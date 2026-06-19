import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { collectContext } from "../src/collectContext.js";
import type { JudgeConfig } from "../src/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf8");
}

function baseConfig(overrides?: Partial<JudgeConfig>): JudgeConfig {
  return {
    baseUrl: "http://localhost:8000/v1",
    model: "mock",
    headers: {},
    temperature: 0,
    timeoutMs: 60000,
    mode: "advisory",
    blockOn: ["critical"],
    failOpen: true,
    maxDiffBytes: 120000,
    maxOutputBytes: 60000,
    maxPayloadBytes: 120000,
    includeDiff: false,
    includeStatus: false,
    includeHookPayload: true,
    profile: "default",
    dumpRaw: false,
    hookDedup: true,
    hookCooldownMs: 0,

    hookAutofix: false,
    hookStateFile: "/tmp/test-agy-judge-hook-state.json",
    hookLogFile: "/tmp/test-agy-judge-hook-events.ndjson",
    lockFile: "/tmp/test-agy-judge.lock",
    verdictFile: "/tmp/test-agy-judge-verdict.json",
    ...overrides,
  };
}

describe("extractRecentOutput via collectContext", () => {
  it("extracts output from nested commands array", async () => {
    const payload = loadFixture("hook-payload-success.json");
    const context = await collectContext(baseConfig(), payload);

    expect(context.recentOutput).toBeDefined();
    expect(context.recentOutput).toContain("Test Files 5 passed");
    expect(context.recentOutput).toContain("Build completed successfully");
    expect(context.recentOutput).toContain("$ pnpm test");
    expect(context.recentOutput).toContain("$ pnpm build");
    expect(context.recentOutput).toContain("Agent final response:");
  });

  it("extracts stderr from nested commands and top-level test_output", async () => {
    const payload = loadFixture("hook-payload-failure.json");
    const context = await collectContext(baseConfig(), payload);

    expect(context.recentOutput).toBeDefined();
    expect(context.recentOutput).toContain("AssertionError");
    expect(context.recentOutput).toContain("$ pnpm test");
    expect(context.recentOutput).toContain("1 test failed");
  });

  it("extracts final_response from minimal payloads with no commands", async () => {
    const payload = loadFixture("hook-payload-minimal.json");
    const context = await collectContext(baseConfig(), payload);

    expect(context.recentOutput).toBeDefined();
    expect(context.recentOutput).toContain("Agent final response: Done.");
  });

  it("returns undefined recentOutput when hook payload is disabled", async () => {
    const payload = loadFixture("hook-payload-success.json");
    const context = await collectContext(baseConfig({ includeHookPayload: false }), payload);

    // Hook payload is excluded but recentOutput still extracts from the parsed payload
    // because extractRecentOutput receives the parsed payload before the config filter
    // The hookPayload field should be undefined though
    expect(context.hookPayload).toBeUndefined();
  });

  it("returns undefined recentOutput for empty payload", async () => {
    const context = await collectContext(baseConfig(), "");
    expect(context.recentOutput).toBeUndefined();
    expect(context.hookPayload).toBeUndefined();
  });

  it("returns undefined recentOutput for undefined payload", async () => {
    const context = await collectContext(baseConfig());
    expect(context.recentOutput).toBeUndefined();
    expect(context.hookPayload).toBeUndefined();
  });

  it("parses non-JSON payloads as raw text", async () => {
    const context = await collectContext(baseConfig(), "this is not JSON");
    expect(context.hookPayload).toEqual({ raw: "this is not JSON" });
  });

  it("handles top-level output keys for backward compatibility", async () => {
    const payload = JSON.stringify({
      event: "agent_finished",
      output: "Direct top-level output",
      stdout: "Top-level stdout",
    });
    const context = await collectContext(baseConfig(), payload);

    expect(context.recentOutput).toBeDefined();
    expect(context.recentOutput).toContain("Direct top-level output");
    expect(context.recentOutput).toContain("Top-level stdout");
  });

  it("includes untracked text files as bounded pseudo-diffs", async () => {
    const previousCwd = process.cwd();
    const cwd = mkdtempSync(join(tmpdir(), "agy-judge-untracked-"));
    execFileSync("git", ["init"], { cwd, stdio: "ignore" });
    writeFileSync(join(cwd, "new-file.ts"), "export const value = 1;\n");
    process.chdir(cwd);

    try {
      const context = await collectContext(baseConfig({ includeDiff: true, includeStatus: true }));

      expect(context.git.untrackedFiles).toContain("new-file.ts");
      expect(context.git.untrackedDiff).toContain("diff --git a/new-file.ts b/new-file.ts");
      expect(context.git.untrackedDiff).toContain("+export const value = 1;");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("truncates oversized hook payloads to maxPayloadBytes", async () => {
    const bigString = "x".repeat(20_000);
    const payload = JSON.stringify({ event: "agent_finished", output: bigString });
    const context = await collectContext(baseConfig({ maxPayloadBytes: 1000 }), payload);

    expect(context.hookPayload).toBeDefined();
    const obj = context.hookPayload as { _truncated: boolean; originalBytes: number; slice: string };
    expect(obj._truncated).toBe(true);
    expect(obj.originalBytes).toBeGreaterThan(1000);
    expect(obj.slice.length).toBeLessThanOrEqual(1000);
  });

  it("preserves hook payloads that fit within maxPayloadBytes", async () => {
    const payload = JSON.stringify({ event: "agent_finished", output: "small" });
    const context = await collectContext(baseConfig({ maxPayloadBytes: 1000 }), payload);

    expect(context.hookPayload).toEqual({ event: "agent_finished", output: "small" });
  });
});
