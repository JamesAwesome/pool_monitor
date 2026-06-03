# Weather Condition Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `<WeatherLane>` of sky-condition icons aligned to the top of `TempChart` and the `ChemFocusSheet` trend chart, driven by a mode-per-bucket condition added to the weather-history API.

**Architecture:** The weather service already stores `condition_code` + `condition` in InfluxDB. Extend `queryWeatherHistory` to also pull raw codes and bucket them (mode per window) in a pure TS helper, returning `WeatherHistoryPoint[]`. On the client, a `WeatherLane` renders as a Recharts `<Customized>` layer inside the existing charts so icons align to the real x-scale.

**Tech Stack:** Express 5, `@influxdata/influxdb-client`, React 19, TypeScript 6, Recharts, Vitest, Node 24 / pnpm 10.33.0.

---

## Spec reference

`docs/superpowers/specs/2026-06-02-weather-lane-design.md`. Read it first.

## Conventions (read once)

- All pnpm/node commands: prefix `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null` (Node 24 / pnpm 10.33.0; if 24 unavailable locally, 22 is fine — both have corepack). Run from `dashboard/`. Delete any stray `pnpm-workspace.yaml` (gitignored).
- Server tests: Node env (`// @vitest-environment node`). Component tests: jsdom default; components using `useTheme` mock `../../context/ThemeContext` (see `ChemCard.test.tsx`); chart tests mock `recharts` (see `TempChart.test.tsx`).
- After server changes, COLD build (`rm -rf dist && find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete; pnpm build`) — Docker/CI run `tsc -b` cold.
- Existing relevant files: `dashboard/server/influx.ts` (`queryWeatherHistory`, `windowPeriod`, `parseRange`), `dashboard/src/types.ts` (`TimeSeriesPoint`), `dashboard/src/hooks/usePoolData.ts` (`airHistory`), `dashboard/src/components/TempChart/TempChart.tsx` (margins `{top:8,right:16,bottom:0,left:0}`, `YAxis width={56}`, the `Tooltip`), `dashboard/src/components/ChemChart/ChemChart.tsx` (`variant: 'mini'|'full'`), `dashboard/src/components/ChemFocusSheet/ChemFocusSheet.tsx`.
- Icon glyph SVG paths are in the handoff `weather_lane_handoff/design_handoff_weather_lane/weather-options.jsx` (`Ico` object) — copy the sun/partly/cloud/rain paths verbatim. (That handoff dir is untracked/local.)
- CI gates this (lint exit 0, typecheck, test:coverage ≥80%, build). Keep green.

## File structure

**Backend**
- `dashboard/server/weatherBuckets.ts` *(new)* — `bucketConditions(samples, range)`: pure mode-per-window aggregation.
- `dashboard/server/influx.ts` *(modify)* — `queryWeatherHistory` returns `WeatherHistoryPoint[]` (temp + condition merged).
- Tests: `dashboard/server/weatherBuckets.test.ts` *(new)*, `dashboard/server/influx.test.ts` *(modify)*.

**Frontend**
- `dashboard/src/types.ts` *(modify)* — add `WeatherHistoryPoint`.
- `dashboard/src/components/WeatherLane/conditionIcon.tsx` *(new)* — 4 glyphs + `conditionToIcon(code, isDay)`.
- `dashboard/src/components/WeatherLane/WeatherLane.tsx` *(new)* — the `<Customized>` lane.
- `dashboard/src/components/WeatherLane/index.ts` *(new)*.
- `dashboard/src/hooks/usePoolData.ts` *(modify)* — widen `airHistory` to `WeatherHistoryPoint[]`.
- `dashboard/src/components/TempChart/TempChart.tsx` *(modify)* — add lane + condition in tooltip.
- `dashboard/src/components/ChemChart/ChemChart.tsx` + `ChemFocusSheet/ChemFocusSheet.tsx` *(modify)* — lane per reading on the full variant.
- Tests alongside each.

---

## Phase 1 — Backend bucketing

### Task 1: `bucketConditions` pure helper

**Files:** Create `dashboard/server/weatherBuckets.ts`; Test `dashboard/server/weatherBuckets.test.ts`.

- [ ] **Step 1: Write failing tests.** Create `dashboard/server/weatherBuckets.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { bucketConditions } from './weatherBuckets';

// windowPeriod('24h') === '5m'; windowPeriod('7d') === '1h'; windowPeriod('30d') === '2h'.
// bucketConditions buckets samples into floor(time / windowMs) and returns one
// point per bucket at the bucket-START time, with the MODE code (ties -> earliest-seen).

describe('bucketConditions', () => {
  it('returns the mode code per bucket with its label, keyed at bucket start', () => {
    // 7d -> 1h windows. Two samples in the 10:00 hour: sunny x2 vs cloud x1 -> sunny.
    const samples = [
      { time: '2026-05-20T10:05:00Z', code: 1000, label: 'Sunny' },
      { time: '2026-05-20T10:25:00Z', code: 1000, label: 'Sunny' },
      { time: '2026-05-20T10:45:00Z', code: 1006, label: 'Cloudy' },
      { time: '2026-05-20T11:30:00Z', code: 1006, label: 'Cloudy' },
    ];
    const out = bucketConditions(samples, '7d');
    expect(out).toEqual([
      { time: '2026-05-20T10:00:00.000Z', conditionCode: 1000, condition: 'Sunny' },
      { time: '2026-05-20T11:00:00.000Z', conditionCode: 1006, condition: 'Cloudy' },
    ]);
  });

  it('breaks ties by earliest-seen code (deterministic)', () => {
    const samples = [
      { time: '2026-05-20T10:10:00Z', code: 1006, label: 'Cloudy' },
      { time: '2026-05-20T10:40:00Z', code: 1000, label: 'Sunny' },
    ];
    // 1h window, one each -> tie -> earliest-seen (1006 Cloudy)
    expect(bucketConditions(samples, '7d')).toEqual([
      { time: '2026-05-20T10:00:00.000Z', conditionCode: 1006, condition: 'Cloudy' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(bucketConditions([], '7d')).toEqual([]);
  });

  it('sorts buckets ascending by time', () => {
    const samples = [
      { time: '2026-05-21T00:00:00Z', code: 1000, label: 'Sunny' },
      { time: '2026-05-20T00:00:00Z', code: 1006, label: 'Cloudy' },
    ];
    const out = bucketConditions(samples, '30d'); // 2h windows
    expect(out.map((p) => p.time)).toEqual([
      '2026-05-20T00:00:00.000Z', '2026-05-21T00:00:00.000Z',
    ]);
  });
});
```

- [ ] **Step 2: Run, expect fail.** `source ~/.nvm/nvm.sh && pnpm vitest run server/weatherBuckets.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement.** Create `dashboard/server/weatherBuckets.ts`:

```ts
import { windowPeriod } from './influx.js'

export interface ConditionSample {
  time: string
  code: number
  label: string
}

export interface BucketCondition {
  time: string
  conditionCode: number
  condition: string
}

/** Parse a windowPeriod token like '5m' | '1h' | '2h' | '1d' into milliseconds. */
function windowMs(period: string): number {
  const m = period.match(/^(\d+)([mhd])$/)
  if (!m) return 60 * 60 * 1000 // sensible 1h fallback
  const n = parseInt(m[1], 10)
  const unit = m[2]
  if (unit === 'm') return n * 60 * 1000
  if (unit === 'h') return n * 60 * 60 * 1000
  return n * 24 * 60 * 60 * 1000
}

/**
 * Bucket raw condition samples into the same windows the temp line uses
 * (windowPeriod(range)) and pick the MODE code per bucket. Ties resolve to the
 * earliest-seen code, making the result deterministic. Bucket time is the
 * window START (floor(ms / windowMs) * windowMs), matching aggregateWindow.
 */
export function bucketConditions(samples: ConditionSample[], range: string): BucketCondition[] {
  if (samples.length === 0) return []
  const w = windowMs(windowPeriod(range))

  // bucketStartMs -> { counts: Map<code, n>, firstSeen: Map<code, order>, label: Map<code, label> }
  const buckets = new Map<number, { counts: Map<number, number>; order: Map<number, number>; labels: Map<number, string> }>()
  let seq = 0
  for (const s of samples) {
    const t = new Date(s.time).getTime()
    const start = Math.floor(t / w) * w
    let b = buckets.get(start)
    if (!b) { b = { counts: new Map(), order: new Map(), labels: new Map() }; buckets.set(start, b) }
    b.counts.set(s.code, (b.counts.get(s.code) ?? 0) + 1)
    if (!b.order.has(s.code)) b.order.set(s.code, seq)
    b.labels.set(s.code, s.label)
    seq += 1
  }

  const out: BucketCondition[] = []
  for (const [start, b] of buckets) {
    let bestCode = -1, bestCount = -1, bestOrder = Infinity
    for (const [code, count] of b.counts) {
      const order = b.order.get(code)!
      if (count > bestCount || (count === bestCount && order < bestOrder)) {
        bestCode = code; bestCount = count; bestOrder = order
      }
    }
    out.push({ time: new Date(start).toISOString(), conditionCode: bestCode, condition: b.labels.get(bestCode)! })
  }
  out.sort((a, b) => a.time.localeCompare(b.time))
  return out
}
```

- [ ] **Step 4: Run, expect pass.** `source ~/.nvm/nvm.sh && pnpm vitest run server/weatherBuckets.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add server/weatherBuckets.ts server/weatherBuckets.test.ts
git commit -m "feat: add bucketConditions (mode condition per window)"
```
(Append the `Co-Authored-By` trailer your harness requires.)

---

### Task 2: `queryWeatherHistory` returns condition per bucket

**Files:** Modify `dashboard/server/influx.ts`; Test `dashboard/server/influx.test.ts`.

- [ ] **Step 1: Update failing tests.** In `server/influx.test.ts`, find the `queryWeatherHistory` describe block and replace it with:

```ts
describe('queryWeatherHistory', () => {
  it('merges the mode condition per bucket onto the temp points', async () => {
    // First collectRows call = temp aggregation; second = raw condition samples.
    queryApiStub.collectRows
      .mockResolvedValueOnce([
        { _time: '2026-05-20T10:00:00.000Z', _value: 24 },
        { _time: '2026-05-20T11:00:00.000Z', _value: 25 },
      ])
      .mockResolvedValueOnce([
        { _time: '2026-05-20T10:05:00Z', _value: 1000, condition: 'Sunny' },
        { _time: '2026-05-20T10:25:00Z', _value: 1000, condition: 'Sunny' },
        { _time: '2026-05-20T11:30:00Z', _value: 1006, condition: 'Cloudy' },
      ]);
    const out = await queryWeatherHistory('7d'); // 1h windows
    expect(out).toEqual([
      { time: '2026-05-20T10:00:00.000Z', value: 24, conditionCode: 1000, condition: 'Sunny' },
      { time: '2026-05-20T11:00:00.000Z', value: 25, conditionCode: 1006, condition: 'Cloudy' },
    ]);
  });

  it('omits condition fields when a temp bucket has no condition samples', async () => {
    queryApiStub.collectRows
      .mockResolvedValueOnce([{ _time: '2026-05-20T10:00:00.000Z', _value: 24 }])
      .mockResolvedValueOnce([]);
    expect(await queryWeatherHistory('7d')).toEqual([
      { time: '2026-05-20T10:00:00.000Z', value: 24 },
    ]);
  });
});
```

- [ ] **Step 2: Run, expect fail.** `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In `server/influx.ts`:

Add imports near the top:
```ts
import { bucketConditions } from './weatherBuckets.js'
import type { ConditionSample } from './weatherBuckets.js'
```

Add the exported type (next to the other interfaces):
```ts
export interface WeatherHistoryPoint {
  time: string
  value: number
  conditionCode?: number
  condition?: string
}
```

Replace `queryWeatherHistory` with:
```ts
export async function queryWeatherHistory(range: string): Promise<WeatherHistoryPoint[]> {
  const api = getQueryApi()
  const period = windowPeriod(range)

  const tempQuery = `
    from(bucket: "${bucket}")
      |> range(${parseRange(range)})
      |> filter(fn: (r) => r._measurement == "weather")
      |> filter(fn: (r) => r._field == "temperature_C")
      |> group()
      |> aggregateWindow(every: ${period}, fn: mean, createEmpty: false)
      |> yield(name: "weather_history")
  `
  // Raw condition samples (un-windowed); bucketed + mode-picked in JS so the
  // bucket boundaries match the temp line exactly.
  const condQuery = `
    from(bucket: "${bucket}")
      |> range(${parseRange(range)})
      |> filter(fn: (r) => r._measurement == "weather")
      |> filter(fn: (r) => r._field == "condition_code")
      |> keep(columns: ["_time", "_value", "condition"])
  `

  const tempRows = await api.collectRows<{ _time: string; _value: number }>(tempQuery)
  const condRows = await api.collectRows<{ _time: string; _value: number; condition: string }>(condQuery)

  const samples: ConditionSample[] = condRows.map((r) => ({
    time: r._time, code: r._value, label: r.condition,
  }))
  const condByTime = new Map(bucketConditions(samples, range).map((c) => [c.time, c]))

  return tempRows.map((r) => {
    const cond = condByTime.get(r._time)
    const point: WeatherHistoryPoint = { time: r._time, value: r._value }
    if (cond) { point.conditionCode = cond.conditionCode; point.condition = cond.condition }
    return point
  })
}
```

Note: keep the existing `HistoryRow` interface if other functions use it; `queryWeatherHistory` now uses its own inline row types.

- [ ] **Step 4: Run, expect pass.** `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts` → PASS. Then full server suite: `pnpm vitest run server/` → PASS.

- [ ] **Step 5: Cold build + commit.**
```bash
source ~/.nvm/nvm.sh && rm -rf dist && find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete; pnpm build  # exit 0
git add server/influx.ts server/influx.test.ts
git commit -m "feat: weather history returns mode condition per bucket"
```

---

## Phase 2 — Frontend types + icons

### Task 3: `WeatherHistoryPoint` type + `usePoolData` widening

**Files:** Modify `dashboard/src/types.ts`, `dashboard/src/hooks/usePoolData.ts`.

- [ ] **Step 1: Add the type.** In `src/types.ts`, after `TimeSeriesPoint`:
```ts
export interface WeatherHistoryPoint extends TimeSeriesPoint {
  // value = air temp °C (unchanged)
  conditionCode?: number;
  condition?: string;
}
```

- [ ] **Step 2: Widen `airHistory`.** In `src/hooks/usePoolData.ts`: import `WeatherHistoryPoint`; change the `airHistory` state + the `UsePoolDataReturn.airHistory` type from `TimeSeriesPoint[]` to `WeatherHistoryPoint[]`. The fetch already does `res.json() as Promise<TimeSeriesPoint[]>` for weather history — change that cast to `WeatherHistoryPoint[]`. No other logic changes (extra fields pass through).

- [ ] **Step 3: Typecheck.** `source ~/.nvm/nvm.sh && pnpm typecheck` → clean. (TempChart still accepts `airHistory?: TimeSeriesPoint[]`; `WeatherHistoryPoint[]` is assignable to it since it extends `TimeSeriesPoint` — fine until Task 6 widens it.)

- [ ] **Step 4: Run tests + commit.**
```bash
source ~/.nvm/nvm.sh && pnpm test 2>&1 | grep -E "Tests "   # all pass
git add src/types.ts src/hooks/usePoolData.ts
git commit -m "feat: add WeatherHistoryPoint; widen airHistory typing"
```

---

### Task 4: `conditionIcon` — glyphs + `conditionToIcon`

**Files:** Create `dashboard/src/components/WeatherLane/conditionIcon.tsx`; Test `dashboard/src/components/WeatherLane/conditionIcon.test.tsx`.

- [ ] **Step 1: Write failing tests.** Create `conditionIcon.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { conditionToIcon } from './conditionIcon';

describe('conditionToIcon', () => {
  it('maps clear/sunny (1000) to sun + warning color', () => {
    const r = conditionToIcon(1000, true);
    expect(r?.kind).toBe('sun');
    expect(r?.colorVar).toBe('var(--color-warning)');
  });
  it('maps partly cloudy (1003) to partly', () => {
    expect(conditionToIcon(1003, true)?.kind).toBe('partly');
  });
  it('maps cloud/overcast/fog (1006,1009,1135,1147) to cloud + secondary', () => {
    for (const c of [1006, 1009, 1135, 1147]) {
      const r = conditionToIcon(c, true);
      expect(r?.kind).toBe('cloud');
      expect(r?.colorVar).toBe('var(--color-text-secondary)');
    }
  });
  it('maps rain/snow/storm ranges to rain + primary', () => {
    for (const c of [1063, 1180, 1201, 1240, 1282]) {
      const r = conditionToIcon(c, true);
      expect(r?.kind).toBe('rain');
      expect(r?.colorVar).toBe('var(--color-primary)');
    }
  });
  it('returns null for an unknown code', () => {
    expect(conditionToIcon(9999, true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect fail.** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/WeatherLane/conditionIcon.test.tsx` → FAIL.

- [ ] **Step 3: Implement.** Create `src/components/WeatherLane/conditionIcon.tsx` (copy the SVG paths verbatim from the handoff `weather-options.jsx` `Ico` object):
```tsx
export type ConditionKind = 'sun' | 'partly' | 'cloud' | 'rain';

const GLYPHS: Record<ConditionKind, React.ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  partly: (
    <>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1.5v1.6M2.6 8H1M3.6 3.6l-.9-.9M12.4 3.6l.9-.9M2.6 8 1.6 9" />
      <path d="M17.5 19H7.5a3.5 3.5 0 0 1-.3-7 5 5 0 0 1 9.6 1.2A3 3 0 0 1 17.5 19Z" />
    </>
  ),
  cloud: (
    <path d="M17.5 18.5H7a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6 1.3 3.4 3.4 0 0 1 .2 6.7Z" />
  ),
  rain: (
    <>
      <path d="M17 15.5H7.5a3.7 3.7 0 0 1-.3-7.4 5.2 5.2 0 0 1 10 1.2 3.1 3.1 0 0 1-.2 6.2Z" />
      <path d="M8 18.5l-1 2.5M12 18.5l-1 2.5M16 18.5l-1 2.5" />
    </>
  ),
};

const COLOR: Record<ConditionKind, string> = {
  sun: 'var(--color-warning)',
  partly: 'var(--color-warning)',
  cloud: 'var(--color-text-secondary)',
  rain: 'var(--color-primary)',
};

/** Render a condition glyph at the given size. color comes from CSS var via currentColor. */
export function ConditionGlyph({ kind, size = 18 }: { kind: ConditionKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[kind]}
    </svg>
  );
}

/**
 * Map a WeatherAPI condition_code to a glyph kind + accent color.
 * isDay is reserved for a future night variant; the four buckets are the minimum.
 */
export function conditionToIcon(
  code: number,
  _isDay: boolean,
): { kind: ConditionKind; colorVar: string } | null {
  let kind: ConditionKind | null = null;
  if (code === 1000) kind = 'sun';
  else if (code === 1003) kind = 'partly';
  else if (code === 1006 || code === 1009 || code === 1135 || code === 1147) kind = 'cloud';
  else if ((code >= 1063 && code <= 1201) || (code >= 1240 && code <= 1282)) kind = 'rain';
  if (!kind) return null;
  return { kind, colorVar: COLOR[kind] };
}
```

- [ ] **Step 4: Run, expect pass.** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/WeatherLane/conditionIcon.test.tsx` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/components/WeatherLane/conditionIcon.tsx src/components/WeatherLane/conditionIcon.test.tsx
git commit -m "feat: add condition glyphs + conditionToIcon mapping"
```

---

## Phase 3 — The WeatherLane (Customized layer)

### Task 5: `WeatherLane` component

**Files:** Create `dashboard/src/components/WeatherLane/WeatherLane.tsx`, `index.ts`, `WeatherLane.test.tsx`.

- [ ] **Step 1: Read the Recharts `Customized` contract.** A `<Customized component={fn} />` child renders `fn(props)` where props include `xAxisMap` (object keyed by axis id → axis with a `scale` fn and `x`/`width`), `yAxisMap`, and `offset` ({top,left,width,height}). The lane reads the default x-axis scale to map a time value → pixel x. Confirm by reading how `TempChart` configures its `XAxis` (dataKey="time", default axis id 0).

- [ ] **Step 2: Write failing tests.** Create `WeatherLane.test.tsx`. Test the PURE bucket-selection logic directly (the rendering needs Recharts internals, so unit-test the exported helper + a light render):
```tsx
import { describe, it, expect } from 'vitest';
import { selectLaneIcons } from './WeatherLane';

const pts = [
  { time: '2026-05-20T00:00:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
  { time: '2026-05-21T00:00:00Z', value: 21, conditionCode: 1006, condition: 'Cloudy' },
  { time: '2026-05-22T00:00:00Z', value: 22 }, // no condition
  { time: '2026-05-23T00:00:00Z', value: 23, conditionCode: 1063, condition: 'Rain' },
];

describe('selectLaneIcons', () => {
  it('keeps only points with a mappable condition', () => {
    const out = selectLaneIcons(pts, 1000); // wide plot, no step-down
    expect(out.map((i) => i.kind)).toEqual(['sun', 'cloud', 'rain']);
  });
  it('steps down when too dense to fit (one icon per ~minGap px)', () => {
    // plotWidth 40px, 3 icons need 3*minGap(24)=72 > 40 -> step to every 2nd
    const out = selectLaneIcons(pts, 40);
    expect(out.length).toBeLessThan(3);
  });
  it('returns [] when no points carry a condition', () => {
    expect(selectLaneIcons([{ time: 't', value: 1 }], 1000)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, expect fail.** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/WeatherLane/WeatherLane.test.tsx` → FAIL.

- [ ] **Step 4: Implement.** Create `src/components/WeatherLane/WeatherLane.tsx`:
```tsx
import { Customized } from 'recharts';
import type { WeatherHistoryPoint } from '../../types';
import { conditionToIcon, ConditionGlyph, type ConditionKind } from './conditionIcon';

const MIN_ICON_GAP = 24; // px — minimum horizontal spacing so icons never collide

export interface LaneIcon {
  time: string;
  kind: ConditionKind;
  colorVar: string;
  condition: string;
}

/**
 * From the weather points, keep those with a mappable condition, then step down
 * (render every Nth) so that at most floor(plotWidth / MIN_ICON_GAP) icons show.
 * Pure + exported for testing.
 */
export function selectLaneIcons(points: WeatherHistoryPoint[], plotWidth: number): LaneIcon[] {
  const mapped: LaneIcon[] = [];
  for (const p of points) {
    if (p.conditionCode === undefined) continue;
    const ico = conditionToIcon(p.conditionCode, true);
    if (!ico) continue;
    mapped.push({ time: p.time, kind: ico.kind, colorVar: ico.colorVar, condition: p.condition ?? '' });
  }
  const maxIcons = Math.max(1, Math.floor(plotWidth / MIN_ICON_GAP));
  if (mapped.length <= maxIcons) return mapped;
  const step = Math.ceil(mapped.length / maxIcons);
  return mapped.filter((_, i) => i % step === 0);
}

interface CustomizedProps {
  xAxisMap?: Record<string, { scale: (v: unknown) => number; x: number; width: number }>;
  offset?: { top: number; left: number; width: number; height: number };
}

interface WeatherLaneProps {
  points: WeatherHistoryPoint[];
  iconSize?: number;
}

/**
 * Renders as a Recharts <Customized> layer: reads the real x-scale + plot offset
 * and draws each kept icon at its time's pixel-x, in a band just below the top
 * margin. Aligns to the plot (not the axis) automatically.
 */
function LaneLayer({ xAxisMap, offset, points, iconSize = 18 }: CustomizedProps & WeatherLaneProps) {
  if (!xAxisMap || !offset) return null;
  const axis = Object.values(xAxisMap)[0];
  if (!axis) return null;
  const icons = selectLaneIcons(points, offset.width);
  const y = Math.max(0, offset.top - iconSize - 2); // band above the plot
  return (
    <g className="weather-lane" pointerEvents="none">
      {icons.map((ic) => {
        const cx = axis.scale(new Date(ic.time).getTime());
        if (!Number.isFinite(cx)) return null;
        return (
          <foreignObject key={ic.time} x={cx - iconSize / 2} y={y} width={iconSize} height={iconSize}>
            <div style={{ color: ic.colorVar, width: iconSize, height: iconSize }} title={ic.condition}>
              <ConditionGlyph kind={ic.kind} size={iconSize} />
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}

export function WeatherLane({ points, iconSize }: WeatherLaneProps) {
  return <Customized component={(props: CustomizedProps) => (
    <LaneLayer {...props} points={points} iconSize={iconSize} />
  )} />;
}
```
Create `index.ts`:
```ts
export { WeatherLane, selectLaneIcons } from './WeatherLane';
export type { LaneIcon } from './WeatherLane';
```

Note on the x-scale time mapping: TempChart's `XAxis dataKey="time"` is a category/time axis. If `axis.scale(new Date(time).getTime())` returns NaN because the axis is categorical (scale keyed by the string `time` value, not epoch), pass the raw `ic.time` string to `axis.scale(ic.time)` instead. **Determine which during Step 1** by reading the XAxis config; use whichever the scale accepts. (TempChart uses string `time` values as the category dataKey, so `axis.scale(ic.time)` is the likely correct call — adjust the implementation + the cx computation accordingly, and keep `selectLaneIcons` unchanged since it's scale-agnostic.)

- [ ] **Step 5: Run, expect pass.** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/WeatherLane/ && pnpm typecheck && pnpm lint 2>&1 | tail -2` → all green.

- [ ] **Step 6: Commit.**
```bash
git add src/components/WeatherLane/
git commit -m "feat: add WeatherLane Customized layer with overlap step-down"
```

---

## Phase 4 — Integrate into charts

### Task 6: TempChart lane + tooltip condition

**Files:** Modify `dashboard/src/components/TempChart/TempChart.tsx`; Test `dashboard/src/components/TempChart/TempChart.test.tsx`.

- [ ] **Step 1: Read** `TempChart.tsx` fully. It maps `airHistory` into `chartData` (each point keyed by `time`, with `value`/`airValue`). Note the prop `airHistory?: TimeSeriesPoint[]` and the `<Tooltip>`.

- [ ] **Step 2: Add a failing test.** In `TempChart.test.tsx` (recharts is mocked there — add `Customized: () => <div data-testid="customized" />` to the recharts mock if not present), add:
```tsx
it('renders the weather lane when airHistory carries conditions', () => {
  const air = [
    { time: '2025-07-01T12:00:00Z', value: 28, conditionCode: 1000, condition: 'Sunny' },
  ];
  render(<TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} airHistory={air} />);
  expect(screen.getByTestId('customized')).toBeTruthy();
});
```
(Match the file's existing render/mocks; `sampleData` already exists in that test file.)

- [ ] **Step 3: Implement.** In `TempChart.tsx`:
  - Change the prop type: `airHistory?: WeatherHistoryPoint[]` (import it from `../../types`).
  - Import `WeatherLane` from `../WeatherLane`.
  - Inside the `<ComposedChart>` (e.g. just after `<CartesianGrid>`), render the lane:
    ```tsx
    {hasAir && <WeatherLane points={airHistory!} iconSize={18} />}
    ```
  - Fold condition into the tooltip: build a `time → condition` map from `airHistory`, and in the `Tooltip` `labelFormatter`, append the condition for that timestamp when present, e.g.:
    ```tsx
    labelFormatter={(label) => {
      const cond = condByTime.get(String(label));
      const base = new Date(String(label)).toLocaleString();
      return cond ? `${base} · ${cond}` : base;
    }}
    ```
    where `const condByTime = useMemo(() => new Map((airHistory ?? []).filter(p => p.condition).map(p => [p.time, p.condition!])), [airHistory]);`. (The `chartData` x key is the same `time` string, so the tooltip `label` matches.)

- [ ] **Step 4: Run tests + typecheck + lint.**
```bash
source ~/.nvm/nvm.sh && pnpm vitest run src/components/TempChart/ && pnpm typecheck && pnpm lint 2>&1 | tail -2
```
Expected: PASS, clean.

- [ ] **Step 5: Commit.**
```bash
git add src/components/TempChart/
git commit -m "feat: weather lane + condition tooltip in TempChart"
```

---

### Task 7: ChemFocusSheet lane (one icon per reading)

**Files:** Modify `dashboard/src/components/ChemChart/ChemChart.tsx` and/or `dashboard/src/components/ChemFocusSheet/ChemFocusSheet.tsx`; Test the focus sheet test.

- [ ] **Step 1: Read** `ChemChart.tsx` and `ChemFocusSheet.tsx`. The focus sheet renders `ChemChart variant="full"`. The chart already receives `airHistory` (temp). We need a per-reading condition: for each reading, find the weather condition for that reading's **calendar day** from `airHistory` (the `WeatherHistoryPoint[]` the focus sheet has access to).

- [ ] **Step 2: Add a failing test.** In `ChemFocusSheet.test.tsx` (mocks ThemeContext; recharts likely mocked via ChemChart's own test — verify), assert the lane renders when conditions exist:
```tsx
it('renders a weather lane on the full chart when conditions exist', () => {
  // render ChemFocusSheet with readings + an airHistory carrying a condition on a reading's day
  // assert the Customized layer (lane) is present (data-testid="customized" via the recharts mock)
});
```
(Fill in using the file's existing render harness + fixtures; add `Customized` to the recharts mock used by ChemChart's tests if absent.)

- [ ] **Step 3: Implement.**
  - Add an optional prop to `ChemChart`: `weatherByDay?: WeatherHistoryPoint[]` (or reuse `airHistory` it already gets). Build a `day → condition` map (`utc date slice 0..10 → first conditionCode that day`). Note: pick the reading-day's dominant condition — since `airHistory` is already mode-per-bucket, take the condition of the bucket whose day matches; if multiple buckets share a day (e.g. 24h range), use the midday-ish one or the first — simplest correct: the first bucket of that day with a condition.
  - In `ChemChart` when `variant === 'full'`, render `<WeatherLane points={perReadingPoints} iconSize={16} />` where `perReadingPoints` is one synthetic `WeatherHistoryPoint` per reading: `{ time: reading.id, value: 0, conditionCode, condition }` looked up by the reading's day. (The lane keys off `time`/`conditionCode` only; `value` is unused by the lane.) This reuses the existing `<Customized>` alignment so each icon sits over its reading's x-position.
  - `variant === 'mini'` and the chemistry home grid: no lane (guard on `isFull`).

- [ ] **Step 4: Run tests + typecheck + lint.**
```bash
source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemChart/ src/components/ChemFocusSheet/ && pnpm typecheck && pnpm lint 2>&1 | tail -2
```
Expected: PASS, clean.

- [ ] **Step 5: Commit.**
```bash
git add src/components/ChemChart/ src/components/ChemFocusSheet/
git commit -m "feat: weather lane per reading on chemistry focus chart"
```

---

## Phase 5 — Docs + verification

### Task 8: Docs, full gate, PR

**Files:** Modify `CLAUDE.md`.

- [ ] **Step 1: Update CLAUDE.md.** In the dashboard API endpoints list, update the weather/history line:
```markdown
  - `/api/weather/history?range=...` — aggregated air temperature time series; each point also carries the **dominant weather condition** for its bucket (`{ time, value, conditionCode?, condition? }`, mode of `condition_code` over the window). Drives the chart weather-icon lane.
```
And add a short note under the dashboard architecture section:
```markdown
- **Weather lane**: `src/components/WeatherLane/` renders a Recharts `<Customized>` layer of sky-condition icons aligned to the chart x-axis (TempChart for every range; ChemFocusSheet full chart, one icon per reading-day). Condition per bucket is computed server-side (`server/weatherBuckets.ts`, mode per `windowPeriod`). Fail-silent when condition data is absent.
```

- [ ] **Step 2: Full local gate (mirrors CI).**
```bash
source ~/.nvm/nvm.sh && nvm use 24 >/dev/null 2>&1
pnpm install --frozen-lockfile
pnpm lint            # exit 0
pnpm typecheck       # clean
pnpm test:coverage   # all pass, coverage >= 80%
rm -rf dist && find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete; pnpm build   # exit 0
```
Fix anything that fails before proceeding.

- [ ] **Step 3: Docker build smoke.**
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor && docker build -t pm-weatherlane ./dashboard && docker rmi pm-weatherlane
```
Expected: BUILD succeeds.

- [ ] **Step 4: Commit docs.**
```bash
git add CLAUDE.md
git commit -m "docs: weather condition lane + history-endpoint condition fields"
```

- [ ] **Step 5: Push + PR (gated by CI).**
```bash
git push -u origin <branch>
gh pr create --title "Weather condition lane on temp + chemistry charts" --body "<summary + test plan>"
gh pr checks --watch   # dashboard + weather + docker must pass
```

---

## Self-review notes

- **Spec coverage:** mode-per-bucket condition + `bucketConditions` reusing `windowPeriod` → Tasks 1–2; `WeatherHistoryPoint` + `usePoolData` widening → Task 3; `conditionToIcon` + glyphs → Task 4; `<Customized>` lane with overlap step-down + fail-silent → Task 5; TempChart lane + tooltip condition → Task 6; ChemFocusSheet per-reading lane (no mini/home lane) → Task 7; docs + full gate + Docker + PR → Task 8. All spec sections map.
- **Type consistency:** `WeatherHistoryPoint` defined once in `server/influx.ts` (server shape) and `src/types.ts` (client, extends `TimeSeriesPoint`) with identical fields (`time/value/conditionCode?/condition?`); `bucketConditions`/`ConditionSample`/`BucketCondition` defined in Task 1 and consumed in Task 2; `conditionToIcon`/`ConditionKind`/`ConditionGlyph` defined in Task 4 and consumed in Task 5; `selectLaneIcons`/`WeatherLane`/`LaneIcon` defined in Task 5 and consumed in Tasks 6–7.
- **No placeholders:** every code step has complete code; the only `<branch>`/`<summary>` placeholders are git/gh args filled at runtime.
- **Investigate-then-implement flags:** Task 5 Step 1 + Step 4 note (the x-scale call — `axis.scale(epoch)` vs `axis.scale(timeString)`) and Task 7 (per-reading-day mapping) are explicit reads-first because the exact Recharts scale behavior + the focus-sheet harness must be confirmed against the real code; each states the concrete change once determined.
- **Adaptation note:** `WeatherLane`'s render path (the `<Customized>` SVG layer) is verified via the pure `selectLaneIcons` unit tests + a presence render (recharts mocked); full pixel alignment is confirmed in the live Docker/dev app, not jsdom — matching how the existing chart tests treat recharts.
