# Pool Maintenance Events — Design

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan
**Source:** `events.zip` design handoff (`design_handoff_events/`)

## Overview

Log **pool maintenance events** and surface them on the temperature and chemistry charts,
exactly as the shipped swim feature surfaces swims. Four kinds:

| Kind | Icon | Captures | Color / tint |
|---|---|---|---|
| **chemical** | 🧪 | product (preset list + free-text "Other") · amount · unit (`oz`/`lb`/`gal`) | `#b45309` / `rgba(180,83,9,.13)` |
| **water** | 💧 | amount · unit (`in`/`gal`/`min`) | `#0369a1` / `rgba(3,105,161,.12)` |
| **backwash** | 🔄 | timestamp only | `#0f766e` / `rgba(15,118,110,.12)` |
| **note** | 📝 | free text | `#475569` / `rgba(71,85,105,.14)` |

This is a **deliberate structural twin of the shipped swim feature** (PR #33). Where the swim
feature has `SwimLane` / `useSwimData` / `SwimLogFlow` / `SwimHistorySheet` / `constants/swim.ts`
/ `utils/swim.ts` / `/api/swims`, events get the parallel `EventLane` / `useEventData` /
`EventLogFlow` / `LogBookSheet` / `constants/events.ts` / `utils/events.ts` / `/api/events`.
Reuse the swim pattern wholesale; swap the payload.

The handoff (`design_handoff_events/`) is a high-fidelity HTML/React-via-Babel prototype, not
production code. Recreate it in `dashboard/` (React + TS + CSS Modules + Recharts) using the
swim feature as the template. Re-extract with `unzip -o ~/Desktop/events.zip -d /tmp/events_handoff`;
key files: `events.jsx` (components), `events-data.js` (kinds/constants/helpers), `events-app.jsx`
(wiring), `Pool Events - Maintenance Log.html` (`<style>` = exact CSS).

## Decisions (confirmed)

- **Storage:** new InfluxDB `event` measurement with **per-kind fields** (not a JSON blob).
- **Card markers:** render event markers on the small chemistry preview cards too (compact),
  alongside swim markers; both layers toggle independently.
- **Auth:** reuse the existing chem/swim unlock (`useChemAuth`, same credential + limiter).
- **Scope:** full feature in one pass (all four kinds + markers everywhere + Events pill +
  Log book + kind chooser + unlock gate).

## Data model & storage

```ts
type EventKind = 'chemical' | 'water' | 'backwash' | 'note';

interface PoolEvent {
  id: string;        // ISO-UTC instant of the point (stable id) — same convention as SwimSession
  date: string;      // YYYY-MM-DD in app timezone
  time: string;      // HH:mm 24h in app timezone
  kind: EventKind;
  product?: string;  // chemical (preset name or free text)
  amount?: number;   // chemical | water
  unit?: string;     // chemical: oz|lb|gal · water: in|gal|min
  note?: string;     // note
}
```

New InfluxDB **`event`** measurement, identical pattern to `swim`/`chemistry`:

- Point **timestamp = the event's date+time in `TIMEZONE`**, derived with the existing
  `dateTimeToUtc`; that UTC instant is also the stable **id** (`utcToZonedParts` on read).
- Store **`kind`** as a string field on every point, plus only the fields that kind uses:
  `product` (string), `amount` (float), `unit` (string), `note` (string). Sparse fields are
  idiomatic in InfluxDB (chemistry already stores optional fields this way). On read,
  reconstruct the `PoolEvent` by `kind`, attaching only present fields.
- **Edit = delete-then-write** (reuse `deletePoint(id, 'event')`), same rationale as
  chemistry/swim (supports timestamp changes; non-transactional, acceptable here).
- `EventKind` + `PoolEvent` added to `dashboard/src/types.ts`; the server defines a parallel
  shape inline in `influx.ts` (matching how `SwimSession`/`ChemistryReading` are defined there).

### Why fields, not a JSON blob

A single JSON string field is simplest to write but opaque to Flux and inconsistent with the
chemistry/swim storage already in place. Per-kind fields keep the data queryable and uniform.
Kind is stored as a **field** (not a tag): there are only four kinds and all filtering
(Log book, marker coloring) is client-side over a small set, so a tag adds cardinality/edit
complexity for no benefit — mirrors how swim stored `people` as a field.

## Backend (`dashboard/server/`)

### `event.ts` (new)

`validateEventBody(body)` → `{ ok: true; date; time; kind; ...payload } | { ok: false; error }`,
with **per-kind validation**:
- common: valid `date`, valid `HH:mm` `time` (reuse `isValidTime`), `kind ∈ EventKind`.
- **chemical:** `product` non-empty trimmed string ≤64 chars; `amount` finite > 0; `unit ∈ {oz,lb,gal}`.
- **water:** `amount` finite > 0; `unit ∈ {in,gal,min}`.
- **backwash:** no extra fields required.
- **note:** `note` non-empty trimmed string ≤500 chars.
Reject unknown kinds and out-of-enum units. Strip fields not belonging to the kind.

### `influx.ts` (additions)

- `queryEvents(range, timeZone)` → `PoolEvent[]`: filter `_measurement == "event"`, pivot the
  fields by `_time`, map `_time → id`, `utcToZonedParts → {date,time}`, attach `kind` + present
  payload fields, sorted by time.
- `writeEvent({ date, time, kind, ...payload }, timeZone)` → ISO id: `new Point('event')`
  `.timestamp(when).stringField('kind', kind)` + the kind's fields (`stringField`/`floatField`),
  flush, return `when.toISOString()`.

### `routes.ts` (additions)

Mirror `/api/swims`:
- `GET /api/events?range=` — **public**, validated by the existing `isValidRange`; default `season`.
- `POST /api/events` — `chemistryAuthLimiter` → `requireAuth` → `validateEventBody` → `writeEvent` → `201 { id }`.
- `PUT /api/events` — validate `id` (`isValidId`) + body, `deletePoint(id,'event')` then `writeEvent` → `200 { id }`.
- `DELETE /api/events?id=` — `deletePoint(id,'event')` → `200 { ok: true }`.
- `router.use('/api/events', express.json())`.

## Markers — `EventLane` (mirror of `SwimLane`)

Copy `SwimLane.tsx` + `SwimLane.module.css`. Reuse the proven mechanics verbatim:
`useXAxisScale`/`useYAxisScale`/`usePlotArea`; `interpolateValueAt`/`indexFractionAt`
(`utils/markerPositions.ts`); the **off-domain skip** (events outside the series time domain are
not drawn); **index mode** for TempChart (categorical axis), **scale mode** for ChemChart
(numeric axis, `yAxisId="chem"`); and the **compact** flag for the 66px cards.

Differences from `SwimLane`:
- The marker body is a **square kind-colored chip** instead of the round emoji bubble:
  `border-radius: 7px`, **23×23 full / 17×17 compact**, `background: kind.tint`, `1.5px solid
  kind.color` border, kind icon centered. This makes events read as a distinct layer from the
  round swim bubbles.
- **stem + foot are colored by kind** (the marker's `currentColor` = `kind.color`), so each
  marker in the lane is individually colored. Compact mode keeps the centered chip, no stem/foot
  (same as compact swim markers).
- Props: `{ events, series, xMode, color?(unused per-marker), iconSize?, yAxisId?, compact? }` —
  effectively `SwimLaneProps` with `swims`→`events`; color comes from each event's kind, not a
  single `color` prop.

Rendered in: `TempChart` (index), `ChemChart` full + compact (scale) — same call sites as
`SwimLane`, gated by `eventsOn` and `events.length > 0`.

## Toggle + entry points

- **`OverlayPill` `events` variant** — extend the existing pill (currently `pool|air|swim`) with
  `events`: a 🧰 glyph indicator and a teal active tint (`rgba(15,118,110,…)`). Rendered next to
  the Swim pill on the **temp chart**, the **chem tab** (gates the preview cards), and the **chem
  focus sheet** (gates the focus chart) — only when `events.length > 0`. Same three-place,
  independent-toggle wiring established for Swim.
- **"Log event" row** on `ChemistryTab`, directly under the existing `History / ＋ Log test`
  header: a small card with a "Log event" label + right-aligned **"Log book ›"** button, and four
  vertical icon-chip buttons (🧪 Chemical · 💧 Water · 🔄 Backwash · 📝 Note). Tapping a kind opens
  that kind's form through the unlock gate. (Logging lives on the Chemistry tab; the temp chart
  only shows markers + the Events pill — per the handoff.)

The existing chem-test feature (its own `History` / `＋ Log test` / `LogForm`) is **unchanged**.

## Client pieces (`dashboard/src/`)

- **`constants/events.ts`** — `EVENT_KINDS` (icon/label/color/tint/noun per kind),
  `EVENT_KIND_ORDER`, `CHEM_PRODUCTS`, `CHEM_UNITS`, `WATER_UNITS` (ported from `events-data.js`).
- **`utils/events.ts`** (pure, tested) — `sortedEvents` (newest first), `summary(ev)` (one-line by
  kind), `whenLabel(ev)`, `countByKind`.
- **`hooks/useEventData.ts`** — `GET /api/events?range`, returns `{ events, loading, error, refetch }`,
  30s poll (mirror `useSwimData`).
- **`components/EventLane/`** — the overlay + a per-kind chip marker (mirror `SwimLane`).
- **`components/EventLogFlow/`** — `EventLogFlow` (unlock gate → form, reusing `useChemAuth` +
  the shared `UnlockSheet` with an "Unlock to log an event" title) wrapping:
  - `EventLogForm` — one component, fields switch on `kind` (product chips + Other free-text;
    `Segmented` unit control; number amount; backwash info panel; note textarea; shared Date/Time
    row defaulting to now; Cancel / Log it; edit mode adds inline Delete-confirm). Performs the
    authed `POST`/`PUT`/`DELETE` fetches; calls `lock()` on 401.
  - `EventKindChooser` — 2×2 grid of the four kinds (opened from the Log book footer).
- **`components/LogBookSheet/`** — header `{N} entries` / "Log book"; a filter row (`All` + one
  chip per kind with icon + count); chronological rows (kind chip + `summary` + `whenLabel` +
  chevron), newest first, tap → edit; footer **＋ Log an event** → `EventKindChooser`.

### Wiring (`ChemistryTab`)

`ChemistryTab` owns the event flow, mirroring its swim wiring:
- `useEventData(range)` for the markers (range-scoped) and a season-wide `useEventData('season')`
  for the Log book (same fix applied to swim History so the log doesn't shrink with the range).
- State: `eventsOn` (default true), `evFlow` (`null|'unlock'|'chooser'|'form'`), `evKind`,
  `evEntry`, `bookOpen`, `bookFilter` (`'all'|EventKind`).
- Pass `events` (gated by `eventsOn`) into `ChemCard` (compact) and `ChemFocusSheet`/`ChemChart`
  (full); the temp chart receives events via `App.tsx` `TemperatureTab` (markers + pill only).
- Reuse the existing `Toast`; messages "{Kind noun} logged" / "Entry updated" / "Entry deleted".

`TempChart` / `ChemChart` / `ChemFocusSheet` gain an optional `events?` prop exactly parallel to
the existing `swims?` prop.

## Testing (mirror the swim suite; target ≥80%)

- **Server:** `event.test.ts` (per-kind validation edge cases — bad/oversized product, amount≤0,
  bad unit, empty note, unknown kind); event influx query/write (mocked); routes integration
  (public GET, auth gate, rate-limit shared, per-kind 201/400, DELETE measurement `'event'`).
- **Client:** `utils/events.test.ts` (sorted/summary/whenLabel/countByKind); `useEventData`;
  `EventLane.render.test.tsx` (marker per in-domain event, off-domain skip, compact vs full,
  per-kind color); `EventLogForm.test.tsx` (each kind's required fields gate Save; POST body +
  auth; PUT edit; DELETE; 401 → lock); `LogBookSheet.test.tsx` (counts, filter by kind, edit
  callback, kind chooser); `OverlayPill` `events` variant; toggle wiring on the hosts.

## Out of scope

- Per-marker tap targets — markers stay non-interactive (`pointer-events: none`), like swims.
- Any change to the chem-test or swim features.
- Deleting/altering historical data; rtl_433/hardware concerns.
