# Pool Maintenance Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log pool maintenance events (chemical / water / backwash / note) and surface them as kind-colored markers on the temperature + chemistry charts, with a Log book — a structural twin of the shipped swim feature.

**Architecture:** New InfluxDB `event` measurement (timestamp = event date+time in TIMEZONE = stable id; `kind` + per-kind fields). `/api/events` GET (public) + POST/PUT/DELETE (shared chemistry auth + limiter). On the client, an `EventLane` Recharts child (mirror of `SwimLane`) draws square kind-colored chips; an `OverlayPill` `events` variant toggles them; a four-kind `EventLogForm` + `EventKindChooser` + `LogBookSheet` (mirrors of the swim log flow + history) handle logging, all on the Chemistry tab. The temperature chart shows event markers + the Events pill only.

**Tech Stack:** Express + `@influxdata/influxdb-client`, React 19, recharts, TypeScript, Vitest, CSS Modules. Run all dashboard commands prefixed with `source ~/.nvm/nvm.sh &&` from `dashboard/`.

**Design spec:** `docs/superpowers/specs/2026-06-05-maintenance-events-design.md`
**Prototype:** `unzip -o ~/Desktop/events.zip -d /tmp/events_handoff` → `design_handoff_events/` (`events.jsx`, `events-data.js`, `events-app.jsx`, `Pool Events - Maintenance Log.html` = exact CSS).
**Template = the shipped swim feature.** This plan frequently says "copy `<swim file>` and adapt." Those files are on `main` and are the source of truth:
`dashboard/server/swim.ts`, `swim.test.ts`; `server/influx.ts` (`querySwims`/`writeSwim`); `server/routes.ts` (`/api/swims`); `src/components/SwimLane/*`; `src/components/SwimLogFlow/*`; `src/components/SwimHistorySheet/*`; `src/hooks/useSwimData.ts`; `src/utils/swim.ts`; `src/constants/swim.ts`; `src/components/OverlayPill/*`; and the wiring in `src/App.tsx`, `src/components/ChemistryTab/ChemistryTab.tsx`, `ChemChart/ChemChart.tsx`, `ChemCard/ChemCard.tsx`, `ChemFocusSheet/ChemFocusSheet.tsx`, `TempChart/TempChart.tsx`.

---

## File Structure

**New — server:** `server/event.ts`, `server/event.test.ts`.
**New — client:** `src/constants/events.ts`; `src/utils/events.ts` (+`.test.ts`); `src/hooks/useEventData.ts` (+`.test.ts`); `src/components/EventLane/{EventLane.tsx,EventLane.module.css,index.ts}` (+`EventLane.render.test.tsx`); `src/components/EventLogFlow/{EventLogFlow.tsx,EventLogForm.tsx,EventKindChooser.tsx,EventLogFlow.module.css,index.ts}` (+`EventLogForm.test.tsx`); `src/components/LogBookSheet/{LogBookSheet.tsx,LogBookSheet.module.css,index.ts}` (+`LogBookSheet.test.tsx`).
**Modified:** `src/types.ts`; `server/influx.ts`; `server/routes.ts`; `server/routes.integration.test.ts`; `src/components/OverlayPill/{OverlayPill.tsx,OverlayPill.module.css,OverlayPill.test.tsx}`; `src/components/ChemChart/ChemChart.tsx`; `src/components/ChemCard/ChemCard.tsx`; `src/components/ChemFocusSheet/ChemFocusSheet.tsx`; `src/components/ChemistryTab/ChemistryTab.tsx` (+ `.module.css`); `src/components/TempChart/TempChart.tsx`; `src/App.tsx`.

---

## Phase A — Backend

### Task A1: `EventKind` + `PoolEvent` types

**Files:** Modify `dashboard/src/types.ts`

- [ ] **Step 1: Append to `src/types.ts`:**

```ts
export type EventKind = 'chemical' | 'water' | 'backwash' | 'note';

export interface PoolEvent {
  id: string;        // ISO-UTC instant of the point (stable id)
  date: string;      // YYYY-MM-DD in app timezone
  time: string;      // HH:mm 24h in app timezone
  kind: EventKind;
  product?: string;  // chemical
  amount?: number;   // chemical | water
  unit?: string;     // chemical: oz|lb|gal · water: in|gal|min
  note?: string;     // note
}
```

- [ ] **Step 2:** `source ~/.nvm/nvm.sh && pnpm typecheck` → PASS
- [ ] **Step 3:** `git add dashboard/src/types.ts && git commit -m "feat(events): add EventKind + PoolEvent types"`

---

### Task A2: Event body validation (`server/event.ts`)

**Files:** Create `dashboard/server/event.ts`, `dashboard/server/event.test.ts`

- [ ] **Step 1: Write the failing test** `server/event.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateEventBody } from './event';

const base = { date: '2026-05-20', time: '14:30' };

describe('validateEventBody', () => {
  it('accepts a chemical event', () => {
    const r = validateEventBody({ ...base, kind: 'chemical', product: 'Liquid chlorine', amount: 48, unit: 'oz' });
    expect(r).toEqual({ ok: true, ...base, kind: 'chemical', product: 'Liquid chlorine', amount: 48, unit: 'oz' });
  });
  it('trims the product and drops fields not for the kind', () => {
    const r = validateEventBody({ ...base, kind: 'water', amount: 2, unit: 'in', product: 'ignored', note: 'ignored' });
    expect(r).toEqual({ ok: true, ...base, kind: 'water', amount: 2, unit: 'in' });
  });
  it('accepts a backwash with no payload', () => {
    expect(validateEventBody({ ...base, kind: 'backwash' })).toEqual({ ok: true, ...base, kind: 'backwash' });
  });
  it('accepts a note', () => {
    expect(validateEventBody({ ...base, kind: 'note', note: ' did a thing ' })).toEqual({ ok: true, ...base, kind: 'note', note: 'did a thing' });
  });
  it('rejects an unknown kind', () => {
    expect(validateEventBody({ ...base, kind: 'nope' }).ok).toBe(false);
  });
  it('rejects an invalid date / time', () => {
    expect(validateEventBody({ date: 'x', time: '14:30', kind: 'backwash' }).ok).toBe(false);
    expect(validateEventBody({ date: '2026-05-20', time: '99:99', kind: 'backwash' }).ok).toBe(false);
  });
  it('chemical: rejects missing product / amount<=0 / bad unit', () => {
    expect(validateEventBody({ ...base, kind: 'chemical', amount: 1, unit: 'oz' }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'chemical', product: 'x', amount: 0, unit: 'oz' }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'chemical', product: 'x', amount: 1, unit: 'ml' }).ok).toBe(false);
  });
  it('chemical: rejects a product longer than 64 chars', () => {
    expect(validateEventBody({ ...base, kind: 'chemical', product: 'x'.repeat(65), amount: 1, unit: 'oz' }).ok).toBe(false);
  });
  it('water: rejects amount<=0 / bad unit', () => {
    expect(validateEventBody({ ...base, kind: 'water', amount: 0, unit: 'in' }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'water', amount: 1, unit: 'oz' }).ok).toBe(false);
  });
  it('note: rejects empty / oversized text', () => {
    expect(validateEventBody({ ...base, kind: 'note', note: '   ' }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'note', note: 'x'.repeat(501) }).ok).toBe(false);
  });
});
```

- [ ] **Step 2:** `source ~/.nvm/nvm.sh && pnpm vitest run server/event.test.ts` → FAIL (module not found)

- [ ] **Step 3: Create `server/event.ts`:**

```ts
import { isValidTime } from './chemistry.js';

export const EVENT_KINDS = ['chemical', 'water', 'backwash', 'note'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const CHEM_UNITS = ['oz', 'lb', 'gal'] as const;
export const WATER_UNITS = ['in', 'gal', 'min'] as const;
export const MAX_PRODUCT_LEN = 64;
export const MAX_NOTE_LEN = 500;

export type ValidatedEvent =
  | { ok: true; date: string; time: string; kind: EventKind; product?: string; amount?: number; unit?: string; note?: string }
  | { ok: false; error: string };

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function validateEventBody(body: unknown): ValidatedEvent {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body must be an object' };
  const b = body as Record<string, unknown>;

  if (typeof b.date !== 'string' || Number.isNaN(new Date(b.date).getTime())) {
    return { ok: false, error: 'Invalid or missing date' };
  }
  if (!isValidTime(b.time)) return { ok: false, error: 'Invalid or missing time' };
  if (typeof b.kind !== 'string' || !(EVENT_KINDS as readonly string[]).includes(b.kind)) {
    return { ok: false, error: 'Invalid or missing kind' };
  }
  const kind = b.kind as EventKind;
  const date = b.date, time = b.time as string;

  if (kind === 'chemical') {
    const product = typeof b.product === 'string' ? b.product.trim() : '';
    if (!product) return { ok: false, error: 'Product is required' };
    if (product.length > MAX_PRODUCT_LEN) return { ok: false, error: 'Product is too long' };
    const amount = num(b.amount);
    if (amount === null || amount <= 0) return { ok: false, error: 'Amount must be a positive number' };
    if (typeof b.unit !== 'string' || !(CHEM_UNITS as readonly string[]).includes(b.unit)) {
      return { ok: false, error: 'Invalid unit' };
    }
    return { ok: true, date, time, kind, product, amount, unit: b.unit };
  }
  if (kind === 'water') {
    const amount = num(b.amount);
    if (amount === null || amount <= 0) return { ok: false, error: 'Amount must be a positive number' };
    if (typeof b.unit !== 'string' || !(WATER_UNITS as readonly string[]).includes(b.unit)) {
      return { ok: false, error: 'Invalid unit' };
    }
    return { ok: true, date, time, kind, amount, unit: b.unit };
  }
  if (kind === 'note') {
    const note = typeof b.note === 'string' ? b.note.trim() : '';
    if (!note) return { ok: false, error: 'Note text is required' };
    if (note.length > MAX_NOTE_LEN) return { ok: false, error: 'Note is too long' };
    return { ok: true, date, time, kind, note };
  }
  return { ok: true, date, time, kind: 'backwash' }; // backwash: no payload
}
```

- [ ] **Step 4:** `source ~/.nvm/nvm.sh && pnpm vitest run server/event.test.ts` → PASS
- [ ] **Step 5:** `git add dashboard/server/event.ts dashboard/server/event.test.ts && git commit -m "feat(events): per-kind event body validation"`

---

### Task A3: `queryEvents` + `writeEvent` (`server/influx.ts`)

**Files:** Modify `dashboard/server/influx.ts`, `dashboard/server/influx.test.ts`

Reference the existing `querySwims`/`writeSwim` (in `influx.ts` ~line 516) and the existing
swim tests in `influx.test.ts`.

- [ ] **Step 1: Add failing tests** to `server/influx.test.ts`. Add `queryEvents, writeEvent` to the dynamic import line, then append:

```ts
describe('queryEvents', () => {
  it('maps each point to id + derived date/time + kind payload', async () => {
    queryApiStub.collectRows.mockResolvedValueOnce([
      { _time: '2026-05-20T18:30:00.000Z', kind: 'chemical', product: 'Liquid chlorine', amount: 48, unit: 'oz' },
      { _time: '2026-05-21T13:00:00.000Z', kind: 'backwash' },
    ]);
    const out = await queryEvents('season', 'America/New_York');
    expect(out).toEqual([
      { id: '2026-05-20T18:30:00.000Z', date: '2026-05-20', time: '14:30', kind: 'chemical', product: 'Liquid chlorine', amount: 48, unit: 'oz' },
      { id: '2026-05-21T13:00:00.000Z', date: '2026-05-21', time: '09:00', kind: 'backwash' },
    ]);
  });
  it('filters the event measurement', async () => {
    queryApiStub.collectRows.mockResolvedValueOnce([]);
    await queryEvents('season', 'America/New_York');
    expect(queryApiStub.collectRows.mock.calls.at(-1)![0]).toContain('_measurement == "event"');
  });
});

describe('writeEvent', () => {
  it('writes a chemical point and returns the ISO id', async () => {
    const id = await writeEvent({ date: '2026-05-20', time: '14:30', kind: 'chemical', product: 'Cal-hypo', amount: 16, unit: 'oz' }, 'America/New_York');
    expect(writeApiStub.writePoint).toHaveBeenCalledOnce();
    expect(writeApiStub.flush).toHaveBeenCalledOnce();
    expect(id).toBe('2026-05-20T18:30:00.000Z');
  });
});
```

- [ ] **Step 2:** `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts` → FAIL

- [ ] **Step 3: Implement in `server/influx.ts`** (after the swim functions). `Point`, `getQueryApi`, `getWriteApi`, `bucket`, `parseRange`, `dateTimeToUtc`, `utcToZonedParts` already exist.

```ts
export type EventKind = 'chemical' | 'water' | 'backwash' | 'note'
export interface PoolEvent {
  id: string
  date: string
  time: string
  kind: EventKind
  product?: string
  amount?: number
  unit?: string
  note?: string
}

export async function queryEvents(
  range: string,
  timeZone = process.env.TIMEZONE ?? 'America/New_York',
): Promise<PoolEvent[]> {
  const api = getQueryApi()
  const query = `
    from(bucket: "${bucket}")
      |> range(${parseRange(range)})
      |> filter(fn: (r) => r._measurement == "event")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `
  const rows = await api.collectRows<Record<string, unknown>>(query)
  return rows.map((row) => {
    const id = row._time as string
    const { date, time } = utcToZonedParts(id, timeZone)
    const ev: PoolEvent = { id, date, time, kind: row.kind as EventKind }
    if (typeof row.product === 'string') ev.product = row.product
    if (typeof row.amount === 'number') ev.amount = row.amount
    if (typeof row.unit === 'string') ev.unit = row.unit
    if (typeof row.note === 'string') ev.note = row.note
    return ev
  })
}

export async function writeEvent(
  input: { date: string; time: string; kind: EventKind; product?: string; amount?: number; unit?: string; note?: string },
  timeZone = process.env.TIMEZONE ?? 'America/New_York',
): Promise<string> {
  const writeApi = getWriteApi()
  const when = dateTimeToUtc(input.date, input.time, timeZone)
  const point = new Point('event').timestamp(when).stringField('kind', input.kind)
  if (input.product !== undefined) point.stringField('product', input.product)
  if (input.amount !== undefined) point.floatField('amount', input.amount)
  if (input.unit !== undefined) point.stringField('unit', input.unit)
  if (input.note !== undefined) point.stringField('note', input.note)
  writeApi.writePoint(point)
  await writeApi.flush()
  return when.toISOString()
}
```

- [ ] **Step 4:** `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts` → PASS
- [ ] **Step 5:** `git add dashboard/server/influx.ts dashboard/server/influx.test.ts && git commit -m "feat(events): queryEvents + writeEvent influx functions"`

---

### Task A4: `/api/events` routes

**Files:** Modify `dashboard/server/routes.ts`, `dashboard/server/routes.integration.test.ts`

Mirror the `/api/swims` routes exactly.

- [ ] **Step 1: Add failing integration tests** to `server/routes.integration.test.ts`. Extend the `vi.mock('./influx.js', …)` factory with `queryEvents: vi.fn(async () => [])`, `writeEvent: vi.fn(async () => '2026-05-20T18:30:00.000Z')`. Add `queryEvents as _queryEvents, writeEvent as _writeEvent` to the `import … from './influx.js'` line (underscore-prefixed to satisfy lint, matching how `querySwims`/`writeSwim` are imported there). Then append:

```ts
describe('/api/events', () => {
  const auth = 'Basic ' + Buffer.from('tester:secret').toString('base64');
  it('GET is public and returns an array', async () => {
    const res = await fetch(`${base}/api/events?range=season`);
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
  it('GET rejects an injection-ish range with 400', async () => {
    const res = await fetch(`${base}/api/events?range=${encodeURIComponent('30d) |> evil')}`);
    expect(res.status).toBe(400);
  });
  it('POST without auth is 401', async () => {
    const res = await fetch(`${base}/api/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ date: '2026-05-20', time: '14:30', kind: 'backwash' }),
    });
    expect(res.status).toBe(401);
  });
  it('POST with auth + valid chemical is 201 with id', async () => {
    const res = await fetch(`${base}/api/events`, {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ date: '2026-05-20', time: '14:30', kind: 'chemical', product: 'Cal-hypo', amount: 16, unit: 'oz' }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe('2026-05-20T18:30:00.000Z');
  });
  it('POST with auth + invalid body is 400', async () => {
    const res = await fetch(`${base}/api/events`, {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ date: '2026-05-20', time: '14:30', kind: 'chemical' }),
    });
    expect(res.status).toBe(400);
  });
  it('DELETE with a valid id + auth is 200', async () => {
    const id = encodeURIComponent('2026-05-20T18:30:00.000Z');
    const res = await fetch(`${base}/api/events?id=${id}`, { method: 'DELETE', headers: { Authorization: auth, 'CF-Connecting-IP': nextIp() } });
    expect(res.status).toBe(200);
    expect(deletePoint).toHaveBeenCalledWith('2026-05-20T18:30:00.000Z', 'event');
  });
});
```

(`nextIp()`, `deletePoint`, and the unique-IP rate-limit helper already exist in this file from the swim work. Keep authenticated write attempts modest — the limiter is shared.)

- [ ] **Step 2:** `source ~/.nvm/nvm.sh && pnpm vitest run server/routes.integration.test.ts` → FAIL (404)

- [ ] **Step 3: Implement routes in `server/routes.ts`.** Add to the influx import: `queryEvents, writeEvent`. Add `import { validateEventBody } from './event.js'`. Add a body-parser line `router.use('/api/events', express.json())` next to the swim one. Add (after the swim routes):

```ts
router.get('/api/events', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : 'season'
    if (req.query.range !== undefined && !isValidRange(range)) { res.status(400).json({ error: 'Invalid range' }); return }
    res.json(await queryEvents(range))
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})

router.post('/api/events', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const result = validateEventBody(req.body)
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    const { date, time, ...rest } = result
    const id = await writeEvent({ date, time, ...rest })
    res.status(201).json({ id })
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})

router.put('/api/events', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const id = (req.body as { id?: unknown })?.id
    if (!isValidId(id)) { res.status(400).json({ error: 'Invalid or missing id' }); return }
    const result = validateEventBody(req.body)
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    await deletePoint(id as string, 'event')
    const { date, time, ...rest } = result
    const newId = await writeEvent({ date, time, ...rest })
    res.status(200).json({ id: newId })
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})

router.delete('/api/events', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!isValidId(id)) { res.status(400).json({ error: 'Invalid or missing id' }); return }
    await deletePoint(id, 'event')
    res.status(200).json({ ok: true })
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})
```

Note: `result` from `validateEventBody` includes `ok: true`; destructuring `{ date, time, ...rest }` leaves `ok` and `kind`+payload in `rest`. Pass `kind`+payload via `rest` but NOT `ok` — adjust to `const { ok, date, time, ...rest } = result` so `ok` is excluded. Use:

```ts
    const { ok: _ok, date, time, ...rest } = result
    const id = await writeEvent({ date, time, ...rest })
```

(apply the same `{ ok: _ok, … }` exclusion in both POST and PUT).

- [ ] **Step 4:** `source ~/.nvm/nvm.sh && pnpm vitest run server/routes.integration.test.ts && pnpm typecheck` → PASS
- [ ] **Step 5:** `git add dashboard/server/routes.ts dashboard/server/routes.integration.test.ts && git commit -m "feat(events): /api/events GET/POST/PUT/DELETE routes"`

---

## Phase B — Client data layer

### Task B1: Constants (`constants/events.ts`)

**Files:** Create `dashboard/src/constants/events.ts`

- [ ] **Step 1: Create the file** (ported from prototype `events-data.js`):

```ts
import type { EventKind } from '../types';

export interface EventKindMeta { key: EventKind; label: string; icon: string; color: string; tint: string; noun: string }

export const EVENT_KINDS: Record<EventKind, EventKindMeta> = {
  chemical: { key: 'chemical', label: 'Chemical', icon: '🧪', color: '#b45309', tint: 'rgba(180,83,9,0.13)',  noun: 'Chemical addition' },
  water:    { key: 'water',    label: 'Water',    icon: '💧', color: '#0369a1', tint: 'rgba(3,105,161,0.12)',  noun: 'Water addition' },
  backwash: { key: 'backwash', label: 'Backwash', icon: '🔄', color: '#0f766e', tint: 'rgba(15,118,110,0.12)', noun: 'Filter backwash' },
  note:     { key: 'note',     label: 'Note',     icon: '📝', color: '#475569', tint: 'rgba(71,85,105,0.14)',  noun: 'Note' },
};
export const EVENT_KIND_ORDER: EventKind[] = ['chemical', 'water', 'backwash', 'note'];
export const CHEM_PRODUCTS = ['Liquid chlorine', 'Cal-hypo', 'Muriatic acid', 'Soda ash', 'Baking soda', 'Stabilizer (CYA)', 'Calcium chloride', 'Algaecide'];
export const CHEM_UNITS = ['oz', 'lb', 'gal'];
export const WATER_UNITS = ['in', 'gal', 'min'];
```

- [ ] **Step 2:** `source ~/.nvm/nvm.sh && pnpm typecheck` → PASS
- [ ] **Step 3:** `git add dashboard/src/constants/events.ts && git commit -m "feat(events): kind metadata + product/unit constants"`

---

### Task B2: Pure helpers (`utils/events.ts`)

**Files:** Create `dashboard/src/utils/events.ts`, `dashboard/src/utils/events.test.ts`

- [ ] **Step 1: Write the failing test** `src/utils/events.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sortedEvents, summary, whenLabel, countByKind } from './events';
import type { PoolEvent } from '../types';

const ev = (id: string, date: string, time: string, extra: Partial<PoolEvent>): PoolEvent =>
  ({ id, date, time, kind: 'backwash', ...extra });

const data: PoolEvent[] = [
  ev('1', '2026-05-10', '12:00', { kind: 'chemical', product: 'Cal-hypo', amount: 16, unit: 'oz' }),
  ev('2', '2026-05-16', '14:00', { kind: 'water', amount: 2, unit: 'in' }),
  ev('3', '2026-05-16', '17:00', { kind: 'backwash' }),
  ev('4', '2026-05-18', '09:00', { kind: 'note', note: 'cleaned skimmer' }),
];

describe('sortedEvents', () => {
  it('orders newest first, non-mutating', () => {
    const copy = [...data];
    expect(sortedEvents(data).map((x) => x.id)).toEqual(['4', '3', '2', '1']);
    expect(data).toEqual(copy);
  });
});
describe('summary', () => {
  it('summarizes by kind', () => {
    expect(summary(data[0])).toBe('Cal-hypo · 16 oz');
    expect(summary(data[1])).toBe('Added water · 2 in');
    expect(summary(data[2])).toBe('Backwashed the filter');
    expect(summary(data[3])).toBe('cleaned skimmer');
  });
});
describe('countByKind', () => {
  it('counts per kind', () => {
    expect(countByKind(data)).toEqual({ chemical: 1, water: 1, backwash: 1, note: 1 });
  });
});
describe('whenLabel', () => {
  it('returns a non-empty label', () => {
    expect(whenLabel(data[0]).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2:** `source ~/.nvm/nvm.sh && pnpm vitest run src/utils/events.test.ts` → FAIL

- [ ] **Step 3: Implement `src/utils/events.ts`:**

```ts
import type { PoolEvent } from '../types';

export function sortedEvents(list: PoolEvent[]): PoolEvent[] {
  return [...list].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

export function summary(ev: PoolEvent): string {
  switch (ev.kind) {
    case 'chemical': return `${ev.product} · ${ev.amount} ${ev.unit}`;
    case 'water': return `Added water · ${ev.amount} ${ev.unit}`;
    case 'backwash': return 'Backwashed the filter';
    case 'note': return ev.note ?? '';
    default: return '';
  }
}

export function whenLabel(ev: PoolEvent): string {
  const d = new Date(`${ev.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const t = new Date(`2000-01-01T${ev.time}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${d} · ${t}`;
}

export function countByKind(list: PoolEvent[]): Record<PoolEvent['kind'], number> {
  const c = { chemical: 0, water: 0, backwash: 0, note: 0 };
  for (const e of list) c[e.kind] += 1;
  return c;
}
```

- [ ] **Step 4:** `source ~/.nvm/nvm.sh && pnpm vitest run src/utils/events.test.ts` → PASS
- [ ] **Step 5:** `git add dashboard/src/utils/events.ts dashboard/src/utils/events.test.ts && git commit -m "feat(events): pure helpers (sorted/summary/whenLabel/countByKind)"`

---

### Task B3: `useEventData` hook

**Files:** Create `dashboard/src/hooks/useEventData.ts`, `dashboard/src/hooks/useEventData.test.ts`

Copy `src/hooks/useSwimData.ts` + `useSwimData.test.ts` and swap swims→events, `/api/swims`→`/api/events`, `SwimSession`→`PoolEvent`.

- [ ] **Step 1: Write `src/hooks/useEventData.test.ts`** (mirror `useSwimData.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEventData } from './useEventData';

const events = [{ id: '1', date: '2026-05-20', time: '14:30', kind: 'backwash' }];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => events })) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useEventData', () => {
  it('fetches events for the range', async () => {
    const { result } = renderHook(() => useEventData('season', 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual(events);
    expect(fetch).toHaveBeenCalledWith('/api/events?range=season');
  });
  it('returns [] on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => [] })) as unknown as typeof fetch);
    const { result } = renderHook(() => useEventData('season', 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual([]);
  });
});
```

- [ ] **Step 2:** `source ~/.nvm/nvm.sh && pnpm vitest run src/hooks/useEventData.test.ts` → FAIL

- [ ] **Step 3: Implement `src/hooks/useEventData.ts`** (copy `useSwimData.ts`, rename):

```ts
import { useState, useEffect, useCallback } from 'react';
import type { PoolEvent } from '../types';

export interface UseEventDataReturn {
  events: PoolEvent[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useEventData(range: string, refreshInterval = 30000): UseEventDataReturn {
  const [events, setEvents] = useState<PoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/events?range=${encodeURIComponent(range)}`);
      const data = res.ok ? ((await res.json()) as PoolEvent[]) : [];
      setEvents(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchData();
    if (!refreshInterval) return;
    const id = setInterval(fetchData, refreshInterval);
    return () => clearInterval(id);
  }, [fetchData, refreshInterval]);

  return { events, loading, error, refetch: fetchData };
}
```

- [ ] **Step 4:** `source ~/.nvm/nvm.sh && pnpm vitest run src/hooks/useEventData.test.ts` → PASS
- [ ] **Step 5:** `git add dashboard/src/hooks/useEventData.ts dashboard/src/hooks/useEventData.test.ts && git commit -m "feat(events): useEventData hook"`

---

## Phase C — `EventLane` overlay

### Task C1: `EventLane` + chip marker

**Files:** Create `dashboard/src/components/EventLane/{EventLane.tsx,EventLane.module.css,index.ts}`

Copy `src/components/SwimLane/SwimLane.tsx` and adapt. The mechanics (hooks, off-domain skip,
index/scale x, interpolated y, compact box geometry) are IDENTICAL — change only the marker body
(square kind chip, per-kind color) and the data prop (`events` instead of `swims`).

- [ ] **Step 1: Create `EventLane.tsx`:**

```tsx
import { useXAxisScale, useYAxisScale, usePlotArea } from 'recharts';
import type { PoolEvent } from '../../types';
import { interpolateValueAt, indexFractionAt, type ChartPointTV } from '../../utils/markerPositions';
import { EVENT_KINDS } from '../../constants/events';
import styles from './EventLane.module.css';

interface EventLaneProps {
  events: PoolEvent[];
  series: ChartPointTV[];
  xMode: 'index' | 'scale';
  iconSize?: number;
  yAxisId?: string | number;
  compact?: boolean;
}

function eventEpoch(e: PoolEvent): number { return new Date(e.id).getTime(); }

export function EventLane({ events, series, xMode, iconSize = 23, yAxisId, compact = false }: EventLaneProps) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale(yAxisId);
  const plot = usePlotArea();
  if (!xScale || !yScale || !plot || series.length === 0) return null;

  const n = series.length;
  const FOOT_R = 3;
  const markerH = compact ? iconSize : iconSize + 40;
  const tMin = series[0].t;
  const tMax = series[n - 1].t;

  return (
    <g className={styles.lane} pointerEvents="none">
      {events.map((ev) => {
        const e = eventEpoch(ev);
        if (e < tMin || e > tMax) return null;
        const yVal = interpolateValueAt(series, e);
        if (yVal == null) return null;
        const cy = yScale(yVal) as number;
        if (!Number.isFinite(cy)) return null;

        let cx: number | undefined;
        if (xMode === 'index') {
          const frac = indexFractionAt(series, e);
          if (frac == null) return null;
          cx = plot.x + (frac / (n - 1)) * plot.width;
        } else {
          cx = xScale(e) as number;
        }
        if (cx == null || !Number.isFinite(cx)) return null;

        const k = EVENT_KINDS[ev.kind];
        const boxW = compact ? iconSize : iconSize + 2;
        return (
          <foreignObject key={ev.id} x={cx - boxW / 2} y={compact ? cy - markerH / 2 : cy + FOOT_R - markerH} width={boxW} height={markerH}>
            <div className={styles.marker} style={{ color: k.color }}>
              {!compact && <span className={styles.stem} aria-hidden="true" />}
              {!compact && <span className={styles.foot} aria-hidden="true" />}
              <span className={`${styles.chip} ${compact ? styles.chipCompact : ''}`} style={{ background: k.tint, borderColor: k.color }} title={k.noun}>
                <span className={styles.ico}>{k.icon}</span>
              </span>
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}
```

- [ ] **Step 2: Create `EventLane.module.css`** — copy `SwimLane.module.css` `.lane`/`.marker`/`.stem`/`.foot` rules verbatim, then replace the bubble rules with the square chip. The chip is positioned like the swim chrome (full: `bottom: 23px`; compact: centered). Reference the prototype `.ev-chip`/`.ev-ico` CSS in `Pool Events - Maintenance Log.html`. Minimum:

```css
.lane {}
.marker { position: relative; width: 100%; height: 100%; }

/* full-pin chip floats above the 18px stem (3 + 18 + 2 = 23px from box bottom) */
.chip {
  position: absolute; left: 50%; bottom: 23px; transform: translateX(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 23px; height: 23px; border-radius: 7px; border: 1.5px solid currentColor;
  box-shadow: var(--shadow-sm); line-height: 1;
}
/* compact: centered on the curve point, smaller, no stem/foot */
.chipCompact {
  bottom: auto; top: 50%; transform: translate(-50%, -50%);
  width: 17px; height: 17px; border-radius: 6px;
}
.ico { font-size: 12px; line-height: 1; }
.chipCompact .ico { font-size: 9px; }

.stem { position: absolute; left: 50%; bottom: 3px; transform: translateX(-50%); display: block; width: 1.5px; height: 18px; background: currentColor; opacity: 0.45; }
.foot { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); display: block; width: 6px; height: 6px; border-radius: 50%; background: var(--color-surface); border: 2px solid currentColor; box-sizing: border-box; }
```

(Cross-check exact sizes/offsets against the prototype `<style>` and tune so the chip's foot lands on the curve point.)

- [ ] **Step 3: Create `index.ts`:** `export { EventLane } from './EventLane';`
- [ ] **Step 4:** `source ~/.nvm/nvm.sh && pnpm typecheck && pnpm lint` → PASS (0 errors)
- [ ] **Step 5:** `git add dashboard/src/components/EventLane && git commit -m "feat(events): EventLane recharts overlay with per-kind chips"`

---

## Phase D — Log flow

### Task D1: `OverlayPill` `events` variant

**Files:** Modify `dashboard/src/components/OverlayPill/{OverlayPill.tsx,OverlayPill.module.css,OverlayPill.test.tsx}`

The pill currently supports `pool|air|swim`. Add `events` (🧰 glyph, teal active tint).

- [ ] **Step 1: In `OverlayPill.tsx`** widen the variant union to `'pool' | 'air' | 'swim' | 'events'`; extend the active-class map and swatch branch:

```tsx
  const activeClass = active
    ? { pool: styles.poolOn, air: styles.airOn, swim: styles.swimOn, events: styles.eventsOn }[variant]
    : '';
  // ...in the JSX, the indicator:
      {variant === 'swim' || variant === 'events' ? (
        <span className={styles.swatchSwim} aria-hidden="true">{variant === 'events' ? '🧰' : '🦦'}</span>
      ) : (
        <span className={variant === 'pool' ? styles.swatchPool : styles.swatchAir} aria-hidden="true" />
      )}{' '}
```

- [ ] **Step 2: In `OverlayPill.module.css`** add:

```css
.eventsOn {
  background: rgba(15, 118, 110, 0.12);
  border-color: rgba(15, 118, 110, 0.35);
  color: #0f766e;
}
```

- [ ] **Step 3: In `OverlayPill.test.tsx`** add a case:

```tsx
  it('renders the events variant with a 🧰 swatch and reflects active', () => {
    const onToggle = vi.fn();
    render(<OverlayPill label="Events" variant="events" active onToggle={onToggle} />);
    const btn = screen.getByRole('button', { name: /events/i });
    expect(btn).toHaveTextContent('🧰');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalled();
  });
```

(match the file's existing imports/idioms).

- [ ] **Step 4:** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/OverlayPill && pnpm typecheck` → PASS
- [ ] **Step 5:** `git add dashboard/src/components/OverlayPill && git commit -m "feat(events): OverlayPill events variant"`

---

### Task D2: `EventLogForm` (all four kinds)

**Files:** Create `dashboard/src/components/EventLogFlow/EventLogForm.tsx`, `EventLogFlow.module.css`, `EventLogForm.test.tsx`

Port the prototype `EventLogForm` (in `events.jsx`) to TSX. Model the authed fetch + 401 handling
on the shipped `src/components/SwimLogFlow/SwimLogForm.tsx`. Render inside the shared `BottomSheet`.

- [ ] **Step 1: Write a failing smoke test** `EventLogForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EventLogForm } from './EventLogForm';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: 'x' }) })) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const noop = () => {};

describe('EventLogForm', () => {
  it('backwash needs no payload — Log it is enabled and POSTs kind=backwash', async () => {
    render(<EventLogForm kind="backwash" authHeader="Basic x" onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    const btn = screen.getByRole('button', { name: /log it/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/events', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![1].body);
    expect(body.kind).toBe('backwash');
  });
  it('note Log it is disabled until text entered', () => {
    render(<EventLogForm kind="note" authHeader="Basic x" onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    expect(screen.getByRole('button', { name: /log it/i })).toBeDisabled();
  });
  it('water posts amount + unit', async () => {
    render(<EventLogForm kind="water" authHeader="Basic x" onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /log it/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![1].body);
    expect(body).toMatchObject({ kind: 'water', amount: 2 });
    expect(['in', 'gal', 'min']).toContain(body.unit);
  });
});
```

- [ ] **Step 2:** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/EventLogFlow/EventLogForm.test.tsx` → FAIL

- [ ] **Step 3: Implement `EventLogForm.tsx`.** One component, fields switch on `kind`. Props
`{ open?: true; kind: EventKind; authHeader: string; editEntry?: PoolEvent | null; onSaved; onDeleted; onClose; onAuthExpired }`. Lazy `useState` initializers for date/time (`new Date()` once), per the swim-form fix. Build the body by kind and `fetch('/api/events', { method: editing?'PUT':'POST', headers: { 'Content-Type':'application/json', Authorization: authHeader }, body: JSON.stringify(body) })`; on `res.status === 401` call `onAuthExpired()`; on `!res.ok` show an error; else `onSaved()`. DELETE mirrors swim (`/api/events?id=`). Render inside `<BottomSheet open onClose title={editing ? 'Edit' : 'Log'}>`; include: chemical (product chips from `CHEM_PRODUCTS` + "Other…" → free text input; Amount number; Unit `Segmented` over `CHEM_UNITS`); water (Amount + Unit `Segmented` over `WATER_UNITS` with the in/gal/min hint); backwash (info panel); note (textarea). Add a small local `Segmented` component (port from `events.jsx`). Date/Time inputs default to now. Save disabled until the kind's required fields are valid (chemical: product + amount>0 + unit; water: amount>0; note: text; backwash: always). Edit mode pre-fills (including "Other" product detection) and shows an inline Delete-confirm. Use `data-testid="event-product-<name>"` etc. only if needed for tests. Full reference: prototype `EventLogForm` (`/tmp/events_handoff/design_handoff_events/events.jsx`) for markup, and `SwimLogForm.tsx` for the fetch/gle/error/busy pattern.

- [ ] **Step 4: Create `EventLogFlow.module.css`** — port the prototype's `.seg`/`.seg-btn`, `.chip`/`.chip-wrap`, `.picker-head`/`.picker-label`/`.picker-hint`, `.form-help`, `.bw-note`/`.bw-ico`, `.textarea`, `.formgrid`/`.field`/`.input`, `.del-link`/`.del-confirm`/`.btn-*`, `.ev-badge`, `.kind-grid`/`.kind-card`/`.kind-ico`/`.kind-label` (the last group is for D3) from `Pool Events - Maintenance Log.html`, using existing token vars. Mirror `SwimLogFlow.module.css` for buttons/inputs.

- [ ] **Step 5:** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/EventLogFlow/EventLogForm.test.tsx` → PASS (adjust selectors if needed)
- [ ] **Step 6:** `git add dashboard/src/components/EventLogFlow/EventLogForm.tsx dashboard/src/components/EventLogFlow/EventLogFlow.module.css dashboard/src/components/EventLogFlow/EventLogForm.test.tsx && git commit -m "feat(events): four-kind event log form"`

---

### Task D3: `EventKindChooser`

**Files:** Create `dashboard/src/components/EventLogFlow/EventKindChooser.tsx`

- [ ] **Step 1: Create `EventKindChooser.tsx`** (port prototype; renders inside `BottomSheet`):

```tsx
import { BottomSheet } from '../BottomSheet';
import { EVENT_KINDS, EVENT_KIND_ORDER } from '../../constants/events';
import type { EventKind } from '../../types';
import styles from './EventLogFlow.module.css';

interface EventKindChooserProps { open: boolean; onPick: (k: EventKind) => void; onClose: () => void }

export function EventKindChooser({ open, onPick, onClose }: EventKindChooserProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Log a maintenance event">
      <div className={styles.kindGrid}>
        {EVENT_KIND_ORDER.map((kk) => {
          const k = EVENT_KINDS[kk];
          return (
            <button key={kk} type="button" className={styles.kindCard} style={{ borderColor: k.color }} onClick={() => onPick(kk)}>
              <span className={styles.kindIco} style={{ background: k.tint }}>{k.icon}</span>
              <span className={styles.kindLabel}>{k.noun}</span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 2:** `source ~/.nvm/nvm.sh && pnpm typecheck` → PASS
- [ ] **Step 3:** `git add dashboard/src/components/EventLogFlow/EventKindChooser.tsx && git commit -m "feat(events): event kind chooser"`

---

### Task D4: `EventLogFlow` (unlock gate → chooser/form) + index

**Files:** Create `dashboard/src/components/EventLogFlow/EventLogFlow.tsx`, `index.ts`

Mirror `src/components/SwimLogFlow/SwimLogFlow.tsx`. The flow is driven by the parent
(`ChemistryTab`) via props: which kind to log, edit entry, and whether the chooser or a specific
form is open.

- [ ] **Step 1: Create `EventLogFlow.tsx`:**

```tsx
import { UnlockSheet } from '../LogTestFlow/UnlockSheet';
import { EventLogForm } from './EventLogForm';
import { EventKindChooser } from './EventKindChooser';
import { useChemAuth } from '../../hooks/useChemAuth';
import type { EventKind, PoolEvent } from '../../types';

interface EventLogFlowProps {
  open: boolean;
  mode: 'chooser' | 'form';
  kind: EventKind;
  editEntry?: PoolEvent | null;
  onPickKind: (k: EventKind) => void;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function EventLogFlow({ open, mode, kind, editEntry, onPickKind, onClose, onSaved, onDeleted }: EventLogFlowProps) {
  const { unlocked, authHeader, unlock, lock } = useChemAuth();
  if (!open) return null;

  if (!unlocked || !authHeader) {
    return (
      <UnlockSheet open unlockTitle="Unlock to log an event" onClose={onClose}
        onUnlocked={(header) => { const [u, p] = atob(header.slice(6)).split(/:(.*)/s); unlock(u, p); }} />
    );
  }
  if (mode === 'chooser') {
    return <EventKindChooser open onPick={onPickKind} onClose={onClose} />;
  }
  return (
    <EventLogForm key={editEntry?.id ?? `new-${kind}`} kind={kind} authHeader={authHeader}
      editEntry={editEntry} onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} onAuthExpired={lock} />
  );
}
```

(`UnlockSheet` already accepts `unlockTitle` from the swim work.)

- [ ] **Step 2: Create `index.ts`:** `export { EventLogFlow } from './EventLogFlow';`
- [ ] **Step 3:** `source ~/.nvm/nvm.sh && pnpm typecheck` → PASS
- [ ] **Step 4:** `git add dashboard/src/components/EventLogFlow/EventLogFlow.tsx dashboard/src/components/EventLogFlow/index.ts && git commit -m "feat(events): EventLogFlow unlock gate + chooser/form router"`

---

## Phase E — Log book

### Task E1: `LogBookSheet`

**Files:** Create `dashboard/src/components/LogBookSheet/{LogBookSheet.tsx,LogBookSheet.module.css,index.ts}`, `LogBookSheet.test.tsx`

Mirror `src/components/SwimHistorySheet/SwimHistorySheet.tsx`. Filter row by kind, chronological
rows, edit on tap, footer ＋ Log an event.

- [ ] **Step 1: Write the failing smoke test** `LogBookSheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LogBookSheet } from './LogBookSheet';
import type { PoolEvent } from '../../types';

const events: PoolEvent[] = [
  { id: '1', date: '2026-05-10', time: '12:00', kind: 'chemical', product: 'Cal-hypo', amount: 16, unit: 'oz' },
  { id: '2', date: '2026-05-16', time: '14:00', kind: 'water', amount: 2, unit: 'in' },
];

describe('LogBookSheet', () => {
  it('shows the entry count and newest-first rows', () => {
    render(<LogBookSheet open events={events} onClose={() => {}} onEdit={() => {}} onNew={() => {}} />);
    expect(screen.getByText(/2 entries/)).toBeInTheDocument();
    expect(screen.getByText('Added water · 2 in')).toBeInTheDocument();
  });
  it('filters by kind', () => {
    render(<LogBookSheet open events={events} onClose={() => {}} onEdit={() => {}} onNew={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /water/i }));
    expect(screen.queryByText('Cal-hypo · 16 oz')).not.toBeInTheDocument();
    expect(screen.getByText('Added water · 2 in')).toBeInTheDocument();
  });
  it('calls onEdit with the tapped event', () => {
    const onEdit = vi.fn();
    render(<LogBookSheet open events={events} onClose={() => {}} onEdit={onEdit} onNew={() => {}} />);
    fireEvent.click(screen.getByText('Added water · 2 in'));
    expect(onEdit).toHaveBeenCalledWith(events[1]); // newest first
  });
});
```

- [ ] **Step 2:** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/LogBookSheet` → FAIL

- [ ] **Step 3: Implement `LogBookSheet.tsx`:**

```tsx
import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { sortedEvents, summary, whenLabel, countByKind } from '../../utils/events';
import { EVENT_KINDS, EVENT_KIND_ORDER } from '../../constants/events';
import type { EventKind, PoolEvent } from '../../types';
import styles from './LogBookSheet.module.css';

interface LogBookSheetProps {
  open: boolean;
  events: PoolEvent[];
  onClose: () => void;
  onEdit: (e: PoolEvent) => void;
  onNew: () => void;
}

export function LogBookSheet({ open, events, onClose, onEdit, onNew }: LogBookSheetProps) {
  const [filter, setFilter] = useState<'all' | EventKind>('all');
  const counts = countByKind(events);
  const rows = sortedEvents(events).filter((e) => filter === 'all' || e.kind === filter);

  return (
    <BottomSheet open={open} onClose={onClose} title={`${events.length} ${events.length === 1 ? 'entry' : 'entries'} · Log book`}>
      <div className={styles.filterRow}>
        <button type="button" className={`${styles.filterChip} ${filter === 'all' ? styles.on : ''}`} onClick={() => setFilter('all')}>
          All<span className={styles.fcN}>{events.length}</span>
        </button>
        {EVENT_KIND_ORDER.map((kk) => {
          const k = EVENT_KINDS[kk];
          return (
            <button key={kk} type="button" className={`${styles.filterChip} ${filter === kk ? styles.on : ''}`}
              style={filter === kk ? { borderColor: k.color, color: k.color, background: k.tint } : undefined}
              onClick={() => setFilter(kk)}>
              <span aria-hidden="true">{k.icon}</span> {k.label}<span className={styles.fcN}>{counts[kk]}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.list}>
        {rows.length === 0 && <p className={styles.hint}>No entries of this kind yet.</p>}
        {rows.map((ev) => {
          const k = EVENT_KINDS[ev.kind];
          return (
            <button key={ev.id} type="button" className={styles.row} onClick={() => onEdit(ev)}>
              <span className={styles.rowIco} style={{ background: k.tint, borderColor: k.color }}>{k.icon}</span>
              <span className={styles.rowMain}>
                <span className={styles.rowSummary}>{summary(ev)}</span>
                <span className={styles.rowWhen}>{whenLabel(ev)}</span>
              </span>
              <span className={styles.chevron} aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} onClick={onNew}>＋ Log an event</button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Create `LogBookSheet.module.css`** — port `.filter-row`/`.filter-chip`/`.fc-n`/`.fc-ico`, `.logrow`/`.logrow-ico`/`.logrow-main`/`.logrow-summary`/`.logrow-when`, `.hist-chevron`, `.hist-hint`, `.sheet-actions`/`.btn-primary` from the prototype `<style>`, using token vars; mirror `SwimHistorySheet.module.css`.
- [ ] **Step 5: Create `index.ts`:** `export { LogBookSheet } from './LogBookSheet';`
- [ ] **Step 6:** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/LogBookSheet` → PASS
- [ ] **Step 7:** `git add dashboard/src/components/LogBookSheet && git commit -m "feat(events): Log book sheet (filter by kind, edit/delete)"`

---

## Phase F — Wiring

### Task F1: Event markers in `ChemChart` (compact + full)

**Files:** Modify `dashboard/src/components/ChemChart/ChemChart.tsx`

`ChemChart` already renders `<SwimLane>` (compact on mini, full on focus). Add the parallel
`<EventLane>` and an `events?` prop.

- [ ] **Step 1:** Add `events?: PoolEvent[]` to `ChemChartProps` (import `PoolEvent` from `../../types`, `EventLane` from `../EventLane`). After the existing `swimSeries` memo (reuse the same `swimSeries` — it's the chem-value series), render alongside the SwimLane:

```tsx
  {events && events.length > 0 && (
    <EventLane events={events} series={swimSeries} xMode="scale" yAxisId="chem" compact={!isFull} iconSize={isFull ? 23 : 17} />
  )}
```

- [ ] **Step 2:** `source ~/.nvm/nvm.sh && pnpm typecheck && pnpm vitest run src/components/ChemChart` → PASS
- [ ] **Step 3:** `git add dashboard/src/components/ChemChart && git commit -m "feat(events): render EventLane in ChemChart"`

---

### Task F2: Thread `events` through `ChemCard` + `ChemFocusSheet`

**Files:** Modify `dashboard/src/components/ChemCard/ChemCard.tsx`, `dashboard/src/components/ChemFocusSheet/ChemFocusSheet.tsx`

- [ ] **Step 1: `ChemCard.tsx`** — add `events?: PoolEvent[]` to props (import `PoolEvent`), forward `events={events}` to its `<ChemChart>`.
- [ ] **Step 2: `ChemFocusSheet.tsx`** — add `events?: PoolEvent[]` to props; add an `eventsOn` local state (default true) + hasEvents; add an Events `OverlayPill` to the overlay row (only when events present), gating `events={eventsOn ? events : undefined}` passed to `<ChemChart>`. Mirror exactly how `swimOn` + the Swim pill already work in this file.
- [ ] **Step 3:** `source ~/.nvm/nvm.sh && pnpm typecheck && pnpm vitest run src/components/ChemFocusSheet src/components/ChemCard` → PASS
- [ ] **Step 4:** `git add dashboard/src/components/ChemCard dashboard/src/components/ChemFocusSheet && git commit -m "feat(events): thread events through ChemCard + focus sheet"`

---

### Task F3: `ChemistryTab` — Log event row, Events pill, flow, Log book

**Files:** Modify `dashboard/src/components/ChemistryTab/ChemistryTab.tsx` (+ `.module.css`)

This is the main wiring, mirroring the tab's existing swim handling plus the swim *logging* flow
(which for events lives here, not on the temp tab).

- [ ] **Step 1: Add state + data.** Import `useEventData`, `EventLogFlow`, `LogBookSheet`, `EVENT_KIND_ORDER`/`EVENT_KINDS`, types. Add:

```tsx
  const { events, refetch: refetchEvents } = useEventData(range);
  const { events: seasonEvents, refetch: refetchSeasonEvents } = useEventData('season');
  const refetchAllEvents = () => { refetchEvents(); refetchSeasonEvents(); };
  const [eventsOn, setEventsOn] = useState(true);
  const [evFlowOpen, setEvFlowOpen] = useState(false);
  const [evMode, setEvMode] = useState<'chooser' | 'form'>('form');
  const [evKind, setEvKind] = useState<EventKind>('chemical');
  const [evEntry, setEvEntry] = useState<PoolEvent | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
```

- [ ] **Step 2: Add the "Log event" row** under the existing header (port markup + `.logEvent*` styles from the prototype). Each kind button: `onClick={() => { setEvEntry(null); setEvKind(kk); setEvMode('form'); setEvFlowOpen(true); }}`; the "Log book ›" button: `onClick={() => setBookOpen(true)}`.
- [ ] **Step 3: Add the Events `OverlayPill`** in the overlay row after the Swim pill: `{events.length > 0 && <OverlayPill label="Events" variant="events" active={eventsOn} onToggle={() => setEventsOn((v) => !v)} />}`.
- [ ] **Step 4: Pass events to the cards + focus sheet — mirror exactly how the tab passes `swims` today.** The tab's `eventsOn` pill gates the **cards**; the focus sheet owns its **own** events pill (F2). So: `ChemCard ... events={eventsOn ? events : undefined}` (tab toggle gates the cards) and `ChemFocusSheet ... events={events}` (raw — the sheet's own pill controls it). This is identical to the shipped `swims` wiring: `ChemCard ... swims={swimOn ? swims : undefined}` and `ChemFocusSheet ... swims={swims}`.
- [ ] **Step 5: Render the flow + book** before the closing tag:

```tsx
      <LogBookSheet open={bookOpen} events={seasonEvents}
        onClose={() => setBookOpen(false)}
        onEdit={(e) => { setBookOpen(false); setEvEntry(e); setEvKind(e.kind); setEvMode('form'); setEvFlowOpen(true); }}
        onNew={() => { setBookOpen(false); setEvEntry(null); setEvMode('chooser'); setEvFlowOpen(true); }} />
      <EventLogFlow open={evFlowOpen} mode={evMode} kind={evKind} editEntry={evEntry}
        onPickKind={(k) => { setEvKind(k); setEvMode('form'); }}
        onClose={() => { setEvFlowOpen(false); setEvEntry(null); }}
        onSaved={() => { setEvFlowOpen(false); setEvEntry(null); setToast(`${EVENT_KINDS[evKind].noun} logged`); refetchAllEvents(); }}
        onDeleted={() => { setEvFlowOpen(false); setEvEntry(null); setToast('Entry deleted'); refetchAllEvents(); }} />
```

(`toast`/`setToast` + `<Toast>` already exist in ChemistryTab from the chem-test flow — reuse. If the toast copy should say "Entry updated" on edit, track an `editing` flag like the swim code does.)

- [ ] **Step 6:** `source ~/.nvm/nvm.sh && pnpm typecheck && pnpm vitest run && pnpm lint` → PASS
- [ ] **Step 7:** `git add dashboard/src/components/ChemistryTab && git commit -m "feat(events): wire log event row, Events pill, flow + log book into ChemistryTab"`

---

### Task F4: Event markers + pill on the Temperature chart

**Files:** Modify `dashboard/src/components/TempChart/TempChart.tsx`, `dashboard/src/App.tsx`

The temp chart shows event markers + the Events pill (no logging UI).

- [ ] **Step 1: `TempChart.tsx`** — add `events?: PoolEvent[]` prop; add an `eventsVisible` state (default true) + `hasEvents`; render the Events `OverlayPill` in the overlay row next to the Swim pill (only when hasEvents); render `<EventLane events={events} series={swimSeries} xMode="index" />` inside the chart, gated by `hasEvents && eventsVisible` (reuse the existing `swimSeries` memo — same chart-unit series).
- [ ] **Step 2: `App.tsx` `TemperatureTab`** — add `const { events } = useEventData(range);` and pass `events={events}` to `<TempChart>`.
- [ ] **Step 3:** `source ~/.nvm/nvm.sh && pnpm typecheck && pnpm vitest run src/components/TempChart && pnpm lint` → PASS
- [ ] **Step 4:** `git add dashboard/src/components/TempChart dashboard/src/App.tsx && git commit -m "feat(events): event markers + Events pill on the temperature chart"`

---

## Phase G — Tests + verification

### Task G1: `EventLane` render test

**Files:** Create `dashboard/src/components/EventLane/EventLane.render.test.tsx`

- [ ] **Step 1:** Copy `src/components/SwimLane/SwimLane.render.test.tsx` and adapt: render `EventLane` inside a real recharts chart (as that file does), pass `events` (give each a real ISO `id`), assert: a marker chip renders per in-domain event (query by the kind icon text, e.g. `🧪`); an event whose id-epoch is before/after the series domain renders nothing; empty `series` renders nothing; compact vs full differ (full has the stem/foot spans, compact does not); different kinds render their own icon/color. Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/EventLane` → PASS.
- [ ] **Step 2:** `git add dashboard/src/components/EventLane/EventLane.render.test.tsx && git commit -m "test(events): EventLane render + off-domain skip"`

---

### Task G2: Full gate + docs

- [ ] **Step 1:** `source ~/.nvm/nvm.sh && pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build` → all PASS; coverage ≥ 80% (add tests if the new files drag it below — e.g. an `EventLogForm` edit/delete/401 test mirroring the swim one).
- [ ] **Step 2: Update `CLAUDE.md`** — add a "Maintenance events" subsection under the dashboard docs (the `event` measurement; `/api/events` GET public + POST/PUT/DELETE shared auth; `EventLane`/Log book; logging lives on the Chemistry tab), and add `/api/events` to the endpoints list. Commit.
- [ ] **Step 3: Manual smoke (optional, needs live InfluxDB)** — via the `verify` skill or `pnpm dev`+`pnpm dev:server`: log one of each kind (unlock once), confirm kind-colored chips ride the temp curve, the chem cards, and a chem focus chart; toggle the Events pill on all three; open the Log book, filter by kind, edit + delete an entry; confirm the chem-test and swim features are unaffected.
- [ ] **Step 4: Finish the branch** — use `superpowers:finishing-a-development-branch` to open a PR.

---

## Self-review notes / carried decisions
- `event` measurement, `kind` + sparse per-kind fields (not a JSON blob); kind is a field, filtering is client-side.
- Markers render on compact cards too (per decision); both Swim and Events layers toggle independently.
- Auth + rate limiter shared with chemistry/swim; edit = delete-then-write via `deletePoint(id,'event')`.
- Logging UI lives on the Chemistry tab; the temperature chart shows markers + the Events pill only.
- Reuses `markerPositions`, `BottomSheet`, `Toast`, `UnlockSheet`, `useChemAuth` — no new copies.
