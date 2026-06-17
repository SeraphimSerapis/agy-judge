import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { JudgeConfig } from "./config.js";
import { redactSecrets } from "./redact.js";

export interface ReviewContext {
  cwd: string;
  timestamp: string;
  git: {
    available: boolean;
    statusShort: string;
    diffStat: string;
    diff: string;
    stagedDiffStat: string;
    stagedDiff: string;
    notes: string[];
  };
  packageJson?: {
    name?: string;
    version?: string;
    scripts?: Record<string, string>;
  };
  hookPayload?: unknown;
  recentOutput?: string;
}

export async function collectContext(config: JudgeConfig, hookPayloadText?: string): Promise<ReviewContext> {
  const cwd = process.cwd();
  const hookPayload = parseHookPayload(hookPayloadText);
  const context: ReviewContext = {
    cwd,
    timestamp: new Date().toISOString(),
    git: collectGit(config),
    packageJson: collectPackageJson(cwd),
    hookPayload: config.includeHookPayload ? hookPayload : undefined,
    recentOutput: extractRecentOutput(hookPayload, config.maxOutputBytes)
  };
  return JSON.parse(redactSecrets(JSON.stringify(context))) as ReviewContext;
}

function collectGit(config: JudgeConfig): ReviewContext["git"] {
  const notes: string[] = [];
  const statusShort = config.includeStatus ? runGit(["status", "--short"], notes) : "disabled by config";
  const diffStat = config.includeDiff ? runGit(["diff", "--stat"], notes) : "disabled by config";
  const diff = config.includeDiff ? truncate(runGit(["diff"], notes), config.maxDiffBytes) : "disabled by config";
  const stagedDiffStat = config.includeDiff ? runGit(["diff", "--cached", "--stat"], notes) : "disabled by config";
  const stagedDiff = config.includeDiff
    ? truncate(runGit(["diff", "--cached"], notes), config.maxDiffBytes)
    : "disabled by config";
  return {
    available: !notes.some((note) => note.includes("git unavailable")) && !notes.some((note) => note.includes("not a git repo")),
    statusShort,
    diffStat,
    diff,
    stagedDiffStat,
    stagedDiff,
    notes
  };
}

function runGit(args: string[], notes: string[]): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    }).trim() || "(empty)";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const note = message.includes("not a git repository") ? "not a git repo" : `git unavailable or command failed: git ${args.join(" ")}`;
    if (!notes.includes(note)) notes.push(note);
    return "(unavailable)";
  }
}

function collectPackageJson(cwd: string): ReviewContext["packageJson"] | undefined {
  const path = join(cwd, "package.json");
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { name?: string; version?: string; scripts?: Record<string, string> };
    return {
      name: raw.name,
      version: raw.version,
      scripts: raw.scripts
    };
  } catch {
    return undefined;
  }
}

function parseHookPayload(text?: string): unknown {
  if (!text || text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractRecentOutput(payload: unknown, maxBytes: number): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const candidates = ["output", "command_output", "test_output", "logs", "stdout", "stderr", "transcript"];
  const values = candidates
    .map((key) => record[key])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (values.length === 0) return undefined;
  return truncate(values.join("\n\n"), maxBytes);
}

function truncate(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value);
  if (bytes.length <= maxBytes) return value;
  return `${bytes.subarray(0, maxBytes).toString("utf8")}\n[truncated to ${maxBytes} bytes]`;
}
