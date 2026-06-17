# Roadmap to 1.0

This roadmap tracks the concrete work needed to move `agy-judge` from a useful pre-1.0 CLI into a stable 1.0 release.

## Release Goal

`agy-judge` 1.0 should be a reliable Antigravity judge layer that is easy to install, safe by default, clear when it cannot judge, and useful enough that feedback can be passed back into an agent workflow.

The project should stay small. It should not become a general evaluation platform like DeepEval, Ragas, OpenAI Evals, or Microsoft `llm-as-judge`. Its niche is coding-agent review in local CLI workflows.

## Current Status

Implemented:

- CLI commands: `status`, `review`, `hook`, `print-prompt`, `doctor`, `--version`.
- OpenAI-compatible `/v1/chat/completions` client.
- Environment, `.env`, and `.agy-judge.json` configuration.
- Custom HTTP headers via `JUDGE_HEADERS`.
- Advisory, warn, and block policy modes.
- Fail-open default behavior.
- Git status, diff, staged diff, package metadata, hook payload, and command output collection.
- Regex-based secret redaction.
- Zod schema validation and one repair retry.
- Text, JSON, and agent feedback output formats.
- Review profiles: `default`, `security`, `tests`, `docs`, `release`.
- Optional `.agy-judge.rubric.md` support.
- Empty-context preflight that skips the judge call.
- Antigravity plugin metadata, command, hook, and skill files.
- Local mock judge.
- README, security, contributing, changelog, code of conduct, issue templates, PR template, and CI.
- Example env files, hook payloads, rubric, and output.

## Milestone 0.2: Real Hook Confidence

Goal: prove the Antigravity integration works in real sessions, not only through metadata validation.

Tasks:

- Capture real hook payloads from Antigravity CLI.
- Add sanitized fixtures for real payload shapes under `test/fixtures/`.
- Add tests for final response extraction from real hook payloads.
- Add tests for command output extraction from real hook payloads.
- Document the tested Antigravity CLI version.
- Document exact command and hook behavior observed in real sessions.
- Decide whether `plugin/hooks.json` should remain minimal or target a specific hook event.

Acceptance criteria:

- `agy plugin validate ./plugin` passes.
- `/agy-judge:agy-judge` works in a fresh Antigravity session.
- At least one real hook payload fixture is tested.
- README states the tested Antigravity CLI version and known hook limitations.

## Milestone 0.3: Provider Compatibility

Goal: make endpoint setup predictable across common OpenAI-compatible servers.

Tasks:

- Test llama.cpp OpenAI-compatible server.
- Test LiteLLM.
- Test vLLM.
- Test OpenRouter or another hosted OpenAI-compatible provider.
- Add a provider compatibility table to README or `docs/providers.md`.
- Record known quirks for `response_format`, model naming, headers, and auth.
- Add `doctor` examples for each provider.

Acceptance criteria:

- At least three provider configurations are verified.
- Each verified provider has an example config.
- `agy-judge doctor` succeeds against each verified provider.
- Known failures produce actionable error messages.

## Milestone 0.4: Safety Hardening

Goal: reduce leakage and prompt-injection risk before a stable release.

Tasks:

- Add redaction tests for more API key shapes.
- Add redaction tests for private keys, `.env` values, authorization headers, and high-entropy tokens.
- Add prompt-injection fixtures for diffs, logs, filenames, and hook payloads.
- Add tests proving untrusted content is wrapped as reviewed context, not instructions.
- Consider `JUDGE_LOCAL_ONLY` or `JUDGE_ALLOW_REMOTE` for teams that want local-only safety.
- Improve invalid `JUDGE_HEADERS` and invalid `.agy-judge.json` diagnostics.

Acceptance criteria:

- Prompt-injection fixture tests pass.
- Redaction tests cover the documented secret classes.
- `agy-judge status` and `agy-judge doctor` surface config problems without leaking values.

## Milestone 0.5: Workflow Polish

Goal: make judge feedback easy to act on.

Tasks:

- Add `agy-judge review --feedback-file <path>`.
- Add `agy-judge hook --dump-payload <path>` for local debugging.
- Redact dumped payloads by default, or require an explicit unsafe flag for raw dumps.
- Improve agent-format output for required changes and rerun instructions.
- Add an end-to-end workflow document:
  - make a change
  - run judge
  - feed agent feedback back into Antigravity
  - fix
  - rerun judge
- Add sample outputs for pass, warn, fail, and block.

Acceptance criteria:

- Agent feedback can be saved to a file.
- A documented workflow takes a new user from change to judge feedback to fix.
- Example outputs match actual CLI output.

## Milestone 0.6: Release Automation

Goal: make releases repeatable and low-risk.

Tasks:

- Add a GitHub release workflow for tagged releases.
- Keep npm publishing manual initially, or add a protected publish workflow.
- Add `npm publish --dry-run` to release checklist.
- Add provenance/signing if practical.
- Add `RELEASE.md` with exact release steps.
- Decide whether 1.0 is published as `agy-judge` or a scoped package if name availability changes.

Acceptance criteria:

- CI passes on `main`.
- `npm pack --dry-run` contains expected files.
- Release checklist can be followed by someone other than the original author.
- GitHub release notes are generated from `CHANGELOG.md`.

## 1.0 Acceptance Criteria

Before tagging `1.0.0`, all of the following should be true:

- `npm install --global agy-judge` works.
- `agy-judge --version` works.
- `agy-judge status` does not leak secrets.
- `agy-judge doctor` works against mock and at least three real provider configurations.
- `agy-judge review` works with text output.
- `agy-judge review --format json` works for automation.
- `agy-judge review --format agent` works for passing feedback back into Antigravity.
- Empty review packets skip the judge endpoint and return a local warning.
- Antigravity plugin validation passes.
- Antigravity command workflow is documented and tested.
- At least one real Antigravity hook payload fixture is tested.
- Redaction tests cover all documented secret classes.
- Prompt-injection fixture tests pass.
- README gets a new user to a first useful review in under 10 minutes.
- CI is green.
- `npm pack --dry-run` contains only expected release files.
- `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, and license are present.

## Post-1.0 Ideas

These are intentionally not required for 1.0:

- Multi-judge or judge-assembly mode.
- Persisted review history.
- Aggregate statistics over judge outcomes.
- CI annotations.
- SARIF output.
- Rich Antigravity-specific feedback channel if the CLI exposes one.
- Optional command execution for configured test commands.
- Provider-specific adapters beyond OpenAI-compatible chat completions.

