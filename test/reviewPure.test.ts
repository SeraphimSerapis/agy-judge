import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  hasReviewableEvidence,
  isUsefulContextValue,
  buildEmptyContextResult,
  readRubric,
  renderReviewError,
} from "../src/commands/review.js";
import type { ReviewContext } from "../src/collectContext.js";
import type { JudgeConfig } from "../src/config.js";
import { loadConfig } from "../src/config.js";

function makeContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    cwd: "/tmp/test",
    timestamp: new Date().toISOString(),
    git: {
      available: true,
      statusShort: "(empty)",
      diffStat: "(empty)",
      diff: "",
      stagedDiffStat: "(empty)",
      stagedDiff: "",
      untrackedFiles: "(empty)",
      untrackedDiff: "(empty)",
      notes: [],
    },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<JudgeConfig> = {}): JudgeConfig {
  return {
    ...loadConfig("/tmp/nonexistent"),
    ...overrides,
  };
}

describe("isUsefulContextValue", () => {
  it("returns false for undefined", () => {
    expect(isUsefulContextValue(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isUsefulContextValue("")).toBe(false);
  });

  it("returns false for whitespace only", () => {
    expect(isUsefulContextValue("   \n  ")).toBe(false);
  });

  it("returns false for (empty)", () => {
    expect(isUsefulContextValue("(empty)")).toBe(false);
  });

  it("returns false for (unavailable)", () => {
    expect(isUsefulContextValue("(unavailable)")).toBe(false);
  });

  it("returns false for disabled by config", () => {
    expect(isUsefulContextValue("disabled by config")).toBe(false);
  });

  it("returns true for meaningful content", () => {
    expect(isUsefulContextValue("some diff content")).toBe(true);
  });

  it("returns true for single character", () => {
    expect(isUsefulContextValue("x")).toBe(true);
  });
});

describe("hasReviewableEvidence", () => {
  it("returns false when all fields are empty/absent", () => {
    const ctx = makeContext();
    expect(hasReviewableEvidence(ctx)).toBe(false);
  });

  it("returns true when statusShort is present", () => {
    const ctx = makeContext({
      git: {
        available: true,
        statusShort: "M test.ts",
        diffStat: "(empty)",
        diff: "",
        stagedDiffStat: "(empty)",
        stagedDiff: "",
        untrackedFiles: "(empty)",
        untrackedDiff: "(empty)",
        notes: [],
      },
    });
    expect(hasReviewableEvidence(ctx)).toBe(true);
  });

  it("returns true when diff is present", () => {
    const ctx = makeContext({
      git: {
        available: true,
        statusShort: "(empty)",
        diffStat: "(empty)",
        diff: "+added line",
        stagedDiffStat: "(empty)",
        stagedDiff: "",
        untrackedFiles: "(empty)",
        untrackedDiff: "(empty)",
        notes: [],
      },
    });
    expect(hasReviewableEvidence(ctx)).toBe(true);
  });

  it("returns true when stagedDiff is present", () => {
    const ctx = makeContext({
      git: {
        available: true,
        statusShort: "(empty)",
        diffStat: "(empty)",
        diff: "",
        stagedDiffStat: "(empty)",
        stagedDiff: "+staged change",
        untrackedFiles: "(empty)",
        untrackedDiff: "(empty)",
        notes: [],
      },
    });
    expect(hasReviewableEvidence(ctx)).toBe(true);
  });

  it("returns true when recentOutput is present", () => {
    const ctx = makeContext({ recentOutput: "test output" });
    expect(hasReviewableEvidence(ctx)).toBe(true);
  });

  it("returns true when hookPayload is present", () => {
    const ctx = makeContext({ hookPayload: { key: "value" } });
    expect(hasReviewableEvidence(ctx)).toBe(true);
  });

  it("returns true when diffStat is present", () => {
    const ctx = makeContext({
      git: {
        available: true,
        statusShort: "(empty)",
        diffStat: "1 file changed",
        diff: "",
        stagedDiffStat: "(empty)",
        stagedDiff: "",
        untrackedFiles: "(empty)",
        untrackedDiff: "(empty)",
        notes: [],
      },
    });
    expect(hasReviewableEvidence(ctx)).toBe(true);
  });
});

describe("buildEmptyContextResult", () => {
  it("returns a warn verdict with no-reviewable-evidence issue", () => {
    const ctx = makeContext();
    const config = makeConfig();
    const result = buildEmptyContextResult(ctx, config);

    expect(result.judge.verdict).toBe("warn");
    expect(result.judge.issues).toHaveLength(1);
    expect(result.judge.issues[0].category).toBe("evidence");
    expect(result.judge.issues[0].severity).toBe("medium");
    expect(result.decision.blocked).toBe(false);
  });

  it("includes cwd and git status in evidence", () => {
    const ctx = makeContext({ cwd: "/test/path" });
    const config = makeConfig();
    const result = buildEmptyContextResult(ctx, config);

    expect(result.judge.issues[0].evidence).toContain("/test/path");
  });
});

describe("readRubric", () => {
  it("returns undefined when no rubric file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "agy-judge-rubric-"));
    expect(readRubric(dir)).toBeUndefined();
  });

  it("reads the rubric file when present", () => {
    const dir = mkdtempSync(join(tmpdir(), "agy-judge-rubric-"));
    const rubric = "# Custom Rubric\n- Be strict about security\n";
    writeFileSync(join(dir, ".agy-judge.rubric.md"), rubric);
    expect(readRubric(dir)).toBe(rubric);
  });

  it("returns undefined when file read fails", () => {
    expect(readRubric("/nonexistent/path")).toBeUndefined();
  });
});

describe("renderReviewError", () => {
  it("returns 0 for failOpen", () => {
    const config = makeConfig({ failOpen: true });
    const code = renderReviewError(new Error("fail"), config, "text");
    expect(code).toBe(0);
  });

  it("returns 2 for non-failOpen", () => {
    const config = makeConfig({ failOpen: false });
    const code = renderReviewError(new Error("fail"), config, "text");
    expect(code).toBe(2);
  });

  it("outputs JSON format", () => {
    const config = makeConfig({ failOpen: true });
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);

    renderReviewError(new Error("test error"), config, "json");

    const output = logMock.mock.calls.at(-1)?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("test error");
    expect(parsed.failOpen).toBe(true);
    logMock.mockRestore();
  });
});
