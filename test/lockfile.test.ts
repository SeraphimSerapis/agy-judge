import { existsSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireLock } from "../src/lockfile.js";

const LOCK_FILE = join(tmpdir(), "agy-judge-test.lock");

function cleanupLock(): void {
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    /* no lock to clean */
  }
}

describe("lockfile", () => {
  beforeEach(cleanupLock);
  afterEach(cleanupLock);

  it("acquires a lock and returns a release function", () => {
    const release = acquireLock(LOCK_FILE);
    expect(release).toBeDefined();
    expect(typeof release).toBe("function");
    expect(existsSync(LOCK_FILE)).toBe(true);
    release?.();
  });

  it("prevents a second lock while the first is held", () => {
    const first = acquireLock(LOCK_FILE);
    expect(first).toBeDefined();

    const second = acquireLock(LOCK_FILE);
    expect(second).toBeUndefined();

    first?.();
  });

  it("allows a new lock after the first is released", () => {
    const first = acquireLock(LOCK_FILE);
    expect(first).toBeDefined();
    first?.();

    const second = acquireLock(LOCK_FILE);
    expect(second).toBeDefined();
    second?.();
  });

  it("release is idempotent", () => {
    const release = acquireLock(LOCK_FILE);
    expect(release).toBeDefined();

    release?.();
    release?.();
  });

  it("creates the lock file with 0o600 permissions", () => {
    const release = acquireLock(LOCK_FILE);
    expect(release).toBeDefined();

    // Mask with 0o777 to extract just the permission bits.
    const mode = statSync(LOCK_FILE).mode & 0o777;
    expect(mode).toBe(0o600);

    release?.();
  });

  it("uses the provided lock file path", () => {
    const customPath = join(tmpdir(), "agy-judge-custom.lock");
    try {
      const release = acquireLock(customPath);
      expect(release).toBeDefined();
      expect(existsSync(customPath)).toBe(true);
      release?.();
    } finally {
      try {
        unlinkSync(customPath);
      } catch {
        /* ignore */
      }
    }
  });
});
