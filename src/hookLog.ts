import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";

export interface HookLogEvent {
  timestamp: string;
  event: "received" | "skip" | "judge_start" | "judge_result" | "continue" | "error";
  reason?: string;
  conversationId?: string;
  executionNum?: number;
  fullyIdle?: boolean;
  workspace?: string;
  reviewKey?: string;
  verdict?: string;
  issueCount?: number;
}

export function appendHookLogEvent(path: string, event: Omit<HookLogEvent, "timestamp">): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch {
    // Best effort: hook logging must never affect the hook contract.
  }
}

export function readHookLogEvents(path: string, limit = 20): HookLogEvent[] {
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).slice(-limit);
    return lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as HookLogEvent];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function clearHookLog(path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "", { encoding: "utf8", mode: 0o600 });
  } catch {
    // Best effort.
  }
}
