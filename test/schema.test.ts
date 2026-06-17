import { describe, expect, it } from "vitest";
import { judgeResponseSchema } from "../src/schema.js";

describe("judgeResponseSchema", () => {
  it("accepts a valid response", () => {
    const result = judgeResponseSchema.safeParse({
      verdict: "pass",
      should_block: false,
      confidence: 0.9,
      scores: {
        user_intent: 5,
        correctness: 5,
        completeness: 4,
        safety_security: 5,
        maintainability: 4,
        evidence: 4
      },
      summary: "Looks good.",
      issues: [],
      required_changes: [],
      optional_improvements: [],
      judge_notes: ""
    });

    expect(result.success).toBe(true);
  });

  it("accepts zero scores", () => {
    const result = judgeResponseSchema.safeParse({
      verdict: "warn",
      should_block: false,
      confidence: 0.5,
      scores: {
        user_intent: 0,
        correctness: 0,
        completeness: 0,
        safety_security: 0,
        maintainability: 0,
        evidence: 0
      },
      summary: "Insufficient evidence.",
      issues: [],
      required_changes: [],
      optional_improvements: [],
      judge_notes: ""
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid severities and scores", () => {
    const result = judgeResponseSchema.safeParse({
      verdict: "pass",
      should_block: false,
      confidence: 2,
      scores: {
        user_intent: 6,
        correctness: 5,
        completeness: 4,
        safety_security: 5,
        maintainability: 4,
        evidence: 4
      },
      summary: "Bad shape.",
      issues: [{ severity: "urgent", category: "testing", message: "", evidence: "", suggested_fix: "" }],
      required_changes: [],
      optional_improvements: [],
      judge_notes: ""
    });

    expect(result.success).toBe(false);
  });

  it("accepts completeness as an issue category", () => {
    const result = judgeResponseSchema.safeParse({
      verdict: "warn",
      should_block: false,
      confidence: 0.8,
      scores: {
        user_intent: 4,
        correctness: 4,
        completeness: 3,
        safety_security: 5,
        maintainability: 4,
        evidence: 3
      },
      summary: "Mostly complete.",
      issues: [
        {
          severity: "medium",
          category: "completeness",
          message: "One expected item is missing.",
          evidence: "The review packet does not show the requested example.",
          suggested_fix: "Add the missing example."
        }
      ],
      required_changes: [],
      optional_improvements: [],
      judge_notes: ""
    });

    expect(result.success).toBe(true);
  });
});
