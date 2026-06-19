import { openSync, closeSync, unlinkSync, statSync, writeSync, readFileSync, constants } from "node:fs";
import { join } from "node:path";

const STALE_MS = 300_000; // 5 minutes — generous upper bound for a judge call

/**
 * Attempts to acquire an exclusive lock. Returns a release function on success,
 * or undefined if another instance already holds the lock.
 *
 * Uses O_CREAT | O_EXCL for atomic creation (race-condition safe).
 * Writes the PID and timestamp so stale locks can be detected and reclaimed.
 */
export function acquireLock(
  lockFile: string = join(process.env.TMPDIR ?? "/tmp", "agy-judge.lock"),
): (() => void) | undefined {
  // Check for stale lock before attempting to acquire.
  if (isLockStale(lockFile)) {
    try {
      unlinkSync(lockFile);
    } catch {
      /* already removed */
    }
  }

  try {
    const fd = openSync(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    const payload = JSON.stringify({ pid: process.pid, ts: Date.now() });
    writeSync(fd, payload);
    closeSync(fd);

    const release = (): void => {
      process.removeListener("exit", release);
      try {
        unlinkSync(lockFile);
      } catch {
        /* best-effort */
      }
    };

    // Safety net: release on exit even if the caller forgets.
    process.once("exit", release);

    return release;
  } catch {
    // O_EXCL failed → another process holds the lock.
    return undefined;
  }
}

function isLockStale(lockFile: string): boolean {
  try {
    const stat = statSync(lockFile);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > STALE_MS) return true;

    // Also check if the PID that wrote the lock is still running.
    const content = readFileSync(lockFile, "utf8");
    const { pid } = JSON.parse(content) as { pid: number };
    try {
      process.kill(pid, 0); // Signal 0 = existence check, doesn't kill.
      return false; // Process is alive → lock is valid.
    } catch {
      return true; // Process is gone → lock is stale.
    }
  } catch {
    return false; // Can't stat → no lock file exists.
  }
}
