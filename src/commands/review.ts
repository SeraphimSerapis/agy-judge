import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { collectContext, type ReviewContext } from "../collectContext.js";
import type { JudgeConfig, JudgeProfile } from "../config.js";
import {
  formatAgentFeedback,
  formatJudgeOutput,
  formatJsonOutput,
  formatRuntimeError,
  type OutputFormat,
} from "../formatOutput.js";
import { callJudge } from "../judgeClient.js";
import { applyPolicy, type PolicyDecision } from "../policy.js";
import { buildSystemPrompt, buildUserPrompt } from "../prompt.js";
import type { JudgeResponse } from "../schema.js";

export interface ReviewResult {
  exitCode: number;
  judge?: JudgeResponse;
  decision?: PolicyDecision;
  source: "judge" | "local-preflight";
  profile: JudgeProfile;
  skippedJudgeCall: boolean;
}

export async function runReview(config: JudgeConfig, format: OutputFormat): Promise<ReviewResult> {
  const rubric = readRubric(process.cwd());
  const systemPrompt = buildSystemPrompt(config.profile, rubric);
  const context = await collectContext(config);
  const userPrompt = buildUserPrompt(context);

  if (!hasReviewableEvidence(context)) {
    return finalize(buildEmptyContextResult(context, config), config.profile, format, "local-preflight", true);
  }

  const judge = await callJudge(config, systemPrompt, userPrompt);
  const decision = applyPolicy(judge, config);
  return finalize({ judge, decision }, config.profile, format, "judge", false);
}

export async function runDoctor(config: JudgeConfig, format: OutputFormat): Promise<ReviewResult> {
  const rubric = readRubric(process.cwd());
  const systemPrompt = buildSystemPrompt(config.profile, rubric);
  const checks = {
    baseUrl: Boolean(config.baseUrl),
    model: Boolean(config.model),
    timeoutMs: config.timeoutMs,
    mode: config.mode,
    profile: config.profile,
    headersConfigured: Object.keys(config.headers).length,
    apiKeyConfigured: Boolean(config.apiKey),
  };

  try {
    const judge = await callJudge(
      config,
      systemPrompt,
      "This is an agy-judge diagnostic request. Return a passing judge JSON response confirming the endpoint can produce valid JSON.",
    );
    if (format === "json") {
      console.log(
        formatJsonOutput({ ok: true, checks, diagnostic: { verdict: judge.verdict, summary: judge.summary } }),
      );
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
          `Summary: ${judge.summary}`,
        ].join("\n"),
      );
    }
    return { exitCode: 0, source: "judge", profile: config.profile, skippedJudgeCall: false };
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
          "Tip: check JUDGE_BASE_URL, JUDGE_MODEL, JUDGE_API_KEY, JUDGE_HEADERS, and provider support for JSON responses.",
        ].join("\n"),
      );
    }
    return { exitCode: config.failOpen ? 0 : 2, source: "judge", profile: config.profile, skippedJudgeCall: false };
  }
}

export async function runPrintPrompt(config: JudgeConfig): Promise<number> {
  const rubric = readRubric(process.cwd());
  const systemPrompt = buildSystemPrompt(config.profile, rubric);
  const context = await collectContext(config);
  const userPrompt = buildUserPrompt(context);
  console.log(`System prompt:\n${systemPrompt}\n\nUser prompt:\n${userPrompt}`);
  return 0;
}

export function renderReviewError(error: unknown, config: JudgeConfig, format: OutputFormat): number {
  const message = error instanceof Error ? error.message : String(error);
  if (format === "json") {
    console.log(formatJsonOutput({ ok: false, error: message, failOpen: config.failOpen }));
  } else {
    console.error(formatRuntimeError(error, config.failOpen));
  }
  return config.failOpen ? 0 : 2;
}

function finalize(
  result: { judge: JudgeResponse; decision: PolicyDecision },
  profile: JudgeProfile,
  format: OutputFormat,
  source: "judge" | "local-preflight",
  skippedJudgeCall: boolean,
): ReviewResult {
  const { judge, decision } = result;
  if (format === "json") {
    console.log(
      formatJsonOutput({
        ok: true,
        source,
        profile,
        skippedJudgeCall,
        decision,
        judge,
      }),
    );
  } else if (format === "agent") {
    console.log(formatAgentFeedback(judge, decision));
  } else {
    console.log(formatJudgeOutput(judge, decision));
  }
  return { exitCode: decision.exitCode, judge, decision, source, profile, skippedJudgeCall };
}

export function readRubric(cwd: string): string | undefined {
  const path = join(cwd, ".agy-judge.rubric.md");
  if (!existsSync(path)) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

export function hasReviewableEvidence(context: ReviewContext): boolean {
  return [
    context.git.statusShort,
    context.git.diffStat,
    context.git.diff,
    context.git.stagedDiffStat,
    context.git.stagedDiff,
    context.git.untrackedDiff,
    context.recentOutput,
    context.hookPayload === undefined ? undefined : JSON.stringify(context.hookPayload),
  ].some(isUsefulContextValue);
}

export function isUsefulContextValue(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed !== "(empty)" && trimmed !== "(unavailable)" && trimmed !== "disabled by config";
}

export function buildEmptyContextResult(
  context: ReviewContext,
  config: JudgeConfig,
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
      evidence: 0,
    },
    summary: "No reviewable evidence was found, so the judge call was skipped.",
    issues: [
      {
        severity: "medium",
        category: "evidence",
        message: "No diff, hook payload, or command output was available to review.",
        evidence: `cwd=${context.cwd}; git=${context.git.available ? "available" : "unavailable"}`,
        suggested_fix:
          "Run agy-judge after making a change, staging a diff, or from an Antigravity hook with payload data.",
      },
    ],
    required_changes: [],
    optional_improvements: ["Provide reviewable context before relying on judge feedback."],
    judge_notes: "Local preflight result; no judge endpoint was called.",
  };
  return { judge, decision: applyPolicy(judge, config) };
}
