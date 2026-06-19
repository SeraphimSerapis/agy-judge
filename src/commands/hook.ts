import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { acquireLock } from "../lockfile.js";
import { collectContext, type ReviewContext } from "../collectContext.js";
import type { JudgeConfig, JudgeProfile } from "../config.js";
import { formatAgentFeedback, formatJsonOutput, type OutputFormat } from "../formatOutput.js";
import { callJudge } from "../judgeClient.js";
import { applyPolicy, type PolicyDecision } from "../policy.js";
import { buildSystemPrompt, buildUserPrompt } from "../prompt.js";
import { redactSecrets } from "../redact.js";
import { buildHookReviewKey, readHookReviewState, shouldSkipHookReview, writeHookReviewState } from "../hookState.js";
import { appendHookLogEvent, clearHookLog, readHookLogEvents, type HookLogEvent } from "../hookLog.js";
import { getHookGitSnapshot } from "../hookGit.js";

import { tryParseStopHookInput, type StopHookOutput } from "../hookPayload.js";
import type { JudgeResponse } from "../schema.js";
import { hasReviewableEvidence, readRubric } from "./review.js";

export interface HookOptions {
  format: OutputFormat;
  dumpPayload?: string;
  stdinText?: string;
}

export async function runHook(config: JudgeConfig, options: HookOptions): Promise<number> {
  const debug = (msg: string): void => console.error(`[agy-judge-hook] ${msg}`);
  const log = (event: Omit<HookLogEvent, "timestamp">): void => appendHookLogEvent(config.hookLogFile, event);

  // Read the Stop event JSON from stdin.
  const stdinText = options.stdinText ?? readStdinIfAvailable();
  if (!stdinText) {
    debug("skip: no stdin");
    log({ event: "skip", reason: "no stdin" });
    writeStopResponse({ decision: "" });
    return 0;
  }

  // Dump payload if requested.
  const dumpPath = options.dumpPayload ?? config.dumpPayload;
  if (dumpPath) {
    dumpPayloadToFile(stdinText, dumpPath, config.dumpRaw);
  }

  const parsedInput = tryParseStopHookInput(stdinText);
  if (!parsedInput.ok) {
    debug(`skip: invalid JSON (${parsedInput.error})`);
    log({ event: "skip", reason: "invalid JSON" });
    writeStopResponse({ decision: "" });
    return 0;
  }
  const input = parsedInput.value;

  debug(
    `executionNum=${input.executionNum} fullyIdle=${input.fullyIdle} conversationId=${input.conversationId} workspace=${input.workspacePaths?.[0]}`,
  );
  log({
    event: "received",
    conversationId: input.conversationId,
    executionNum: input.executionNum,
    fullyIdle: input.fullyIdle,
    workspace: input.workspacePaths?.[0],
  });

  // Only review when the agent is fully idle (no background tasks running).
  if (input.fullyIdle === false) {
    debug("skip: not fully idle");
    log({
      event: "skip",
      reason: "not fully idle",
      conversationId: input.conversationId,
      executionNum: input.executionNum,
      fullyIdle: input.fullyIdle,
      workspace: input.workspacePaths?.[0],
    });
    writeStopResponse({ decision: "" });
    return 0;
  }

  // Resolve workspace from the hook payload.
  const workspace = input.workspacePaths?.[0];
  if (!workspace || !existsSync(workspace)) {
    debug("skip: no workspace");
    log({
      event: "skip",
      reason: "no workspace",
      conversationId: input.conversationId,
      executionNum: input.executionNum,
      fullyIdle: input.fullyIdle,
      workspace,
    });
    writeStopResponse({ decision: "" });
    return 0;
  }

  const releaseLock = acquireLock(config.lockFile);
  if (!releaseLock) {
    debug("skip: another agy-judge instance is already running");
    log({
      event: "skip",
      reason: "lock held",
      conversationId: input.conversationId,
      executionNum: input.executionNum,
      workspace,
    });
    writeStopResponse({ decision: "" });
    return 0;
  }

  try {
    const gitSnapshot = getHookGitSnapshot(workspace);
    if (!gitSnapshot.hasChanges) {
      debug("skip: no git changes");
      log({
        event: "skip",
        reason: "no git changes",
        conversationId: input.conversationId,
        executionNum: input.executionNum,
        workspace,
      });
      writeStopResponse({ decision: "" });
      return 0;
    }

    const reviewKey = buildHookReviewKey({
      conversationId: input.conversationId,
      workspace,
      gitStatus: gitSnapshot.status,
      gitDiff: gitSnapshot.diff,
      stagedGitDiff: gitSnapshot.stagedDiff,
    });

    if (config.hookDedup) {
      const state = readHookReviewState(config.hookStateFile);
      const dedup = shouldSkipHookReview(state, reviewKey, config.hookCooldownMs);
      if (dedup.skip) {
        debug(`skip: duplicate hook review (${dedup.reason})`);
        log({
          event: "skip",
          reason: `duplicate: ${dedup.reason}`,
          conversationId: input.conversationId,
          executionNum: input.executionNum,
          workspace,
          reviewKey,
        });
        writeStopResponse({ decision: "" });
        return 0;
      }

      writeHookReviewState(config.hookStateFile, {
        key: reviewKey,
        timestamp: Date.now(),
        conversationId: input.conversationId,
        workspace,
      });
    }

    debug("proceeding to judge call");
    log({
      event: "judge_start",
      conversationId: input.conversationId,
      executionNum: input.executionNum,
      workspace,
      reviewKey,
    });

    // Write a "judging" marker so the statusline shows progress.
    writeJudgingMarker(config.verdictFile);

    const rubric = readRubric(workspace);
    const renderedSystemPrompt = buildSystemPrompt(config.profile, rubric);
    const context = await collectContext(config, stdinText, workspace);
    const userPrompt = buildUserPrompt(context);

    if (!hasReviewableEvidence(context)) {
      log({
        event: "skip",
        reason: "no reviewable evidence",
        conversationId: input.conversationId,
        executionNum: input.executionNum,
        workspace,
        reviewKey,
      });
      writeStopResponse({ decision: "" });
      return 0;
    }

    const judge = await callJudge(config, renderedSystemPrompt, userPrompt);
    const decision = applyPolicy(judge, config);

    // Write result file to workspace.
    writeResultFile(workspace, judge, decision);

    // On clean PASS (no issues): allow the agent to stop.
    // If the judge said "pass" but flagged issues, treat as WARN so the
    // agent presents the review and the statusline badge matches.
    const hasIssues = judge.issues.length > 0 || judge.required_changes.length > 0;
    const displayVerdict = judge.verdict === "pass" && hasIssues ? "warn" : judge.verdict;
    const displayJudge: JudgeResponse =
      displayVerdict === judge.verdict ? judge : { ...judge, verdict: displayVerdict };

    if (judge.verdict === "pass" && !hasIssues) {
      debug("verdict: clean PASS");
      log({
        event: "judge_result",
        reason: "clean pass",
        conversationId: input.conversationId,
        executionNum: input.executionNum,
        workspace,
        reviewKey,
        verdict: judge.verdict,
        issueCount: judge.issues.length,
      });
      writeVerdictFile(displayJudge, decision, config);
      writeStopResponse({ decision: "" });
      return 0;
    }

    if (judge.verdict === "pass" && hasIssues) {
      debug("verdict: pass with issues → treating as WARN");
    }

    log({
      event: "judge_result",
      conversationId: input.conversationId,
      executionNum: input.executionNum,
      workspace,
      reviewKey,
      verdict: displayJudge.verdict,
      issueCount: judge.issues.length,
    });
    writeVerdictFile(displayJudge, decision, config);

    // On WARN/FAIL: force-continue with the review injected as a system message.
    // The message instructs the agent to PRESENT the review and ASK the user
    // before making any changes — giving the user accept/decline control.
    const agentFeedback = formatAgentFeedback(displayJudge, decision);
    const autofix = config.hookAutofix;

    const instruction = autofix
      ? agentFeedback
      : `${agentFeedback}\n\n---\nIMPORTANT: Present the above review to the user. Do NOT automatically fix these issues. Ask the user if they would like you to address the feedback.`;

    writeStopResponse({
      decision: "continue",
      reason: instruction,
    });
    log({
      event: "continue",
      conversationId: input.conversationId,
      executionNum: input.executionNum,
      workspace,
      reviewKey,
      verdict: displayJudge.verdict,
      issueCount: judge.issues.length,
    });
    return 0;
  } catch (error) {
    // Fail open: let the agent stop if the judge itself errors.
    const message = error instanceof Error ? error.message : String(error);
    debug(`error: ${message}`);
    log({
      event: "error",
      reason: message,
      conversationId: input.conversationId,
      executionNum: input.executionNum,
      workspace,
    });
    writeStopResponse({ decision: "" });
    return config.failOpen ? 0 : 2;
  } finally {
    releaseLock();
  }
}

export function runHookDebug(config: JudgeConfig, options: { format: OutputFormat; clearHookLog: boolean }): number {
  if (options.clearHookLog) clearHookLog(config.hookLogFile);
  const state = readHookReviewState(config.hookStateFile);
  const events = readHookLogEvents(config.hookLogFile, 30);

  if (options.format === "json") {
    console.log(
      formatJsonOutput({
        ok: true,
        hookDedup: config.hookDedup,
        hookCooldownMs: config.hookCooldownMs,
        hookStateFile: config.hookStateFile,
        hookLogFile: config.hookLogFile,
        state,
        events,
      }),
    );
    return 0;
  }

  const lines = [
    "agy-judge hook-debug",
    "",
    `Dedup: ${config.hookDedup ? "enabled" : "disabled"}`,
    `Cooldown: ${config.hookCooldownMs}ms`,
    `State file: ${config.hookStateFile}`,
    `Log file: ${config.hookLogFile}`,
    "",
  ];

  lines.push("Last review state:");
  if (!state) {
    lines.push("- None");
  } else {
    lines.push(`- key: ${state.key.slice(0, 12)}...`);
    lines.push(`- timestamp: ${new Date(state.timestamp).toISOString()}`);
    lines.push(`- conversationId: ${state.conversationId ?? "(missing)"}`);
    lines.push(`- workspace: ${state.workspace}`);
  }

  lines.push("", "Recent hook events:");
  if (events.length === 0) {
    lines.push("- None");
  } else {
    for (const event of events) {
      const parts = [
        event.timestamp,
        event.event,
        event.reason ? `reason=${event.reason}` : undefined,
        event.verdict ? `verdict=${event.verdict}` : undefined,
        event.reviewKey ? `key=${event.reviewKey.slice(0, 12)}...` : undefined,
        event.executionNum !== undefined ? `executionNum=${event.executionNum}` : undefined,
        event.workspace ? `workspace=${event.workspace}` : undefined,
      ].filter(Boolean);
      lines.push(`- ${parts.join(" ")}`);
    }
  }

  if (options.clearHookLog) lines.push("", "Hook log cleared before reading.");
  console.log(lines.join("\n"));
  return 0;
}

function readStdinIfAvailable(): string | undefined {
  if (process.stdin.isTTY) return undefined;
  try {
    return readFileSync(0, "utf8");
  } catch {
    return undefined;
  }
}

function writeStopResponse(response: StopHookOutput): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function writeJudgingMarker(verdictFile: string): void {
  try {
    const dir = dirname(verdictFile);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    writeFileSync(verdictFile, JSON.stringify({ judge: { verdict: "judging", issues: [] } }), {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch {
    /* best-effort */
  }
}

function writeVerdictFile(judge: JudgeResponse, decision: PolicyDecision, config: JudgeConfig): void {
  try {
    const verdict = {
      ok: !decision.blocked,
      source: "judge",
      profile: config.profile satisfies JudgeProfile,
      decision: {
        blocked: decision.blocked,
        exitCode: decision.exitCode,
        reason: decision.reason,
      },
      judge,
    };
    const dir = dirname(config.verdictFile);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    writeFileSync(config.verdictFile, JSON.stringify(verdict, null, 2), { encoding: "utf8", mode: 0o600 });
  } catch {
    // Best-effort — don't fail the hook.
  }
}

function writeResultFile(workspace: string, judge: JudgeResponse, decision: PolicyDecision): void {
  try {
    const verdict = decision.blocked ? "BLOCKED" : judge.verdict.toUpperCase();
    const icon = judge.verdict === "pass" ? "✅" : judge.verdict === "warn" ? "⚠️" : "❌";
    const blocked = decision.blocked ? " **[BLOCKED]**" : "";

    const lines: string[] = [`# ${icon} agy-judge: ${verdict}${blocked}`, "", `**Summary:** ${judge.summary}`, ""];

    lines.push("## Scores", "", "| Category | Score |", "|---|---|");
    for (const [k, s] of Object.entries(judge.scores)) {
      lines.push(`| ${k.replace(/_/g, " ")} | ${s}/5 |`);
    }
    lines.push("");

    if (judge.issues.length > 0) {
      lines.push("## Issues", "");
      for (const issue of judge.issues) {
        lines.push(`- **[${issue.severity}][${issue.category}]** ${issue.message}`);
        if (issue.evidence) lines.push(`  - Evidence: ${issue.evidence}`);
        if (issue.suggested_fix) lines.push(`  - Fix: ${issue.suggested_fix}`);
      }
      lines.push("");
    }

    if (judge.required_changes.length > 0) {
      lines.push("## Required Changes", "");
      for (const c of judge.required_changes) lines.push(`- ${c}`);
      lines.push("");
    }

    if (judge.optional_improvements.length > 0) {
      lines.push("## Optional Improvements", "");
      for (const c of judge.optional_improvements) lines.push(`- ${c}`);
      lines.push("");
    }

    if (judge.judge_notes.trim()) {
      lines.push("---", `*Judge notes: ${judge.judge_notes}*`);
    }

    writeFileSync(join(workspace, ".agy-judge-result.md"), lines.join("\n"), "utf8");
  } catch {
    // Best-effort — don't fail the hook.
  }
}

function dumpPayloadToFile(payload: string, filePath: string, raw: boolean): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const content = raw ? payload : redactSecrets(payload);
    writeFileSync(filePath, content, { encoding: "utf8", mode: 0o600 });
    console.error(`Payload saved to: ${filePath}${raw ? " (raw, unredacted)" : " (redacted)"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to dump payload: ${message}`);
  }
}

export type { ReviewContext };
