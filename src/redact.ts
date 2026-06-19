const REDACTION = "[REDACTED_SECRET]";

/**
 * Specific, well-known secret formats. These have low false-positive rates
 * because the prefixes (`sk-`, `ghp_`, `AKIA`, etc.) are unique to credential
 * formats and don't collide with normal source code identifiers. Each match
 * is replaced wholesale with REDACTION.
 */
const simplePatterns: RegExp[] = [
  // PEM private keys
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  // Authorization header values
  /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
  // Bearer / Basic tokens in arbitrary context
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g,
  // Google API keys (AIza + 35 chars)
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  // AWS access keys
  /\bAKIA[0-9A-Z]{16}\b/g,
  // Slack tokens (xox[baprs]-...)
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  // OpenAI / Anthropic / many-provider secret keys
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
];

/**
 * .env-style key=value secrets. The keyword acts as context that this is
 * probably a credential. The pattern captures three groups:
 *   1. the key + separator (e.g. `apiKey":` or `apiKey=` or `"apiKey": `),
 *   2. the optional opening quote of the value (`"`, `'`, or empty),
 *   3. the value itself.
 * The closing quote is matched via the backreference `\2?`.
 *
 * The replacement function preserves the key and any existing quotes so the
 * result stays valid JSON when redaction runs on a stringified context.
 * In plain text, the replacement is `key=[REDACTED_SECRET]` or
 * `key="[REDACTED_SECRET]"` depending on how the value was quoted.
 */
const envStylePattern =
  /((?<![a-zA-Z0-9_-])(?:api[_-]?key|token|secret|password|passwd|pwd|client[_-]?secret|access[_-]?token)\b\s*["']?\s*[:=]\s*)(["']?)([^"'\s,;]{8,})\2?/gi;

/**
 * Replace substrings that look like secrets with the redaction marker.
 *
 * Intentionally conservative: we do NOT redact arbitrary 40+ or 48+
 * character tokens. The previous over-greedy heuristics would destroy
 * legitimate long identifiers, file paths, commit SHAs, and base64-encoded
 * file content. To redact a value that doesn't match one of the specific
 * patterns above, set `JUDGE_HEADERS` to override the request, or use a
 * redacted hook dump (`JUDGE_DUMP_PAYLOAD=...`, raw off by default).
 */
export function redactSecrets(input: string): string {
  let text = input;
  for (const pattern of simplePatterns) {
    text = text.replace(pattern, REDACTION);
  }
  text = text.replace(envStylePattern, (_match, keyPart: string, openQuote: string) => {
    return `${keyPart}${openQuote}${REDACTION}${openQuote}`;
  });
  return text;
}

export function redactObject<T>(value: T): T {
  return JSON.parse(redactSecrets(JSON.stringify(value))) as T;
}
