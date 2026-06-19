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
    untrackedFiles: string;
    untrackedDiff: string;
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

export async function collectContext(
  config: JudgeConfig,
  hookPayloadText?: string,
  cwd: string = process.cwd(),
): Promise<ReviewContext> {
  const hookPayload = hookPayloadText ? parseHookPayload(hookPayloadText) : undefined;
  const context: ReviewContext = {
    cwd,
    timestamp: new Date().toISOString(),
    git: collectGit(config, cwd),
    packageJson: collectPackageJson(cwd),
    hookPayload: config.includeHookPayload ? truncateHookPayload(hookPayload, config.maxPayloadBytes) : undefined,
    recentOutput: extractRecentOutput(hookPayload, config.maxOutputBytes),
  };
  return JSON.parse(redactSecrets(JSON.stringify(context))) as ReviewContext;
}

function collectGit(config: JudgeConfig, cwd: string): ReviewContext["git"] {
  const notes: string[] = [];
  const statusShort = config.includeStatus ? runGit(["status", "--short"], notes, cwd) : "disabled by config";
  const diffStat = config.includeDiff ? runGit(["diff", "--stat"], notes, cwd) : "disabled by config";
  const diff = config.includeDiff ? truncate(runGit(["diff"], notes, cwd), config.maxDiffBytes) : "disabled by config";
  const stagedDiffStat = config.includeDiff ? runGit(["diff", "--cached", "--stat"], notes, cwd) : "disabled by config";
  const stagedDiff = config.includeDiff
    ? truncate(runGit(["diff", "--cached"], notes, cwd), config.maxDiffBytes)
    : "disabled by config";
  const untrackedFiles = config.includeDiff ? collectUntrackedFiles(notes, cwd) : "disabled by config";
  const untrackedDiff = config.includeDiff
    ? truncate(collectUntrackedDiff(untrackedFiles, config.maxDiffBytes, cwd), config.maxDiffBytes)
    : "disabled by config";
  return {
    available:
      !notes.some((note) => note.includes("git unavailable")) && !notes.some((note) => note.includes("not a git repo")),
    statusShort,
    diffStat,
    diff,
    stagedDiffStat,
    stagedDiff,
    untrackedFiles,
    untrackedDiff,
    notes,
  };
}

function runGit(args: string[], notes: string[], cwd: string): string {
  try {
    return (
      execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim() || "(empty)"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const note = message.includes("not a git repository")
      ? "not a git repo"
      : `git unavailable or command failed: git ${args.join(" ")}`;
    if (!notes.includes(note)) notes.push(note);
    return "(unavailable)";
  }
}

function collectUntrackedFiles(notes: string[], cwd: string): string {
  try {
    const output = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output || "(empty)";
  } catch {
    const note = "git unavailable or command failed: git ls-files --others --exclude-standard";
    if (!notes.includes(note)) notes.push(note);
    return "(unavailable)";
  }
}

function collectUntrackedDiff(untrackedFiles: string, maxBytes: number, cwd: string): string {
  if (!untrackedFiles || untrackedFiles === "(empty)" || untrackedFiles === "(unavailable)") return untrackedFiles;
  const parts: string[] = [];
  for (const file of untrackedFiles.split(/\r?\n/).filter(Boolean)) {
    const path = join(cwd, file);
    try {
      const content = readFileSync(path);
      if (content.includes(0)) {
        parts.push(`diff --git a/${file} b/${file}\nnew file mode 100644\n[untracked binary file omitted]\n`);
      } else {
        const text = content.toString("utf8");
        parts.push(
          [
            `diff --git a/${file} b/${file}`,
            "new file mode 100644",
            "--- /dev/null",
            `+++ b/${file}`,
            ...text.split(/\r?\n/).map((line) => `+${line}`),
          ].join("\n"),
        );
      }
    } catch {
      parts.push(`diff --git a/${file} b/${file}\n[untracked file could not be read]\n`);
    }
    if (Buffer.byteLength(parts.join("\n\n")) >= maxBytes) break;
  }
  return parts.length > 0 ? truncate(parts.join("\n\n"), maxBytes) : "(empty)";
}

function collectPackageJson(cwd: string): ReviewContext["packageJson"] | undefined {
  const path = join(cwd, "package.json");
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      name?: string;
      version?: string;
      scripts?: Record<string, string>;
    };
    return {
      name: raw.name,
      version: raw.version,
      scripts: raw.scripts,
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

  // Collect from top-level string fields.
  const topLevelKeys = ["output", "command_output", "test_output", "logs", "stdout", "stderr", "transcript"];
  const values: string[] = topLevelKeys
    .map((key) => record[key])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  // Traverse nested array structures (commands, steps, actions) to extract output.
  const arrayKeys = ["commands", "steps", "actions"];
  const nestedOutputKeys = ["output", "stdout", "stderr", "logs", "command_output", "test_output"];
  for (const arrayKey of arrayKeys) {
    const items = record[arrayKey];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const label = typeof entry.command === "string" ? `$ ${entry.command}\n` : "";
      for (const key of nestedOutputKeys) {
        const value = entry[key];
        if (typeof value === "string" && value.trim().length > 0) {
          values.push(`${label}${value}`);
        }
      }
    }
  }

  // Also extract final_response as supplementary context.
  if (typeof record.final_response === "string" && record.final_response.trim().length > 0) {
    values.push(`Agent final response: ${record.final_response}`);
  }

  if (values.length === 0) return undefined;
  return truncate(values.join("\n\n"), maxBytes);
}

function truncate(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value);
  if (bytes.length <= maxBytes) return value;
  // Walk back from maxBytes to avoid splitting a multi-byte UTF-8 sequence.
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return `${bytes.subarray(0, end).toString("utf8")}\n[truncated to ${end} bytes]`;
}

/**
 * Truncate a hook payload's serialized size to `maxPayloadBytes` so a large
 * Stop payload doesn't dominate the review context. If the payload fits, it
 * is returned as-is. If it doesn't, the serialized representation is sliced
 * and a `truncated: true` marker is added.
 */
function truncateHookPayload(payload: unknown, maxBytes: number): unknown {
  if (payload === undefined) return undefined;
  const serialized = JSON.stringify(payload);
  const byteLength = Buffer.byteLength(serialized);
  if (byteLength <= maxBytes) return payload;
  // Slice by bytes (not characters) to respect the byte limit.
  const buf = Buffer.from(serialized);
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  const slice = buf.subarray(0, end).toString("utf8");
  return { _truncated: true, originalBytes: byteLength, slice };
}
