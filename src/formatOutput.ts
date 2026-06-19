import type { PolicyDecision } from "./policy.js";
import type { JudgeResponse } from "./schema.js";

export type OutputFormat = "text" | "json" | "agent";

export function formatJudgeOutput(judge: JudgeResponse, decision: PolicyDecision): string {
  const title = decision.blocked ? "BLOCK" : judge.verdict.toUpperCase();
  const lines: string[] = [`agy-judge: ${title}`, "", "Summary:", judge.summary, "", "Scores:"];
  for (const [key, value] of Object.entries(judge.scores)) {
    lines.push(`- ${key}: ${value}/5`);
  }

  lines.push("", "Issues:");
  if (judge.issues.length === 0) {
    lines.push("- None");
  } else {
    for (const issue of judge.issues) {
      lines.push(`[${issue.severity}][${issue.category}] ${issue.message}`);
      lines.push(`Evidence: ${issue.evidence}`);
      lines.push(`Suggested fix: ${issue.suggested_fix}`, "");
    }
  }

  appendList(lines, "Required changes:", judge.required_changes);
  appendList(lines, "Optional improvements:", judge.optional_improvements);
  lines.push("", "Blocking:", decision.blocked ? "Yes" : "No", `Policy: ${decision.reason}`);
  if (judge.judge_notes.trim()) lines.push("", "Judge notes:", judge.judge_notes);
  return lines.join("\n").trimEnd();
}

export function formatJsonOutput(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatAgentFeedback(judge: JudgeResponse, decision: PolicyDecision): string {
  const lines = [
    `agy-judge result: ${decision.blocked ? "BLOCK" : judge.verdict.toUpperCase()}`,
    "",
    `Summary: ${judge.summary}`,
    "",
    `Blocking: ${decision.blocked ? "Yes" : "No"}`,
    `Policy: ${decision.reason}`,
  ];

  const required = judge.required_changes.length > 0 ? judge.required_changes : [];
  if (required.length > 0) {
    lines.push("", "Required changes:");
    for (const change of required) lines.push(`- ${change}`);
  }

  const topIssues = judge.issues.slice(0, 5);
  if (topIssues.length > 0) {
    lines.push("", "Top issues:");
    for (const issue of topIssues) {
      lines.push(`- [${issue.severity}][${issue.category}] ${issue.message}`);
      lines.push(`  Evidence: ${issue.evidence}`);
      lines.push(`  Suggested fix: ${issue.suggested_fix}`);
    }
  }

  if (required.length === 0 && topIssues.length === 0) {
    lines.push("", "No required changes were identified.");
  }

  return lines.join("\n");
}

export function formatRuntimeError(error: unknown, failOpen: boolean): string {
  const message = error instanceof Error ? error.message : String(error);
  return [
    `agy-judge: ${failOpen ? "WARN" : "ERROR"}`,
    "",
    "Runtime:",
    message,
    "",
    "Blocking:",
    failOpen ? "No" : "Yes",
  ].join("\n");
}

function appendList(lines: string[], title: string, values: string[]): void {
  lines.push("", title);
  if (values.length === 0) {
    lines.push("- None");
    return;
  }
  for (const value of values) lines.push(`- ${value}`);
}
