# Repo Hardening & Best-Practices Audit — Design

**Date:** 2026-05-31
**Status:** Approved (pending implementation plan)

## Overview

A quick, focused, **read-only** deep-dive audit of the `pool_monitor` repository to
surface opportunities to upgrade and harden it against best practices. The audit
produces a single **prioritized findings report**. It makes **no code, dependency,
or config changes** — remediation is deferred to follow-up specs/PRs chosen from
the report's backlog.

## Scope

Three areas, confirmed with the owner:

1. **Security & hardening** — auth/secrets handling, injection surfaces, container
   hardening, network exposure, input validation, dependency CVEs.
2. **Dependency & version upgrades** — outdated npm packages and Docker image tags,
   runtime versions, and safe upgrade paths.
3. **Code quality & best practices** — lint errors, error-handling consistency,
   type safety, test-coverage gaps, dead code, duplication.

### Out of scope (deferred, not lost)

Infrastructure/build/performance items are **not** audited in depth here, but the
report captures a short "Deferred" list so they aren't forgotten:
- JS bundle size / code-splitting (the ~640 KB un-split client bundle).
- CI/CD setup (there is currently no CI).
- InfluxDB backup/retention strategy.
- Docker Compose structural refactors and healthcheck coverage.

Container *hardening* (non-root, read-only FS, capability drops) **is** in scope
under Security, even though broader infra is not.

## Method

A single read-only pass, area by area. **Every finding must be backed by concrete
evidence** — a `file:line` reference, a command's output, or an image tag. No
speculative findings.

Inputs gathered during the pass:
- `pnpm outdated` and `pnpm audit` in both `dashboard/` and `weather/` (run via
  `source ~/.nvm/nvm.sh && ...`).
- Docker image tag review across `docker-compose.yml` (rtl_433, mosquitto,
  influxdb, grafana, telegraf, dashboard, weather, cloudflared).
- Targeted `grep` for risk patterns (e.g. raw interpolation into Flux queries,
  `dangerouslySetInnerHTML`, secret logging, `process.env` usage).
- Review of issues already known from recent work (see Seed findings).
- Node/runtime version review (`package.json` engines, Dockerfiles, nvm).

The audit is conducted as a focused single-pass survey (not a multi-agent
adversarial audit); it favors high-value findings over exhaustive long-tail
coverage. The report explicitly notes this limitation.

## Severity & priority rubric

Each finding records: **title, area, severity, effort, evidence, recommended fix**.

**Severity**
- **Critical** — exploitable security hole or data-loss risk.
- **High** — a real security weakness or correctness/maintainability risk likely to bite.
- **Medium** — a best-practice gap with moderate risk.
- **Low** — polish / nice-to-have.

**Effort** — **S** (< 1h) · **M** (a few hours) · **L** (a day or more).

**Priority** — findings are ranked into one backlog, surfacing **quick wins**
(high severity × low effort) first, then high-severity/high-effort, then the rest.

## Coverage checklist per area

These are the minimum checks each area's sweep must perform. Seed findings (below)
are starting hypotheses to confirm/expand — not the final list.

**Security & hardening**
- Injection: any user-controlled value interpolated into Flux/SQL/shell.
- AuthN/AuthZ: the chemistry Basic-Auth gate; public vs protected endpoints;
  credential storage model; absence of rate limiting/brute-force protection.
- Secrets: `.env` handling, token scope/breadth, secrets in logs or client bundle.
- Containers: run-as-root, read-only root FS, dropped capabilities, `no-new-privileges`.
- Network exposure: cloudflared tunnel surface, MQTT anonymous access, exposed ports.
- Input validation across all API endpoints (sensor id, range, body).
- Dependency CVEs (from `pnpm audit`).

**Dependency & version upgrades**
- `pnpm outdated` (dashboard + weather): current vs wanted vs latest, with major-vs-minor risk noted.
- `pnpm audit`: known vulnerabilities and available fixes.
- Docker image tags: pinned digest/version vs floating (`:latest`) — reproducibility & supply-chain risk.
- Node runtime version vs current LTS; engines field presence.

**Code quality & best practices**
- Outstanding lint errors/warnings (`pnpm lint`).
- Test-coverage gaps (`pnpm test:coverage`) and untested layers (e.g. HTTP routes).
- Error-handling consistency across server and client.
- Type-safety escapes (`as never`, `as unknown`, `any`).
- Dead code and duplicated logic / shared-pattern candidates.

## Seed findings (to verify during the pass)

Concrete hypotheses already observed during recent work, recorded so the audit
confirms and quantifies them rather than rediscovering them:

- **Flux injection surface:** `parseRange()` in `dashboard/server/influx.ts`
  interpolates a user-controlled `range` string directly into Flux for the
  temperature/weather/history endpoints. `GET /api/chemistry` was guarded with an
  `isValidRange` allowlist; the older endpoints were not. (Severity and effort are assigned during the pass, like every finding.)
- **Pre-existing lint error:** `dashboard/src/components/BottomSheet/BottomSheet.tsx`
  (`react-hooks/refs` — ref written during render) fails `pnpm lint`.
- **Floating image tags:** `cloudflared:latest` (and any other unpinned tags) in
  `docker-compose.yml` — reproducibility/supply-chain risk.
- **Container privilege:** services likely run as root with default capabilities;
  no `read_only`/`cap_drop`/`no-new-privileges` hardening.
- **Token breadth:** the dashboard's `INFLUXDB_TOKEN` now needs write scope; audit
  whether it can be narrowed (e.g. per-bucket scoping).
- **Credential model:** chemistry unlock stores `base64(user:pass)` in
  `localStorage`; acceptable for the threat model but worth documenting/limiting.
- **Coverage gaps:** server routes have no HTTP-layer tests; `TempChart` and some
  components sit below the 80% target.

## Output

A single markdown report at **`docs/audit/2026-05-31-repo-hardening-audit.md`**,
structured as:
1. **Executive summary** — counts by severity, the top 3–5 quick wins, overall posture.
2. **Prioritized backlog** — one table: rank, finding, area, severity, effort, recommended fix.
3. **Findings detail** — one section per finding with evidence (`file:line`/output) and the recommended fix.
4. **Deferred (out of scope)** — the infra/build/perf items listed above, for later consideration.
5. **Method & limitations** — what was and wasn't checked; the single-pass caveat.

## Success criteria

- All three areas swept, each with its coverage checklist completed.
- Every finding has evidence and a recommended fix; none speculative.
- Findings ranked into a single actionable backlog with quick wins first.
- The seed findings are each confirmed (with evidence) or refuted.
- Report committed; **no source/config/dependency changes made** by this effort.

## Non-goals

- No code changes, dependency bumps, or config edits.
- No remediation PRs (those are chosen later from the backlog).
- No exhaustive/long-tail enumeration — this is a focused survey, not a certification.
