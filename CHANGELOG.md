# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 - Unreleased

Initial release.

- Add `agy-judge` CLI with `status`, `review`, `hook`, and `print-prompt`.
- Support OpenAI-compatible `/v1/chat/completions` judge endpoints.
- Support environment variables, `.env`, and `.agy-judge.json`.
- Add custom HTTP headers through `JUDGE_HEADERS`.
- Collect git status, diff stats, diffs, package metadata, hook payloads, and command output when available.
- Redact likely secrets before sending review context.
- Validate judge JSON responses with Zod.
- Apply local advisory, warn, and block policy.
- Add Antigravity plugin metadata, command, hook, and skill files.
- Add local mock judge and tests.

