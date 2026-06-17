import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type JudgeMode = "advisory" | "warn" | "block";
export type Severity = "low" | "medium" | "high" | "critical";
export type JudgeProfile = "default" | "security" | "tests" | "docs" | "release";

export interface JudgeConfig {
  baseUrl: string;
  apiKey?: string;
  headers: Record<string, string>;
  model: string;
  temperature: number;
  timeoutMs: number;
  mode: JudgeMode;
  blockOn: Severity[];
  failOpen: boolean;
  maxDiffBytes: number;
  maxOutputBytes: number;
  includeDiff: boolean;
  includeStatus: boolean;
  includeHookPayload: boolean;
  profile: JudgeProfile;
}

type ConfigFile = Partial<JudgeConfig> & {
  JUDGE_BASE_URL?: string;
  JUDGE_API_KEY?: string;
  JUDGE_HEADERS?: string | Record<string, string>;
  JUDGE_MODEL?: string;
};

const severityValues: Severity[] = ["low", "medium", "high", "critical"];
const modeValues: JudgeMode[] = ["advisory", "warn", "block"];
const profileValues: JudgeProfile[] = ["default", "security", "tests", "docs", "release"];

export function loadConfig(cwd = process.cwd(), env = process.env): JudgeConfig {
  const fileConfig = loadConfigFile(cwd);
  const effectiveEnv = { ...loadDotEnvFile(cwd), ...env };
  const get = (envName: string, fileKey: keyof ConfigFile): string | undefined => {
    const envValue = effectiveEnv[envName];
    if (envValue !== undefined) return envValue;
    const fileValue = fileConfig[fileKey];
    return fileValue === undefined ? undefined : String(fileValue);
  };

  return {
    baseUrl: normalizeBaseUrl(get("JUDGE_BASE_URL", "baseUrl") ?? fileConfig.JUDGE_BASE_URL ?? ""),
    apiKey: get("JUDGE_API_KEY", "apiKey") ?? fileConfig.JUDGE_API_KEY,
    headers: parseHeaders(effectiveEnv.JUDGE_HEADERS ?? fileConfig.headers ?? fileConfig.JUDGE_HEADERS),
    model: get("JUDGE_MODEL", "model") ?? fileConfig.JUDGE_MODEL ?? "",
    temperature: parseNumber(get("JUDGE_TEMPERATURE", "temperature"), 0),
    timeoutMs: parseInteger(get("JUDGE_TIMEOUT_MS", "timeoutMs"), 60_000),
    mode: parseMode(get("JUDGE_MODE", "mode"), "advisory"),
    blockOn: parseSeverities(get("JUDGE_BLOCK_ON", "blockOn"), ["critical"]),
    failOpen: parseBoolean(get("JUDGE_FAIL_OPEN", "failOpen"), true),
    maxDiffBytes: parseInteger(get("JUDGE_MAX_DIFF_BYTES", "maxDiffBytes"), 120_000),
    maxOutputBytes: parseInteger(get("JUDGE_MAX_OUTPUT_BYTES", "maxOutputBytes"), 60_000),
    includeDiff: parseBoolean(get("JUDGE_INCLUDE_DIFF", "includeDiff"), true),
    includeStatus: parseBoolean(get("JUDGE_INCLUDE_STATUS", "includeStatus"), true),
    includeHookPayload: parseBoolean(get("JUDGE_INCLUDE_HOOK_PAYLOAD", "includeHookPayload"), true),
    profile: parseProfile(get("JUDGE_PROFILE", "profile"), "default")
  };
}

export function getConfigStatus(config: JudgeConfig): Record<string, string> {
  return {
    JUDGE_BASE_URL: config.baseUrl ? "configured" : "missing",
    JUDGE_MODEL: config.model ? "configured" : "missing",
    JUDGE_API_KEY: config.apiKey ? "configured" : "not set",
    JUDGE_HEADERS: Object.keys(config.headers).length > 0 ? `${Object.keys(config.headers).length} configured` : "not set",
    mode: config.mode,
    timeoutMs: String(config.timeoutMs),
    blockOn: config.blockOn.join(","),
    failOpen: String(config.failOpen),
    profile: config.profile
  };
}

function loadConfigFile(cwd: string): ConfigFile {
  const path = join(cwd, ".agy-judge.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ConfigFile;
  } catch {
    return {};
  }
}

function loadDotEnvFile(cwd: string): Record<string, string> {
  const path = join(cwd, ".env");
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
      if (!match) continue;
      const [, key, rawValue] = match;
      values[key] = unquoteEnvValue(rawValue);
    }
  } catch {
    return {};
  }
  return values;
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\s+#.*$/, "");
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseHeaders(value: unknown): Record<string, string> {
  if (value === undefined || value === null || value === "") return {};
  const raw = typeof value === "string" ? parseHeaderJson(value) : value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([key, headerValue]) => isSafeHeaderName(key) && headerValue !== undefined && headerValue !== null)
      .map(([key, headerValue]) => [key, String(headerValue)])
  );
}

function parseHeaderJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function isSafeHeaderName(value: string): boolean {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value);
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return fallback;
}

function parseInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMode(value: unknown, fallback: JudgeMode): JudgeMode {
  return typeof value === "string" && modeValues.includes(value as JudgeMode) ? (value as JudgeMode) : fallback;
}

function parseProfile(value: unknown, fallback: JudgeProfile): JudgeProfile {
  return typeof value === "string" && profileValues.includes(value as JudgeProfile)
    ? (value as JudgeProfile)
    : fallback;
}

function parseSeverities(value: unknown, fallback: Severity[]): Severity[] {
  if (Array.isArray(value)) {
    const parsed = value.filter((item): item is Severity => severityValues.includes(item));
    return parsed.length > 0 ? parsed : fallback;
  }
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is Severity => severityValues.includes(item as Severity));
  return parsed.length > 0 ? parsed : fallback;
}
