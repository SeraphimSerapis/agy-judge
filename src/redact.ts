const REDACTION = "[REDACTED_SECRET]";

const secretPatterns: RegExp[] = [
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
  /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?:api[_-]?key|token|secret|password|passwd|pwd|client[_-]?secret|access[_-]?token)\b\s*[:=]\s*["']?[^"'\s,;]{8,}["']?/gi,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
  /\b[A-Za-z0-9_-]{48,}\b/g
];

export function redactSecrets(input: string): string {
  return secretPatterns.reduce((text, pattern) => text.replace(pattern, REDACTION), input);
}

export function redactObject<T>(value: T): T {
  return JSON.parse(redactSecrets(JSON.stringify(value))) as T;
}
