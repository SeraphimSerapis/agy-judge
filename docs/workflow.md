# Recommended Workflow

This is the recommended `agy-judge` workflow for 1.0.

## 1. Configure The Judge

In the workspace you want reviewed:

```sh
cp /path/to/agy-judge/.env.example .env
$EDITOR .env
agy-judge status
agy-judge doctor
```

Use a local endpoint when reviewing sensitive code.

## 2. Make Or Stage A Change

`agy-judge` works best when it has local evidence:

```sh
git status --short
git diff --stat
```

If there is no diff, no staged diff, no hook payload, and no command output, `agy-judge` skips the judge endpoint and returns a local warning.

## 3. Run A Manual Review

From the project workspace:

```sh
agy-judge review
```

For structured output:

```sh
agy-judge review --format json
```

For feedback you can pass back to Antigravity:

```sh
agy-judge review --format agent
```

## 4. Use Profiles When Helpful

```sh
agy-judge review --profile security
agy-judge review --profile tests
agy-judge review --profile docs
agy-judge review --profile release
```

You can also add project-specific release or review rules:

```sh
$EDITOR .agy-judge.rubric.md
agy-judge review --profile release
```

## 5. Run From Antigravity

After installing the plugin, use the skill-based slash command:

```text
/agy-judge:agy-judge
```

This is currently the stable Antigravity workflow. The skill runs `agy-judge review`.

If the judge returns warnings or failures, pass the feedback back to the agent:

```text
Use this agy-judge feedback to fix the current work, then run the judge again.
```

## 6. Treat Hooks As Experimental

Automatic hook invocation is useful but currently less predictable than slash-command invocation.

Known issues:

- Stop hook sometimes does not trigger a review
- Stop hook sometimes triggers duplicate reviews
- statusline updates are disabled for now

Use hook mode for experiments and fixture capture, not as the default 1.0 workflow.
