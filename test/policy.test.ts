import { describe, expect, it } from "vitest";
import { applyPolicy } from "../src/policy.js";
import type { JudgeResponse } from "../src/schema.js";

const baseJudge: JudgeResponse = {
  verdict: "warn",
  should_block: true,
  confidence: 0.8,
  scores: {
    user_intent: 4,
    correctness: 3,
    completeness: 3,
    safety_security: 4,
    maintainability: 4,
    evidence: 2
  },
  summary: "summary",
  issues: [
    {
      severity: "high",
      category: "correctness",
      message: "bug",
      evidence: "diff",
      suggested_fix: "fix it"
    }
  ],
  required_changes: [],
  optional_improvements: [],
  judge_notes: ""
};

describe("applyPolicy", () => {
  it("never blocks in advisory mode", () => {
    const decision = applyPolicy(baseJudge, { mode: "advisory", blockOn: ["high"] });
    expect(decision.blocked).toBe(false);
    expect(decision.exitCode).toBe(0);
  });

  it("does not block in warn mode", () => {
    const decision = applyPolicy(baseJudge, { mode: "warn", blockOn: ["high"] });
    expect(decision.blocked).toBe(false);
    expect(decision.exitCode).toBe(0);
  });

  it("blocks in block mode when severity matches", () => {
    const decision = applyPolicy(baseJudge, { mode: "block", blockOn: ["high"] });
    expect(decision.blocked).toBe(true);
    expect(decision.exitCode).toBe(1);
  });

  it("does not block when severity does not match", () => {
    const decision = applyPolicy(baseJudge, { mode: "block", blockOn: ["critical"] });
    expect(decision.blocked).toBe(false);
    expect(decision.exitCode).toBe(0);
  });
});
