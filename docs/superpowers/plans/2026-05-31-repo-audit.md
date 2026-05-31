# Repo Hardening & Best-Practices Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a single, prioritized, evidence-backed findings report covering security/hardening, dependency upgrades, and code quality for the `pool_monitor` repo — with no code, dependency, or config changes.

**Architecture:** A read-only investigation. Task 1 gathers raw tool output. Tasks 2–4 sweep one area each, emitting structured **finding records**. Task 5 confirms the seed findings and ranks everything into one backlog. Task 6 assembles the report, self-reviews it against the spec, and commits. This is the only repo task type here that is NOT test-driven — there is no production code to test; correctness means *every finding is backed by real evidence*.

**Tech Stack:** pnpm/Node 22 (dashboard + weather), Vite/React, Express, InfluxDB 2/Flux, Docker Compose, eslint/vitest.

---

## Spec reference

`docs/superpowers/specs/2026-05-31-repo-audit-design.md`. Read it first.

## Conventions (read once)

- All `pnpm` commands need nvm: prefix with `source ~/.nvm/nvm.sh &&` and run from the relevant package dir (`dashboard/` or `weather/`). Plain `pnpm` fails with "command not found".
- `pnpm audit`/`pnpm outdated` exit non-zero when they find things — append `|| true` so a task step doesn't abort.
- This is **read-only**. Do NOT edit source, configs, dependencies, or run fixers. The only file created is the report (Task 6).
- Accumulate raw tool output and in-progress findings in a scratch file `docs/audit/_notes.md` as you go (it is overwritten/removed at the end; the committed artifact is the final report only).

## Finding record schema (used by Tasks 2–5)

Every finding is recorded in this exact shape so Task 5 can rank them uniformly:

```markdown
#### <concise finding title>
- **Area:** Security | Dependencies | Code quality
- **Severity:** Critical | High | Medium | Low
- **Effort:** S (<1h) | M (hours) | L (day+)
- **Evidence:** <file:line reference OR a short verbatim command-output snippet>
- **Recommendation:** <one concrete, specific fix>
```

Severity = exploitability/impact (Critical = exploitable or data-loss; High = real security/correctness risk; Medium = best-practice gap; Low = polish). Do NOT invent findings — if a check comes back clean, record "clean" and move on.

## File structure

- Create (Task 6 only): `docs/audit/2026-05-31-repo-hardening-audit.md` — the deliverable.
- Scratch (not committed): `docs/audit/_notes.md` — raw outputs + draft findings.
- No other files are created or modified.

---

### Task 1: Gather raw inputs (inventory)

**Files:** Create scratch `docs/audit/_notes.md` (append raw output under a `## Raw inputs` heading).

- [ ] **Step 1: Dependency state — dashboard**

Run:
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor/dashboard && source ~/.nvm/nvm.sh && pnpm outdated || true; pnpm audit || true
```
Record the full output verbatim in `_notes.md`.

- [ ] **Step 2: Dependency state — weather**

Run:
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor/weather && source ~/.nvm/nvm.sh && pnpm outdated || true; pnpm audit || true
```
Record verbatim.

- [ ] **Step 3: Lint + coverage — dashboard**

Run:
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor/dashboard && source ~/.nvm/nvm.sh && pnpm lint 2>&1 | tail -20; pnpm test:coverage 2>&1 | grep -E "All files|^ *[A-Za-z].*\.tsx?|Tests " | tail -40
```
Record the lint errors and the per-file coverage table.

- [ ] **Step 4: Container & runtime inventory**

Run:
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor && grep -nE "image:|build:" docker-compose.yml; grep -nE "read_only|cap_drop|security_opt|user:|no-new-privileges" docker-compose.yml || echo "NO hardening keys"; grep -nE "^FROM|^USER" dashboard/Dockerfile weather/Dockerfile
```
Record: which images use floating tags (`:latest`/bare major), whether any compose hardening keys exist, and whether the Dockerfiles set a non-root `USER`.

- [ ] **Step 5: Node/runtime versions**

Run:
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor && grep -nE "\"engines\"|\"node\"" dashboard/package.json weather/package.json; cat .nvmrc 2>/dev/null || echo "no .nvmrc"; grep -n "FROM node" dashboard/Dockerfile weather/Dockerfile
```
Record the declared/used Node versions.

- [ ] **Step 6: Checkpoint** — confirm `_notes.md` has all six raw outputs. No commit (read-only).

---

### Task 2: Security & hardening sweep

**Files:** Append findings to `_notes.md` under `## Security findings`, each using the finding-record schema.

- [ ] **Step 1: Injection surfaces (Flux)**

Run:
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor/dashboard && grep -nE "\\$\\{range\\}|parseRange|range\\(start" server/influx.ts; grep -nE "isValidRange|isValidSensorId" server/routes.ts
```
Read `server/influx.ts` `parseRange` and every route in `server/routes.ts`. For each GET endpoint taking `range`, determine whether the value reaches Flux without allowlist validation (note: `GET /api/chemistry` has `isValidRange`; check `/api/history`, `/api/stats`, `/api/weather/history`, `/api/stat-detail`). Record one finding per unguarded interpolation surface with the `file:line`.

- [ ] **Step 2: Secrets exposure**

Run:
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor && grep -rnE "INFLUXDB_TOKEN|WEATHERAPI_KEY|CHEM_AUTH_PASSWORD|PASSWORD|token" dashboard/src weather/src 2>/dev/null; grep -rnE "console\\.(log|error|warn)" dashboard/server weather/src 2>/dev/null
```
Confirm no secret reaches the client bundle (`dashboard/src`) and no secret is logged server-side. Record findings (or "clean").

- [ ] **Step 2b: Token scope**

Read the InfluxDB token usage: the dashboard now needs write scope (for `chemistry`) but historically was read-only. Record a finding recommending a narrowly-scoped (per-bucket, read+write only) token rather than an all-access token, with `docker-compose.yml` env reference.

- [ ] **Step 3: Container hardening**

From Task 1 Step 4 output: record findings for (a) Dockerfiles running as root (no `USER`), (b) absent `read_only`/`cap_drop: [ALL]`/`security_opt: [no-new-privileges:true]` in compose. Recommend the specific compose/Dockerfile additions. Severity reflects that these are defense-in-depth on a home network behind cloudflared.

- [ ] **Step 4: Network exposure & auth robustness**

Run:
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor && grep -nE "1883|allow_anonymous|password_file" mosquitto*.conf 2>/dev/null; grep -rnE "rate.?limit|express-rate-limit" dashboard/server 2>/dev/null || echo "no rate limiting"; grep -nE "ports:" -A2 docker-compose.yml
```
Record findings: anonymous MQTT in standalone mode; no rate limiting / brute-force protection on the public API (esp. `POST /api/chemistry` + `auth-check`); any host-exposed ports that needn't be. Reference the chemistry auth model (`server/auth.ts`) — note it's sound (timing-safe, no `WWW-Authenticate`) but unthrottled.

- [ ] **Step 5: Input validation coverage**

Read each endpoint in `server/routes.ts`; confirm `sensor` (regex), `range` (allowlist), and POST body are validated. Record any endpoint missing validation.

- [ ] **Step 6: Dependency CVEs**

From the `pnpm audit` output (Task 1): record one finding per advisory (or "no advisories"), with package, severity, and whether a non-breaking fix exists.

- [ ] **Step 7: Checkpoint** — every Security check above has either a finding record or an explicit "clean" note in `_notes.md`.

---

### Task 3: Dependency & version sweep

**Files:** Append findings to `_notes.md` under `## Dependency findings`.

- [ ] **Step 1: npm packages (both apps)**

From Task 1 `pnpm outdated` output, for each app: list packages where `Current` ≠ `Latest`. Group by upgrade risk — **patch/minor** (low risk) vs **major** (needs review, note the breaking-change concern, e.g. a framework major). Record as findings: one "batch minor/patch bumps" finding per app (Effort S–M), plus a separate finding for any risky **major** upgrade with its specific concern.

- [ ] **Step 2: Docker image tag pinning**

From Task 1 Step 4: record a finding listing each floating tag (`hertzg/rtl_433:latest`, `telegraf:latest`, `grafana/grafana:latest`, `cloudflare/cloudflared:latest`) and loose majors (`eclipse-mosquitto:2`, `influxdb:2`). Recommend pinning to specific versions (or digests) for reproducibility/supply-chain safety. Note `influxdb` pinning especially matters (data store).

- [ ] **Step 3: Node runtime**

From Task 1 Step 5: record whether Node 22 is current LTS and whether `engines` is declared in `package.json` (recommend adding it to prevent accidental drift). Record finding or "clean".

- [ ] **Step 4: Checkpoint** — outdated/audit fully triaged into findings.

---

### Task 4: Code quality & best-practices sweep

**Files:** Append findings to `_notes.md` under `## Code quality findings`.

- [ ] **Step 1: Lint**

From Task 1 lint output: record the `BottomSheet.tsx` `react-hooks/refs` error as a finding (Severity Low–Medium, Effort S) with the `file:line` and the recommended fix approach (move the ref write into an effect or use the established latest-ref pattern eslint accepts). Note it currently makes `pnpm lint` exit non-zero (would block any future CI lint gate).

- [ ] **Step 2: Test coverage gaps**

From Task 1 coverage table: record findings for files notably below the 80% target (e.g. `TempChart.tsx`) and the absence of HTTP-layer route tests (`server/routes.ts` has no test; logic is tested only at the unit level). Recommend specific tests.

- [ ] **Step 3: Type-safety escapes**

Run:
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor/dashboard && grep -rnE "as never|as unknown|: any\\b|@ts-ignore|eslint-disable" src server | grep -v ".test." | head -40
```
Record findings for production (non-test) escapes worth tightening. Test-file casts are acceptable — note but don't flag as issues.

- [ ] **Step 4: Error-handling consistency**

Read `server/routes.ts` and the client hooks (`src/hooks/`). Confirm the consistent try/catch + 500 pattern server-side and graceful-degradation pattern client-side. Record any endpoint/hook deviating, or "consistent — no finding".

- [ ] **Step 5: Dead code / duplication**

Run:
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor/dashboard && grep -rnE "parseRange|windowPeriod|computePeriods" server | head; grep -rn "TODO\\|FIXME\\|XXX" src server weather 2>/dev/null || echo "none"
```
Note any duplicated range-window logic or stray TODO/FIXME markers. Record findings or "clean".

- [ ] **Step 6: Checkpoint** — every Code-quality check has a finding or "clean" note.

---

### Task 5: Confirm seed findings & rank the backlog

**Files:** Edit `_notes.md` — add a `## Backlog (ranked)` section.

- [ ] **Step 1: Reconcile seed findings**

For each seed finding in the spec (Flux interpolation on older endpoints; `BottomSheet` lint error; floating image tags; container privilege; token breadth; localStorage credential model; coverage gaps), confirm it appears in Tasks 2–4 with evidence, or explicitly mark it refuted with why. Add any seed not yet captured.

- [ ] **Step 2: Assign severity & effort**

Ensure every finding has a Severity and Effort per the rubric. Sanity-check consistency (e.g. an unauthenticated injection on a public endpoint is High/Critical, not Low).

- [ ] **Step 3: Rank into one backlog**

Produce a single ordered list: **quick wins first** (High/Critical severity × S effort), then High severity regardless of effort, then Medium, then Low. Record as a table: Rank | Finding | Area | Severity | Effort | Recommended fix.

- [ ] **Step 4: Checkpoint** — backlog covers every finding exactly once; ordering follows the rule.

---

### Task 6: Write the report, self-review, commit

**Files:** Create `docs/audit/2026-05-31-repo-hardening-audit.md`; delete `docs/audit/_notes.md`.

- [ ] **Step 1: Assemble the report**

Create `docs/audit/2026-05-31-repo-hardening-audit.md` with these sections (in order):
1. **Executive summary** — finding counts by severity; the top 3–5 quick wins (one line each); a one-paragraph overall posture statement.
2. **Prioritized backlog** — the ranked table from Task 5 Step 3.
3. **Findings detail** — grouped by area (Security, Dependencies, Code quality); each finding in the schema shape (title, area, severity, effort, evidence, recommendation).
4. **Deferred (out of scope)** — bullet the infra/build/perf items from the spec (bundle splitting / ~640 KB client bundle, no CI/CD, InfluxDB backup-retention, compose structural refactors/healthchecks).
5. **Method & limitations** — single-pass survey; tools used; read-only; explicit note that long-tail issues may remain.

- [ ] **Step 2: Self-review against the spec**

Re-read `docs/superpowers/specs/2026-05-31-repo-audit-design.md`. Verify: all three areas covered; every finding has evidence + a recommendation (none speculative); every seed finding is confirmed-with-evidence or refuted; backlog ordering follows the quick-wins-first rule; no code/config/dependency changes were made (`git status` shows only the new report file). Fix any gaps inline.

- [ ] **Step 3: Clean up scratch + verify no changes**

Run:
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor && rm -f docs/audit/_notes.md && git status --short
```
Expected: only `docs/audit/2026-05-31-repo-hardening-audit.md` is new/untracked; no other tracked files modified.

- [ ] **Step 4: Commit**

```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor && git add -f docs/audit/2026-05-31-repo-hardening-audit.md && git commit -m "docs: add repo hardening & best-practices audit report"
```
(End the commit body with the `Co-Authored-By` trailer your harness requires.)

---

## Self-review notes

- **Spec coverage:** Security/Dependencies/Code-quality areas → Tasks 2/3/4; method & inputs → Task 1; severity/effort/priority rubric → finding schema + Task 5; seed findings → Task 5 Step 1; output report structure & location → Task 6 Step 1; success criteria & non-goals (read-only) → Task 6 Steps 2–3. All spec sections map to a task.
- **No placeholders:** every step has exact commands or exact files to read and a concrete recording action.
- **Consistency:** the finding-record schema defined once is referenced by Tasks 2–5; the report sections in Task 6 match the spec's Output section exactly; scratch file name `docs/audit/_notes.md` and report path `docs/audit/2026-05-31-repo-hardening-audit.md` are used consistently.
- **Adaptation note:** this plan intentionally departs from the TDD task template because the work is a read-only audit; "correctness" is enforced via the evidence requirement and the Task 6 self-review rather than failing tests.
