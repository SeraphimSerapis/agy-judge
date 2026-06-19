#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "agy-judge-hook-replay-"));
const workspace = join(tmp, "workspace");
const stateFile = join(tmp, "state.json");
const logFile = join(tmp, "events.ndjson");

run("git", ["init", workspace]);
writeFileSync(join(workspace, "changed.txt"), "review me\n", "utf8");

const payload = JSON.stringify({
  executionNum: 0,
  fullyIdle: true,
  conversationId: "hook-replay-smoke",
  workspacePaths: [workspace],
});

const env = {
  ...process.env,
  JUDGE_BASE_URL: "http://unused.invalid/v1",
  JUDGE_MODEL: "unused",
  JUDGE_FAIL_OPEN: "true",
  JUDGE_HOOK_STATE_FILE: stateFile,
  JUDGE_HOOK_LOG_FILE: logFile,
  JUDGE_LOCK_FILE: join(tmp, "hook-replay.lock"),
};

const first = runHook(root, payload, env);
const second = runHook(root, payload, env);
const debug = spawnSync(process.execPath, [join(root, "dist/index.js"), "hook-debug", "--format", "json"], {
  cwd: workspace,
  env,
  encoding: "utf8",
});

if (debug.status !== 0) {
  process.stderr.write(debug.stderr);
  process.exit(debug.status ?? 1);
}

const parsed = JSON.parse(debug.stdout);
const reasons = parsed.events.map((event) => event.reason).filter(Boolean);
if (!reasons.some((reason) => String(reason).includes("duplicate"))) {
  process.stderr.write(`Expected duplicate skip event. Events:\n${debug.stdout}\n`);
  process.exit(1);
}

process.stdout.write(
  [
    "hook replay smoke: OK",
    `workspace: ${workspace}`,
    `first stdout: ${first.stdout.trim()}`,
    `second stdout: ${second.stdout.trim()}`,
    `log file: ${logFile}`,
  ].join("\n"),
);

rmSync(tmp, { recursive: true, force: true });

function runHook(rootDir, stdin, env) {
  return spawnSync(process.execPath, [join(rootDir, "dist/index.js"), "hook"], {
    cwd: rootDir,
    env,
    input: stdin,
    encoding: "utf8",
  });
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
}
