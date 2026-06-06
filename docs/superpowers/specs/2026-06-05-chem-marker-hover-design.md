# Chem Marker Hover Values — Design

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan

## Problem

On the chemistry **focus chart** (`ChemChart` `variant="full"`, in `ChemFocusSheet`), each
reading is drawn as a dot on the chemical's curve, but `ChemChart` has **no Recharts
`<Tooltip>`** (unlike `TempChart`). So hovering a reading shows nothing — there's no way to
read the recorded value off the chart. We want hovering to reveal the reading's value (plus
date and the overlaid temps for context).

## Decisions (confirmed)

- **Mechanism:** a Recharts `<Tooltip>` on `ChemChart` (mirrors `TempChart`), not a per-dot
  custom box. Recharts snaps to the nearest reading and highlights its active dot.
- **Content:** the chemical value + date **and** the pool/air temps at that point (when those
  overlays are on) — correlation context.
- **Scope:** the **full** (focus-sheet) chart only. The 66px preview cards are unchanged.
- **Style:** the standardized solid tooltip (`#1e293b`), consistent with the temp/battery
  tooltips and the swim/event hover boxes.

## Design

### 1. Add `<Tooltip>` to `ChemChart`, full variant only

In `dashboard/src/components/ChemChart/ChemChart.tsx`, render a Recharts `<Tooltip>` inside the
`<ComposedChart>` **only when `isFull`** (`{isFull && <Tooltip … />}`). Mirror `TempChart`'s
tooltip props (`formatter`, `labelFormatter`, `contentStyle`, `cursor`). Import `Tooltip` from
`recharts`. The preview-card (`mini`) path renders no tooltip.

The chart's `data` already carries, per point: `t` (epoch ms), `chem` (raw reading value,
yAxisId `chem`), and `pool`/`air` (already converted to the display unit by `buildChartData`,
yAxisId `temp`). Recharts' tooltip payload exposes whichever of these series are present at the
hovered point and currently rendered.

### 2. Content — header + rows

- **`labelFormatter(label)`** — `label` is the point's `t` (epoch ms). Format as date + time in
  the browser locale (e.g. `Fri, Jun 5 · 2:00 PM`), matching the reading's recorded time so two
  same-day readings are distinguishable.
- **`formatter(value, name, item)`** — discriminate by `item.dataKey`:
  - `chem` → `[`${value.toFixed(decimals)}${unitSuffix}`, meta.name]` where `unitSuffix` is
    `meta.unit` (e.g. `ppm`) when present, and `meta.name` is the chemical label (e.g. `pH`,
    `Free Cl`). (`decimals`, `meta` are already in scope / passed to `ChemChart`.)
  - `pool` → `[`${value.toFixed(1)}${tempUnit}`, 'Pool temp']`
  - `air` → `[`${value.toFixed(1)}${tempUnit}`, 'Air temp']`
  - `tempUnit` = `°F`/`°C` from the theme unit (`useTheme`, already used in `ChemChart`).
  Pool/air values are already in display units (from `buildChartData`); the chem value is raw,
  formatted with the chemical's `decimals`.

Because the chart only includes the `pool`/`air` series when `showPool`/`showAir` are on, those
rows naturally appear only when the overlays are enabled. A hovered point that is a pool/air
sample with no reading has no `chem` in its payload, so only the temp rows show; the chem row
appears only when the snapped point has a chem value.

### 3. Testability — extract the formatters

Recharts tooltips can't be hover-triggered in jsdom, so put the logic in **small pure helpers**
(e.g. in a colocated `chemTooltip.ts` or exported from `ChemChart`):
- `formatChemTooltipItem(dataKey, value, { name, decimals, unit, tempUnit }) → [text, label] | null`
- `formatChemTooltipLabel(t) → string`
These are unit-tested directly (chem value+unit+decimals; pool/air temp in °F and °C; the
date/time label). The `<Tooltip>` wires `formatter`/`labelFormatter` to these helpers.

### 4. Style & coexistence

- `contentStyle`: `backgroundColor: '#1e293b'`, `border: '1px solid rgba(56,189,248,0.4)'`,
  `borderRadius: '12px'`, light text, padding — identical to the temp/battery tooltips.
  `cursor`: the faint cyan vertical line, as on `TempChart`.
- The existing `SwimLane`/`EventLane` marker hover boxes are unchanged and continue to work:
  hovering a marker chip shows its box; hovering the curve shows this chem tooltip.

## Verification

- Unit tests for the formatter/label helpers (above).
- A render test: `<Tooltip>` is present for `variant="full"` and absent for `variant="mini"`.
- Manual (needs live data): open a chemical's focus chart, hover a reading dot → box shows the
  chemical value + date, plus Pool/Air temp when those overlays are on; toggling Pool/Air off
  drops those rows; preview cards show no tooltip.

## Files

**Modified:** `dashboard/src/components/ChemChart/ChemChart.tsx` (add `<Tooltip>` + wire
helpers). **New:** a small helper module + its test (e.g.
`dashboard/src/components/ChemChart/chemTooltip.ts` + `chemTooltip.test.ts`), or colocated
exported helpers with a test.

## Out of scope

Preview-card tooltips; changes to the swim/event marker hover boxes; any data/measurement
changes; ideal-range/dosing annotations.
