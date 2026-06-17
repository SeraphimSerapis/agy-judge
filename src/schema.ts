import { z } from "zod";

export const severitySchema = z.enum(["low", "medium", "high", "critical"]);

export const judgeIssueSchema = z.object({
  severity: severitySchema,
  category: z.enum([
    "correctness",
    "safety",
    "security",
    "maintainability",
    "user_intent",
    "completeness",
    "testing",
    "style",
    "performance",
    "evidence"
  ]),
  message: z.string(),
  evidence: z.string(),
  suggested_fix: z.string()
});

export const judgeResponseSchema = z.object({
  verdict: z.enum(["pass", "warn", "fail"]),
  should_block: z.boolean(),
  confidence: z.number().min(0).max(1),
  scores: z.object({
    user_intent: z.number().min(0).max(5),
    correctness: z.number().min(0).max(5),
    completeness: z.number().min(0).max(5),
    safety_security: z.number().min(0).max(5),
    maintainability: z.number().min(0).max(5),
    evidence: z.number().min(0).max(5)
  }),
  summary: z.string(),
  issues: z.array(judgeIssueSchema),
  required_changes: z.array(z.string()),
  optional_improvements: z.array(z.string()),
  judge_notes: z.string()
});

export type JudgeResponse = z.infer<typeof judgeResponseSchema>;
export type JudgeIssue = z.infer<typeof judgeIssueSchema>;
