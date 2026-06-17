# agy-judge

`agy-judge` is a small Antigravity CLI plugin that adds a judge layer to coding-agent workflows. It collects local evidence such as git status, diff stats, diffs, hook payloads, and command output when available, sends a redacted review packet to any OpenAI-compatible `/v1/chat/completions` endpoint, validates the judge response, and surfaces a pass/warn/fail/block result.

> agy-judge sends selected review context, such as diffs and command output, to the configured judge endpoint. Use a local endpoint or review your provider’s data policy if your code is sensitive.

## Quick Start

From source:

```sh
git clone https://github.com/SeraphimSerapis/agy-judge.git
cd agy-judge
pnpm install
pnpm build
pnpm link --global
agy-judge status
agy-judge doctor
```

Configure a local OpenAI-compatible endpoint:

```sh
cp .env.example .env
$EDITOR .env
agy-judge status
```

Run a manual review from the project you want judged:

```sh
cd /path/to/your/project
agy-judge review
```

Install the Antigravity plugin:

```sh
cd /path/to/agy-judge
agy plugin validate ./plugin
agy plugin install ./plugin
agy plugin enable agy-judge
```

In Antigravity, run the command if it is available:

```text
/agy-judge:agy-judge
```

or ask the agent:

```text
Use agy-judge to review the current work.
```

## Install

### From npm

When published:

```sh
npm install --global agy-judge
agy-judge --version
agy-judge status
```

Then install the bundled Antigravity plugin metadata:

```sh
agy plugin validate "$(npm root -g)/agy-judge/plugin"
agy plugin install "$(npm root -g)/agy-judge/plugin"
agy plugin enable agy-judge
```

If you use pnpm global installs instead:

```sh
pnpm add --global agy-judge
agy plugin install "$(pnpm root -g)/agy-judge/plugin"
```

### From source

```sh
pnpm install
pnpm build
pnpm link --global
```

After linking, the `agy-judge` command should be available on your `PATH`.

## Configuration

`agy-judge` reads `.agy-judge.json` and `.env` from the current working directory, then applies real environment variable overrides. Use `.env.example` as a starting point for local configuration.

| Variable | Default | Notes |
| --- | --- | --- |
| `JUDGE_BASE_URL` | empty | Base URL such as `http://localhost:8000/v1`. |
| `JUDGE_API_KEY` | empty | Optional for local endpoints. Sent as `Authorization: Bearer ...` when set. |
| `JUDGE_HEADERS` | empty | Optional JSON object of extra HTTP headers, for example `{"X-API-KEY":"..."}`. |
| `JUDGE_MODEL` | empty | Required for `review` and `hook`. |
| `JUDGE_TEMPERATURE` | `0` | Chat completion temperature. |
| `JUDGE_TIMEOUT_MS` | `60000` | Request timeout. |
| `JUDGE_MODE` | `advisory` | `advisory`, `warn`, or `block`. |
| `JUDGE_BLOCK_ON` | `critical` | Comma-separated severities, for example `critical,high`. |
| `JUDGE_FAIL_OPEN` | `true` | If true, endpoint/runtime failures do not block the workflow. |
| `JUDGE_MAX_DIFF_BYTES` | `120000` | Maximum diff bytes sent to the judge. |
| `JUDGE_MAX_OUTPUT_BYTES` | `60000` | Maximum command/test output bytes from hook payloads. |
| `JUDGE_INCLUDE_DIFF` | `true` | Include `git diff` and `git diff --stat`. |
| `JUDGE_INCLUDE_STATUS` | `true` | Include `git status --short`. |
| `JUDGE_INCLUDE_HOOK_PAYLOAD` | `true` | Include Antigravity hook payload stdin when available. |
| `JUDGE_PROFILE` | `default` | Review profile: `default`, `security`, `tests`, `docs`, or `release`. |

Configuration precedence is:

```text
real environment variables > .env > .agy-judge.json > defaults
```

Example `.agy-judge.json`:

```json
{
  "baseUrl": "http://localhost:8000/v1",
  "model": "Qwen/Qwen3-Coder",
  "headers": {
    "X-API-KEY": "optional-provider-key"
  },
  "mode": "advisory",
  "blockOn": ["critical"],
  "failOpen": true
}
```

Example `.env`:

```env
JUDGE_BASE_URL=http://localhost:8000/v1
JUDGE_MODEL=Qwen/Qwen3-Coder
JUDGE_API_KEY=
JUDGE_HEADERS='{}'
JUDGE_MODE=advisory
JUDGE_PROFILE=default
JUDGE_FAIL_OPEN=true
JUDGE_TIMEOUT_MS=60000
```

`.env` belongs in the workspace where you run `agy-judge`. It is gitignored by this project and should not be committed.

You can also add a trusted local rubric in `.agy-judge.rubric.md`. Rubrics are useful for project-specific release rules, security expectations, or documentation standards. Reviewed diffs and hook payloads are still treated as untrusted content.

## Endpoint Examples

Local vLLM:

```sh
export JUDGE_BASE_URL=http://localhost:8000/v1
export JUDGE_MODEL=Qwen/Qwen3-Coder
export JUDGE_API_KEY=
```

llama.cpp server:

```sh
export JUDGE_BASE_URL=http://127.0.0.1:8080/v1
export JUDGE_MODEL=Qwen3.5-9B
export JUDGE_API_KEY=
agy-judge review
```

LiteLLM:

```sh
export JUDGE_BASE_URL=http://localhost:4000/v1
export JUDGE_MODEL=gpt-4.1-mini
export JUDGE_API_KEY="$LITELLM_API_KEY"
# Or, for gateways that expect a custom header:
export JUDGE_HEADERS='{"X-API-KEY":"your-litellm-key"}'
```

LiteLLM with both bearer auth and a custom header:

```sh
export JUDGE_BASE_URL=http://localhost:4000/v1
export JUDGE_MODEL=qwen-coder
export JUDGE_API_KEY="$LITELLM_API_KEY"
export JUDGE_HEADERS='{"X-API-KEY":"your-litellm-gateway-key"}'
agy-judge status
agy-judge review
```

OpenRouter or another cloud OpenAI-compatible provider:

```sh
export JUDGE_BASE_URL=https://openrouter.ai/api/v1
export JUDGE_MODEL=openai/gpt-4.1-mini
export JUDGE_API_KEY="$OPENROUTER_API_KEY"
# Optional provider headers can also go here:
export JUDGE_HEADERS='{"HTTP-Referer":"https://github.com/SeraphimSerapis/agy-judge","X-Title":"agy-judge"}'
```

## Commands

```sh
agy-judge status
agy-judge doctor
agy-judge print-prompt
agy-judge review
agy-judge review --format json
agy-judge review --format agent
agy-judge review --profile security
agy-judge hook
agy-judge --version
```

`status` prints configuration status without leaking secrets. `doctor` sends a tiny diagnostic request to confirm the endpoint can return valid judge JSON. `print-prompt` renders the redacted review prompt without calling the judge. `review` runs locally. `hook` reads an optional hook payload from stdin and runs the same review flow.

Output formats:

- `text`: human-readable terminal output, the default.
- `json`: structured result for scripts, CI, and hooks.
- `agent`: concise Markdown feedback suitable for passing back to Antigravity.

Review profiles:

- `default`: balanced review.
- `security`: security, privacy, secret handling, and injection risk.
- `tests`: testability and test evidence.
- `docs`: documentation accuracy and user-facing clarity.
- `release`: packaging, installability, CI, changelog, and release risk.

## What Gets Sent

Before calling the judge endpoint, `agy-judge` builds a redacted review packet from local evidence:

- current working directory
- timestamp
- `git status --short`, when enabled and available
- `git diff --stat`, staged diff stat, and diffs, when enabled and available
- package metadata from `package.json`, when available
- Antigravity hook payload from stdin, when enabled and available
- command/test output found in the hook payload, when available

It does not intentionally read arbitrary project files. Diffs and hook payloads can still contain sensitive content, so redaction is a safety layer rather than a guarantee.

If there is no diff, no staged diff, no hook payload, and no command output, `agy-judge review` skips the judge endpoint and returns a local warning. This avoids spending a model call on an empty review packet.

## Local Mock Judge

For repeatable end-to-end checks without a real model endpoint, run:

```sh
pnpm mock-judge
```

Then, in another terminal:

```sh
JUDGE_BASE_URL=http://localhost:8123/v1 \
JUDGE_MODEL=mock \
JUDGE_MODE=advisory \
node dist/index.js review
```

The default mock returns a `critical` issue with `should_block=true`. Advisory mode should still exit `0`, while block mode should exit `1`:

```sh
JUDGE_BASE_URL=http://localhost:8123/v1 \
JUDGE_MODEL=mock \
JUDGE_MODE=block \
JUDGE_BLOCK_ON=critical \
node dist/index.js review
```

You can tune the mock response:

```sh
MOCK_JUDGE_PORT=8123 MOCK_JUDGE_SEVERITY=medium MOCK_JUDGE_SHOULD_BLOCK=false pnpm mock-judge
```

For a no-network automated check of the same CLI review path, run:

```sh
pnpm test:review
```

That test stubs the OpenAI-compatible HTTP call in process, verifies custom headers are passed, and checks both advisory and blocking policy behavior.

## Examples

Example configuration files live in `examples/env/`:

- `examples/env/llama-cpp.env`
- `examples/env/litellm.env`
- `examples/env/openrouter.env`

Use one as a starting point:

```sh
cp examples/env/llama-cpp.env .env
agy-judge doctor
agy-judge review --profile tests
```

Example hook payloads live in `examples/hook-payloads/`:

```sh
agy-judge hook --format json < examples/hook-payloads/final-response.json
```

Example rubrics live in `examples/rubrics/`:

```sh
cp examples/rubrics/release.rubric.md .agy-judge.rubric.md
agy-judge review --profile release
```

## Policy Examples

Advisory mode never blocks, even if the judge recommends blocking:

```sh
JUDGE_MODE=advisory agy-judge review
```

Warn mode highlights issues but exits `0` unless a fail-closed runtime error occurs:

```sh
JUDGE_MODE=warn agy-judge review
```

Block mode exits `1` when a configured blocking severity appears:

```sh
JUDGE_MODE=block JUDGE_BLOCK_ON=critical,high agy-judge review
```

`JUDGE_FAIL_OPEN=true` means endpoint failures, timeouts, and invalid judge responses do not break the workflow by default. Set `JUDGE_FAIL_OPEN=false` only when you want local runtime/configuration failures to exit `2`.

## Passing Feedback Back To Antigravity

For a concise follow-up prompt, use agent format:

```sh
agy-judge review --format agent
```

Then ask Antigravity to address the required changes and rerun the judge:

```text
Use this agy-judge feedback to fix the current work, then run the judge again.
```

## Antigravity Plugin

The `plugin/` directory contains metadata for:

- `plugin/plugin.json`
- `plugin/hooks.json`
- `plugin/commands/commands.json`
- `plugin/skills/agy-judge/SKILL.md`

The hook command is:

```sh
agy-judge hook
```

The plugin also exposes an explicit command named `agy-judge`. Antigravity CLI may expose plugin commands with a plugin-qualified name, for example:

```text
/agy-judge:agy-judge
```

That command runs:

```sh
agy-judge review
```

The command metadata follows the Antigravity CLI plugin command format:

```json
{
  "agy-judge": {
    "type": "command",
    "command": "agy-judge review"
  }
}
```

If your Antigravity CLI session has not reloaded plugin commands yet, start a new session or use the skill-style activation:

```text
Use agy-judge to review this.
```

or:

```text
Run the judge layer now.
```

Manual command runs review the current workspace evidence. If there is no git diff, no staged diff, and no hook payload, the judge may return a fail/warn because there is nothing substantive to evaluate. For a realistic manual test, make or stage a small change first:

```sh
git status --short
git diff --stat
agy-judge review
```

Install locally with:

```sh
pnpm build
pnpm link --global
agy plugin validate ./plugin
agy plugin install ./plugin
agy plugin enable agy-judge
```

The Antigravity hooks and plugin docs are at [hooks](https://antigravity.google/docs/hooks), [plugins](https://antigravity.google/docs/plugins), and [CLI plugins](https://antigravity.google/docs/cli-plugins).

The plugin assumes the `agy-judge` CLI is already installed and available on the `PATH` used by Antigravity.

## Exit Codes

- `0`: pass or warn, including all advisory and warn-mode judge findings.
- `1`: blocking policy says to block.
- `2`: local configuration/runtime error when `JUDGE_FAIL_OPEN=false`.

## Security Model

`agy-judge` is conservative and evidence-oriented:

- It collects deterministic local evidence before asking the model.
- It redacts likely secrets before sending context.
- It treats diffs, logs, filenames, command output, and hook payloads as untrusted data.
- It retries invalid judge JSON once, then respects fail-open/fail-closed policy.
- It never blocks in advisory mode.

Regex redaction is a safety layer, not a guarantee. Review the prompt with `agy-judge print-prompt` when working with sensitive repositories.

## Troubleshooting

### `agy-judge: command not found`

Install or link the CLI first:

```sh
pnpm build
pnpm link --global
agy-judge --version
```

For npm installs, use:

```sh
npm install --global agy-judge
```

### Slash command is not visible in Antigravity

Validate and reinstall the plugin:

```sh
agy plugin validate /path/to/agy-judge/plugin
agy plugin install /path/to/agy-judge/plugin
agy plugin enable agy-judge
```

Restart the Antigravity session after installing. Depending on the CLI version, the command may appear as:

```text
/agy-judge:agy-judge
```

### Hooks show as skipped

Check that `plugin/hooks.json` exists and validates. Hook support and payload shape may change across Antigravity releases; this project keeps the hook minimal and falls back gracefully when stdin is empty.

### The judge says there is nothing to evaluate

Manual reviews need local evidence. Make a change, stage a change, or run from a hook that provides payload data:

```sh
git status --short
git diff --stat
agy-judge review
```

### Endpoint returns invalid JSON

`agy-judge` retries once with a JSON repair prompt. If the endpoint still returns invalid JSON, try a stronger instruction-following model, lower temperature, or the local mock judge:

```sh
pnpm mock-judge
```

You can also run:

```sh
agy-judge doctor
```

to isolate endpoint/schema problems from repository context problems.

### Custom headers are not working

Use valid JSON:

```sh
export JUDGE_HEADERS='{"X-API-KEY":"your-key"}'
agy-judge status
```

`status` only prints how many headers are configured. It never prints header values.

## Prior Art

Projects such as [microsoft/llm-as-judge](https://github.com/microsoft/llm-as-judge) explore larger judge systems with multiple judges, assemblies, APIs, storage, and statistical analysis. `agy-judge` intentionally starts smaller: one local CLI review path, one OpenAI-compatible endpoint, deterministic context collection, strict JSON validation, and conservative blocking.

Ideas that fit future releases:

- named prompt profiles for different review criteria
- multi-judge or assembly-style review for high-risk changes
- persisted evaluation history
- aggregate statistics over judge outcomes

## Limitations

- Hook metadata validates with the current CLI, but hook payload shape may evolve with Antigravity releases.
- Redaction is regex-based and cannot catch every secret.
- The judge only sees collected local context, not the full agent transcript unless Antigravity includes it in the hook payload.
- JSON output mode is planned but not implemented in v0.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the concrete path to 1.0.

- More robust Antigravity hook payload parsing once the schema stabilizes.
- Optional test command execution and captured test summaries.
- Multi-judge or judge-assembly mode for high-risk review.
- Evaluation history and trend summaries.
- Provider compatibility matrix with known-good configs and quirks.
