# Security Policy

`agy-judge` is an independent private project. It is not an official Google product, not an officially supported Google Antigravity CLI plugin, and is not endorsed by Google.

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability.

If this repository has GitHub private vulnerability reporting enabled, use that. Otherwise, contact the maintainer directly or open a minimal public issue asking for a private reporting channel without including exploit details.

**Contact:** Use [GitHub private vulnerability reporting](https://github.com/SeraphimSerapis/agy-judge/security/advisories/new) if available. Otherwise, contact the maintainer (Tim Messerschmidt) directly or open a minimal public issue asking for a private reporting channel without including exploit details.

## Data Sent to Judge Endpoints

`agy-judge` sends selected review context, such as diffs, git status, package metadata, hook payloads, and command output, to the configured OpenAI-compatible judge endpoint.

Use a local endpoint or review your provider's data policy if your code is sensitive.

## Redaction Limits

`agy-judge` applies regex-based redaction before sending context to the judge. This helps with obvious secrets such as bearer tokens, API keys, private keys, GitHub tokens, Google API keys, AWS access keys, Slack tokens, authorization headers, and `.env`-style `key=value` pairs.

Redaction is best effort and cannot guarantee every secret is removed. The redaction patterns are intentionally conservative so they do not corrupt legitimate long identifiers, file paths, commit SHAs, or base64-encoded file content. If you need broader redaction, set `JUDGE_HEADERS` to override headers per request, or pipe the prompt through an external redactor.

Redaction is applied to the review context as a string, including its JSON representation. The `.env`-style pattern matches JSON-quoted keys (`"apiKey":"value"`) and replaces only the value, so the surrounding JSON stays valid. Value-based patterns (`sk-…`, `ghp_…`, `AKIA…`, `AIza…`, `xoxb-…`, `Bearer …`, PEM blocks) match the value directly and are JSON-safe by construction. Keys that embed a keyword inside a larger identifier (for example `customSecret`) are not matched — this avoids false positives on ordinary camelCase field names.

Review the rendered prompt with:

```sh
agy-judge print-prompt
```

## Captured Payloads

`JUDGE_DUMP_PAYLOAD=<path>` saves the Stop-hook stdin to a file for debugging. The dump is redacted by default; set `JUDGE_DUMP_RAW=true` to save the raw unredacted payload. Dumped payloads are still untrusted data — open them with a redacting viewer and delete them when no longer needed.

## Secure Defaults

- Advisory mode is the default.
- Fail-open behavior is the default.
- Blocking requires explicit `JUDGE_MODE=block`.
- Extra HTTP headers are opt-in through `JUDGE_HEADERS`.

- Lockfile, verdict, hook state, and hook log files are created with `0o600` permissions.
- `.env` is ignored by git.
- `process.chdir` is not used; the hook reads its workspace from the payload and the CLI runs from the caller's directory.
