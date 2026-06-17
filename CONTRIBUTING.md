# Contributing

Thanks for helping improve `agy-judge`.

## Development Setup

```sh
pnpm install
pnpm build
pnpm test
```

For a local CLI:

```sh
pnpm link --global
agy-judge status
```

## Useful Commands

```sh
pnpm typecheck
pnpm test
pnpm test:review
pnpm mock-judge
pnpm pack:dry-run
```

## Pull Requests

Please keep changes small and focused. For behavior changes, add or update tests when practical.

Before opening a pull request, run:

```sh
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run
```

## Security-Sensitive Changes

Changes that affect redaction, prompt construction, request headers, or collected context should be reviewed carefully. `agy-judge` may send diffs and command output to a configured judge endpoint, so avoid broadening collected context without documenting the change.

