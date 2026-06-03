# Weather Condition Lane — Design

**Date:** 2026-06-02
**Status:** Approved (pending implementation plan)

## Overview

Add a horizontal lane of sky-condition icons aligned to the top of the
time-series charts, so the curves explain themselves ("pool temp dipped Thursday
because it rained"). Implements the handoff in `~/Desktop/pool_monitor_weather_lane.zip`
(`design_handoff_weather_lane/`).

This adds **one new thing**: a `<WeatherLane>` of condition icons sharing each
chart's time axis. Current conditions are already shown (the hero's
`AirTempReadout` "Air 63° · Sunny" and the dashed air line, already default-on in
`TempChart`) — so **no** separate weather header/bar is added; that would
duplicate the hero.

## Decisions (confirmed with owner)

1. **Alignment:** a Recharts `<Customized>` layer inside the existing
   `ComposedChart` (reads the real `xAxisMap`/`offset` — no hardcoded geometry).
2. **Per-bucket condition:** the **mode** (most-frequent `condition_code`) per
   bucket.
3. **Aggregation impl:** Flux returns the raw `condition_code` samples; the Node
   server buckets + computes the mode in TypeScript (testable; bucketing matches
   the chart exactly).
4. **Scope:** lane only (condition + code). No `uv`/`precip` fields added now.

## Scope — where the lane appears

| Location | Chart | Bucketing |
|---|---|---|
| **Temperature tab** | `TempChart` (`ComposedChart`) | per the selected `range` (matches the air-line buckets) |
| **Chemistry tab → focus sheet** | `ChemFocusSheet`'s `ChemChart` (`variant="full"`) | one icon **per reading**, matched to that reading's calendar-day dominant condition |

The Chemistry **home** small-multiple grid gets **no** lane and **no** weather bar.

## A. Backend — condition per bucket

The weather service (`weather/src/point.ts`) already writes `condition_code`
(intField) and `condition` (tag) to the `weather` measurement every poll. This
exposes them aggregated per bucket on the history endpoint.

- **New pure module `dashboard/server/weatherBuckets.ts`** — `bucketConditions(samples, range)`:
  - Input: raw `{ time: string; code: number; label: string }[]` samples over the range.
  - Buckets them by the **same window** the chart uses — reuse the existing
    `windowPeriod(range)` from `influx.ts` so lane buckets align exactly with the
    air-temp line's `aggregateWindow`.
  - Computes the **mode** `code` per bucket (ties → the earliest-seen code, deterministic),
    carrying the human `label` from the sample whose code won.
  - Returns `{ time: <bucket time>; conditionCode: number; condition: string }[]`,
    where bucket `time` matches the temp points' bucket times so they merge cleanly.
- **`queryWeatherHistory(range)`** (`dashboard/server/influx.ts`) — keep the
  existing temp query (`{time, value}` mean-aggregated). Add a second Flux query
  that pulls raw `condition_code` (field) and `condition` (tag) samples over the
  range, **un-windowed**, `keep`ing `_time`, `_value` (the code), and `condition`.
  Run `bucketConditions` on those, then merge condition fields onto the matching
  temp points by bucket time. Return `WeatherHistoryPoint[]`.
- **Return type** `WeatherHistoryPoint extends TimeSeriesPoint` (see C). Points
  with no condition data for their bucket simply omit `conditionCode`/`condition`
  — **fail-silent**, matching how weather already degrades.
- **`/api/weather/history` route** — unchanged code except the richer payload;
  backward-compatible (`value` still present). Range still allowlist-validated.

## B. Frontend — the WeatherLane

New `dashboard/src/components/WeatherLane/`:

- **`conditionIcon.tsx`** — the 4 line-style SVG glyphs (sun, partly, cloud, rain)
  copied from the handoff's `weather-options.jsx` `Ico` set (24×24,
  `stroke="currentColor"`, width 2, round caps/joins). Plus
  `conditionToIcon(code, isDay)` mapping a WeatherAPI `condition_code` → `{ Icon,
  colorVar, label }` per the README's code buckets:
  - 1000 → sun (`--color-warning`); 1003 → partly (`--color-warning`);
    1006/1009/1135/1147 → cloud (`--color-text-secondary`);
    1063–1201 / 1240–1282 (rain/snow/storm) → rain (`--color-primary`).
  - (`isDay` reserved for a future night variant; the 4 buckets are the minimum.)
- **`WeatherLane.tsx`** — rendered as a Recharts **`<Customized>`** child inside the
  host `ComposedChart`. It receives the chart's `xAxisMap`/`offset`, computes each
  bucket-center's pixel-x from the real x scale, and draws the icon (via
  `<foreignObject>`/`<image>`) in the top band (~24–28px tall, 18–19px icons; 16px
  in the chemistry focus sheet). **Overlap guard:** if buckets are denser than the
  plot width allows, step down (render every Nth) so icons never collide. A bucket
  with no condition renders nothing.

Integration:
- **`TempChart.tsx`** — feed the extended `airHistory` (`WeatherHistoryPoint[]`);
  add the `<Customized>` lane; fold the bucket's condition string into the existing
  `Tooltip`. The dashed air `Line` (default-on) and hero `AirTempReadout` are
  untouched.
- **`ChemFocusSheet.tsx` / `ChemChart.tsx`** — for `variant="full"`, render the lane
  with **one icon per reading**, each reading's calendar day matched to that day's
  dominant condition from the temp-tab weather history (`airHistory`). 16px icons.
  No change to the mini variant or the home grid.

## C. Data flow, types, theming

- **`dashboard/src/types.ts`** — add:
  ```ts
  export interface WeatherHistoryPoint extends TimeSeriesPoint {
    // value = air temp °C (unchanged)
    conditionCode?: number;
    condition?: string;
  }
  ```
- **`usePoolData.ts`** — `airHistory` typing widens from `TimeSeriesPoint[]` to
  `WeatherHistoryPoint[]`. No fetch-flow change (same endpoint, richer shape);
  existing fail-silent handling unchanged.
- **Theming/motion:** icon colors come from CSS variables, so light/dark follow
  `ThemeContext` automatically; the lane is static (no animation; print/reduced-motion safe).

## D. Approach, scope, testing

- **Approach:** add a self-contained `WeatherLane` component + a pure
  `weatherBuckets` module; extend the existing weather history query/type in place.
  No chart rebuild — the lane layers onto the real Recharts charts.
- **Out of scope (per handoff):** no weather header/bar; no lane on the chemistry
  home grid; `uv`/`precip_mm` not added; `/api/weather/current` untouched; air line
  + hero unchanged; no new design tokens.
- **Testing (Vitest + RTL; coverage ≥80%, CI-gated):**
  - Server unit: `bucketConditions` — mode selection, tie determinism, bucket
    alignment to `windowPeriod(range)`, empty/sparse input, code→label carry;
    `queryWeatherHistory` merged-shape mapping (mock the query API).
  - `conditionToIcon` — each code bucket maps to the right glyph + color; unknown
    code → no icon; boundary codes (1006 vs 1063, 1201 vs 1240).
  - `WeatherLane` — icon count per range bucket set, overlap step-down kicks in
    when dense, renders nothing for missing-condition buckets, mocks Recharts
    `Customized` props like the existing chart tests mock recharts.
- **Deliverable:** spec → plan → subagent-driven implementation; one feature branch
  + PR, gated by CI (dashboard/weather/docker).

## Success criteria

- `/api/weather/history` returns `WeatherHistoryPoint[]` with a mode condition per
  bucket, bucketed by the same window as the temp line; backward-compatible.
- `TempChart` shows an aligned icon lane above the plot for every range, condition
  folded into the tooltip; air line + hero unchanged.
- `ChemFocusSheet` full chart shows one icon per reading, matched to the reading's day.
- Lane aligns to the plot (not the axis) and stays aligned on resize.
- Missing condition data renders silently; light/dark themed automatically.
- No weather bar; chemistry home grid unchanged. Coverage ≥80%; CI green.

## Non-goals

- No separate weather header/bar (the hero already shows current conditions).
- No lane on the chemistry small-multiple grid.
- No `uv`/`precip_mm` per-bucket fields; no `/api/weather/current` change.
- No change to the air line, the hero `AirTempReadout`, or the temperature stats.
