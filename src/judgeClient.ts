import type { JudgeConfig } from "./config.js";
import { repairPrompt } from "./prompt.js";
import { judgeResponseSchema, type JudgeResponse } from "./schema.js";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class JudgeClientError extends Error {}

export async function callJudge(config: JudgeConfig, systemPrompt: string, userPrompt: string): Promise<JudgeResponse> {
  if (!config.baseUrl) throw new JudgeClientError("JUDGE_BASE_URL is required for review calls.");
  if (!config.model) throw new JudgeClientError("JUDGE_MODEL is required for review calls.");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
  const first = await chatCompletion(config, messages);
  const firstParsed = parseJudgeResponse(first);
  if (firstParsed.ok) return firstParsed.value;

  const repairMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: first },
    { role: "user", content: repairPrompt }
  ];
  const second = await chatCompletion(config, repairMessages);
  const secondParsed = parseJudgeResponse(second);
  if (secondParsed.ok) return secondParsed.value;
  throw new JudgeClientError(`Judge returned invalid JSON/schema after retry: ${secondParsed.error}`);
}

async function chatCompletion(config: JudgeConfig, messages: ChatMessage[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        ...config.headers,
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        messages,
        response_format: { type: "json_object" }
      })
    });
    if (!response.ok) throw new JudgeClientError(`Judge endpoint returned HTTP ${response.status}.`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new JudgeClientError("Judge endpoint returned no message content.");
    return content;
  } catch (error) {
    if (error instanceof JudgeClientError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new JudgeClientError(`Judge request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseJudgeResponse(text: string): { ok: true; value: JudgeResponse } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(extractJsonObject(text));
    const result = judgeResponseSchema.safeParse(parsed);
    if (!result.success) return { ok: false, error: result.error.message };
    return { ok: true, value: result.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}
