import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getHookGitSnapshot } from "../src/hookGit.js";

describe("getHookGitSnapshot", () => {
  it("ignores agy-judge generated result files", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agy-judge-hook-snapshot-"));
    execFileSync("git", ["init"], { cwd, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
    execFileSync("git", ["config", "user.name", "Test"], { cwd });
    writeFileSync(join(cwd, "README.md"), "hello\n");
    execFileSync("git", ["add", "README.md"], { cwd });
    execFileSync("git", ["commit", "-m", "initial"], { cwd, stdio: "ignore" });
    writeFileSync(join(cwd, ".agy-judge-result.md"), "generated\n");
    execFileSync("git", ["add", ".agy-judge-result.md"], { cwd });
    execFileSync("git", ["commit", "-m", "track generated file for regression"], { cwd, stdio: "ignore" });

    writeFileSync(join(cwd, ".agy-judge-result.md"), "generated update\n");

    const snapshot = getHookGitSnapshot(cwd);

    expect(snapshot.hasChanges).toBe(false);
    expect(snapshot.status).toBe("");
    expect(snapshot.diff).toBe("");
  });

  it("still sees real source changes", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agy-judge-hook-snapshot-"));
    execFileSync("git", ["init"], { cwd, stdio: "ignore" });
    writeFileSync(join(cwd, "source.txt"), "changed\n");

    const snapshot = getHookGitSnapshot(cwd);

    expect(snapshot.hasChanges).toBe(true);
    expect(snapshot.status).toContain("source.txt");
  });

  it("returns no changes outside a git repository", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agy-judge-hook-snapshot-nogit-"));
    writeFileSync(join(cwd, "file.txt"), "data\n");

    const snapshot = getHookGitSnapshot(cwd);

    expect(snapshot.hasChanges).toBe(false);
    expect(snapshot.status).toBe("");
    expect(snapshot.diff).toBe("");
    expect(snapshot.stagedDiff).toBe("");
  });
});
