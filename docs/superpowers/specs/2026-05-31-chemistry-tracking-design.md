# Pool Chemistry Tracking — Design

**Date:** 2026-05-31
**Status:** Approved (pending implementation plan)

## Overview

A new **Chemistry** tab for the pool dashboard that lets the owner manually log
test-kit readings (a few times a week) for six chemicals and view how each one
trends over time, correlated against pool and/or air temperature.

This implements the design handoff in `pool_monitor_design.zip`
(`design_handoff_chemistry_tracking/`), recreated inside the existing
`dashboard/` codebase (React 19 + TypeScript + Vite + CSS Modules + Recharts),
reusing its established patterns (`StatCard`, `BottomSheet`, `TempChart`).

The six tracked chemicals:

| Key  | Name              | Unit | Decimals |
|------|-------------------|------|----------|
| `ph` | pH                | —    | 1        |
| `fc` | Free Chlorine     | ppm  | 1        |
| `cc` | Combined Chlorine | ppm  | 1        |
| `ta` | Total Alkalinity  | ppm  | 0        |
| `cya`| Cyanuric Acid     | ppm  | 0        |
| `ch` | Calcium Hardness  | ppm  | 0        |

### Explicitly out of scope (confirmed with product owner)

- **No ideal-range / "in spec" / status coloring.** Numbers and trends only — no
  green/red good/bad judgement. Delta tags show *direction of change only*.
- **No dosing recommendations.**

## Decisions

Three implementation decisions were resolved during brainstorming (the visual/UX
design is otherwise fully locked by the high-fidelity handoff):

1. **Write auth:** Express Basic Auth middleware with a single shared credential
   from `.env` — fits the `cloudflared → Express` deployment with no new infra.
   (The handoff assumed a reverse proxy; there is none in the live deployment.)
2. **Tracked window:** a **selectable range** like the Temperature view (an
   extension beyond the handoff's fixed window).
3. **Tab navigation:** local React state, no router dependency.

### Deviations from the handoff

- Auth lives in the Express server, not a reverse proxy.
- A range picker is added. Because readings are sparse (a few per week), the
  Temperature view's `6H/12H/24H` ranges would be near-empty, so the Chemistry
  range set is **30D · 90D · Season · All · Custom**, default **Season**.
- Date-only readings are timestamped at **local noon** (configured `TIMEZONE`).

---

## A. Data & Storage

**New InfluxDB measurement: `chemistry`** (same bucket). Within the existing
stack; a separate store would fragment the data layer for no benefit.

- **Fields:** `ph`, `fc`, `cc`, `ta`, `cya`, `ch` (floats). Partial readings
  write only the fields present in the submission.
- **Tags:** none (single pool). The measurement name alone keeps chemistry data
  out of `mqtt_consumer` (pool/sensor) and `weather` queries, and vice versa.
- **Timestamp:** readings are logged by *date* only. Each is stored at **local
  noon** in the configured `TIMEZONE`, converted to UTC — it sorts correctly and
  lands on the correct calendar day in every view/timezone.

A reading object on the wire:

```ts
interface ChemistryReading {
  date: string;   // ISO date, e.g. "2026-05-29"
  ph?: number; fc?: number; cc?: number; ta?: number; cya?: number; ch?: number;
}
```

## B. Backend (`dashboard/server/`)

### `influx.ts`

- `getWriteApi()` — returns a write API from the existing client
  (`client.getWriteApi(org, bucket, 'ms')`).
- `writeChemistry(reading)` — builds a `Point('chemistry')` with the date-derived
  timestamp and only the provided float fields; writes and flushes.
- `queryChemistry(range)` — filters `_measurement == "chemistry"`, reuses the
  existing `parseRange(range)`, `pivot`s `_field`→columns to produce one row per
  timestamp, returns `ChemistryReading[]` (newest-last, like history endpoints).

### `routes.ts`

- `GET /api/chemistry?range=` → `queryChemistry`. `range` defaults to the season;
  reuses existing range parsing.
- `POST /api/chemistry` → behind `requireAuth` middleware →
  validates body → `writeChemistry` → `201`.

**Validation (POST):**
- `date` parseable.
- At least one chemical field present (mirrors the form's "save disabled until ≥1
  value").
- Each present value is a finite number within a sane per-chemical bound
  (reject NaN/Infinity/absurd values).

### Auth middleware (`requireAuth`)

- Reads `CHEM_AUTH_USER` / `CHEM_AUTH_PASSWORD` from env.
- Parses the `Authorization: Basic base64(user:pass)` header; compares both
  fields with a timing-safe equality (`crypto.timingSafeEqual`).
- **On failure → `401` with NO `WWW-Authenticate` header.** Sending that header
  would trigger the browser's native Basic-Auth dialog, which the design
  explicitly rejects in favor of the custom unlock sheet.
- Applied to `POST /api/chemistry` only; all GET endpoints stay public.

## C. Frontend (`dashboard/src/`)

### Components

| Component | Role |
|-----------|------|
| `TabBar` | Temperature \| Chemistry tabs, driven by `activeTab` state in `App`. Styling per handoff (active = `--color-primary` text + bottom border). |
| `ChemistryTab` | Grid home: tab head + subtitle (`Last test {date} · tap a card to correlate with temp`), **Log test** button, `OVERLAY TEMP` segmented control (Pool · Air · Off), the **range control**, and the 2×3 `ChemCard` grid. |
| `ChemCard` | Built on the `StatCard` pattern: accent `border-top: 3px`, uppercase name, `DeltaTag`, large accent value + unit suffix, mini `ChemChart`. Whole card is a tappable button (hover/active transforms per handoff). |
| `ChemChart` | One Recharts `ComposedChart` with a `variant` prop: `mini` (150×66, no axes/grid, sparse dots) and `full` (330×180, X start/end date ticks, Y min/mid/max). |
| `DeltaTag` | `↑`/`↓` + absolute magnitude vs previous reading, formatted to the chemical's decimals; dimmed `±0` when change < half a display unit. Direction only. |
| `ChemFocusSheet` | `BottomSheet` with value+delta header, independent **Pool temp** / **Air temp** toggle pills, full `ChemChart`, overlay legend (e.g. "84°F pool now"), Low/Avg/High stat boxes (min/avg/max over the range), recent-readings list (~6, newest first). |
| `LogTestFlow` | Orchestrates `UnlockSheet`, `LogForm`, `Toast`, all in `BottomSheet`s. |
| `UnlockSheet` | Lock badge + username/password fields + Cancel/Unlock. On submit, probes `POST /api/chemistry` auth; 401 → inline red error; 2xx → cache credential, advance to form. |
| `LogForm` | Date field (defaults to today), 2-col grid of six `inputMode="decimal"` inputs with "last {value}" hints + unit suffix. Save disabled until ≥1 value. On save → POST with cached auth → close → toast. |
| `Toast` | Dark pill, bottom-center, green check + "Reading saved", auto-dismiss ~2.2s. |

### Charts (Recharts, matching `TempChart`)

- **Chemical series:** `monotone` line in the chemical's accent color, with a dot
  at each reading (sparse/manual data); last point emphasized (`r≈3.4`).
- **Chemical Y axis:** auto-scaled to that chemical's own min/max with ~15%
  padding. Each chemical has its own scale — never a shared Y axis. `full`
  variant shows 3 gridlines/labels (min/mid/max) at the chemical's decimals.
- **Temperature overlays** on a **separate hidden Y axis** (`yAxisId`) — this is
  correlation, not shared units; the temp axis is unlabeled, drawn *behind* the
  chemical line:
  - **Pool:** faint filled Area (`--ghost-fill`) under a gray dashed line
    (`--ghost-stroke`, `dasharray 2 3`).
  - **Air:** orange dashed line only, no fill (`--air-stroke`, `dasharray 5 3`) —
    mirrors `TempChart`'s air rendering.
- **X axis:** time, domain = the selected range. `full` shows start/end date
  ticks; `mini` has no axis.
- Grid overlay control is single-select (Pool/Air/Off); the focus sheet's larger
  chart uses two independent toggles (Pool and/or Air).

### Hooks & config

- `useChemistryData(range)` — fetches chemistry + pool history + air history for
  the selected range (mirrors `usePoolData`'s fetch/refresh/visibility pattern).
- `useChemAuth` — manages the localStorage-persisted base64 `user:pass`
  credential; seeds `unlocked` from its presence; exposes the cached
  `Authorization` header for POSTs.
- `CHEMS` config constant (TS): `{ key, name, unit, decimals, accentColor }` for
  the six chemicals. Accent colors = the handoff's oklch values, used for both
  chart strokes and card `border-top`/dots.

### State

- `App`: `activeTab: 'temperature' | 'chemistry'`.
- `ChemistryTab`: `range`, `overlay: 'pool' | 'air' | 'off'` (default `'pool'`),
  `selectedChem: key | null`.
- `ChemFocusSheet`: `poolOn` (default true), `airOn` (default false).
- Log flow: `flow: null | 'unlock' | 'form'`, `unlocked` (seeded from persisted
  credential), `toast`. `logTest()` → `flow = unlocked ? 'form' : 'unlock'`.

## D. Tokens, Config & Testing

### Design tokens (`src/styles/tokens.css`, light + dark)

Add (new):

```css
--air-stroke: rgba(234, 88, 12, 0.7);
--ghost-fill: rgba(71, 91, 114, 0.07);
--ghost-stroke: rgba(71, 91, 114, 0.45);
```

`--color-air-temp` **already exists** (TempChart uses it) — reuse, do not
duplicate. Chemical accent oklch colors live in the `CHEMS` TS constant (needed
as JS values for Recharts strokes) and are applied to cards via inline style.

### Config

- Add `CHEM_AUTH_USER` / `CHEM_AUTH_PASSWORD` to the dashboard `environment`
  block in `docker-compose.yml` and to `.env.example`.
- The dashboard's `INFLUXDB_TOKEN` now needs **write** scope (previously
  query-only). Document this in `CLAUDE.md` and `.env.example`.
- Update `CLAUDE.md`: new endpoints (`GET`/`POST /api/chemistry`), env vars,
  `chemistry` measurement, new tokens, the Chemistry tab section.

### Testing (Vitest + React Testing Library, ≥80% coverage)

- **Server:** `queryChemistry` query/pivot building; `writeChemistry` point/
  timestamp building (local-noon conversion); `requireAuth` accepts valid creds,
  rejects bad creds with 401 and **no `WWW-Authenticate` header**; POST
  validation (rejects empty/invalid, accepts partial).
- **Components:** `DeltaTag` (up/down/`±0` thresholds, decimals); `ChemCard`
  render + tap; `ChemFocusSheet` (overlay toggles, stats, readings list);
  `LogForm` (save disabled until ≥1 value, success path, 401 inline error in
  unlock); `TabBar` switching.

## Components — boundaries summary

Each unit has one purpose and a clear interface:

- `influx.ts` write/query functions: pure data access, no HTTP.
- `requireAuth`: pure middleware, env-configured, no knowledge of chemistry.
- `ChemChart`: pure presentational, `variant` + data props; no fetching.
- `ChemCard` / `DeltaTag`: presentational, derive display from a reading + prev.
- `useChemistryData` / `useChemAuth`: own all fetching/persistence; components
  stay presentational.
- `LogTestFlow`: owns the unlock→form→toast state machine; sheets are dumb views.
