# CI Pipeline Setup — Design

**Date:** 2026-06-02
**Status:** Approved (pending implementation plan)

## Overview

Add a GitHub Actions CI workflow so every pull request (and push to `main`) is
automatically linted, typechecked, tested, and built — mirroring the manual
verification this project has relied on throughout the hardening phases. Closes
the "no CI/CD pipeline" item deferred by the repo audit.

Single deliverable: `.github/workflows/ci.yml` (plus a `github-actions` entry
added to the existing `.github/dependabot.yml`). No application code changes.

## Decisions (confirmed with owner)

- **Scope:** full gate — lint + typecheck + test + build for both packages, **plus**
  a Docker image-build job.
- **Enforcement:** CI becomes a **required status check** (owner toggles branch
  protection; this spec sets up the workflow + exact steps).
- **Action versions:** pinned to current-latest major tags, **validated against the
  registry**, and kept current by Dependabot's `github-actions` ecosystem.
- **Triggers:** `pull_request` and `push` to `main`.

## Approach

One workflow file with parallel jobs (rejected: a monolithic serial job — slow,
poor failure isolation; and per-package workflow files — more files, harder to
require as a single check). Parallel jobs give fast feedback and independently
inspectable failures.

## Repo facts the workflow must match

- **Two pnpm packages:** `dashboard/` and `weather/`.
- **Package manager:** pnpm `10.33.0` (from `dashboard/package.json` `packageManager`).
- **Node:** 24 (Dockerfiles pin `node:24.16.0-slim`).
- **Scripts — dashboard:** `lint` (eslint), `typecheck` (`tsc -b`),
  `test:coverage` (`vitest run --coverage`), `build` (`tsc -b && vite build &&
  tsc -p tsconfig.server.json`). NOTE: `test` is `vitest` (watch mode) — CI must
  use `test:coverage`/`vitest run`, never `test`, or the job hangs.
- **Scripts — weather:** `typecheck` (`tsc -p … --noEmit`), `test` (`vitest run`
  — already non-watch), `build` (`tsc`). No `lint` or `test:coverage` scripts exist.
- **esbuild build script:** pnpm 10 blocks esbuild's postinstall by default
  (weather's vitest needs it). CI must allow it headlessly (see Components).

## Components (jobs)

All jobs: `runs-on: ubuntu-latest`, parallel, each sets up pnpm **before**
`actions/setup-node` so node's `cache: pnpm` resolves.

1. **`dashboard`** — `working-directory: dashboard`:
   `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` →
   `pnpm test:coverage` → `pnpm build`.
2. **`weather`** — `working-directory: weather`:
   `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm test` →
   `pnpm build`. (No lint/coverage — those scripts don't exist here.)
3. **`docker`** — builds both images to catch the cold in-container `tsc -b`
   (the failure mode that broke an earlier PR): `docker/setup-buildx-action`,
   then `docker/build-push-action` twice (`context: ./dashboard` and
   `./weather`, `push: false`, `load: false`). Independent of the node jobs.

`--frozen-lockfile` everywhere — fails the build if a lockfile is stale, which is
exactly the regression we want caught.

**esbuild approval:** weather's `pnpm test` runs vitest, which needs esbuild's
native binary; pnpm 10 ignores its build script by default. Resolve headlessly by
configuring pnpm to allow it before install — `pnpm config set enable-pre-post-scripts true`
is insufficient; use a committed `pnpm.onlyBuiltDependencies` entry in
`weather/package.json` (e.g. `["esbuild"]`) OR run `pnpm rebuild esbuild` after
install in the weather job. Implementation will pick whichever verifies clean;
prefer the `onlyBuiltDependencies` manifest field (declarative, also silences the
stray `pnpm-workspace.yaml` prompt locally). If a manifest change is needed it is
limited to adding that field.

## Action versions (validated 2026-06-02, pinned to major tag)

| Action | Latest | Pin |
|--------|--------|-----|
| `actions/checkout` | v6.0.2 | `@v6` |
| `actions/setup-node` | v6.4.0 | `@v6` |
| `pnpm/action-setup` | v6.0.8 | `@v6` |
| `docker/setup-buildx-action` | v4.1.0 | `@v4` |
| `docker/build-push-action` | v7.2.0 | `@v7` |

Major-tag pins (not full SHAs): standard for a personal project, and Dependabot's
`github-actions` updater keeps them current.

## Dependabot

Add a 5th entry to `.github/dependabot.yml`: `package-ecosystem: github-actions`,
`directory: /`, weekly/Monday, `dependencies` label, `deps` commit prefix,
minor+patch grouped (`github-actions-minor-patch`), majors separate — matching the
existing entries' shape.

## Required status check (owner action)

The workflow is named `CI`; its jobs (`dashboard`, `weather`, `docker`) appear as
status checks. The owner enables enforcement in GitHub:
Settings → Branches → Add/edit branch protection rule for `main` →
"Require status checks to pass before merging" → select `dashboard`, `weather`,
`docker`. (Claude cannot change repo settings; the plan documents these steps.)

## Out of scope

- Deployment / CD — there is no deploy target; the Pi/server pull and rebuild
  manually. This is CI only.
- Coverage upload to an external service (Codecov etc.).
- Multi-version test matrix (single Node 24 line, matching production).
- Caching the Docker layer build beyond buildx defaults.

## Success criteria

- `.github/workflows/ci.yml` exists, valid YAML, triggers on PR + push-to-main.
- Three jobs (`dashboard`, `weather`, `docker`) run in parallel and pass against
  the current `main`.
- Dashboard job runs lint + typecheck + test:coverage + build; weather runs
  typecheck + test + build; docker builds both images.
- All actions pinned to the validated current major versions.
- `--frozen-lockfile` used for both installs.
- A `github-actions` Dependabot entry is added.
- No application/source changes (a `weather/package.json`
  `onlyBuiltDependencies` field is the only permissible manifest touch).
