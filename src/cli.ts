import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { collectContext } from "./collectContext.js";
import { loadConfig, getConfigStatus, type JudgeConfig, type JudgeProfile } from "./config.js";
import {
  formatAgentFeedback,
  formatJudgeOutput,
  formatJsonOutput,
  formatRuntimeError,
  type OutputFormat
} from "./formatOutput.js";
import { callJudge } from "./judgeClient.js";
import { applyPolicy } from "./policy.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import type { PolicyDecision } from "./policy.js";
import type { JudgeResponse } from "./schema.js";
import type { ReviewContext } from "./collectContext.js";

type Command = "status" | "review" | "hook" | "print-prompt" | "doctor" | "version" | "help";

interface CliOptions {
  command: Command;
  format: OutputFormat;
  profile?: JudgeProfile;
}

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv);
  const command = options.command;
  const config = withCliOverrides(loadConfig(), options);

  if (command === "help") {
    printHelp();
    return 0;
  }

  if (command === "version") {
    console.log(packageJson.version);
    return 0;
  }

  if (command === "status") {
    for (const [key, value] of Object.entries(getConfigStatus(config))) {
      console.log(`${key}: ${value}`);
    }
    return 0;
  }

  const hookPayload = command === "hook" ? readStdinIfAvailable() : undefined;
  try {
    const rubric = readRubric(process.cwd());
    const renderedSystemPrompt = buildSystemPrompt(config.profile, rubric);
    if (command === "doctor") return await runDoctor(config, renderedSystemPrompt, options.format);

    const context = await collectContext(config, hookPayload);
    const userPrompt = buildUserPrompt(context);
    if (command === "print-prompt") {
      console.log(`System prompt:\n${renderedSystemPrompt}\n\nUser prompt:\n${userPrompt}`);
      return 0;
    }
    if (!hasReviewableEvidence(context)) {
      const local = buildEmptyContextResult(context, config);
      printReviewResult(local.judge, local.decision, options.format, {
        source: "local-preflight",
        profile: config.profile,
        skippedJudgeCall: true
      });
      return local.decision.exitCode;
    }

    const judge = await callJudge(config, renderedSystemPrompt, userPrompt);
    const decision = applyPolicy(judge, config);
    printReviewResult(judge, decision, options.format, {
      source: "judge",
      profile: config.profile,
      skippedJudgeCall: false
    });
    return decision.exitCode;
  } catch (error) {
    if (options.format === "json") {
      console.log(formatJsonOutput({ ok: false, error: error instanceof Error ? error.message : String(error), failOpen: config.failOpen }));
    } else {
      console.error(formatRuntimeError(error, config.failOpen));
    }
    return config.failOpen ? 0 : 2;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const command = parseCommand(argv[0]);
  let format: OutputFormat = "text";
  let profile: JudgeProfile | undefined;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format" && argv[index + 1]) {
      format = parseFormat(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith("--format=")) {
      format = parseFormat(arg.slice("--format=".length));
    } else if (arg === "--json") {
      format = "json";
    } else if (arg === "--agent") {
      format = "agent";
    } else if (arg === "--profile" && argv[index + 1]) {
      profile = parseProfile(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      profile = parseProfile(arg.slice("--profile=".length));
    }
  }

  return { command, format, profile };
}

function parseCommand(value: string | undefined): Command {
  if (value === "--version" || value === "-v" || value === "version") return "version";
  if (value === "status" || value === "review" || value === "hook" || value === "print-prompt" || value === "doctor") return value;
  return "help";
}

function parseFormat(value: string): OutputFormat {
  return value === "json" || value === "agent" || value === "text" ? value : "text";
}

function parseProfile(value: string): JudgeProfile | undefined {
  if (value === "default" || value === "security" || value === "tests" || value === "docs" || value === "release") return value;
  return undefined;
}

function withCliOverrides(config: JudgeConfig, options: CliOptions): JudgeConfig {
  return options.profile ? { ...config, profile: options.profile } : config;
}

function readStdinIfAvailable(): string | undefined {
  if (process.stdin.isTTY) return undefined;
  try {
    return readFileSync(0, "utf8");
  } catch {
    return undefined;
  }
}

function readRubric(cwd: string): string | undefined {
  const path = join(cwd, ".agy-judge.rubric.md");
  if (!existsSync(path)) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

async function runDoctor(config: JudgeConfig, renderedSystemPrompt: string, format: OutputFormat): Promise<number> {
  const checks = {
    baseUrl: Boolean(config.baseUrl),
    model: Boolean(config.model),
    timeoutMs: config.timeoutMs,
    mode: config.mode,
    profile: config.profile,
    headersConfigured: Object.keys(config.headers).length,
    apiKeyConfigured: Boolean(config.apiKey)
  };

  try {
    const judge = await callJudge(
      config,
      renderedSystemPrompt,
      "This is an agy-judge diagnostic request. Return a passing judge JSON response confirming the endpoint can produce valid JSON."
    );
    if (format === "json") {
      console.log(formatJsonOutput({ ok: true, checks, diagnostic: { verdict: judge.verdict, summary: judge.summary } }));
    } else {
      console.log(
        [
          "agy-judge doctor: OK",
          "",
          `Endpoint: ${config.baseUrl}`,
          `Model: ${config.model}`,
          `Profile: ${config.profile}`,
          `Headers configured: ${Object.keys(config.headers).length}`,
          "",
          `Diagnostic verdict: ${judge.verdict}`,
          `Summary: ${judge.summary}`
        ].join("\n")
      );
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (format === "json") {
      console.log(formatJsonOutput({ ok: false, checks, error: message, failOpen: config.failOpen }));
    } else {
      console.error(
        [
          `agy-judge doctor: ${config.failOpen ? "WARN" : "ERROR"}`,
          "",
          `Endpoint: ${config.baseUrl || "(missing)"}`,
          `Model: ${config.model || "(missing)"}`,
          `Profile: ${config.profile}`,
          `Headers configured: ${Object.keys(config.headers).length}`,
          "",
          `Diagnostic error: ${message}`,
          "",
          "Tip: check JUDGE_BASE_URL, JUDGE_MODEL, JUDGE_API_KEY, JUDGE_HEADERS, and provider support for JSON responses."
        ].join("\n")
      );
    }
    return config.failOpen ? 0 : 2;
  }
}

function hasReviewableEvidence(context: ReviewContext): boolean {
  return [
    context.git.statusShort,
    context.git.diffStat,
    context.git.diff,
    context.git.stagedDiffStat,
    context.git.stagedDiff,
    context.recentOutput,
    context.hookPayload === undefined ? undefined : JSON.stringify(context.hookPayload)
  ].some(isUsefulContextValue);
}

function isUsefulContextValue(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed !== "(empty)" && trimmed !== "(unavailable)" && trimmed !== "disabled by config";
}

function buildEmptyContextResult(
  context: ReviewContext,
  config: JudgeConfig
): { judge: JudgeResponse; decision: PolicyDecision } {
  const judge: JudgeResponse = {
    verdict: "warn",
    should_block: false,
    confidence: 1,
    scores: {
      user_intent: 0,
      correctness: 0,
      completeness: 0,
      safety_security: 0,
      maintainability: 0,
      evidence: 0
    },
    summary: "No reviewable evidence was found, so the judge call was skipped.",
    issues: [
      {
        severity: "medium",
        category: "evidence",
        message: "No diff, hook payload, or command output was available to review.",
        evidence: `cwd=${context.cwd}; git=${context.git.available ? "available" : "unavailable"}`,
        suggested_fix: "Run agy-judge after making a change, staging a diff, or from an Antigravity hook with payload data."
      }
    ],
    required_changes: [],
    optional_improvements: ["Provide reviewable context before relying on judge feedback."],
    judge_notes: "Local preflight result; no judge endpoint was called."
  };
  return { judge, decision: applyPolicy(judge, config) };
}

function printReviewResult(
  judge: JudgeResponse,
  decision: PolicyDecision,
  format: OutputFormat,
  metadata: { source: "judge" | "local-preflight"; profile: JudgeProfile; skippedJudgeCall: boolean }
): void {
  if (format === "json") {
    console.log(formatJsonOutput({ ok: true, source: metadata.source, profile: metadata.profile, skippedJudgeCall: metadata.skippedJudgeCall, decision, judge }));
    return;
  }
  if (format === "agent") {
    console.log(formatAgentFeedback(judge, decision));
    return;
  }
  console.log(formatJudgeOutput(judge, decision));
}

function printHelp(): void {
  console.log(`agy-judge

Usage:
  agy-judge status
  agy-judge review
  agy-judge review --format json
  agy-judge review --format agent
  agy-judge review --profile security
  agy-judge hook
  agy-judge doctor
  agy-judge print-prompt
  agy-judge --version`);
}
