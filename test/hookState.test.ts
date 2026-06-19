import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHookReviewKey,
  readHookReviewState,
  shouldSkipHookReview,
  writeHookReviewState,
} from "../src/hookState.js";

describe("hookState", () => {
  it("builds stable keys for identical review inputs", () => {
    const input = {
      conversationId: "conv-1",
      workspace: "/workspace",
      gitStatus: " M file.ts",
      gitDiff: "diff --git a/file.ts b/file.ts",
      stagedGitDiff: "",
    };

    expect(buildHookReviewKey(input)).toBe(buildHookReviewKey(input));
  });

  it("changes keys when the diff changes", () => {
    const base = {
      conversationId: "conv-1",
      workspace: "/workspace",
      gitStatus: " M file.ts",
      gitDiff: "old",
      stagedGitDiff: "",
    };

    expect(buildHookReviewKey(base)).not.toBe(buildHookReviewKey({ ...base, gitDiff: "new" }));
  });

  it("skips duplicate keys inside the cooldown window", () => {
    const state = { key: "same", timestamp: 1_000, workspace: "/workspace" };

    const result = shouldSkipHookReview(state, "same", 60_000, 30_000);

    expect(result.skip).toBe(true);
    expect(result.reason).toContain("same review key");
  });

  it("skips duplicate keys indefinitely when cooldown is zero", () => {
    const state = { key: "same", timestamp: 1_000, workspace: "/workspace" };

    const result = shouldSkipHookReview(state, "same", 0, 90_000);

    expect(result.skip).toBe(true);
    expect(result.reason).toContain("until git state changes");
  });

  it("does not skip different keys or expired cooldowns", () => {
    const state = { key: "same", timestamp: 1_000, workspace: "/workspace" };

    expect(shouldSkipHookReview(state, "different", 60_000, 30_000).skip).toBe(false);
    expect(shouldSkipHookReview(state, "same", 60_000, 90_000).skip).toBe(false);
  });

  it("writes and reads state", () => {
    const dir = mkdtempSync(join(tmpdir(), "agy-judge-hook-state-"));
    const path = join(dir, "state.json");

    writeHookReviewState(path, {
      key: "key",
      timestamp: 123,
      conversationId: "conv",
      workspace: "/workspace",
    });

    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ key: "key" });
    expect(readHookReviewState(path)).toEqual({
      key: "key",
      timestamp: 123,
      conversationId: "conv",
      workspace: "/workspace",
    });
  });
});
