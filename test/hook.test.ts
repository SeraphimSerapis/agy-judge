import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runHook } from "../src/commands/hook.js";
import { loadConfig } from "../src/config.js";

const previousEnv = { ...process.env };

afterEach(() => {
  process.env = { ...previousEnv };
  vi.restoreAllMocks();
});

function makeHookPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    fullyIdle: true,
    conversationId: "test-conv",
    executionNum: 1,
    workspacePaths: ["/tmp/agy-judge-test-nonexistent"],
    ...overrides,
  });
}

function createTestWorkspace(): string {
  const cwd = mkdtempSync(join(tmpdir(), "agy-judge-hook-test-"));
  execFileSync("git", ["init"], { cwd, stdio: "ignore" });
  writeFileSync(join(cwd, "test.ts"), "console.log('hello');\n");
  execFileSync("git", ["add", "test.ts"], { cwd, stdio: "ignore" });
  return cwd;
}

describe.sequential("hook command", () => {
  it("returns exit code 0 with no stdin (skip)", async () => {
    const result = await runHook(makeConfig(), { format: "text", stdinText: "" });
    expect(result).toBe(0);
    expect(lastStdout()).toBe('{"decision":""}');
  });

  it("returns exit code 0 for invalid JSON on stdin (skip)", async () => {
    const result = await runHook(makeConfig(), { format: "text", stdinText: "not-valid-json" });
    expect(result).toBe(0);
    expect(lastStdout()).toBe('{"decision":""}');
  });

  it("returns exit code 0 for missing workspace (skip)", async () => {
    const payload = makeHookPayload({
      workspacePaths: ["/tmp/agy-judge-nonexistent-workspace-path"],
    });
    const result = await runHook(makeConfig(), { format: "text", stdinText: payload });
    expect(result).toBe(0);
    expect(lastStdout()).toBe('{"decision":""}');
  });

  it("returns exit code 0 for fullyIdle=false (skip)", async () => {
    const workspace = createTestWorkspace();
    const payload = makeHookPayload({
      fullyIdle: false,
      workspacePaths: [workspace],
    });
    const result = await runHook(makeConfig(), { format: "text", stdinText: payload });
    expect(result).toBe(0);
    expect(lastStdout()).toBe('{"decision":""}');
  });

  it("returns exit code 0 for no git changes (skip)", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "agy-judge-hook-nochanges-"));
    execFileSync("git", ["init"], { cwd: workspace, stdio: "ignore" });
    const payload = makeHookPayload({ workspacePaths: [workspace] });
    const result = await runHook(makeConfig(), { format: "text", stdinText: payload });
    expect(result).toBe(0);
    expect(lastStdout()).toBe('{"decision":""}');
  });
});

function makeConfig() {
  const dir = mkdtempSync(join(tmpdir(), "agy-judge-hook-config-"));
  const config = loadConfig(dir, {
    JUDGE_MODE: "advisory",
    JUDGE_LOCK_FILE: join(dir, "agy-judge.lock"),
    JUDGE_HOOK_STATE_FILE: join(dir, "hook-state.json"),
    JUDGE_HOOK_LOG_FILE: join(dir, "hook-events.ndjson"),
    JUDGE_VERDICT_FILE: join(dir, "verdict.json"),
  });
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  return config;
}

function lastStdout(): string | undefined {
  const writeMock = vi.mocked(process.stdout.write);
  return String(writeMock.mock.calls.at(-1)?.[0]).trim();
}
