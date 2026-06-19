# Antigravity Integration

This document describes the current Antigravity integration status for `agy-judge`.

`agy-judge` is an independent private project built out of personal interest. It is not an official Google product, not an officially supported Google Antigravity CLI plugin, and is not endorsed by Google.

## Recommended 1.0 Path: Slash Command

The reliable workflow is manual invocation through the Antigravity CLI plugin command.

Install the CLI first:

```sh
pnpm build
pnpm link --global
agy-judge --version
```

Install the plugin metadata:

```sh
agy plugin validate /path/to/agy-judge/plugin
agy plugin install /path/to/agy-judge/plugin
agy plugin enable agy-judge
```

In a fresh Antigravity session, invoke the plugin skill as a slash command:

```text
/agy-judge:agy-judge
```

That command runs `agy-judge review` via the plugin skill.

If the slash command is not visible, restart the Antigravity session after installing or enabling the plugin.

## Hook Integration: Experimental

`agy-judge hook` implements the Antigravity Stop-hook stdin/stdout contract, and the plugin hook registers as a Stop event. Automatic hook invocation is not reliable enough to be the default 1.0 path yet.

Observed behavior in real sessions:

- Stop hooks sometimes do not trigger after changes.
- Stop hooks sometimes trigger twice.
- Stop-hook `executionNum` increments on continue-stops, but reset behavior across user messages is inconsistent.
- PreInvocation fires for normal model invocations and for invocations triggered by Stop-hook `continue` decisions.
- PreInvocation/Stop/continue interaction can make deduplication fragile.

Use automatic hooks only when you are comfortable debugging Antigravity hook behavior.

## Reliability Controls

Hook mode uses several local controls to reduce duplicate reviews:

- a process lock so concurrent `agy-judge` runs do not review at the same time
- a content-based review key built from conversation ID, workspace, git status, unstaged diff, and staged diff
- a dedup state file so repeated Stop-hook invocations for the same git state can be skipped
- a configurable cooldown window

Defaults:

```sh
JUDGE_HOOK_DEDUP=true
JUDGE_HOOK_COOLDOWN_MS=0
JUDGE_HOOK_STATE_FILE=/tmp/agy-judge-hook-state.json
JUDGE_HOOK_LOG_FILE=/tmp/agy-judge-hook-events.ndjson
```

`JUDGE_HOOK_COOLDOWN_MS=0` means duplicate reviews for the same conversation/workspace/git state are skipped until the git state changes. Set a positive value to use a time-based dedup window instead.

Disable dedup only while debugging:

```sh
JUDGE_HOOK_DEDUP=false
```

These controls help with duplicate Stop-hook invocations. They cannot fix cases where Antigravity does not invoke the hook at all.

## Debugging Hook Behavior

`agy-judge` writes a small NDJSON event log for hook mode. It records lifecycle events such as `received`, `skip`, `judge_start`, `judge_result`, `continue`, and `error`.

It does not record raw hook payloads, diffs, or command output.

Inspect recent events:

```sh
agy-judge hook-debug
```

Machine-readable output:

```sh
agy-judge hook-debug --format json
```

Clear the event log:

```sh
agy-judge hook-debug --clear
```

Run a local no-network Stop-hook replay smoke test:

```sh
pnpm test:hook-replay
```

This creates a temporary git workspace, invokes `agy-judge hook` twice with the same synthetic Stop payload, and verifies the duplicate invocation is skipped.

Useful patterns:

- No `received` event: Antigravity did not invoke the hook.
- `received` followed by `skip reason=no git changes`: hook fired, but there was nothing to review.
- `received` followed by `skip reason=duplicate`: dedup suppressed a repeated Stop event.
- `judge_start` without `judge_result` or `continue`: the judge call likely errored or timed out.
- `continue`: the hook returned feedback to the agent.

## Stop Hook Payload

Captured Stop-hook payloads included fields like:

```json
{
  "executionNum": 0,
  "fullyIdle": true,
  "conversationId": "example",
  "workspacePaths": ["/path/to/workspace"],
  "transcriptPath": "/path/to/transcript",
  "artifactDirectoryPath": "/path/to/artifacts"
}
```

`agy-judge hook` returns JSON on stdout:

```json
{"decision": ""}
```

or:

```json
{"decision":"continue","reason":"judge feedback for the agent"}
```

## Capturing Payloads

To capture payloads for debugging:

```sh
agy-judge hook --dump-payload ./captured-payload.json < payload.json
```

For automatic hooks, configure:

```sh
export JUDGE_DUMP_PAYLOAD=./captured-payload.json
```

Payload dumps are redacted by default. Raw dumps can include sensitive data:

```sh
export JUDGE_DUMP_RAW=true
```

## Statusline: Disabled For Now

Statusline support is paused.

Observed issues:

- Statusline updates were inconsistent.
- Verdict files could become stale across sessions.
- Deduplicating hook-triggered reviews without a stable user-turn identifier was fragile.

The statusline should not be treated as part of the supported 1.0 workflow.

Useful docs:

- Plugin docs: https://antigravity.google/docs/plugins
- Hooks config: https://antigravity.google/docs/hooks
- Plugins and skills for CLI: https://antigravity.google/docs/cli-plugins
- CLI statusline: https://antigravity.google/docs/cli-statusline
