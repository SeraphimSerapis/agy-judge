# Release Checklist

Steps to publish a new release of `agy-judge`.

## Prerequisites

- `main` branch is green in CI.
- `CHANGELOG.md` has been updated with all notable changes.
- You have npm publish rights for the `agy-judge` package.

## Steps

1. **Verify CI is green**

   ```sh
   pnpm verify
   ```

2. **Update version in `package.json`**

   ```sh
   npm version <patch|minor|major> --no-git-tag-version
   ```

3. **Update `CHANGELOG.md`**

   Add a section for the new version at the top of the file.

4. **Commit the version bump**

   ```sh
   git add package.json pnpm-lock.yaml CHANGELOG.md
   git commit -m "chore: release vX.Y.Z"
   ```

5. **Create and push the tag**

   ```sh
   git tag vX.Y.Z
   git push origin main --tags
   ```

   The `release.yml` workflow will automatically:
   - Build and test the package
   - Pack the exact npm tarball that will be published
   - Create a GitHub release with auto-generated release notes
   - Publish to npm with provenance

6. **Verify the release**

   - Check the [GitHub releases page](https://github.com/SeraphimSerapis/agy-judge/releases) for the new release
   - Verify the package is published on npm: `npm view agy-judge version`
   - Test installation: `npm install -g agy-judge@X.Y.Z`

## Dry Run

To verify the package contents without publishing:

```sh
npm pack --dry-run
```

## Rollback

If a bad release is published:

1. Unpublish the bad version from npm (within 72 hours):
   ```sh
   npm unpublish agy-judge@X.Y.Z
   ```
2. Delete the git tag:
   ```sh
   git tag -d vX.Y.Z
   git push origin :refs/tags/vX.Y.Z
   ```
3. Fix the issue and re-release.

## Package Contents

The published package includes:

- `dist/` — compiled JavaScript and type declarations
- `plugin/` — Antigravity plugin metadata (`plugin.json`, `hooks.json`, skill)
- `scripts/` — mock judge and hook-replay smoke test
- `examples/` — example env files, hook payloads, rubrics, and output
- `docs/` — workflow, Antigravity integration, and provider docs
- `.env.example` — starter environment configuration
- `README.md`, `NOTICE.md`, `CHANGELOG.md`
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `LICENSE`
