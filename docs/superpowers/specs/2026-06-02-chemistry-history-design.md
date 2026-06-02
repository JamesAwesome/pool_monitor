# Chemistry Tracking — Timestamps, History & Edit/Delete — Design

**Date:** 2026-06-02
**Status:** Approved (pending implementation plan)

## Overview

Extend the existing Chemistry tab (shipped earlier) so manual test readings carry a
real **time** (not just a date), get a stable **id**, and can be **viewed in a full
history, edited, and deleted**. Implements the updated handoff in
`~/Desktop/pool_monitor.zip` (`design_handoff_chemistry_tracking/`, the
"Log & manage tests — timestamps + history" artboards + `history.jsx`,
`logtest.jsx`, updated `chem-data.js`).

This builds on the existing feature — grid home, focus sheet, overlay control,
auth-gated logging, `ChemChart`, `BottomSheet`, `OverlayPill`, `useChemAuth`,
`Toast` — and layers timestamps + CRUD + a history view onto it. No rewrite.

**Unchanged out-of-scope (confirmed originally and still):** no ideal-range /
"in spec" / good-bad coloring; no dosing recommendations; no per-day uniqueness.

## Decisions (confirmed with owner)

1. **Storage:** stay in InfluxDB; the reading's UTC timestamp **is** its stable id.
2. **Minimum valid reading:** ≥1 of the six chemical values (current rule kept).
   Partial / single-chemical readings are fully supported (the rest are
   null/absent); a fully-empty reading is rejected.
3. **Edit semantics:** PUT = **delete-old-timestamp + write-new** — supports
   changing the time, changing values, and clearing a field.
4. **Legacy readings** (previously logged at local noon, date-only): keep working;
   display their real stored time (`12:00 PM`) until edited. No heuristic hiding.

## A. Storage & data model

Each reading is one `chemistry` measurement point in InfluxDB, timestamped at the
real logged instant.

- **API reading shape:** `{ id, date, time, ph?, fc?, cc?, ta?, cya?, ch? }`
  - `id` — the point's ISO-8601 UTC timestamp (e.g. `2026-05-20T20:30:00.000Z`),
    stable and unique per reading; used for edit/delete.
  - `date` — `YYYY-MM-DD`, derived from `id` in the configured `TIMEZONE`.
  - `time` — `HH:mm` (24-hour), derived from `id` in `TIMEZONE`.
  - the six chemical fields — present only when set (partial readings).
- **New write timestamping:** a `dateTimeToUtc(date, time, timeZone)` helper
  converts a `YYYY-MM-DD` + `HH:mm` in the configured tz to the UTC `Date` to
  store. Replaces the noon-only path for new writes. The existing
  `zonedNoonToUtc` remains for reading back legacy points.
- **Two tests per day** are distinct points (different instants) — no uniqueness
  constraint, matching the existing behavior.
- **Field-clearing:** because InfluxDB fields linger on a point, clearing a field
  on edit is handled by the delete-then-write PUT (a fresh point with only the
  retained fields), never an in-place field removal.

## B. Backend API (`dashboard/server/`)

All paths under `/api/chemistry`. `GET` public; `POST`/`PUT`/`DELETE` behind the
existing `requireAuth` + `chemistryAuthLimiter`.

- **`GET /api/chemistry?range=`** — returns `{ id, date, time, ...values }[]`,
  sorted ascending by timestamp. `id`/`date`/`time` derived from each point's
  `_time` in `TIMEZONE`. (Extends current `queryChemistry`, which already pivots
  fields; add id/date/time derivation.)
- **`POST /api/chemistry`** — body `{ date, time, <values...> }`. Validates date,
  time, and ≥1 value; writes a point at `dateTimeToUtc(date, time)`. Responds
  `201 { id }` (the new timestamp).
- **`PUT /api/chemistry`** — body `{ id, date, time, <values...> }`. `id` is the
  original ISO timestamp. Server **deletes the point at `id`** then **writes** the
  new reading at `dateTimeToUtc(date, time)`. Responds `200 { id: <new> }`.
- **`DELETE /api/chemistry?id=<iso>`** — deletes the point at that instant.
  Responds `200 { ok: true }`.
- **Point deletion** uses InfluxDB's delete API via the official
  `@influxdata/influxdb-client-apis` package (`DeleteAPI`), deleting a 1ms window
  `[id, id+1ms)` filtered to `_measurement == "chemistry"`. Used by both PUT and
  DELETE. New dependency: `@influxdata/influxdb-client-apis`.

**Validation (`server/chemistry.ts`):**
- Extend `validateChemistryBody` to also require a parseable `time` (`HH:mm`,
  00:00–23:59). Keep the ≥1-value rule and per-chemical bounds.
- A separate `validateId(id)` ensures `id` is a valid ISO timestamp for PUT/DELETE.
- `date` validation unchanged (`YYYY-MM-DD`, parseable).

## C. Frontend (`dashboard/src/`)

Reuse existing components; extend in place.

- **`LogTestFlow` / `LogForm`:**
  - Add **Date** + **Time** inputs (`type="date"` / `type="time"`), both default
    to *now*, editable. Time label shows a 12-hour hint.
  - Inline note when the chosen date already has tests:
    *"Already N tests logged on this day — this will be added as another."*
  - **Edit mode:** when opened with an `editEntry`, pre-fill all fields, header
    "Edit test", primary button "Save changes" → `PUT`. **New mode** unchanged
    ("Log a test" → `POST`).
  - **Delete:** red "Delete this entry" link (edit mode only) → inline confirm
    (*"Delete this test permanently?"* · Keep / Delete) → `DELETE`. No one-tap delete.
  - Save still disabled until ≥1 value.
- **`HistorySheet` (new):** a `BottomSheet` (title "Test history", subtitle
  "N tests logged") opened from a new ghost **History** button in the Chemistry
  tab header (left of **Log test**). One tappable row per test, newest first
  (sort by timestamp desc): weekday date + 12-hour time, a `+N` badge when a
  calendar day has multiple tests, a 6-cell value micro-grid (short label over
  value, `border-top` in the chem accent), right chevron. A pinned
  "＋ Log a new test" button. Tapping a row → `gateToForm(entry)`.
- **`ChemChart`:** position points by full timestamp so same-day tests separate.
  (The chart already keys x by epoch-ms; readings now carry real times, so this
  largely falls out — verify same-day points render distinctly.)
- **Data hook (`useChemistryData`):** readings now include `id`/`time`; expose a
  `refetch` after any write (already present). Add helpers as needed for
  `testsOnDay(date)` (count) and newest-first sorting.
- **State:** `histOpen: boolean`; `editEntry: reading | null` (null = new);
  `gateToForm(entry)` sets `editEntry` then routes to the unlock gate
  (`flow = unlocked ? 'form' : 'unlock'`), preserving `editEntry` through unlock.
  `toast` message varies by action ("Reading saved" / "Changes saved" /
  "Entry deleted").
- **Auth:** edit and delete are writes → same unlock gate as logging. Viewing the
  history list is public/read-only.

## D. Approach, scope & testing

- **Approach:** extend existing endpoints/components in place; no datastore change,
  no read-only-container regression (InfluxDB stays the store), no migration —
  legacy noon points display as `12:00 PM` until edited.
- **Dependency added:** `@influxdata/influxdb-client-apis` (DeleteAPI). No other
  new runtime deps.
- **Testing (Vitest + RTL; coverage ≥80%, CI-gated):**
  - Server unit: `dateTimeToUtc` (tz + DST correctness, round-trips with the
    derive-back logic), `validateChemistryBody` (time required, bounds, ≥1 value),
    `validateId`, `queryChemistry` id/date/time mapping from `_time`.
  - Server integration (mounted router): POST/PUT/DELETE happy paths (201/200/200),
    401 when unauthenticated, 400 on invalid date/time/id/empty values, and that
    PUT performs delete-then-write (mock the delete + write APIs and assert order).
  - Component: History list (rows, `+N` badge, newest-first), edit-mode pre-fill +
    "Save changes", delete inline-confirm, date/time defaults, the "already N
    tests" note.
- **Deliverable:** spec → plan → subagent-driven implementation; one feature
  branch + PR, gated by the new CI.

## Success criteria

- Readings carry a stable `id` (UTC timestamp), `date`, and `time`; two tests on
  one day are distinct and render as separate chart points.
- `POST`/`PUT`/`DELETE` work end-to-end behind the auth gate; `GET` stays public.
- PUT correctly changes time/values and clears fields via delete-then-write.
- History sheet lists all tests with edit/delete reachable through the unlock gate.
- Partial / single-chemical readings supported; fully-empty rejected.
- Legacy noon readings still display and remain editable.
- No ideal-range/dosing logic; coverage ≥80%; CI green.

## Non-goals

- No move to SQLite or any new datastore; no migration of existing readings.
- No per-day uniqueness; no fully-empty readings.
- No ideal-range/target/good-bad coloring or dosing advice.
- No change to the temperature tab, weather sidecar, or overlay machinery.
