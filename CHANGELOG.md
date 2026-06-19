# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0

Initial release.

- Add `agy-judge` CLI with `status`, `review`, `hook`, `print-prompt`, `doctor`, and `hook-debug` commands.
- Support OpenAI-compatible `/v1/chat/completions` judge endpoints.
- Support environment variables, `.env`, and `.agy-judge.json` configuration.
- Add custom HTTP headers through `JUDGE_HEADERS`.
- Collect git status, diff stats, diffs, staged diffs, untracked files, package metadata, hook payloads, and command output when available.
- Redact likely secrets before sending review context (bearer tokens, API keys, private keys, `.env`-style values).
- Validate judge JSON responses with Zod and repair retry for invalid JSON.
- Apply local advisory, warn, and block policy modes.
- Add review profiles: `default`, `security`, `tests`, `docs`, `release`.
- Add optional `.agy-judge.rubric.md` support for custom review criteria.
- Add text, JSON, and agent feedback output formats.
- Empty-context preflight skips the judge call and returns a local warning.
- Add Antigravity plugin metadata, hook, and skill files.
- Add local mock judge and tests.
- Add notices clarifying that `agy-judge` is an independent private project and not an official Google plugin.
- **Stop hook integration**: reads stdin JSON from Antigravity CLI Stop events, returns `continue`/`""` decisions.
- **Advisory review mode**: presents review to user, asks before fixing.
- **Pass-with-issues → WARN upgrade**: when the judge says "pass" but flags issues, the hook treats it as WARN.
- **Verdict file** (`/tmp/agy-judge-verdict.json`) written after every review for external tooling.
- **Result file** (`.agy-judge-result.md`) written to workspace after each review.

- **Lockfile** (`/tmp/agy-judge.lock`) shared by `review` and `hook` commands with stale lock detection.
- **Hook dedup state** (`/tmp/agy-judge-hook-state.json` by default) keyed by conversation, workspace, git status, unstaged diff, and staged diff.
- **Configurable hook cooldown** via `JUDGE_HOOK_COOLDOWN_MS`; default `0` skips the same review key until git state changes.
- **Hook diagnostic log** (`/tmp/agy-judge-hook-events.ndjson` by default) and `agy-judge hook-debug`.
- **Hook replay smoke test** via `pnpm test:hook-replay`.
- **Debug logging**: `[agy-judge-hook]` traces to stderr for troubleshooting.
- **Payload dump**: `JUDGE_DUMP_PAYLOAD=<path>` saves hook stdin for debugging (redacted by default).
- **Include untracked non-ignored text files** as bounded pseudo-diffs in review context.
- **Fail-open default**: hook errors do not block the agent by default.
- **Doctor command**: validates endpoint connectivity and JSON response format.
- **Print-prompt command**: prints the system and user prompts for debugging.
- **Config warnings**: stderr diagnostics for invalid `JUDGE_MODE`, `JUDGE_PROFILE`, and `JUDGE_BLOCK_ON` values.
- **Secure file permissions**: lockfile, verdict, hook state, and hook log created with `0o600`.
