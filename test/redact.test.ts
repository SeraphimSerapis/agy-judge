import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/redact.js";

describe("redactSecrets", () => {
  it("redacts common token formats", () => {
    const text = [
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890",
      "AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF",
      "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
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

  it("redacts RSA private keys", () => {
    const redacted = redactSecrets(`-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----`);

    expect(redacted).toBe("[REDACTED_SECRET]");
  });

  it("redacts .env-style key=value secrets", () => {
    const text = [
      "password=my_super_secret_password_123",
      "client_secret=abcdef1234567890abcdef",
      "access_token=eyJhbGciOiJIUzI1NiJ9",
    ].join("\n");

    const redacted = redactSecrets(text);

    expect(redacted).not.toContain("my_super_secret_password_123");
    expect(redacted).not.toContain("abcdef1234567890abcdef");
  });

  it("redacts Google API keys", () => {
    // Build the fake key at runtime so GitHub secret scanning does not
    // flag the test file as containing a real Google API key.
    const fakeKey = "AIza" + "SyD_1234567890abcdefghijklmnopqrstu";
    const text = `GOOGLE_API_KEY=${fakeKey}`;
    const redacted = redactSecrets(text);

    expect(redacted).not.toContain(fakeKey);
    expect(redacted).toContain("[REDACTED_SECRET]");
  });

  it("redacts authorization headers appearing in diffs", () => {
    const diff = `+  headers: {
+    "Authorization": "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0"
+  }`;

    const redacted = redactSecrets(diff);

    expect(redacted).not.toContain("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9");
  });

  it("redacts OpenAI-style sk- tokens", () => {
    const text = "const key = 'sk-proj-abcdefghijklmnopqrstuvwxyz';";
    const redacted = redactSecrets(text);

    expect(redacted).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz");
  });

  it("preserves short normal strings", () => {
    const text = "hello world\nfoo=bar\nstatus: ok";
    const redacted = redactSecrets(text);

    expect(redacted).toBe(text);
  });

  // ── False-positive regression suite ────────────────────────────────────
  // The redaction regex must not destroy legitimate long identifiers, file
  // paths, commit SHAs, or base64-encoded file content.

  it("preserves a 64-character commit SHA", () => {
    const sha = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const text = `commit ${sha}\nAuthor: Test\nDate: Mon Jan 1 00:00:00 2026`;
    expect(redactSecrets(text)).toBe(text);
  });

  it("preserves a 60-character branch name", () => {
    const branch = "feat/long-branch-name-with-many-words-to-test-redaction-safety";
    const text = `Branch: ${branch}`;
    expect(redactSecrets(text)).toBe(text);
  });

  it("preserves a 50-character base64-encoded SVG file content", () => {
    const b64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdC";
    const text = `<svg>...${b64}...`;
    expect(redactSecrets(text)).toBe(text);
  });

  it("preserves a long file path with no secret-like content", () => {
    const path = "/Users/example/projects/very-long-repo-name/src/components/SomeFile.tsx";
    const text = `Reading ${path}`;
    expect(redactSecrets(text)).toBe(text);
  });

  it("preserves long alphanumeric identifiers in normal code", () => {
    const id = "aVeryLongCamelCaseIdentifierThatExceedsFortyEightCharactersInLength";
    const text = `const ${id} = compute();`;
    expect(redactSecrets(text)).toBe(text);
  });

  it("redacts Slack tokens", () => {
    // Build the fake token at runtime so GitHub push protection does not
    // flag the test file as containing a real Slack secret.
    const fakeToken = ["xoxb", "1234567890", "1234567890123", "AbCdEfGhIjKlMnOpQrStUvWx"].join("-");
    const text = `SLACK_TOKEN=${fakeToken}`;
    const redacted = redactSecrets(text);
    expect(redacted).toContain("[REDACTED_SECRET]");
    expect(redacted).not.toContain("xoxb-1234567890");
  });

  // ── JSON redaction ─────────────────────────────────────────────────────
  // `agy-judge` runs redaction on the stringified review context, so the
  // .env-style pattern must handle JSON-quoted keys without breaking the
  // surrounding JSON structure.

  it("redacts JSON-formatted key:value secrets and keeps the JSON parseable", () => {
    const obj = { apiKey: "abcdef12345678", secret: "mySecretValue12345" };
    const json = JSON.stringify(obj);
    const redacted = redactSecrets(json);

    expect(redacted).not.toContain("abcdef12345678");
    expect(redacted).not.toContain("mySecretValue12345");
    expect(redacted).toContain("[REDACTED_SECRET]");

    // The result must still be valid JSON with the same keys.
    const parsed = JSON.parse(redacted);
    expect(parsed.apiKey).toBe("[REDACTED_SECRET]");
    expect(parsed.secret).toBe("[REDACTED_SECRET]");
    expect(Object.keys(parsed).sort()).toEqual(["apiKey", "secret"]);
  });

  it("redacts JSON keys in snake_case and kebab-case", () => {
    const obj = { api_key: "abcdef12345678", "client-secret": "zzzzz999988887777" };
    const json = JSON.stringify(obj);
    const redacted = redactSecrets(json);

    expect(redacted).not.toContain("abcdef12345678");
    expect(redacted).not.toContain("zzzzz999988887777");
    const parsed = JSON.parse(redacted);
    expect(parsed.api_key).toBe("[REDACTED_SECRET]");
    expect(parsed["client-secret"]).toBe("[REDACTED_SECRET]");
  });

  it("does not corrupt JSON when a non-secret hyphenated key contains a keyword", () => {
    const obj = { "my-secret": "abcdef12345678" };
    const json = JSON.stringify(obj);
    const redacted = redactSecrets(json);

    expect(redacted).toBe(json);
    expect(JSON.parse(redacted)).toEqual(obj);
  });

  it("does not redact JSON values whose keys are not in the keyword list", () => {
    const obj = { name: "abcdef12345678", description: "abcdef12345678" };
    const json = JSON.stringify(obj);
    const redacted = redactSecrets(json);
    expect(redacted).toBe(json);
  });
});
