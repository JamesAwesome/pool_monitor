# Chem Marker Hover Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering a reading on the chemistry focus chart shows its recorded value (+ date, + pool/air temps when overlaid) in a tooltip — by adding a Recharts `<Tooltip>` to `ChemChart`'s full variant.

**Architecture:** Add a Recharts `<Tooltip>` to `ChemChart` rendered only on the `full` (focus-sheet) variant, mirroring `TempChart`'s tooltip. The value/temp/date formatting lives in small pure helpers (`chemTooltip.ts`) that are unit-tested directly (recharts tooltips can't be hover-triggered in jsdom). The chemical name/unit are derived from `CHEM_BY_KEY[chemKey]` inside `ChemChart` (its props don't include them).

**Tech Stack:** React 19, recharts 3, TypeScript, Vitest, CSS Modules. Run dashboard commands with `source ~/.nvm/nvm.sh &&` from `dashboard/`.

**Design spec:** `docs/superpowers/specs/2026-06-05-chem-marker-hover-design.md`
**Reference to mirror:** `dashboard/src/components/TempChart/TempChart.tsx` — its `<Tooltip>` (`formatter`/`labelFormatter`/`contentStyle`/`cursor`). Use the **same standardized style** (`backgroundColor: '#1e293b'`) shipped in the temp/battery tooltips.

---

## File Structure

- **New:** `dashboard/src/components/ChemChart/chemTooltip.ts` — pure formatter helpers.
- **New:** `dashboard/src/components/ChemChart/chemTooltip.test.ts` — helper unit tests.
- **Modified:** `dashboard/src/components/ChemChart/ChemChart.tsx` — import `Tooltip` + `CHEM_BY_KEY` + the helpers; render `{isFull && <Tooltip … />}`.

---

## Task 1: Tooltip formatter helpers

**Files:**
- Create: `dashboard/src/components/ChemChart/chemTooltip.ts`
- Test: `dashboard/src/components/ChemChart/chemTooltip.test.ts`

- [ ] **Step 1: Write the failing test** `chemTooltip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatChemTooltipItem, formatChemTooltipLabel } from './chemTooltip';

describe('formatChemTooltipItem', () => {
  const base = { name: 'pH', decimals: 1, unit: '', tempUnit: '°F' };
  it('formats the chem value with decimals + chemical name, no unit for pH', () => {
    expect(formatChemTooltipItem('chem', 7.6, base)).toEqual(['7.6', 'pH']);
  });
  it('appends the unit when present', () => {
    expect(formatChemTooltipItem('chem', 3.55, { name: 'Free Chlorine', decimals: 1, unit: 'ppm', tempUnit: '°F' }))
      .toEqual(['3.6 ppm', 'Free Chlorine']);
  });
  it('respects 0 decimals', () => {
    expect(formatChemTooltipItem('chem', 90.4, { name: 'Total Alkalinity', decimals: 0, unit: 'ppm', tempUnit: '°F' }))
      .toEqual(['90 ppm', 'Total Alkalinity']);
  });
  it('formats pool/air temps to one decimal with the unit', () => {
    expect(formatChemTooltipItem('pool', 77.43, base)).toEqual(['77.4°F', 'Pool temp']);
    expect(formatChemTooltipItem('air', 88, { ...base, tempUnit: '°C' })).toEqual(['88.0°C', 'Air temp']);
  });
  it('returns null for an unknown series key', () => {
    expect(formatChemTooltipItem('whatever', 1, base)).toBeNull();
  });
});

describe('formatChemTooltipLabel', () => {
  it('returns a non-empty date + time label with a separator', () => {
    const label = formatChemTooltipLabel(new Date('2026-06-05T18:00:00Z').getTime());
    expect(label).toContain('·');
    expect(label.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemChart/chemTooltip.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `chemTooltip.ts`**

```ts
/** Pure formatters for the chemistry focus-chart hover tooltip. Extracted so the
 *  logic is unit-testable (recharts tooltips can't be hover-triggered in jsdom). */

export interface ChemTooltipOpts {
  name: string;      // chemical label, e.g. 'pH', 'Free Chlorine'
  decimals: number;  // chemical decimals
  unit: string;      // chemical unit, '' for pH
  tempUnit: string;  // '°F' | '°C'
}

/** Format one tooltip row by series key. Returns [valueText, label] or null for
 *  an unrecognized series. `key` is the recharts series name (= the dataKey:
 *  'chem' | 'pool' | 'air'). Pool/air values are already in display units. */
export function formatChemTooltipItem(
  key: string,
  value: number,
  opts: ChemTooltipOpts,
): [string, string] | null {
  if (key === 'chem') {
    const u = opts.unit ? ` ${opts.unit}` : '';
    return [`${value.toFixed(opts.decimals)}${u}`, opts.name];
  }
  if (key === 'pool') return [`${value.toFixed(1)}${opts.tempUnit}`, 'Pool temp'];
  if (key === 'air') return [`${value.toFixed(1)}${opts.tempUnit}`, 'Air temp'];
  return null;
}

/** Header label: localized date + time for the hovered reading's epoch. */
export function formatChemTooltipLabel(t: number): string {
  const d = new Date(t);
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemChart/chemTooltip.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/ChemChart/chemTooltip.ts dashboard/src/components/ChemChart/chemTooltip.test.ts
git commit -m "feat(chem): pure formatters for the chem hover tooltip"
```

---

## Task 2: Wire the `<Tooltip>` into ChemChart (full variant only)

**Files:**
- Modify: `dashboard/src/components/ChemChart/ChemChart.tsx`

Reference `TempChart.tsx`'s `<Tooltip>` for the prop shape; use the same `#1e293b` content style.

- [ ] **Step 1: Add imports.** Add `Tooltip` to the recharts import, and import the helpers + the chemical metadata map:

```tsx
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
```

Add near the other local imports:

```tsx
import { CHEM_BY_KEY } from '../../constants/chemicals';
import { formatChemTooltipItem, formatChemTooltipLabel } from './chemTooltip';
```

(Verify `CHEM_BY_KEY` is exported from `src/constants/chemicals.ts` — `ChemistryTab.tsx` already imports it from there.)

- [ ] **Step 2: Derive the chemical meta + temp unit.** Inside the `ChemChart` component body, after `const isF = unit === 'F'` / `const isFull = variant === 'full'`, add:

```tsx
  const tempUnit = isF ? '°F' : '°C';
  const cmeta = CHEM_BY_KEY[chemKey];
```

- [ ] **Step 3: Render the `<Tooltip>` on the full variant.** Inside the `<ComposedChart>`, add the tooltip (place it just before the `{showPool && …}` Area block, matching TempChart's ordering of Tooltip before the series):

```tsx
          {isFull && (
            <Tooltip
              labelFormatter={(label) => formatChemTooltipLabel(Number(label))}
              formatter={(value, name) => {
                const row = formatChemTooltipItem(String(name), Number(value), {
                  name: cmeta.name, decimals, unit: cmeta.unit, tempUnit,
                });
                return row ?? [String(value), String(name)];
              }}
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '12px',
                color: '#e2e8f0',
                fontSize: '13px',
                padding: '10px 14px',
              }}
              cursor={{ stroke: 'rgba(56, 189, 248, 0.3)', strokeWidth: 1 }}
            />
          )}
```

Note: ChemChart's series (`chem`/`pool`/`air`) have no explicit `name`, so recharts passes the **dataKey as `name`** to the formatter — which is exactly the `key` the helper switches on. No `name` props need to be added to the `<Line>`/`<Area>` series.

- [ ] **Step 4: Typecheck + run the chem tests + build.**

Run: `cd dashboard && source ~/.nvm/nvm.sh && pnpm typecheck && pnpm vitest run src/components/ChemChart src/components/ChemFocusSheet src/components/ChemistryTab && pnpm lint`
Expected: typecheck clean; tests PASS; lint 0 errors (pre-existing warnings OK).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/ChemChart/ChemChart.tsx
git commit -m "feat(chem): hover tooltip on the chemistry focus chart"
```

---

## Task 3: Full verification + docs

- [ ] **Step 1: Full gate.**

Run: `cd dashboard && source ~/.nvm/nvm.sh && pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build`
Expected: all PASS; build succeeds. (Coverage of `chemTooltip.ts` should be high from Task 1; if overall dips, the helper tests already cover the logic.)

- [ ] **Step 2: Manual smoke (needs live InfluxDB).** Open a chemical's focus chart (tap a card on the Chemistry tab). Hover a reading dot → a `#1e293b` tooltip shows the chemical value (e.g. "pH 7.6") + date/time, plus "Pool temp"/"Air temp" rows when those overlays are on. Toggle Pool/Air off → those rows drop. Confirm the preview cards show no tooltip, and the swim/event marker hover boxes still work.

- [ ] **Step 3: Update `CLAUDE.md`.** In the dashboard "Chemistry tab" / ChemChart notes, add a line: the chemistry focus chart has a hover tooltip (value + date + pool/air temps when overlaid), formatters in `ChemChart/chemTooltip.ts`. Commit.

- [ ] **Step 4: Finish the branch.** Use `superpowers:finishing-a-development-branch` to open a PR.

---

## Self-review notes
- Spec coverage: Recharts Tooltip on full only (Task 2 step 3, `{isFull && …}`); value+date+temps content (Task 1 helpers + Task 2 wiring); `#1e293b` style (Task 2 step 3); testable helpers (Task 1). All covered.
- ChemChart gets name/unit via `CHEM_BY_KEY[chemKey]` (props lack them) — no caller changes.
- Series discriminated by `name` (= dataKey, since series have no explicit name) — consistent between the helper (`key`) and the formatter wiring.
- Out of scope (per spec): preview-card tooltips; marker-box changes; data changes.
