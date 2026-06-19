import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface HookReviewFingerprintInput {
  conversationId?: string;
  workspace: string;
  gitStatus: string;
  gitDiff: string;
  stagedGitDiff: string;
}

export interface HookReviewState {
  key: string;
  timestamp: number;
  conversationId?: string;
  workspace: string;
}

export function buildHookReviewKey(input: HookReviewFingerprintInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function readHookReviewState(path: string): HookReviewState | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<HookReviewState>;
    if (!parsed.key || typeof parsed.timestamp !== "number" || !parsed.workspace) return undefined;
    return {
      key: parsed.key,
      timestamp: parsed.timestamp,
      conversationId: parsed.conversationId,
      workspace: parsed.workspace,
    };
  } catch {
    return undefined;
  }
}

export function shouldSkipHookReview(
  state: HookReviewState | undefined,
  key: string,
  cooldownMs: number,
  now = Date.now(),
): { skip: boolean; reason?: string } {
  if (!state || state.key !== key) return { skip: false };
  const age = now - state.timestamp;
  if (cooldownMs === 0 || age < cooldownMs) {
    const policy = cooldownMs === 0 ? "until git state changes" : `cooldown ${Math.round(cooldownMs / 1000)}s`;
    return {
      skip: true,
      reason: `same review key seen ${Math.round(age / 1000)}s ago (${policy})`,
    };
  }
  return { skip: false };
}

export function writeHookReviewState(path: string, state: HookReviewState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
}
