import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import type { JudgeResponse } from "../src/schema.js";

const previousEnv = { ...process.env };
const previousCwd = process.cwd();

describe.sequential("review flow", () => {
  afterEach(() => {
    process.env = { ...previousEnv };
    process.chdir(previousCwd);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("calls an OpenAI-compatible endpoint with configured custom headers", async () => {
    chdirToReviewableRepo();
    configureEnv({ JUDGE_MODE: "advisory", JUDGE_HEADERS: '{"X-Test":"review-flow"}' });
    const fetchMock = mockJudgeFetch(mockJudgeResponse({ verdict: "pass", should_block: false, issues: [] }));
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const exitCode = await runCli(["review"]);

    expect(exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://mock-judge.local/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "X-Test": "review-flow",
      "content-type": "application/json"
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "mock-model",
      temperature: 0,
      response_format: { type: "json_object" }
    });
    expect(logMock.mock.calls.at(-1)?.[0]).toContain("agy-judge: PASS");
  });

  it("returns exit code 1 when block policy matches a critical issue", async () => {
    chdirToReviewableRepo();
    configureEnv({
      JUDGE_MODE: "block",
      JUDGE_BLOCK_ON: "critical",
      JUDGE_HEADERS: "{}"
    });
    mockJudgeFetch(
      mockJudgeResponse({
        verdict: "fail",
        should_block: true,
        issues: [
          {
            severity: "critical",
            category: "correctness",
            message: "Critical mocked issue",
            evidence: "Mock evidence",
            suggested_fix: "Fix the mocked issue"
          }
        ]
      })
    );
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const exitCode = await runCli(["review"]);

    expect(exitCode).toBe(1);
    expect(logMock.mock.calls.at(-1)?.[0]).toContain("agy-judge: BLOCK");
  });

  it("skips the judge call when there is no reviewable context", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "agy-judge-empty-"));
    process.chdir(cwd);
    configureEnv({ JUDGE_MODE: "advisory" });
    const fetchMock = mockJudgeFetch(mockJudgeResponse({}));
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const exitCode = await runCli(["review", "--format", "json"]);

    expect(exitCode).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    const output = JSON.parse(String(logMock.mock.calls.at(-1)?.[0]));
    expect(output.source).toBe("local-preflight");
    expect(output.skippedJudgeCall).toBe(true);
  });

  it("runs doctor against the configured endpoint", async () => {
    configureEnv({ JUDGE_MODE: "advisory" });
    const fetchMock = mockJudgeFetch(mockJudgeResponse({ verdict: "pass", should_block: false, issues: [] }));
    const logMock = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const exitCode = await runCli(["doctor", "--format", "json"]);

    expect(exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    const output = JSON.parse(String(logMock.mock.calls.at(-1)?.[0]));
    expect(output.ok).toBe(true);
    expect(output.checks.model).toBe(true);
    expect(output.diagnostic.verdict).toBe("pass");
  });
});

function chdirToReviewableRepo(): void {
  const cwd = mkdtempSync(join(tmpdir(), "agy-judge-review-"));
  execFileSync("git", ["init"], { cwd, stdio: "ignore" });
  writeFileSync(join(cwd, "changed.txt"), "review me\n");
  process.chdir(cwd);
}

function configureEnv(overrides: Record<string, string>): void {
  process.env = {
    ...previousEnv,
    JUDGE_BASE_URL: "http://mock-judge.local/v1",
    JUDGE_MODEL: "mock-model",
    JUDGE_API_KEY: "",
    JUDGE_INCLUDE_DIFF: "true",
    JUDGE_INCLUDE_STATUS: "true",
    JUDGE_FAIL_OPEN: "true",
    ...overrides
  };
}

function mockJudgeFetch(judgeResponse: JudgeResponse) {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(judgeResponse) } }]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
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
      evidence: 5
    },
    summary: "Mocked review summary.",
    issues: [],
    required_changes: [],
    optional_improvements: [],
    judge_notes: "Mocked judge notes.",
    ...overrides
  };
}
