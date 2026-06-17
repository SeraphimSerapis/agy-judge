import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getConfigStatus, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads JUDGE_HEADERS from .env without leaking values in status", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agy-judge-config-"));
    writeFileSync(
      join(cwd, ".env"),
      [
        "JUDGE_BASE_URL=http://localhost:8123/v1",
        "JUDGE_MODEL=mock-from-env-file",
        "JUDGE_HEADERS='{\"X-API-KEY\":\"secret-value\",\"X-Test\":\"ok\"}'"
      ].join("\n")
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
});
