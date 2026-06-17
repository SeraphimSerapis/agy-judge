import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/redact.js";

describe("redactSecrets", () => {
  it("redacts common token formats", () => {
    const text = [
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890",
      "AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF",
      "api_key=sk-abcdefghijklmnopqrstuvwxyz123456"
    ].join("\n");

    const redacted = redactSecrets(text);

    expect(redacted).not.toContain("ghp_");
    expect(redacted).not.toContain("AKIA1234567890ABCDEF");
    expect(redacted).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(redacted.match(/\[REDACTED_SECRET\]/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("redacts private keys", () => {
    const redacted = redactSecrets(`-----BEGIN PRIVATE KEY-----
abc123
-----END PRIVATE KEY-----`);

    expect(redacted).toBe("[REDACTED_SECRET]");
  });
});
