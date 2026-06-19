import { describe, expect, it } from "vitest";
import { formatJudgeOutput, formatJsonOutput, formatAgentFeedback, formatRuntimeError } from "../src/formatOutput.js";
import type { JudgeResponse } from "../src/schema.js";
import type { PolicyDecision } from "../src/policy.js";

function makeJudge(overrides: Partial<JudgeResponse> = {}): JudgeResponse {
  return {
    verdict: "pass",
    should_block: false,
    confidence: 0.9,
    scores: {
      user_intent: 5,
      correctness: 4,
      completeness: 3,
      safety_security: 5,
      maintainability: 4,
      evidence: 5,
    },
    summary: "Looks good overall.",
    issues: [],
    required_changes: [],
    optional_improvements: [],
    judge_notes: "",
    ...overrides,
  };
}

function makeDecision(overrides: Partial<PolicyDecision> = {}): PolicyDecision {
  return {
    blocked: false,
    exitCode: 0,
    reason: "Advisory mode.",
    ...overrides,
  };
}

describe("formatJudgeOutput", () => {
  it("formats a clean pass verdict", () => {
    const output = formatJudgeOutput(makeJudge(), makeDecision());
    expect(output).toContain("agy-judge: PASS");
    expect(output).toContain("Looks good overall.");
    expect(output).toContain("Blocking:\nNo");
  });

  it("formats a BLOCK verdict when blocked", () => {
    const output = formatJudgeOutput(
      makeJudge({ verdict: "fail" }),
      makeDecision({ blocked: true, exitCode: 1, reason: "Block mode matched severity: critical." }),
    );
    expect(output).toContain("agy-judge: BLOCK");
    expect(output).toContain("Blocking:\nYes");
  });

  it("lists issues with severity and category", () => {
    const output = formatJudgeOutput(
      makeJudge({
        verdict: "warn",
        issues: [
          {
            severity: "high",
            category: "correctness",
            message: "Bug in main function",
            evidence: "line 42",
            suggested_fix: "Add null check",
          },
        ],
      }),
      makeDecision(),
    );
    expect(output).toContain("[high][correctness] Bug in main function");
    expect(output).toContain("Evidence: line 42");
    expect(output).toContain("Suggested fix: Add null check");
  });

  it("shows None when no issues", () => {
    const output = formatJudgeOutput(makeJudge(), makeDecision());
    expect(output).toContain("- None");
  });

  it("includes judge_notes when non-empty", () => {
    const output = formatJudgeOutput(makeJudge({ judge_notes: "Some reviewer notes." }), makeDecision());
    expect(output).toContain("Judge notes:");
    expect(output).toContain("Some reviewer notes.");
  });

  it("omits judge_notes when empty", () => {
    const output = formatJudgeOutput(makeJudge({ judge_notes: "  " }), makeDecision());
    expect(output).not.toContain("Judge notes:");
  });

  it("includes required changes", () => {
    const output = formatJudgeOutput(makeJudge({ required_changes: ["Fix the bug", "Add tests"] }), makeDecision());
    expect(output).toContain("- Fix the bug");
    expect(output).toContain("- Add tests");
  });

  it("includes optional improvements", () => {
    const output = formatJudgeOutput(makeJudge({ optional_improvements: ["Consider refactoring"] }), makeDecision());
    expect(output).toContain("- Consider refactoring");
  });

  it("displays all score categories", () => {
    const output = formatJudgeOutput(makeJudge(), makeDecision());
    expect(output).toContain("user_intent: 5/5");
    expect(output).toContain("correctness: 4/5");
    expect(output).toContain("completeness: 3/5");
    expect(output).toContain("safety_security: 5/5");
    expect(output).toContain("maintainability: 4/5");
    expect(output).toContain("evidence: 5/5");
  });
});

describe("formatJsonOutput", () => {
  it("returns pretty-printed JSON", () => {
    const output = formatJsonOutput({ ok: true, value: 42 });
    expect(output).toBe(JSON.stringify({ ok: true, value: 42 }, null, 2));
  });

  it("handles nested objects", () => {
    const output = formatJsonOutput({ a: { b: [1, 2] } });
    const parsed = JSON.parse(output);
    expect(parsed.a.b).toEqual([1, 2]);
  });
});

describe("formatAgentFeedback", () => {
  it("formats a pass verdict", () => {
    const output = formatAgentFeedback(makeJudge(), makeDecision());
    expect(output).toContain("agy-judge result: PASS");
    expect(output).toContain("Summary: Looks good overall.");
  });

  it("formats a blocked verdict", () => {
    const output = formatAgentFeedback(
      makeJudge({ verdict: "fail" }),
      makeDecision({ blocked: true, reason: "Critical issue." }),
    );
    expect(output).toContain("agy-judge result: BLOCK");
    expect(output).toContain("Blocking: Yes");
  });

  it("lists top issues (max 5)", () => {
    const issues = Array.from({ length: 8 }, (_, i) => ({
      severity: "medium" as const,
      category: "correctness" as const,
      message: `Issue ${i}`,
      evidence: `Evidence ${i}`,
      suggested_fix: `Fix ${i}`,
    }));
    const output = formatAgentFeedback(makeJudge({ issues }), makeDecision());
    const matches = output.match(/Issue \d/g) ?? [];
    expect(matches.length).toBe(5);
  });

  it("shows no-required-changes message when lists are empty", () => {
    const output = formatAgentFeedback(makeJudge(), makeDecision());
    expect(output).toContain("No required changes were identified.");
  });

  it("includes required changes when present", () => {
    const output = formatAgentFeedback(makeJudge({ required_changes: ["Fix the bug"] }), makeDecision());
    expect(output).toContain("- Fix the bug");
  });
});

describe("formatRuntimeError", () => {
  it("formats a WARN for failOpen", () => {
    const output = formatRuntimeError(new Error("network timeout"), true);
    expect(output).toContain("agy-judge: WARN");
    expect(output).toContain("network timeout");
    expect(output).toContain("Blocking:\nNo");
  });

  it("formats an ERROR for non-failOpen", () => {
    const output = formatRuntimeError(new Error("connection refused"), false);
    expect(output).toContain("agy-judge: ERROR");
    expect(output).toContain("connection refused");
    expect(output).toContain("Blocking:\nYes");
  });

  it("handles non-Error values", () => {
    const output = formatRuntimeError("string error", true);
    expect(output).toContain("string error");
  });
});
