# Security Policy

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability.

If this repository has GitHub private vulnerability reporting enabled, use that. Otherwise, contact the maintainer directly or open a minimal public issue asking for a private reporting channel without including exploit details.

## Data Sent to Judge Endpoints

`agy-judge` sends selected review context, such as diffs, git status, package metadata, hook payloads, and command output, to the configured OpenAI-compatible judge endpoint.

Use a local endpoint or review your provider's data policy if your code is sensitive.

## Redaction Limits

`agy-judge` applies regex-based redaction before sending context to the judge. This helps with obvious secrets such as bearer tokens, API keys, private keys, GitHub tokens, Google API keys, AWS access keys, authorization headers, `.env`-style secret values, and long high-entropy tokens.

Redaction is best effort and cannot guarantee every secret is removed. Review the rendered prompt with:

```sh
agy-judge print-prompt
```

## Secure Defaults

- Advisory mode is the default.
- Fail-open behavior is the default.
- Blocking requires explicit `JUDGE_MODE=block`.
- Extra HTTP headers are opt-in through `JUDGE_HEADERS`.
- `.env` is ignored by git.

