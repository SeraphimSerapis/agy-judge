import { execFileSync } from "node:child_process";

/**
 * Pathspec excludes for files that agy-judge itself generates or writes.
 * Used by both collectContext and the Stop hook's git snapshot so the
 * review never includes agy-judge's own artefacts.
 */
export const hookGeneratedPathspecExcludes: string[] = [":(exclude).agy-judge-result.md"];

export interface HookGitSnapshot {
  hasChanges: boolean;
  status: string;
  diff: string;
  stagedDiff: string;
}

export function getHookGitSnapshot(cwd: string = process.cwd()): HookGitSnapshot {
  try {
    const status = execFileSync("git", ["status", "--short", "--", ".", ...hookGeneratedPathspecExcludes], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const diff = execFileSync("git", ["diff", "--", ".", ...hookGeneratedPathspecExcludes], {
      cwd,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const stagedDiff = execFileSync("git", ["diff", "--cached", "--", ".", ...hookGeneratedPathspecExcludes], {
      cwd,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return {
      hasChanges: status.length > 0 || diff.length > 0 || stagedDiff.length > 0,
      status,
      diff,
      stagedDiff,
    };
  } catch {
    // Not a git repo or git unavailable — skip.
    return { hasChanges: false, status: "", diff: "", stagedDiff: "" };
  }
}
