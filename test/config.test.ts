import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfigStatus, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads JUDGE_HEADERS from .env without leaking values in status", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agy-judge-config-"));
    writeFileSync(
      join(cwd, ".env"),
      [
        "JUDGE_BASE_URL=http://localhost:8123/v1",
        "JUDGE_MODEL=mock-from-env-file",
        'JUDGE_HEADERS=\'{"X-API-KEY":"secret-value","X-Test":"ok"}\'',
      ].join("\n"),
    );

    const config = loadConfig(cwd, {});
    const status = getConfigStatus(config);

    expect(config.baseUrl).toBe("http://localhost:8123/v1");
    expect(config.model).toBe("mock-from-env-file");
    expect(config.headers).toEqual({ "X-API-KEY": "secret-value", "X-Test": "ok" });
    expect(status.JUDGE_HEADERS).toBe("2 configured");
    expect(Object.values(status).join(" ")).not.toContain("secret-value");
  });

  it("lets real environment values override .env values", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agy-judge-config-"));
    writeFileSync(join(cwd, ".env"), "JUDGE_MODEL=from-env-file\n");

    const config = loadConfig(cwd, { JUDGE_MODEL: "from-process-env" });

    expect(config.model).toBe("from-process-env");
  });

  it("defaults hook dedup to same-key until git state changes", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agy-judge-config-"));

    const config = loadConfig(cwd, {});

    expect(config.hookDedup).toBe(true);
    expect(config.hookCooldownMs).toBe(0);
  });

  it("allows a positive hook dedup cooldown override", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agy-judge-config-"));

    const config = loadConfig(cwd, { JUDGE_HOOK_COOLDOWN_MS: "60000" });

    expect(config.hookCooldownMs).toBe(60000);
  });

  describe("invalid value warnings", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("warns on stderr when JUDGE_MODE is invalid", () => {
      const cwd = mkdtempSync(join(tmpdir(), "agy-judge-config-"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const config = loadConfig(cwd, { JUDGE_MODE: "urgent" });

      expect(config.mode).toBe("advisory");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('JUDGE_MODE: invalid value "urgent"'));
    });

    it("warns on stderr when JUDGE_PROFILE is invalid", () => {
      const cwd = mkdtempSync(join(tmpdir(), "agy-judge-config-"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const config = loadConfig(cwd, { JUDGE_PROFILE: "perf" });

      expect(config.profile).toBe("default");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('JUDGE_PROFILE: invalid value "perf"'));
    });

    it("warns on stderr when JUDGE_BLOCK_ON has invalid severities", () => {
      const cwd = mkdtempSync(join(tmpdir(), "agy-judge-config-"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const config = loadConfig(cwd, { JUDGE_BLOCK_ON: "critical,urgent,high" });

      expect(config.blockOn).toEqual(["critical", "high"]);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('JUDGE_BLOCK_ON: invalid value(s) "urgent"'));
    });

    it("does not warn when values are valid", () => {
      const cwd = mkdtempSync(join(tmpdir(), "agy-judge-config-"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      loadConfig(cwd, {
        JUDGE_MODE: "block",
        JUDGE_PROFILE: "security",
        JUDGE_BLOCK_ON: "critical,high",
      });

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
