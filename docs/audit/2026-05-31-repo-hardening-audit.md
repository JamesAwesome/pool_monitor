# Repo Hardening & Best-Practices Audit — Report

**Date:** 2026-05-31
**Branch:** repo-audit
**Scope:** Read-only audit of `pool_monitor`. No source, config, or dependency changes were made by this effort.

---

## 1. Executive summary

**Finding counts by severity (actionable findings, n=30):**

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 5 |
| Medium | 12 |
| Low | 13 |

**Top quick wins (backlog ranks 1–5):**

1. Add an `isValidRange` guard before `queryStats` on `/api/stats` (mirror the existing `/api/chemistry` guard) — closes a live Flux-injection path. **High · S**
2. Add an `isValidRange` guard before `queryHistory` on `/api/history`. **High · S**
3. Add an `isValidRange` guard before `queryWeatherHistory` on `/api/weather/history`. **High · S**
4. Bump `vite` to ≥8.0.5 (latest 8.0.14) in `dashboard/` — clears two HIGH + two MODERATE CVEs. **High · S**
5. Pin every Docker image to an explicit version (digest ideally); special-case `influxdb:2` → `2.8.0`. **High · M**

**Overall posture:** This is a well-built, well-tested application (309 passing tests, ~86% overall coverage, consistent error handling, clean secret hygiene, and `sensor`-parameter validation across all routes). The audit found **no Critical issues and nothing currently exploited**. The main themes are: (a) an **unguarded Flux `range` parameter on three public endpoints** (`/api/stats`, `/api/history`, `/api/weather/history`) that interpolate raw user input into Flux via the `parseRange` `start: -${range}` fallthrough; (b) a **known dev-tooling CVE in `vite`** (8.0.3, fixed in 8.0.5) plus several transitive MODERATE advisories; (c) **unpinned / floating Docker image tags** (four `:latest`, two major-only pins) that threaten reproducibility and the data pipeline; and (d) **defense-in-depth container/network hardening** gaps (root containers, no `cap_drop`/`read_only`/`no-new-privileges`, ports on `0.0.0.0`, anonymous MQTT in standalone mode). All findings are concrete and remediable; remediation is deferred to follow-up work selected from the backlog below.

---

## 2. Prioritized backlog

Ordering: quick wins (High/Critical severity AND S effort) first; then remaining High/Critical (lower effort first); then Medium (lower effort first); then Low (lower effort first). Every actionable recorded finding appears exactly once.

| Rank | Finding | Area | Severity | Effort | Recommended fix (short) |
|------|---------|------|----------|--------|--------------------------|
| 1 | Flux injection — `/api/stats` | Security | High | S | Add `isValidRange` guard before `queryStats` (mirror `/api/chemistry`) |
| 2 | Flux injection — `/api/history` | Security | High | S | Add `isValidRange` guard before `queryHistory` |
| 3 | Flux injection — `/api/weather/history` | Security | High | S | Add `isValidRange` guard before `queryWeatherHistory` |
| 4 | Vite HIGH CVEs (fs.deny bypass / WS file read) | Security | High | S | Bump `vite` to ≥8.0.5 (latest 8.0.14) in dashboard |
| 5 | Floating / loosely-pinned Docker image tags | Dependencies | High | M | Pin every image to an explicit version (digest ideally); special-case `influxdb:2`→`2.8.0` |
| 6 | Mosquitto allows anonymous (standalone) | Security | Medium | S | `allow_anonymous false` + password_file in standalone conf |
| 7 | InfluxDB/Grafana ports bound to 0.0.0.0 | Security | Medium | S | Bind to `127.0.0.1`; expose Grafana via cloudflared only |
| 8 | No rate limiting on `/api/chemistry` auth | Security | Medium | S | Add `express-rate-limit` (e.g. 10/15min/IP) on chemistry routes |
| 9 | Dockerfiles run as root (no USER) | Security | Medium | S | Add non-root `app` user + `USER app` before CMD in both Dockerfiles |
| 10 | Vite MODERATE path traversal (`.map`) | Security | Medium | S | Covered by vite bump (dashboard) / vitest bump (weather) |
| 11 | PostCSS MODERATE XSS (stringify) | Security | Medium | S | Pulled in by vite/vitest bump (transitive) |
| 12 | qs MODERATE DoS (via express) | Security | Medium | S | Bump express to pull `qs`≥6.15.2 or add `pnpm.overrides` |
| 13 | Dashboard uses admin InfluxDB token | Security | Medium | M | Issue a bucket-scoped read+write token for dashboard/weather; rotate admin |
| 14 | `@napi-rs/canvas` 0.1→1.0 major | Dependencies | Medium | M | Review 1.0 changelog; bump; verify `/og-image.png` renders |
| 15 | Weather `vitest` 2→4 (clears 3 dev CVEs) | Dependencies | Medium | M | Bump `vitest`→^4.1.7; fix config; closes esbuild/vite/postcss CVEs |
| 16 | TempChart.tsx coverage below 80% | Code quality | Medium | M | Test `formatXTick`, air-overlay, loading state, custom-range flow |
| 17 | `recharts` 2→3 major API change | Dependencies | Medium | L | Dedicated migration; audit imports; visual smoke-test |
| 18 | brace-expansion MODERATE (dev-only) | Security | Low | S | Bump `typescript-eslint` or override `brace-expansion`≥5.0.6 |
| 19 | esbuild MODERATE (weather, dev-only) | Security | Low | S | Covered by weather `vitest` bump |
| 20 | `/api/stat-detail` missing `isValidRange` (hygiene) | Security | Low | S | Add guard for consistency (no live injection path) |
| 21 | Dashboard patch/minor dep batch | Dependencies | Low | S | `pnpm update` in dashboard; also clears vite/postcss/brace CVEs |
| 22 | Node runtime unpinned (engines/.nvmrc/Dockerfile) | Dependencies | Low | S | Add `engines`, `.nvmrc`, pin `node:22.x.y-slim` |
| 23 | ChemistryTab.tsx coverage below 80% | Code quality | Low | S | Test ChemFocusSheet open, custom range, `onSaved` callback |
| 24 | types.ts shows 0% coverage | Code quality | Low | S | Exclude `src/types.ts` in vitest coverage config |
| 25 | TempChart.tsx `undefined as unknown as number` cast | Code quality | Low | S | Widen local point type to `value: number \| undefined` |
| 26 | Chemistry cred base64 in localStorage | Security | Low | S | Accept for threat model; if hardened, use sessionStorage/short-lived token |
| 27 | No runtime hardening in docker-compose | Security | Low | M | Add `no-new-privileges`/`cap_drop`/`read_only` (+tmpfs) per service |
| 28 | `eslint` / `@eslint/js` 9→10 major | Dependencies | Low | M | Review ESLint 10 guide; bump together; fix new rule errors |
| 29 | `@types/node` 24→25 & `typescript` 5→6 majors | Dependencies | Low | M | Bump TS first, typecheck; then `@types/node`; dedicated task |
| 30 | No HTTP-layer (supertest) integration tests | Code quality | Low | M | Optional: add supertest tests for chemistry routes (400/201/range) |

**Authoritative counts by severity (n=30, all ranked):** Critical 0 · High 5 · Medium 12 · Low 13.

**Clean / no-action items (recorded, intentionally not ranked):**
- `ThemeContext.tsx:75` `eslint-disable react-refresh/only-export-components` — standard, intentional. No action.
- No TODO/FIXME/XXX markers in source — clean.
- Server/client error-handling pattern — consistent across all 12 handlers. No finding.

---

## 3. Findings detail

### Security

#### Flux injection — `/api/stats` (unvalidated `range` interpolated into Flux)
- **Area:** Security
- **Severity:** High
- **Effort:** S (<1h)
- **Evidence:** `dashboard/server/routes.ts:52-53` — `range` is read from `req.query.range` and passed directly to `queryStats()` with no `isValidRange()` call. `dashboard/server/influx.ts:31` — `parseRange` falls through to `` return `start: -${range}` ``, placing arbitrary user input verbatim inside the Flux `range()` call.
- **Recommendation:** Add `if (!isValidRange(range)) { res.status(400).json({ error: 'Invalid range' }); return }` immediately after extracting `range` in the `/api/stats` handler (mirror the guard already present in `/api/chemistry`).

#### Flux injection — `/api/history` (unvalidated `range` interpolated into Flux)
- **Area:** Security
- **Severity:** High
- **Effort:** S (<1h)
- **Evidence:** `dashboard/server/routes.ts:63-69` — `range` flows to `queryHistory(range, sensor)` with no `isValidRange()` check. Same `parseRange` interpolation path (`influx.ts:31`) and additionally `windowPeriod(range)` is interpolated as `every: ${period}` in the `aggregateWindow` call (`influx.ts:158`). `windowPeriod` returns hardcoded strings so that sub-path is safe, but the `range(start: ...)` injection remains.
- **Recommendation:** Add `isValidRange` guard before `queryHistory()` call, same pattern as `/api/chemistry`.

#### Flux injection — `/api/weather/history` (unvalidated `range` interpolated into Flux)
- **Area:** Security
- **Severity:** High
- **Effort:** S (<1h)
- **Evidence:** `dashboard/server/routes.ts:159-160` — `range` flows to `queryWeatherHistory(range)` with no `isValidRange()` call. `influx.ts:400,406` — `parseRange(range)` and `windowPeriod(range)` are both interpolated into the query.
- **Recommendation:** Add `isValidRange` guard before `queryWeatherHistory()` call.

#### Missing `isValidRange` guard on `/api/stat-detail` (consistency / defense-in-depth)
- **Area:** Security
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** `dashboard/server/routes.ts:128,139` — `range` is read and forwarded to `queryStatDetail(range, stat, sensor)` with no `isValidRange()` check. However, `range` never reaches `parseRange` from this path. It goes only to `computePeriods` (`influx.ts:241`), which sanitizes in two ways: (a) for relative ranges, `influx.ts:265` regex-matches `^(\d+)([hd])$` and **defaults unrecognized input to 24h** at line 268 — so arbitrary strings never reach Flux; (b) for `custom:` ranges, `influx.ts:247-252` splits on `:` and runs `from`/`to` through `new Date(...).toISOString()` — a non-date injection string produces `"Invalid Date"` and will throw before any Flux query is built. This contrasts with `/api/history`, `/api/stats`, and `/api/weather/history`, which call `parseRange` directly and have a `start: -${range}` fallthrough that interpolates arbitrary input verbatim into Flux. The live injection exposure on `/api/stat-detail` is therefore low.
- **Recommendation:** Add an `isValidRange` guard before the `queryStatDetail()` call in `routes.ts` for consistency with the other routes and as defense-in-depth, but note this is a hygiene/consistency fix rather than a live injection block.

**Note — `sensor` parameter:** All routes that accept `sensor` do call `isValidSensorId()` before use. Sensor validation is clean.

**Note — `/api/chemistry`:** Already guarded with `isValidRange` at `routes.ts:171`. Clean.

**Note — Secrets in client bundle:** `grep` over `dashboard/src` found no occurrences of `INFLUXDB_TOKEN`, `WEATHERAPI_KEY`, `CHEM_AUTH_PASSWORD`, or `PASSWORD`. The weather `src/` references are in server-side config and test files only, never in browser-bundled code. **Clean.**

**Note — Console logging of secrets:** `dashboard/server/og-image.ts:26,32` and `dashboard/server/index.ts:57` log font paths and the listen port — no secrets. `weather/src/index.ts` logs location string, interval, and error messages — no token/key values logged. **Clean.**

#### Dashboard uses the operator/admin InfluxDB token — write access is broader than needed
- **Area:** Security
- **Severity:** Medium
- **Effort:** M (hours)
- **Evidence:** `docker-compose.yml:45` — `DOCKER_INFLUXDB_INIT_ADMIN_TOKEN: ${INFLUXDB_TOKEN}` initialises InfluxDB with this token as the **admin** token. The same `INFLUXDB_TOKEN` env var is injected into the `dashboard` container (`docker-compose.yml:108`), the `weather` container (`docker-compose.yml:131`), the `grafana` container (`docker-compose.yml:88`), and `telegraf` (`docker-compose.yml:69`). The dashboard now also calls `writeChemistry()` (`influx.ts:444`), so it does need write scope to its own bucket — but an all-access admin token grants write to every bucket/org resource.
- **Recommendation:** Create a dedicated InfluxDB token scoped to read+write on the single `pool_temps` bucket for the dashboard and weather containers. Keep the admin token only for Telegraf (which needs to create measurements) and for the initial InfluxDB setup. Rotate the shared admin token after scoped tokens are issued.

#### Dockerfiles run as root — no non-root USER directive
- **Area:** Security
- **Severity:** Medium
- **Effort:** S (<1h)
- **Evidence:** `dashboard/Dockerfile:1,15` and `weather/Dockerfile:1,13` — both multi-stage builds use `FROM node:22-slim` with no `USER` directive. Container inventory: "No USER directive found in either Dockerfile."
- **Recommendation:** Add `RUN addgroup --system app && adduser --system --ingroup app app` in each Dockerfile and switch with `USER app` before the final `CMD`. This limits blast radius if the Express process is compromised.

#### No runtime hardening in docker-compose — no `cap_drop`, `read_only`, or `no-new-privileges`
- **Area:** Security
- **Severity:** Low
- **Effort:** M (hours)
- **Evidence:** Container inventory: "NO hardening keys — No `read_only`, `cap_drop`, `security_opt`, `user:`, or `no-new-privileges` found." All services including `dashboard` and `weather` run without any compose-level security constraints.
- **Recommendation:** Add the following to each custom-built service (`dashboard`, `weather`) in `docker-compose.yml`: `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]`, and `read_only: true` (with a writable `tmpfs` for `/tmp` if needed). For third-party images, at minimum add `security_opt: [no-new-privileges:true]`.

#### Mosquitto allows anonymous connections in standalone mode
- **Area:** Security
- **Severity:** Medium
- **Effort:** S (<1h)
- **Evidence:** `mosquitto/mosquitto.conf:2` — `allow_anonymous true`. This is the config mounted for the `standalone` profile. Any process that can reach port 1883 can publish arbitrary MQTT messages, including spoofed sensor readings.
- **Recommendation:** Enable password auth in the standalone config too (`allow_anonymous false` + `password_file /mosquitto/config/password_file`), using the same `mqtt-password.sh` tooling. The `rtl_433` container already supports `MQTT_USERNAME`/`MQTT_PASSWORD` env vars.

#### InfluxDB and Grafana ports bound to all host interfaces (0.0.0.0)
- **Area:** Security
- **Severity:** Medium
- **Effort:** S (<1h)
- **Evidence:** `docker-compose.yml:37-38` — `"8086:8086"` and `docker-compose.yml:81-82` — `"3000:3000"`. Without a host-level firewall, InfluxDB's HTTP API and Grafana's web UI are reachable on all network interfaces. On a Raspberry Pi accessible via Cloudflare Tunnel, these are likely intended to be internal only.
- **Recommendation:** Bind to loopback: `"127.0.0.1:8086:8086"` and `"127.0.0.1:3000:3000"`. External access to Grafana (if desired) should go via cloudflared. InfluxDB has no need to be externally reachable at all.

#### No rate limiting on authentication endpoints (`/api/chemistry` auth-check and POST)
- **Area:** Security
- **Severity:** Medium
- **Effort:** S (<1h)
- **Evidence:** `dashboard/server/routes.ts:184,188` — `GET /api/chemistry/auth-check` and `POST /api/chemistry` both invoke `requireAuth` middleware. `grep` for `express-rate-limit` returns "none". There is no per-IP request throttle on these endpoints, enabling unlimited password brute-force attempts.
- **Recommendation:** Add `express-rate-limit` as middleware scoped to `/api/chemistry` routes: e.g. 10 attempts per 15-minute window per IP. Example: `import rateLimit from 'express-rate-limit'; const chemLimit = rateLimit({ windowMs: 15*60*1000, max: 10 }); router.use('/api/chemistry', chemLimit)`.

#### Vite HIGH: `server.fs.deny` bypass and arbitrary file read via WebSocket (dashboard)
- **Area:** Security
- **Severity:** High
- **Effort:** S (<1h)
- **Evidence:** `pnpm audit` (dashboard): two HIGH advisories (GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583) for `vite >=8.0.0 <=8.0.4`; current version `8.0.3`. Fixed in `>=8.0.5`. Current latest is `8.0.14`.
- **Recommendation:** Bump `vite` to `>=8.0.5` (latest `8.0.14`) in `dashboard/package.json`. This is a non-breaking patch bump. The `vite` dev server is not exposed in production, but the vulnerability affects the dev build tool itself. Run `pnpm update vite` in `dashboard/`.

#### Vite MODERATE: path traversal in optimized deps `.map` handling (dashboard + weather)
- **Area:** Security
- **Severity:** Medium
- **Effort:** S (<1h)
- **Evidence:** Dashboard audit: `vite >=8.0.0 <=8.0.4` (GHSA-4w7w-66w2-5vf9); weather audit: same advisory for `vite <=6.4.1` via `vitest` dep. Fixed in `>=8.0.5` (dashboard) and `>=6.4.2` (weather's vitest-bundled vite).
- **Recommendation:** Bump `vite` in `dashboard/` as above; bump `vitest` in `weather/` to pull in the fixed vite sub-dep.

#### PostCSS MODERATE: XSS via unescaped `</style>` in CSS stringify output (dashboard + weather)
- **Area:** Security
- **Severity:** Medium
- **Effort:** S (<1h)
- **Evidence:** Dashboard and weather audits: `postcss <8.5.10` (GHSA-qx2v-qp2m-jg93). Transitive via `vite>postcss`. Fixed in `>=8.5.10`.
- **Recommendation:** Resolved by bumping `vite` in both `dashboard/` and `weather/` as the vite bump will pull in the patched postcss version.

#### qs MODERATE: remotely triggerable DoS in `qs.stringify` (dashboard via express)
- **Area:** Security
- **Severity:** Medium
- **Effort:** S (<1h)
- **Evidence:** Dashboard audit: `qs >=6.11.1 <=6.15.1` (GHSA-q8mj-m7cp-5q26) via `express>qs`. Fixed in `>=6.15.2`.
- **Recommendation:** Bump `express` in `dashboard/package.json` to a version that depends on `qs >=6.15.2`, or add a `pnpm.overrides` entry for `qs` set to `>=6.15.2`.

#### brace-expansion MODERATE: large numeric range defeats DoS protection (dashboard, dev-only)
- **Area:** Security
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** Dashboard audit: `brace-expansion >=5.0.0 <5.0.6` (GHSA-jxxr-4gwj-5jf2) via `typescript-eslint>minimatch`. Fixed in `>=5.0.6`. Dev dependency only; not in production bundle.
- **Recommendation:** Bump `typescript-eslint` or add `pnpm.overrides.brace-expansion: ">=5.0.6"` in `dashboard/package.json`.

#### esbuild MODERATE: dev server allows cross-origin requests (weather, dev-only)
- **Area:** Security
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** Weather audit: `esbuild <=0.24.2` (GHSA-67mh-4wv8-2f99) via `vitest>vite>esbuild`. Fixed in `>=0.24.3`. Dev/test dependency only.
- **Recommendation:** Bump `vitest` in `weather/package.json` to a version that pulls in `esbuild >=0.24.3`.

#### Chemistry credential stored as base64 `user:pass` in `localStorage` (acceptable for threat model)
- **Area:** Security
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** `dashboard/src/hooks/useChemAuth.ts:16-17` — `const encoded = btoa(\`${user}:${pass}\`); localStorage.setItem('pool-dashboard-chem-auth', encoded)`. Line 28 replays it as `Basic ${credential}`. `btoa` is reversible encoding, not encryption; `localStorage` is plain-text and readable by any same-origin JS, so an XSS or a malicious browser extension can read the chemistry-write credential, and it persists with no expiry until `lock()` is called.
- **Recommendation:** Acceptable for the current threat model (public read-only dashboard, one shared write credential, no per-user accounts, low-sensitivity data). If hardened later: prefer `sessionStorage` (clears on tab close) or an opaque short-lived server-issued token over storing the raw Basic credential; consider an expiry. Document the trade-off so it is a conscious choice. No urgent action required.

### Dependencies

#### Floating and loosely-pinned Docker image tags across docker-compose.yml
- **Area:** Dependencies
- **Severity:** High
- **Effort:** M (hours)
- **Evidence:** Container inventory: `hertzg/rtl_433:latest` (line 15), `telegraf:latest` (line 57), `grafana/grafana:latest` (line 77), `cloudflare/cloudflared:latest` (line 139) — four images on `:latest` with no version pin at all. Additionally `eclipse-mosquitto:2` (line 3) and `influxdb:2` (line 33) are pinned only to a major version, leaving the patch and minor unpinned. A `docker compose pull` on any of these can silently introduce a breaking change or regression at next deploy.
- **Recommendation:** Pin every image to a specific version tag (e.g. `telegraf:1.33.2`, `grafana/grafana:11.6.1`, `cloudflare/cloudflared:2025.4.2`, `hertzg/rtl_433:24.12`). For extra reproducibility, append the image digest (`image: telegraf:1.33.2@sha256:...`). Pay special attention to `influxdb:2` — it is the datastore; an unexpected bump to a 2.x minor that changes Flux behavior or the write API would silently corrupt the data pipeline. Recommend pinning to `influxdb:2.8.0` (the version in use per CLAUDE.md). For `grafana/grafana` and `cloudflare/cloudflared`, check release notes before pinning to confirm no breaking config changes.

#### Batch patch/minor upgrades available for `dashboard/` (low risk)
- **Area:** Dependencies
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** `pnpm outdated` (dashboard). Packages behind by patch or minor version: `@types/react` 19.2.14→19.2.15, `@vitejs/plugin-react` 6.0.1→6.0.2, `@vitest/coverage-v8` 4.1.2→4.1.7, `react` 19.2.4→19.2.6, `react-dom` 19.2.4→19.2.6, `vitest` 4.1.2→4.1.7, `eslint-plugin-react-hooks` 7.0.1→7.1.1, `globals` 17.4.0→17.6.0, `jsdom` 29.0.1→29.1.1, `tsx` 4.21.0→4.22.4, `typescript-eslint` 8.58.0→8.60.0. **Note:** bumping `vitest` 4.1.2→4.1.7 and `vite` 8.0.3→8.0.14 also clears all three vite CVEs (GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583, GHSA-4w7w-66w2-5vf9) and the postcss CVE (GHSA-qx2v-qp2m-jg93). Bumping `typescript-eslint` 8.58.0→8.60.0 clears the brace-expansion CVE (GHSA-jxxr-4gwj-5jf2). See `dashboard/package.json:25-47`.
- **Recommendation:** Run `pnpm update` in `dashboard/` to apply all patch/minor bumps in one pass. Prioritize `vite` (clears two HIGH + two MODERATE CVEs) and `typescript-eslint` (clears brace-expansion MODERATE). Verify tests pass after (`pnpm test:coverage`).

#### `recharts` 2→3 (major API changes)
- **Area:** Dependencies
- **Severity:** Medium
- **Effort:** L (day+)
- **Evidence:** `pnpm outdated` (dashboard): `recharts` current `2.15.4`, latest `3.8.1`. `recharts` 3.x is a full major with breaking chart API changes (prop renames, new composition model for `<ComposedChart>`, changed tooltip/axis interfaces). `dashboard/package.json:25`: `"recharts": "^2.15.4"` (caret would not auto-pull 3.x). Used in `TempChart.tsx` (coverage 60%, complex logic including EMA smoothing noted in CLAUDE.md).
- **Recommendation:** Treat as a dedicated migration task. Review the recharts v3 migration guide, audit every recharts import in `dashboard/src/`, update props and API usage, run `pnpm test:coverage` and visual smoke-test. Do not batch with other upgrades.

#### `@napi-rs/canvas` 0.1→1.0 (first stable major)
- **Area:** Dependencies
- **Severity:** Medium
- **Effort:** M (hours)
- **Evidence:** `pnpm outdated` (dashboard): `@napi-rs/canvas` current `0.1.97`, latest `1.0.0`. This is the OG image generator (`dashboard/server/og-image.ts`). A 0.x→1.0 bump constitutes a stability stabilization release; the public API may change (method signatures, font loading, image encoding options). `dashboard/package.json:21`: `"@napi-rs/canvas": "^0.1.97"` (caret pins to 0.x only, so this requires a manual version bump).
- **Recommendation:** Review the `@napi-rs/canvas` 1.0.0 changelog/release notes for breaking changes before upgrading. The blast radius is limited to `server/og-image.ts` and bundled fonts in `server/fonts/`. After bumping, rebuild the dashboard container and verify the `/og-image.png` endpoint renders correctly.

#### `@eslint/js` 9→10 and `eslint` 9→10 (ESLint major)
- **Area:** Dependencies
- **Severity:** Low
- **Effort:** M (hours)
- **Evidence:** `pnpm outdated` (dashboard): `@eslint/js` 9.39.4→10.0.1, `eslint` 9.39.4→10.4.1. ESLint 10 continues the flat-config-only migration (no eslintrc) and may drop or rename rule APIs. `dashboard/package.json:28,42`: both currently on `^9.39.4`. The project already uses flat config (`eslint.config.js` or equivalent), so migration risk is lower but not zero.
- **Recommendation:** Review ESLint 10 migration guide. Update `@eslint/js` and `eslint` together (they are tightly versioned). Run `pnpm lint` and resolve any new rule errors. Low priority — dev tooling only, no production impact.

#### `@types/node` 24→25 and `typescript` 5→6 (type-level majors)
- **Area:** Dependencies
- **Severity:** Low
- **Effort:** M (hours)
- **Evidence:** `pnpm outdated` (dashboard): `@types/node` 24.12.2→25.9.1 (major), `typescript` 5.9.3→6.0.3 (major). `dashboard/package.json:33,46`: `"@types/node": "^24.12.0"`, `"typescript": "~5.9.3"`. TypeScript 6 is a significant major (strictness changes, removed deprecated APIs); TS 5.9 is a tilde-pinned minor, so the major must be bumped explicitly. `@types/node` 25 follows Node.js 25 API surface.
- **Recommendation:** Bump `typescript` first in isolation; run `pnpm typecheck` and fix any new type errors before bumping other packages. Then bump `@types/node` to 24.x or 25.x as appropriate for the target Node runtime (currently Node 22 — `@types/node@22.x` would be the most accurate match, or stay at 24.x to stay ahead). Treat as a dedicated task.

#### Weather `vitest` 2.x → 4.x (two-major gap) and other outdated weather deps — also clears dev CVEs
- **Area:** Dependencies
- **Severity:** Medium
- **Effort:** M (hours)
- **Evidence:** `pnpm outdated` (weather): `vitest` pinned at `^2.1.0` (lock shows `2.1.9`), latest `4.1.7` — a two-major-version gap. Also outdated: `tsx` 4.21.0→4.22.3 (patch), `@types/node` 22.19.17→25.9.1 (major), `typescript` 5.9.3→6.0.3 (major). `weather/package.json:22`: `"vitest": "^2.1.0"`. **Critically**, the three weather audit CVEs (esbuild GHSA-67mh-4wv8-2f99, vite GHSA-4w7w-66w2-5vf9, postcss GHSA-qx2v-qp2m-jg93) are all transitive through `vitest`. Bumping `vitest` to `^4.1.7` resolves all three in one change. Vitest 3.x and 4.x each have breaking changes (new config format for mocking, changed snapshot serialization, updated `vi` API).
- **Recommendation:** Bump `vitest` to `^4.1.7` in `weather/package.json`. Review vitest 3.x and 4.x migration guides, run `pnpm test` in `weather/`, and fix any broken test configuration. This single bump closes all three open CVEs in the weather package. Follow with `tsx` patch bump (safe). Treat `@types/node` and `typescript` majors as a separate step (same guidance as dashboard).

#### Node runtime version unpinned — no `engines` field, no `.nvmrc`, no patch pin in Dockerfiles
- **Area:** Dependencies
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** Neither `dashboard/package.json` nor `weather/package.json` declares an `"engines"` field. No `.nvmrc` exists at the repo root. Both Dockerfiles use `node:22-slim` with no patch version: `dashboard/Dockerfile:1,15` and `weather/Dockerfile:1,13`. Node 22 is the current Active LTS (good choice), but `node:22-slim` resolves to whatever patch Docker Hub has cached at pull time. A `22.x` minor update could surface subtle changes in the built-in `fetch`, `crypto`, or stream APIs used by the Express server or weather worker.
- **Recommendation:** (a) Add `"engines": { "node": ">=22 <23" }` to both `dashboard/package.json` and `weather/package.json` — this signals intent and causes `pnpm install` to warn if the wrong Node is active. (b) Add `.nvmrc` at the repo root with content `22` (or a specific patch like `22.15.0`) for local development consistency (CLAUDE.md already notes nvm is required). (c) Pin the Dockerfile base image to a specific patch, e.g. `FROM node:22.15.0-slim`, so container rebuilds are reproducible. Coordinate the patch pin across both Dockerfiles.

### Code quality

#### Ref written during render in BottomSheet — blocks CI lint gate
- **Area:** Code quality
- **Severity:** Medium
- **Effort:** S (<1h)
- **Evidence:** `dashboard/src/components/BottomSheet/BottomSheet.tsx:21` — `onCloseRef.current = onClose` is assigned directly in the render body (confirmed by reading the file). The `react-hooks/refs` rule from `eslint-plugin-react-hooks` v7 flags this as an error: "Cannot update ref during render". This causes `pnpm lint` to exit with code 1 (lint output: "✖ 1 problem (1 error, 0 warnings)"). Any CI lint gate will fail on this.
- **Recommendation:** Wrap the assignment in a `useEffect` with no deps array (runs synchronously after every render, same semantics, rule-compliant): `useEffect(() => { onCloseRef.current = onClose; });`. Alternatively, since `onClose` is already in the `useCallback` dep array at line 25, remove `onCloseRef` entirely and call `onClose()` directly in `onTouchEnd` (it is safe because `onTouchEnd` is registered inside a `useEffect` that re-runs when `open` changes, and `handleKeyDown` already calls `onClose` directly).

#### `TempChart.tsx` — statement and function coverage materially below 80% target
- **Area:** Code quality
- **Severity:** Medium
- **Effort:** M (hours)
- **Evidence:** Coverage report: `TempChart.tsx` — 60% statements, 52.38% branches, 44.44% functions, 58% lines. Uncovered lines include 83–89 (the `airHistory` merge path that writes `undefined as unknown as number` placeholders) and 121–178 (the full recharts JSX rendering tree, including both loading and loaded states, custom range sheet, air-overlay toggle). The function gap (44%) means key units like `formatXTick` and the chart's conditional rendering branches are untested.
- **Recommendation:** Add tests for: (1) `formatXTick` directly (exported or via a named export — if not exported, extract to a testable utility); (2) rendering with `airHistory` data present and `airVisible` toggled; (3) the loading state (`loading=true`); (4) the custom range bottom-sheet open/apply flow. These should close the gap to ≥80% statements/functions.

#### `ChemistryTab.tsx` — branch and function coverage below 80% target
- **Area:** Code quality
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** Coverage report: `ChemistryTab.tsx` — 63.88% statements, 93.75% branches, 47.05% functions, 71.42% lines. Uncovered lines 61–69 and 85–91 correspond to the custom-range picker flow and the `ChemFocusSheet` open path (when `selected` is non-null). Function coverage 47.05% is well below target.
- **Recommendation:** Add tests for: (1) clicking a `ChemCard` to open `ChemFocusSheet` (`selected` state transition); (2) opening/applying the custom `DateRangePicker` bottom sheet (lines 68–70); (3) the `LogTestFlow` `onSaved` callback to verify toast and refetch fire. These three scenarios cover the missing branches and function slots.

#### `types.ts` at 0% coverage — likely not meaningful
- **Area:** Code quality
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** Coverage report: `types.ts` — 0% statements, 0% branches, 0% functions, 0% lines. Reading `dashboard/src/types.ts`: the file contains only TypeScript `interface`, `type alias`, and `export type` declarations. These compile away entirely; there is no executable JS. V8 coverage cannot cover them because there is nothing to execute.
- **Recommendation:** Add `types.ts` to the Vitest coverage `exclude` list (e.g. in `vitest.config.ts`: `coverage: { exclude: ['src/types.ts'] }`). This removes the misleading 0% row from the report and prevents it from artificially dragging down the overall percentage. No tests are needed for this file.

#### `TempChart.tsx:89` — `undefined as unknown as number` type-safety escape in production code
- **Area:** Code quality
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** `dashboard/src/components/TempChart/TempChart.tsx:89` — `poolMap.set(pt.time, { time: pt.time, value: undefined as unknown as number, airValue: airVal })`. This double cast bypasses TypeScript's type checker to satisfy the `{ value: number }` shape for time-series points that have air data but no pool data. The intent is correct (recharts renders `undefined` as a gap), but the cast hides a real type mismatch.
- **Recommendation:** Widen the local type to `{ time: string; value: number | undefined; airValue?: number }` for the `poolMap` entries, or introduce a separate `ChartPoint` type that makes `value` optional. The `TimeSeriesPoint` import type is `{ time: string; value: number }` (no optional) so the cast is load-bearing until the local type is corrected. Test-file casts (`as unknown`, `as never`) are acceptable and not flagged here.

#### No HTTP-layer (supertest) integration tests mounting the Express router
- **Area:** Code quality
- **Severity:** Low
- **Effort:** M (hours)
- **Evidence:** `dashboard/server/routes.test.ts` contains a single `describe('isValidRange', ...)` block testing the exported helper — it does not mount the Express router or issue any HTTP requests. The router wiring itself is therefore never exercised end-to-end: handler↔middleware ordering, sensor-ID 400 responses, route precedence, and 500 error propagation are all untested at the HTTP layer. **However**, the underlying logic is already unit-tested: `auth.test.ts` unit-tests `parseBasicAuth`, `credentialsMatch`, and `requireAuth` including the 401 path; `chemistry.test.ts` (specifically `validateChemistryBody`) covers body validation; `influx.test.ts` covers query building; and `utils.test.ts` covers supporting utilities. The gap is genuinely narrow — only the router wiring itself is unexercised.
- **Recommendation:** OPTIONAL: add a `supertest` integration test for the chemistry routes as defense-in-depth, covering: (1) `POST /api/chemistry` with invalid body → 400; (2) `POST /api/chemistry` with valid auth + valid body → 201 (mock `writeChemistry`); (3) `GET /api/chemistry/auth-check` or `POST /api/chemistry` with an invalid `range` → 400. This is not urgent — auth (including the 401 path), body validation, and query logic are all covered by existing unit tests. Do **not** re-add a `requireAuth` 401 test here; that is already covered in `auth.test.ts`.

#### `ThemeContext.tsx:75` — `eslint-disable-next-line react-refresh/only-export-components` (acceptable — clean)
- **Area:** Code quality
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** `dashboard/src/context/ThemeContext.tsx:75` — `// eslint-disable-next-line react-refresh/only-export-components` suppresses the HMR warning that arises because `useTheme` is exported from the same module as the `ThemeProvider` component. This is the standard pattern recommended by the react-refresh docs for context modules; the suppression is intentional and correct.
- **Recommendation:** No action required. Optionally add a brief inline comment explaining why (e.g. `// context + hook co-located intentionally — standard react-refresh exception`), but this is cosmetic only.

#### No TODO/FIXME/XXX markers — clean
- **Area:** Code quality
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** `grep -rn "TODO\|FIXME\|XXX" dashboard/src dashboard/server weather/src` — no output from source files (only binary font TTF data matched the grep for unrelated reasons). Zero outstanding work markers in production source.
- **Recommendation:** Clean. No action required.

#### Server error-handling pattern — consistent (clean)
- **Area:** Code quality
- **Severity:** Low
- **Effort:** S (<1h)
- **Evidence:** All 12 route handlers in `dashboard/server/routes.ts` follow the same pattern: `try { ... } catch (err) { const message = err instanceof Error ? err.message : 'Unknown error'; res.status(500).json({ error: message }) }`. Client hooks (`usePoolData.ts`, `useChemistryData.ts`) follow a consistent graceful-degradation pattern: weather sub-fetches silently fall back to `null`/`[]` on failure; the main fetch swallows transient errors after the first successful load.
- **Recommendation:** Consistent — no finding. No action required.

---

## 4. Deferred (out of scope)

These infrastructure/build/performance items were **not** audited in depth (per the design spec's "Out of scope" section), but are captured here so they are not lost. Each is a candidate for its own follow-up spec:

- **JS bundle size / code-splitting** — the client bundle is ~640 KB un-split; consider route/feature-based code-splitting and lazy loading.
- **CI/CD pipeline** — there is currently no CI. A pipeline running `lint`, `typecheck`, `test:coverage`, and `build` on PRs would catch regressions (e.g. the existing BottomSheet lint error) before merge.
- **InfluxDB backup / retention strategy** — no documented backup or data-retention policy for the time-series store.
- **Docker Compose structural refactors / healthcheck coverage** — broader compose restructuring and adding `healthcheck` blocks to services for orchestration robustness.

---

## 5. Method & limitations

**Method.** A single read-only pass over the repository, area by area (Security & hardening, Dependency & version upgrades, Code quality & best practices). Every finding is backed by concrete evidence — a `file:line` reference, a command's output, or an image tag. No speculative findings.

**Tools / inputs used:**
- `pnpm outdated` and `pnpm audit` in both `dashboard/` and `weather/` (run via `source ~/.nvm/nvm.sh && ...`). Note: weather `node_modules` were not installed in this environment, so its package versions and audit results derive from `pnpm-lock.yaml` — still valid for advisory matching.
- `pnpm lint` (ESLint) and `pnpm test:coverage` (Vitest, 309 tests passing, ~86% overall coverage) in `dashboard/`.
- Docker image tag review across `docker-compose.yml` (rtl_433, mosquitto, influxdb, grafana, telegraf, dashboard, weather, cloudflared) and `FROM`/`USER` review of both Dockerfiles.
- Targeted `grep` for risk patterns (raw interpolation into Flux, `dangerouslySetInnerHTML`, secret logging, `process.env` usage, hardening keys, TODO/FIXME markers, rate-limit middleware).
- Node/runtime version review (`package.json` engines, Dockerfiles, `.nvmrc`).
- Confirmation/expansion of the design spec's seed findings (all seven seeds were evaluated; see below).

**Read-only:** No source, config, or dependency files were modified by this audit. The only file changes were the creation of this report and the deletion of the scratch working notes.

**Seed reconciliation (all seeds resolved):** Flux injection (CONFIRMED — 3 High + 1 Low); BottomSheet `react-hooks/refs` lint error (CONFIRMED — Medium); floating Docker tags (CONFIRMED and expanded to 6 images — High); container privilege / no hardening (CONFIRMED — Medium + Low); `INFLUXDB_TOKEN` breadth (CONFIRMED — Medium); localStorage credential model (CONFIRMED, newly recorded — Low, acceptable for threat model); coverage gaps (CONFIRMED — 4 code-quality findings). No seed was refuted.

**Limitations.** This is a focused single-pass survey, not a multi-agent adversarial audit or a formal penetration test / security certification. It favors high-value findings over exhaustive long-tail coverage. Long-tail issues may remain. Chemistry-body validation and a few server utilities were confirmed to exist and be invoked but were not exhaustively fuzzed. Findings should be treated as a prioritized starting backlog, not a guarantee of completeness.
