# Provider Compatibility

`agy-judge` targets OpenAI-compatible `/v1/chat/completions` endpoints. Any endpoint that implements this API should work — the providers listed below are tested examples, not an exhaustive list.

Use `agy-judge doctor` to verify a provider before relying on reviews:

```sh
agy-judge doctor
```

## Current Matrix

| Provider | Status | Notes |
| --- | --- | --- |
| LiteLLM | Tested | Works with bearer auth and custom `JUDGE_HEADERS`. |
| llama.cpp OpenAI-compatible server | Needs repeatable verification | Example config exists. Confirm model naming and JSON behavior per server build. |
| vLLM | Example only | Should work when exposing `/v1/chat/completions`; not yet smoke-tested for this release. |
| OpenRouter | Example only | Example config exists; not yet smoke-tested with API key and provider headers for this release. |
| Generic OpenAI-compatible endpoint | Supported target | Must return OpenAI-style `choices[0].message.content`. |

## LiteLLM Example

```sh
export JUDGE_BASE_URL=http://localhost:4000/v1
export JUDGE_MODEL=qwen-coder
export JUDGE_API_KEY="$LITELLM_API_KEY"
export JUDGE_HEADERS='{"X-API-KEY":"your-litellm-gateway-key"}'
agy-judge doctor
```

## llama.cpp Example

This is a template. Server builds and model names vary; verify with `agy-judge doctor` before relying on reviews.

```sh
export JUDGE_BASE_URL=http://127.0.0.1:8080/v1
export JUDGE_MODEL=Qwen3.5-9B
export JUDGE_API_KEY=
export JUDGE_HEADERS='{}'
agy-judge doctor
```

## OpenRouter Example

This is a template and has not yet been smoke-tested for this release.

```sh
export JUDGE_BASE_URL=https://openrouter.ai/api/v1
export JUDGE_MODEL=openai/gpt-4.1-mini
export JUDGE_API_KEY="$OPENROUTER_API_KEY"
export JUDGE_HEADERS='{"HTTP-Referer":"https://github.com/SeraphimSerapis/agy-judge","X-Title":"agy-judge"}'
agy-judge doctor
```

## Compatibility Notes

- Some endpoints ignore `response_format`; `agy-judge` still validates JSON manually.
- Some local models may return natural issue categories; schema compatibility is intentionally a little tolerant.
- If `doctor` fails with invalid JSON, try a stronger instruction-following model or lower temperature.
- If `doctor` fails with HTTP 404, check whether `JUDGE_BASE_URL` should include `/v1`.
- If `doctor` fails with HTTP 401 or 403, check `JUDGE_API_KEY` and `JUDGE_HEADERS`.
