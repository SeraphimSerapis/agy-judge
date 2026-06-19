import { afterEach, describe, expect, it, vi } from "vitest";
import type { JudgeConfig } from "../src/config.js";
import { callJudge, extractJsonObject, JudgeClientError } from "../src/judgeClient.js";
import type { JudgeResponse } from "../src/schema.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractJsonObject", () => {
  it("returns a clean JSON object unchanged", () => {
    const input = `{"verdict":"pass","summary":"ok"}`;
    expect(extractJsonObject(input)).toBe(input);
  });

  it("strips a Markdown ```json fence", () => {
    const input = '```json\n{"verdict":"pass"}\n```';
    expect(extractJsonObject(input)).toBe(`{"verdict":"pass"}`);
  });

  it("strips a Markdown ``` fence (no language tag)", () => {
    const input = '```\n{"verdict":"pass"}\n```';
    expect(extractJsonObject(input)).toBe(`{"verdict":"pass"}`);
  });

  it("extracts JSON from prose with stray '}' before the object", () => {
    const input = 'Some preamble text with a } brace. Then {"verdict":"pass"}';
    expect(extractJsonObject(input)).toBe(`{"verdict":"pass"}`);
  });

  it("respects nested objects and braces inside strings", () => {
    const input = `prefix { "a": "}}}", "b": { "c": 1 } } suffix`;
    expect(extractJsonObject(input)).toBe(`{ "a": "}}}", "b": { "c": 1 } }`);
  });

  it("respects escaped quotes inside string values", () => {
    const input = `prefix { "a": "he said \\"hi\\"" } suffix`;
    expect(extractJsonObject(input)).toBe(`{ "a": "he said \\"hi\\"" }`);
  });

  it("returns the input unchanged if there is no '{'", () => {
    expect(extractJsonObject("no json here")).toBe("no json here");
  });

  it("handles whitespace and newlines", () => {
    const input = `\n  \n{"verdict":"pass"}\n\n`;
    expect(extractJsonObject(input)).toBe(`{"verdict":"pass"}`);
  });
});

describe("callJudge", () => {
  it("requires JUDGE_BASE_URL", async () => {
    await expect(callJudge({ ...baseConfig(), baseUrl: "" }, "system", "user")).rejects.toThrow(
      "JUDGE_BASE_URL is required",
    );
  });

  it("requires JUDGE_MODEL", async () => {
    await expect(callJudge({ ...baseConfig(), model: "" }, "system", "user")).rejects.toThrow(
      "JUDGE_MODEL is required",
    );
  });

  it("sends an OpenAI-compatible request and parses the response", async () => {
    const fetchMock = mockJudgeFetch([JSON.stringify(mockJudgeResponse({ verdict: "pass" }))]);

    const result = await callJudge(baseConfig(), "system prompt", "user prompt");

    expect(result.verdict).toBe("pass");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://judge.local/v1/chat/completions");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer test-key",
      "content-type": "application/json",
      "X-Test": "yes",
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "judge-model",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
      ],
    });
  });

  it("throws on HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "boom" }, { status: 500 })) as unknown as typeof fetch,
    );

    await expect(callJudge(baseConfig(), "system", "user")).rejects.toThrow("Judge endpoint returned HTTP 500");
  });

  it("throws when the endpoint returns no message content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{}] })) as unknown as typeof fetch);

    await expect(callJudge(baseConfig(), "system", "user")).rejects.toThrow(
      "Judge endpoint returned no message content",
    );
  });

  it("repairs invalid JSON/schema with one retry", async () => {
    const fetchMock = mockJudgeFetch(["not valid json", JSON.stringify(mockJudgeResponse({ verdict: "warn" }))]);

    const result = await callJudge(baseConfig(), "system", "user");

    expect(result.verdict).toBe("warn");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(secondBody.messages).toEqual(
      expect.arrayContaining([
        { role: "assistant", content: "not valid json" },
        expect.objectContaining({ role: "user", content: expect.stringContaining("previous response was not valid") }),
      ]),
    );
  });

  it("throws when repair retry still returns invalid JSON/schema", async () => {
    mockJudgeFetch(["not valid json", JSON.stringify({ verdict: "pass" })]);
    const result = callJudge(baseConfig(), "system", "user");

    await expect(result).rejects.toThrow(JudgeClientError);
    await expect(result).rejects.toThrow("Judge returned invalid JSON/schema after retry");
  });
});

function baseConfig(): JudgeConfig {
  return {
    baseUrl: "http://judge.local/v1",
    apiKey: "test-key",
    headers: { "X-Test": "yes" },
    model: "judge-model",
    temperature: 0,
    timeoutMs: 60_000,
    mode: "advisory",
    blockOn: ["critical"],
    failOpen: true,
    maxDiffBytes: 120_000,
    maxOutputBytes: 60_000,
    maxPayloadBytes: 120_000,
    includeDiff: true,
    includeStatus: true,
    includeHookPayload: true,
    profile: "default",
    dumpRaw: false,
    hookDedup: true,
    hookCooldownMs: 0,
    hookStateFile: "/tmp/agy-judge-test-state.json",
    hookLogFile: "/tmp/agy-judge-test-log.ndjson",

    hookAutofix: false,
    lockFile: "/tmp/agy-judge-test.lock",
    verdictFile: "/tmp/agy-judge-test-verdict.json",
  };
}

function mockJudgeFetch(contents: string[]) {
  const fetchMock = vi.fn(async () => {
    const content = contents.shift() ?? "";
    return Response.json({ choices: [{ message: { content } }] });
  }) as unknown as ReturnType<typeof vi.fn<typeof fetch>>;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockJudgeResponse(overrides: Partial<JudgeResponse>): JudgeResponse {
  return {
    verdict: "pass",
    should_block: false,
    confidence: 0.9,
    scores: {
      user_intent: 5,
      correctness: 5,
      completeness: 5,
      safety_security: 5,
      maintainability: 5,
      evidence: 5,
    },
    summary: "Mocked judge response.",
    issues: [],
    required_changes: [],
    optional_improvements: [],
    judge_notes: "",
    ...overrides,
  };
}
