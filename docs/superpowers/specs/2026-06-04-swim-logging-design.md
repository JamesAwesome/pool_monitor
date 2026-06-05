# Swim Logging (anonymous emoji swim log) — Design

**Date:** 2026-06-04
**Status:** Approved (design); pending implementation plan
**Source:** `swim_logging.zip` design handoff (`design_handoff_swim_logging/`)

## Overview

Add the ability to **log when someone goes in the pool** and surface those swims on the
existing Temperature and Chemistry charts. For privacy on the otherwise-public dashboard,
each swimmer is an **emoji avatar, never a name** — the graph shows that the pool was used
and roughly by how many people, never by whom.

Three capabilities:

1. **Swim markers riding the curve** — an emoji marker sits on the pool-temperature curve
   (Temperature tab) and on each chemical's curve (Chemistry focus sheet) at the swim's time.
   Informational only (not tappable).
2. **A "Log swim" flow** on the Temperature tab, behind the same unlock gate as chemistry.
   The picker leads with recently-used swimmers plus a ＋ tile opening an emoji keyboard, so a
   swimmer can be any emoji and a session can have any number of people.
3. **A Swim History sheet** with two tabs — **All swims** (view/edit/delete) and a
   **Leaderboard** of total dips per swimmer.

The handoff (`design_handoff_swim_logging/`) is a **high-fidelity HTML/React-via-Babel
prototype**, not production code. This design recreates it inside the real `dashboard/`
codebase (React + TypeScript + CSS Modules), reusing established components, tokens, and
patterns — chiefly the **chemistry feature** (storage, auth, edit/delete) and the
**`WeatherLane`** recharts overlay.

## Decisions (confirmed)

- **Storage:** new InfluxDB `swim` measurement (mirror chemistry).
- **Auth:** share the chemistry unlock — one credential unlocks both.
- **Scope:** full feature in one pass (temp markers + chem-focus markers + log/edit/delete +
  emoji keyboard + History with All-swims and Leaderboard).

## Correction to the handoff's assumption

The handoff assumes the charts are hand-built SVG and that the marker overlay is an
absolutely-positioned HTML layer using `left%`/`top%`. The real charts use **recharts**, and
there is already a precedent for an overlay riding the chart: **`WeatherLane`**
(`src/components/WeatherLane/WeatherLane.tsx`) renders as a recharts child and reads
`usePlotArea` / `useXAxisScale`. Swim markers follow that pattern instead (`SwimLane`).

## Data model & storage

InfluxDB `swim` measurement, mirroring the chemistry pattern
(`server/chemistry.ts`, `server/influx.ts`):

```ts
interface SwimSession {
  id: string;        // ISO-UTC instant of the point (stable id)
  date: string;      // 'YYYY-MM-DD' in TIMEZONE
  time: string;      // 'HH:mm' 24h in TIMEZONE
  people: string[];  // emoji, 1..N  (e.g. ['🦦','🐢'])
}
```

- Point **timestamp = swim date+time in `TIMEZONE`**, derived with the existing
  `dateTimeToUtc` / `utcToZonedParts` helpers. That UTC instant is also the reading's
  **id** — identical to chemistry. Two swims on the same day at different times are distinct
  points.
- `people` is stored as a **single string field** `people`, comma-joined (`"🦦,🐢"`).
  Commas never appear in emoji (including ZWJ sequences like `🏊‍♀️`), so split/join
  round-trips safely. Validation **rejects any person string containing a comma**.
- **Edit = delete-old-then-write-new** (same approach and rationale as chemistry: supports
  changing the timestamp and is non-transactional, acceptable for this single-user app).
- `SwimSession` is added to `dashboard/src/types.ts`.

### Why a string field, not tags

Storing each emoji as a **tag** would allow Flux-side leaderboard aggregation but explodes
tag cardinality (every emoji combination becomes a series) and complicates edits. The
leaderboard is computed **client-side** from the fetched sessions instead (sessions are few —
a handful per season), so a plain string field is correct.

## Backend (`dashboard/server/`)

### `swim.ts` (new)

- `validateSwimBody(body)` → `{ ok: true; date; time; people } | { ok: false; error }`:
  - `date`: valid date string (`new Date` parses).
  - `time`: valid `HH:mm` (reuse `isValidTime`).
  - `people`: array of **1–30** entries; each a non-empty trimmed string, **≤16 chars**, no
    comma. Reject empty array, non-array, or any invalid entry.
- Reuses `isValidTime` and `isValidId` imported from `chemistry.ts` (both are generic).

### `influx.ts` (additions)

- `querySwims(range, timeZone = process.env.TIMEZONE ?? 'America/New_York')` →
  `SwimSession[]`: filter `_measurement == "swim"`, read the `people` string field, map
  `_time → id`, `utcToZonedParts → {date,time}`, `people.split(',')`, sorted by time.
- `writeSwim({ date, time, people }, timeZone)` → `string` (ISO id):
  `new Point('swim').timestamp(when).stringField('people', people.join(','))`, flush, return
  `when.toISOString()`.

### `influxDelete.ts` (generalize)

- Generalize to `deletePoint(id, measurement = 'chemistry')` — same `[id, id+1ms)` window
  technique, with the measurement parameterized in the predicate. Existing
  `deleteChemistryPoint` callers keep working (default arg); swim deletes pass `'swim'`.
  Re-export remains available for chemistry.

### `routes.ts` (additions)

Mirror the chemistry routes:

- `GET /api/swims?range=` — **public** read. Validates `range` with the existing
  `isValidRange` (accepts `30d`/`90d`/`season`/`all`/`custom:` and the temp ranges
  `6h`–`30d`); default `season`.
- `POST /api/swims` — create. `chemistryAuthLimiter` → `requireAuth` →
  `validateSwimBody` → `writeSwim` → `201 { id }`.
- `PUT /api/swims` — edit. Validates `id` (`isValidId`) and body, `deletePoint(id,'swim')`
  then `writeSwim` → `200 { id }`.
- `DELETE /api/swims?id=` — `deletePoint(id,'swim')` → `200 { ok: true }`.
- `router.use('/api/swims', express.json())` (matching the chemistry body-parser line).

**Auth & rate-limit are shared with chemistry:** the swim write routes reuse `requireAuth`
(the same `CHEM_AUTH_USER`/`CHEM_AUTH_PASSWORD` Basic gate) and the same
`chemistryAuthLimiter` instance (one shared brute-force budget across both features, keyed on
`CF-Connecting-IP`). No new env vars.

## Markers riding the curve — `SwimLane` (recharts child)

`SwimLane` renders inside the recharts chart (like `WeatherLane`), reading `usePlotArea`,
`useXAxisScale`, and `useYAxisScale`. It draws an emoji **pin** at each swim's time, sitting
exactly on the host curve.

### Positioning

x is computed two ways because the two host charts use different axis types:

- **TempChart — index mode.** Its x-axis is **categorical** (`dataKey="time"`, evenly spaced
  by index, *not* by elapsed time). For a swim at epoch `e`, find the two plotted points
  bracketing `e` by time, interpolate the **index** fraction `idxFrac`, and
  `x = plot.x + (idxFrac / (n-1)) · plot.width`. This keeps the marker on the curve even when
  sensor readings are unevenly spaced in time.
- **ChemFocusSheet — scale mode.** ChemChart's x-axis is **numeric** (`type="number"`, epoch
  ms), so x = `useXAxisScale()(e)` directly.

y in **both** modes: interpolate the host series' value at the swim's time (linear between the
two bracketing points), then map to pixels via `useYAxisScale()`. The series passed in is in
**chart units** (e.g. °F when the temp toggle is °F), so markers track the rendered curve.

Swims whose time is outside the plotted domain are **skipped** (fail-silent, like
`WeatherLane`).

### Structure

- The pixel math is a **pure, exported, unit-tested helper** `markerPositions(...)` returning
  `[{ id, x, yValue }]` (or `null` for off-domain); `SwimLane` applies `plot`/scales and
  renders.
- Each marker is a `foreignObject` "pin": a `--color-surface` bubble (1px border, pill
  radius, `--shadow-sm`) with overlapping `Avatars`, a 1.5px stem, and a 6px foot ring-dot in
  the curve color. `pointerEvents: none` (informational; all management is in History).
- **v1 renders every marker** (swims are sparse). Dense same-day overlap is an accepted
  limitation (no step-down/clustering in v1), called out so it isn't mistaken for complete
  collision handling.

## Client components (`dashboard/src/`)

Each models its chemistry analog.

- **`SwimLane/`** — the recharts overlay (markers + `SwimMarker` + `Avatars`) plus the pure
  `markerPositions` helper.
- **`SwimLogFlow/`** — mirrors `LogTestFlow`: unlock gate → form.
  - Reuses `useChemAuth` (shared `pool-dashboard-chem-auth` credential).
  - Reuses the **existing `UnlockSheet`**, parameterized with optional
    `title` / `subtitle` / `helpText` props so it reads "Unlock to log a swim" without
    duplicating the sheet. (Chemistry's existing copy is preserved via defaults.)
  - **`SwimLogForm`** — recent-swimmers grid (`recentEmoji`, seeded by a starter roster so
    it's never empty) + dashed ＋ tile; picked-avatars row; Date/Time inputs defaulting to
    now; Cancel / Log swim (disabled until ≥1 person). Edit mode pre-fills and shows an inline
    Delete-confirm. Performs the authed `POST`/`PUT`/`DELETE` fetches and calls `lock()` on a
    401 (like `LogForm`).
  - **`EmojiKeyboard`** — categorized scrollable picker behind the ＋ tile; multi-select; Done.
- **`SwimHistorySheet/`** — two tabs:
  - **All swims** — rows newest-first: date + time (with a `+n` badge when a day has multiple
    swims), overlapping avatars + count + chevron; tap → edit (unlock-gated). Footer
    ＋ Log a new swim.
  - **Leaderboard** — ranked dips per emoji (🥇🥈🥉 for top 3, else number), gradient
    progress bars (`--color-primary → --color-accent`), count; sorted desc.
- Reuses existing **`Toast`** and **`BottomSheet`** chrome.

## Data, helpers, wiring

- **`hooks/useSwimData.ts`** (new) — `GET /api/swims?range`, returns
  `{ swims, loading, error, refetch }`, 30s poll (like `useChemistryData`).
- **`utils/swim.ts`** (new, pure, tested) — `sortedSwims(swims)` (newest first),
  `totalDips(swims)`, `recentEmoji(swims, seed, limit)`, `leaderboard(swims)`.
- **`constants/swim.ts`** (new) — starter emoji roster + categorized emoji-keyboard set.
  (Per the handoff, a production build could defer to the OS emoji picker; we ship the curated
  set, which is sufficient and offline.)
- **`App.tsx` `TemperatureTab`** — call `useSwimData(range)` (the pool range); add a
  **History + Log swim** action pair to the chart card header; pass `swims` into `TempChart`
  (which renders `<SwimLane>`); add a `🦦 Swim` key to the legend; own flow state
  (`logOpen` / `histOpen` / `editEntry` / `toast`) and `refetch` on save/delete — the
  `ChemistryTab` shape.
- **`ChemistryTab`** — actions unchanged (chemistry-only). Add `useSwimData(range)` and pass
  `swims` into `ChemFocusSheet` so markers ride the chemical curve (scale mode).

## Testing (target ≥80%, matching existing suites)

- **Server:** `swim.test.ts` (validation edge cases — bad date/time, empty/oversized people,
  comma in entry, non-array); swim influx query/write (mocked, like chemistry tests);
  `routes` additions (public GET, auth gate, rate-limit, validation, range); generalized
  `deletePoint` (chemistry default + swim measurement).
- **Client:** `useSwimData`; `utils/swim` (sorted/totalDips/recentEmoji/leaderboard);
  `markerPositions` (index vs scale, interpolation, off-domain skip, bracketing); component
  smoke tests for `SwimLogForm`, `EmojiKeyboard`, `SwimHistorySheet`.

## Out of scope (v1)

- Marker collision/step-down or clustering for dense days (render-all accepted).
- Separate swim credential / env vars (shares chemistry auth by decision).
- Flux-side leaderboard aggregation / storing emoji as tags.
- Names, accounts, or enforced identity — "same emoji = same person" is a soft convention.
- The prototype's `design-canvas.jsx` pan/zoom wrapper (presentation only).

## File inventory

**New (server):** `swim.ts`, `swim.test.ts`.
**New (client):** `components/SwimLane/*`, `components/SwimLogFlow/*`,
`components/SwimHistorySheet/*`, `hooks/useSwimData.ts`, `utils/swim.ts`, `constants/swim.ts`
(+ matching `.test.ts` files).
**Modified:** `server/influx.ts` (querySwims/writeSwim), `server/influxDelete.ts`
(`deletePoint` generalization), `server/routes.ts` (swim routes), `src/types.ts`
(`SwimSession`), `src/components/TempChart/TempChart.tsx` (render `SwimLane`, swim legend
key), `src/components/ChemFocusSheet/*` (thread `swims` through to the chart),
`src/components/ChemChart/ChemChart.tsx` (render `SwimLane` in scale mode),
`src/components/LogTestFlow/UnlockSheet.tsx` (copy props), `src/App.tsx` (TemperatureTab
wiring), `src/components/ChemistryTab/ChemistryTab.tsx` (fetch swims, pass to focus sheet).
