import { createRequire } from "node:module";
import { runDoctor, runPrintPrompt, runReview } from "./commands/review.js";
import { runHook, runHookDebug } from "./commands/hook.js";
import { loadConfig, getConfigStatus, type JudgeProfile } from "./config.js";
import { formatJsonOutput, type OutputFormat } from "./formatOutput.js";
import { acquireLock } from "./lockfile.js";
import { formatRuntimeError } from "./formatOutput.js";

const require = createRequire(import.meta.url);
const { version: VERSION } = require("../package.json") as { version: string };

const COMMANDS = ["status", "review", "hook", "hook-debug", "print-prompt", "doctor", "version", "help"] as const;
type Command = (typeof COMMANDS)[number];

interface CliOptions {
  command: Command;
  format: OutputFormat;
  profile?: JudgeProfile;
  dumpPayload?: string;
  clearHookLog: boolean;
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(`agy-judge: ${error.message}`);
      printHelp();
      return 1;
    }
    throw error;
  }
  const config = withCliOverrides(loadConfig(), options);

  if (options.command === "help") {
    printHelp();
    return 0;
  }

  if (options.command === "version") {
    console.log(VERSION);
    return 0;
  }

  if (options.command === "status") {
    for (const [key, value] of Object.entries(getConfigStatus(config))) {
      console.log(`${key}: ${value}`);
    }
    return 0;
  }

  if (options.command === "hook-debug") {
    return runHookDebug(config, { format: options.format, clearHookLog: options.clearHookLog });
  }

  if (options.command === "hook") {
    return runHook(config, { format: options.format, dumpPayload: options.dumpPayload });
  }

  // review, doctor, print-prompt: acquire the shared lock first.
  const releaseLock = acquireLock(config.lockFile);
  if (!releaseLock) {
    console.error("agy-judge: another instance is already running, skipping.");
    return 0;
  }

  try {
    if (options.command === "doctor") {
      const result = await runDoctor(config, options.format);
      return result.exitCode;
    }
    if (options.command === "print-prompt") {
      return runPrintPrompt(config);
    }
    const result = await runReview(config, options.format);
    return result.exitCode;
  } catch (error) {
    if (options.format === "json") {
      const message = error instanceof Error ? error.message : String(error);
      console.log(formatJsonOutput({ ok: false, error: message, failOpen: config.failOpen }));
    } else {
      console.error(formatRuntimeError(error, config.failOpen));
    }
    return config.failOpen ? 0 : 2;
  } finally {
    releaseLock();
  }
}

function parseArgs(argv: string[]): CliOptions {
  const command = parseCommand(argv[0]);
  let format: OutputFormat = "text";
  let profile: JudgeProfile | undefined;
  let dumpPayload: string | undefined;
  let clearHookLog = false;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return { command: "help", format: "text", clearHookLog: false };
    }
    if (arg === "--format" && argv[index + 1]) {
      format = parseFormat(arg, argv[index + 1]);
      index += 1;
    } else if (arg.startsWith("--format=")) {
      format = parseFormat(arg, arg.slice("--format=".length));
    } else if (arg === "--json") {
      format = "json";
    } else if (arg === "--agent") {
      format = "agent";
    } else if (arg === "--profile" && argv[index + 1]) {
      profile = parseProfile(arg, argv[index + 1]);
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      profile = parseProfile(arg, arg.slice("--profile=".length));
    } else if (arg === "--dump-payload" && argv[index + 1]) {
      dumpPayload = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--dump-payload=")) {
      dumpPayload = arg.slice("--dump-payload=".length);
    } else if (arg === "--clear") {
      clearHookLog = true;
    }
  }

  return { command, format, profile, dumpPayload, clearHookLog };
}

function parseCommand(value: string | undefined): Command {
  if (value === "--version" || value === "-v" || value === "version") return "version";
  if (value === "--help" || value === "-h" || value === "help") return "help";
  if (
    value === "status" ||
    value === "review" ||
    value === "hook" ||
    value === "hook-debug" ||
    value === "print-prompt" ||
    value === "doctor"
  ) {
    return value;
  }
  return "help";
}

function parseFormat(flag: string, value: string): OutputFormat {
  if (value === "json" || value === "agent" || value === "text") return value;
  throw new CliUsageError(`${flag}: expected one of text|json|agent, got "${value}"`);
}

function parseProfile(flag: string, value: string): JudgeProfile {
  if (value === "default" || value === "security" || value === "tests" || value === "docs" || value === "release") {
    return value;
  }
  throw new CliUsageError(`${flag}: expected one of default|security|tests|docs|release, got "${value}"`);
}

class CliUsageError extends Error {
  override name = "CliUsageError";
}

function withCliOverrides<T extends { profile: JudgeProfile }>(config: T, options: CliOptions): T {
  return options.profile ? { ...config, profile: options.profile } : config;
}

function printHelp(): void {
  console.log(`agy-judge v${VERSION}

Usage:
  agy-judge status              Show config status
  agy-judge review              Run a review of the current workspace
  agy-judge review --format json|agent|text
  agy-judge review --profile security|tests|docs|release
  agy-judge hook                Run as an Antigravity CLI Stop hook (stdin/stdout JSON)
  agy-judge hook-debug          Show recent hook events and dedup state
  agy-judge hook-debug --json
  agy-judge hook-debug --clear  Clear hook event log before reading
  agy-judge doctor              Test the judge endpoint
  agy-judge print-prompt        Show the rendered prompt
  agy-judge --version           Show version

Hook Integration:
  Install the plugin: agy plugin install ./plugin
  Recommended stable path: run /agy-judge:agy-judge in Antigravity.
  The plugin hook registers as a Stop event. Automatic hook invocation is
  experimental because Stop/PreInvocation/continue cycles can cause missed
  or duplicate reviews in some Antigravity sessions.

Environment:
  JUDGE_BASE_URL    LiteLLM/OpenAI-compatible endpoint URL
  JUDGE_MODEL       Model name for the judge
  JUDGE_API_KEY     API key for the endpoint
  JUDGE_HEADERS     JSON string of custom headers
  JUDGE_DUMP_PAYLOAD=<path>   Save hook stdin to a file (redacted by default)
  JUDGE_DUMP_RAW=true         Disable redaction for dumped payloads
  JUDGE_HOOK_LOG_FILE=<path>  Hook diagnostic event log`);
}

export { CliUsageError };
