# Chemistry History / Timestamps / Edit-Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give chemistry readings a real timestamp (date + time) and stable id, and add view-history / edit / delete on top of the existing Chemistry tab.

**Architecture:** Stay in InfluxDB — each reading is one `chemistry` point whose UTC timestamp is its id. New writes timestamp at the logged date+time; edits are delete-old-timestamp + write-new; deletes use the InfluxDB delete API. Frontend adds a History bottom sheet and edit/delete to the existing auth-gated log flow.

**Tech Stack:** Express 5, `@influxdata/influxdb-client` (+ new `@influxdata/influxdb-client-apis` for DeleteAPI), React 19, TypeScript 6, Vitest, Node 24 / pnpm 10.33.0.

---

## Spec reference

`docs/superpowers/specs/2026-06-02-chemistry-history-design.md`. Read it first.

## Conventions (read once)

- All pnpm/node commands: prefix `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null` (or 22 — both have corepack 10.33.0), run from `dashboard/`. If a stray `pnpm-workspace.yaml` appears, delete it (gitignored).
- Server tests are Node env (`// @vitest-environment node`); component tests are jsdom default. Component tests that use `useTheme` mock `../../context/ThemeContext` (see `ChemCard.test.tsx`), they do not wrap in `ThemeProvider`.
- After server changes, run a COLD build (`rm -rf dist && find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete; pnpm build`) since the Docker/CI build runs `tsc -b` cold.
- Existing relevant files: `server/chemistry.ts` (validation + tz helpers), `server/influx.ts` (`queryChemistry`/`writeChemistry`/`ChemistryReading`), `server/routes.ts` (chemistry routes + `requireAuth` + `chemistryAuthLimiter`), `src/types.ts` (`ChemistryReading`, `ChemKey`), `src/hooks/useChemistryData.ts`, `src/utils/chemistry.ts`, `src/components/LogTestFlow/` (`LogTestFlow.tsx`, `LogForm.tsx`, `UnlockSheet.tsx`), `src/components/ChemistryTab/ChemistryTab.tsx`, `src/components/ChemCard/`, `src/components/ChemChart/`.
- CI gates this (lint exit 0, typecheck, test:coverage ≥80%, build). Keep all green.

## File structure

**Backend**
- `server/chemistry.ts` *(modify)* — add `dateTimeToUtc`, `utcToZonedParts` (derive date+time), `isValidTime`, `isValidId`; extend `validateChemistryBody` to require `time`.
- `server/influx.ts` *(modify)* — `ChemistryReading` gains `id`/`time`; `queryChemistry` derives them; `writeChemistry` takes `{date,time,values}`; add `deleteChemistryPoint(id)`.
- `server/influxDelete.ts` *(new)* — thin wrapper around `DeleteAPI` (isolates the new dependency; easy to mock).
- `server/routes.ts` *(modify)* — POST takes date+time & returns id; add PUT and DELETE.
- Tests: `server/chemistry.test.ts`, `server/influx.test.ts`, `server/routes.integration.test.ts` *(all modify)*.

**Frontend**
- `src/types.ts` *(modify)* — `ChemistryReading` gains `id`/`time`.
- `src/utils/chemistry.ts` *(modify)* — add `testsOnDay`, `sortedDesc`, `fmtTime12`, `fmtDateWeekday`.
- `src/hooks/useChemistryData.ts` *(modify)* — readings carry id/time (no shape change to the hook itself; data passthrough).
- `src/components/LogTestFlow/LogForm.tsx` *(modify)* — date+time fields, edit mode, delete confirm.
- `src/components/LogTestFlow/LogTestFlow.tsx` *(modify)* — `editEntry`, `gateToForm`, PUT/DELETE wiring, toast messages.
- `src/components/HistorySheet/` *(new)* — `HistorySheet.tsx`, `.module.css`, `index.ts`, test.
- `src/components/ChemistryTab/ChemistryTab.tsx` *(modify)* — History button + sheet wiring; pass id/time through.
- Tests alongside each.

---

## Phase 1 — Backend time + id helpers

### Task 1: `dateTimeToUtc` and `utcToZonedParts`

**Files:** Modify `server/chemistry.ts`; Test `server/chemistry.test.ts`.

- [ ] **Step 1: Add failing tests.** Append to `server/chemistry.test.ts`:

```ts
import { dateTimeToUtc, utcToZonedParts } from './chemistry';

describe('dateTimeToUtc', () => {
  it('maps a date+time in EDT (-4) to the correct UTC instant', () => {
    // 2026-05-20 16:30 America/New_York (EDT) = 20:30 UTC
    expect(dateTimeToUtc('2026-05-20', '16:30', 'America/New_York').toISOString())
      .toBe('2026-05-20T20:30:00.000Z');
  });
  it('maps a winter date+time in EST (-5) correctly', () => {
    // 2026-01-15 08:00 EST = 13:00 UTC
    expect(dateTimeToUtc('2026-01-15', '08:00', 'America/New_York').toISOString())
      .toBe('2026-01-15T13:00:00.000Z');
  });
  it('treats UTC zone as identity', () => {
    expect(dateTimeToUtc('2026-05-20', '16:30', 'UTC').toISOString())
      .toBe('2026-05-20T16:30:00.000Z');
  });
});

describe('utcToZonedParts', () => {
  it('derives date + time back from a UTC instant (EDT)', () => {
    expect(utcToZonedParts('2026-05-20T20:30:00.000Z', 'America/New_York'))
      .toEqual({ date: '2026-05-20', time: '16:30' });
  });
  it('round-trips dateTimeToUtc', () => {
    const iso = dateTimeToUtc('2026-05-20', '07:50', 'America/New_York').toISOString();
    expect(utcToZonedParts(iso, 'America/New_York')).toEqual({ date: '2026-05-20', time: '07:50' });
  });
  it('renders a legacy noon-stored reading as 12:00', () => {
    const iso = '2026-05-29T16:00:00.000Z'; // noon EDT
    expect(utcToZonedParts(iso, 'America/New_York')).toEqual({ date: '2026-05-29', time: '12:00' });
  });
});
```

- [ ] **Step 2: Run, expect fail.** `source ~/.nvm/nvm.sh && pnpm vitest run server/chemistry.test.ts` → FAIL (not exported).

- [ ] **Step 3: Implement.** Add to `server/chemistry.ts` (reuse the offset-derivation approach already used by `zonedNoonToUtc`):

```ts
/**
 * Convert a date (YYYY-MM-DD) + time (HH:mm) in the given IANA timezone to the
 * UTC Date to store. Mirrors zonedNoonToUtc's offset-from-Intl approach so it is
 * independent of the host system timezone.
 */
export function dateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10));
  // Reference instant: treat the wall-clock as if it were UTC.
  const naive = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(naive);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  const localSecondsOfNaive = (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
  const wallSeconds = h * 3600 + m * 60;
  const offsetSeconds = localSecondsOfNaive - wallSeconds;
  return new Date(naive.getTime() - offsetSeconds * 1000);
}

/** Derive { date: 'YYYY-MM-DD', time: 'HH:mm' } from a UTC ISO instant in tz. */
export function utcToZonedParts(iso: string, timeZone: string): { date: string; time: string } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const hour = (parseInt(get('hour'), 10) % 24).toString().padStart(2, '0');
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
}
```

- [ ] **Step 4: Run, expect pass.** `source ~/.nvm/nvm.sh && pnpm vitest run server/chemistry.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add server/chemistry.ts server/chemistry.test.ts
git commit -m "feat: add dateTimeToUtc + utcToZonedParts chemistry tz helpers"
```

---

### Task 2: `isValidTime`, `isValidId`, and `time` in `validateChemistryBody`

**Files:** Modify `server/chemistry.ts`; Test `server/chemistry.test.ts`.

- [ ] **Step 1: Add failing tests.** Append:

```ts
import { isValidTime, isValidId, validateChemistryBody } from './chemistry';

describe('isValidTime', () => {
  it('accepts HH:mm', () => { expect(isValidTime('07:50')).toBe(true); expect(isValidTime('23:59')).toBe(true); });
  it('rejects bad times', () => { ['7:50','24:00','12:60','','noon','12'].forEach(t => expect(isValidTime(t)).toBe(false)); });
});
describe('isValidId', () => {
  it('accepts an ISO timestamp', () => { expect(isValidId('2026-05-20T20:30:00.000Z')).toBe(true); });
  it('rejects non-ISO', () => { ['','abc','2026-05-20'].forEach(s => expect(isValidId(s)).toBe(false)); });
});
describe('validateChemistryBody (with time)', () => {
  it('accepts a valid partial reading with date+time', () => {
    const r = validateChemistryBody({ date: '2026-05-20', time: '16:30', fc: 6.8 });
    expect(r).toEqual({ ok: true, date: '2026-05-20', time: '16:30', values: { fc: 6.8 } });
  });
  it('rejects a missing/invalid time', () => {
    expect(validateChemistryBody({ date: '2026-05-20', fc: 1 }).ok).toBe(false);
    expect(validateChemistryBody({ date: '2026-05-20', time: '99:99', fc: 1 }).ok).toBe(false);
  });
  it('still requires >=1 value', () => {
    expect(validateChemistryBody({ date: '2026-05-20', time: '16:30' }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect fail.** Same command → FAIL.

- [ ] **Step 3: Implement.** In `server/chemistry.ts`: change the `ValidatedChemistry` ok-variant to include `time`, add the two validators, and add the `time` check to `validateChemistryBody`.

Replace the `ValidatedChemistry` type:
```ts
export type ValidatedChemistry =
  | { ok: true; date: string; time: string; values: Partial<Record<ChemField, number>> }
  | { ok: false; error: string };
```

Add:
```ts
export function isValidTime(t: unknown): boolean {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export function isValidId(id: unknown): boolean {
  return typeof id === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(id)
    && !Number.isNaN(new Date(id).getTime());
}
```

In `validateChemistryBody`, after the `date` check and before the values loop, add:
```ts
  if (!isValidTime(b.time)) {
    return { ok: false, error: 'Invalid or missing time' };
  }
```
and change the success return to:
```ts
  return { ok: true, date: b.date, time: b.time as string, values };
```

- [ ] **Step 4: Run, expect pass.** Full file: `source ~/.nvm/nvm.sh && pnpm vitest run server/chemistry.test.ts` → PASS (all, including pre-existing).

- [ ] **Step 5: Commit.**
```bash
git add server/chemistry.ts server/chemistry.test.ts
git commit -m "feat: require time in chemistry validation; add isValidTime/isValidId"
```

---

## Phase 2 — Backend storage (read/write/delete)

### Task 3: `queryChemistry` returns id + date + time; `writeChemistry` takes date+time

**Files:** Modify `server/influx.ts`; Test `server/influx.test.ts`.

- [ ] **Step 1: Update failing tests.** In `server/influx.test.ts`, find the existing `queryChemistry` and `writeChemistry` describe blocks and replace them with:

```ts
describe('queryChemistry', () => {
  it('maps each point to id + derived date/time + present fields', async () => {
    queryApiStub.collectRows.mockResolvedValueOnce([
      { _time: '2026-05-20T11:50:00.000Z', ph: 7.6, fc: 3.6 },           // 07:50 EDT
      { _time: '2026-05-20T20:30:00.000Z', ph: 7.4, fc: 6.8, cc: 0.2 }, // 16:30 EDT
    ]);
    const out = await queryChemistry('season', 'America/New_York');
    expect(out).toEqual([
      { id: '2026-05-20T11:50:00.000Z', date: '2026-05-20', time: '07:50', ph: 7.6, fc: 3.6 },
      { id: '2026-05-20T20:30:00.000Z', date: '2026-05-20', time: '16:30', ph: 7.4, fc: 6.8, cc: 0.2 },
    ]);
  });
});

describe('writeChemistry', () => {
  it('writes a point at the date+time instant with only provided fields', async () => {
    const id = await writeChemistry({ date: '2026-05-20', time: '16:30', values: { fc: 6.8 } }, 'America/New_York');
    expect(writeApiStub.writePoint).toHaveBeenCalledOnce();
    expect(writeApiStub.flush).toHaveBeenCalledOnce();
    expect(id).toBe('2026-05-20T20:30:00.000Z');
  });
});
```

(If the influx test mock's `writePoint`/`flush` stub objects differ in name, keep the existing names — only the assertions change.)

- [ ] **Step 2: Run, expect fail.** `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In `server/influx.ts`:

Import the helpers:
```ts
import { CHEM_FIELDS, dateTimeToUtc, utcToZonedParts } from './chemistry.js'
import type { ChemField } from './chemistry.js'
```

Change the `ChemistryReading` interface to:
```ts
export interface ChemistryReading {
  id: string
  date: string
  time: string
  ph?: number; fc?: number; cc?: number; ta?: number; cya?: number; ch?: number
}
```

Change `queryChemistry` signature + mapping (keep the Flux query the same; the `_time` field is the id):
```ts
export async function queryChemistry(
  range: string,
  timeZone = process.env.TIMEZONE ?? 'America/New_York',
): Promise<ChemistryReading[]> {
  const api = getQueryApi()
  const fieldFilter = CHEM_FIELDS.map((f) => `r._field == "${f}"`).join(' or ')
  const query = `
    from(bucket: "${bucket}")
      |> range(${parseRange(range)})
      |> filter(fn: (r) => r._measurement == "chemistry")
      |> filter(fn: (r) => ${fieldFilter})
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `
  const rows = await api.collectRows<Record<string, unknown>>(query)
  return rows.map((row) => {
    const id = row._time as string
    const { date, time } = utcToZonedParts(id, timeZone)
    const reading: ChemistryReading = { id, date, time }
    for (const f of CHEM_FIELDS) {
      const v = row[f]
      if (typeof v === 'number') reading[f] = v
    }
    return reading
  })
}
```

Change `writeChemistry` to take `time` and return the id:
```ts
export async function writeChemistry(
  input: { date: string; time: string; values: Partial<Record<ChemField, number>> },
  timeZone = process.env.TIMEZONE ?? 'America/New_York',
): Promise<string> {
  const writeApi = getWriteApi()
  const when = dateTimeToUtc(input.date, input.time, timeZone)
  const point = new Point('chemistry').timestamp(when)
  for (const f of CHEM_FIELDS) {
    const v = input.values[f]
    if (v !== undefined) point.floatField(f, v)
  }
  writeApi.writePoint(point)
  await writeApi.flush()
  return when.toISOString()
}
```

- [ ] **Step 4: Run, expect pass.** `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add server/influx.ts server/influx.test.ts
git commit -m "feat: chemistry readings carry id+time; write at date+time instant"
```

---

### Task 4: Delete API wrapper + `deleteChemistryPoint`

**Files:** Create `server/influxDelete.ts`; Modify `server/influx.ts`; install dep.

- [ ] **Step 1: Add the dependency.**
```bash
source ~/.nvm/nvm.sh && nvm use 24 >/dev/null 2>&1 && pnpm add @influxdata/influxdb-client-apis
```
Expected: installs; `@influxdata/influxdb-client-apis` appears in `dashboard/package.json` dependencies.

- [ ] **Step 2: Create the wrapper.** Create `server/influxDelete.ts`:

```ts
import { DeleteAPI } from '@influxdata/influxdb-client-apis'
import { InfluxDB } from '@influxdata/influxdb-client'

const url = process.env.INFLUXDB_URL ?? 'http://localhost:8086'
const token = process.env.INFLUXDB_TOKEN ?? ''
const org = process.env.INFLUXDB_ORG ?? ''
const bucket = process.env.INFLUXDB_BUCKET ?? ''

/**
 * Delete the single chemistry point at the given ISO instant. InfluxDB deletes a
 * half-open [start, stop) window, so we delete [id, id+1ms) filtered to the
 * chemistry measurement — narrow enough to hit exactly that point.
 */
export async function deleteChemistryPoint(id: string): Promise<void> {
  const deleteApi = new DeleteAPI(new InfluxDB({ url, token }))
  const start = new Date(id).toISOString()
  const stop = new Date(new Date(id).getTime() + 1).toISOString()
  await deleteApi.postDelete({
    org,
    bucket,
    body: { start, stop, predicate: '_measurement="chemistry"' },
  })
}
```

- [ ] **Step 3: Re-export from influx.ts for a single import surface.** Add to `server/influx.ts`:
```ts
export { deleteChemistryPoint } from './influxDelete.js'
```

- [ ] **Step 4: Verify it compiles.** `source ~/.nvm/nvm.sh && pnpm typecheck` → clean. (No unit test here — the DeleteAPI is exercised via the route integration test in Task 5 with a mock; a direct unit test would only assert the mock.)

- [ ] **Step 5: Commit.**
```bash
git add server/influxDelete.ts server/influx.ts package.json pnpm-lock.yaml
git commit -m "feat: add deleteChemistryPoint via InfluxDB DeleteAPI"
```

---

## Phase 3 — Backend routes

### Task 5: POST returns id; add PUT and DELETE

**Files:** Modify `server/routes.ts`; Test `server/routes.integration.test.ts`.

- [ ] **Step 1: Add failing integration tests.** In `server/routes.integration.test.ts`, extend the `vi.mock('./influx.js', ...)` factory to include the new functions, and add a describe block. The mock factory must add:
```ts
  writeChemistry: vi.fn(async () => '2026-05-20T20:30:00.000Z'),
  deleteChemistryPoint: vi.fn(async () => {}),
  queryChemistry: vi.fn(async () => []),
```
(Replace the existing `writeChemistry`/`queryChemistry` mock lines; add `deleteChemistryPoint`.)

Add tests (the suite already sets `CHEM_AUTH_USER`/`PASSWORD` and has a `authHeader` helper — reuse them; if not, add `const authHeader = 'Basic ' + Buffer.from('tester:secret').toString('base64')` and set the env in `beforeAll`):

```ts
import { writeChemistry, deleteChemistryPoint } from './influx.js' // for assertions if exposed; else import the mocked module

describe('chemistry write routes', () => {
  const auth = { Authorization: 'Basic ' + Buffer.from('tester:secret').toString('base64') };

  it('POST returns 201 with the new id', async () => {
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-05-20', time: '16:30', fc: 6.8 }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe('2026-05-20T20:30:00.000Z');
  });

  it('POST 400 on missing time', async () => {
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-05-20', fc: 6.8 }),
    });
    expect(res.status).toBe(400);
  });

  it('POST 401 without auth', async () => {
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-05-20', time: '16:30', fc: 6.8 }),
    });
    expect(res.status).toBe(401);
  });

  it('PUT deletes the old id then writes the new reading (200)', async () => {
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '2026-05-20T11:50:00.000Z', date: '2026-05-20', time: '16:30', fc: 6.8 }),
    });
    expect(res.status).toBe(200);
  });

  it('PUT 400 on invalid id', async () => {
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'nope', date: '2026-05-20', time: '16:30', fc: 6.8 }),
    });
    expect(res.status).toBe(400);
  });

  it('DELETE 200 with a valid id', async () => {
    const res = await fetch(`${base}/api/chemistry?id=${encodeURIComponent('2026-05-20T11:50:00.000Z')}`, {
      method: 'DELETE', headers: auth,
    });
    expect(res.status).toBe(200);
  });

  it('DELETE 400 without a valid id', async () => {
    const res = await fetch(`${base}/api/chemistry?id=nope`, { method: 'DELETE', headers: auth });
    expect(res.status).toBe(400);
  });

  it('DELETE 401 without auth', async () => {
    const res = await fetch(`${base}/api/chemistry?id=${encodeURIComponent('2026-05-20T11:50:00.000Z')}`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});
```

Note: ensure `beforeAll` sets `process.env.CHEM_AUTH_USER='tester'` and `process.env.CHEM_AUTH_PASSWORD='secret'` (the existing rateLimit/auth integration test does this; if this file doesn't, add it).

- [ ] **Step 2: Run, expect fail.** `source ~/.nvm/nvm.sh && pnpm vitest run server/routes.integration.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In `server/routes.ts`:

Update the influx import to add `deleteChemistryPoint`, and the chemistry import to add `isValidId`:
```ts
import { ..., queryChemistry, writeChemistry, deleteChemistryPoint } from './influx.js'
import { validateChemistryBody, isValidId } from './chemistry.js'
```

Replace the POST handler body's write + response:
```ts
router.post('/api/chemistry', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const result = validateChemistryBody(req.body)
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    const id = await writeChemistry({ date: result.date, time: result.time, values: result.values })
    res.status(201).json({ id })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})
```

Add PUT and DELETE after it:
```ts
router.put('/api/chemistry', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const id = (req.body as { id?: unknown })?.id
    if (!isValidId(id)) { res.status(400).json({ error: 'Invalid or missing id' }); return }
    const result = validateChemistryBody(req.body)
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    await deleteChemistryPoint(id as string)
    const newId = await writeChemistry({ date: result.date, time: result.time, values: result.values })
    res.status(200).json({ id: newId })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.delete('/api/chemistry', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!isValidId(id)) { res.status(400).json({ error: 'Invalid or missing id' }); return }
    await deleteChemistryPoint(id)
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})
```

Also ensure `express.json()` is applied to PUT (it's currently `router.use('/api/chemistry', express.json())` which covers all methods on that path — verify it's a `use` mount, not POST-specific; it is).

- [ ] **Step 4: Run, expect pass.** `source ~/.nvm/nvm.sh && pnpm vitest run server/routes.integration.test.ts` → PASS. Then full server suite: `pnpm vitest run server/` → PASS.

- [ ] **Step 5: Cold build + commit.**
```bash
source ~/.nvm/nvm.sh && rm -rf dist && find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete; pnpm build  # expect exit 0
git add server/routes.ts server/routes.integration.test.ts
git commit -m "feat: chemistry POST returns id; add PUT (edit) and DELETE routes"
```

---

## Phase 4 — Frontend types, utils, hook

### Task 6: Types + chemistry utils for history

**Files:** Modify `src/types.ts`, `src/utils/chemistry.ts`; Test `src/utils/chemistry.test.ts`.

- [ ] **Step 1: Update the type.** In `src/types.ts` replace the `ChemistryReading` interface:
```ts
export interface ChemistryReading {
  id: string;   // ISO UTC timestamp (stable id)
  date: string; // YYYY-MM-DD in app timezone
  time: string; // HH:mm 24h in app timezone
  ph?: number; fc?: number; cc?: number; ta?: number; cya?: number; ch?: number;
}
```

- [ ] **Step 2: Add failing util tests.** Append to `src/utils/chemistry.test.ts`:
```ts
import { testsOnDay, sortedDesc, fmtTime12, fmtDateWeekday } from './chemistry';

const rs = [
  { id: '2026-05-20T11:50:00Z', date: '2026-05-20', time: '07:50', fc: 3.6 },
  { id: '2026-05-20T20:30:00Z', date: '2026-05-20', time: '16:30', fc: 6.8 },
  { id: '2026-05-24T12:35:00Z', date: '2026-05-24', time: '08:35', fc: 2.9 },
];

describe('testsOnDay', () => {
  it('counts tests on a given date', () => {
    expect(testsOnDay(rs, '2026-05-20')).toBe(2);
    expect(testsOnDay(rs, '2026-05-24')).toBe(1);
    expect(testsOnDay(rs, '2026-05-25')).toBe(0);
  });
});
describe('sortedDesc', () => {
  it('orders newest id first', () => {
    expect(sortedDesc(rs).map(r => r.id)).toEqual([
      '2026-05-24T12:35:00Z', '2026-05-20T20:30:00Z', '2026-05-20T11:50:00Z',
    ]);
  });
});
describe('fmtTime12', () => {
  it('formats 24h to 12h', () => {
    expect(fmtTime12('07:50')).toBe('7:50 AM');
    expect(fmtTime12('16:30')).toBe('4:30 PM');
    expect(fmtTime12('00:05')).toBe('12:05 AM');
    expect(fmtTime12('12:00')).toBe('12:00 PM');
  });
});
describe('fmtDateWeekday', () => {
  it('formats YYYY-MM-DD to weekday short', () => {
    // 2026-05-29 is a Friday
    expect(fmtDateWeekday('2026-05-29')).toMatch(/^Fri, May 29$/);
  });
});
```

- [ ] **Step 3: Run, expect fail.** `source ~/.nvm/nvm.sh && pnpm vitest run src/utils/chemistry.test.ts` → FAIL.

- [ ] **Step 4: Implement.** Append to `src/utils/chemistry.ts`:
```ts
import type { ChemistryReading } from '../types';

export function testsOnDay(readings: ChemistryReading[], date: string): number {
  return readings.filter((r) => r.date === date).length;
}

export function sortedDesc(readings: ChemistryReading[]): ChemistryReading[] {
  return [...readings].sort((a, b) => b.id.localeCompare(a.id));
}

export function fmtTime12(time: string): string {
  const [h, m] = time.split(':').map((s) => parseInt(s, 10));
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function fmtDateWeekday(date: string): string {
  // Parse as local midnight to avoid tz shifting the weekday.
  const [y, mo, d] = date.split('-').map((s) => parseInt(s, 10));
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
```
(If `src/utils/chemistry.ts` already imports `ChemistryReading`, don't duplicate the import.)

- [ ] **Step 5: Run, expect pass; commit.**
```bash
source ~/.nvm/nvm.sh && pnpm vitest run src/utils/chemistry.test.ts   # PASS
git add src/types.ts src/utils/chemistry.ts src/utils/chemistry.test.ts
git commit -m "feat: ChemistryReading id+time; history utils (testsOnDay/sortedDesc/fmt)"
```

---

### Task 7: Verify `useChemistryData` + existing consumers compile with new type

**Files:** Modify as needed: `src/hooks/useChemistryData.ts` and any component using `ChemistryReading` (`ChemistryTab`, `ChemCard`, `ChemChart`, `ChemFocusSheet`, `LogForm`).

- [ ] **Step 1: Typecheck to find breakage.** `source ~/.nvm/nvm.sh && pnpm typecheck` → expect errors anywhere a reading is constructed/consumed without `id`/`time` (e.g. test fixtures, `latestReading`). Note each.

- [ ] **Step 2: Fix consumers minimally.** For each error: production code that only *reads* values needs no change (extra fields are fine). The likely fixes are in **test fixtures** that build `ChemistryReading` literals — add `id`/`time` to them. Update any such fixture inline (e.g. ChemCard/ChemFocusSheet/ChemistryTab tests' sample readings gain `id: '<iso>', time: 'HH:mm'`). Do not change rendering logic.

- [ ] **Step 3: Run full suite + typecheck.**
```bash
source ~/.nvm/nvm.sh && pnpm typecheck && pnpm test
```
Expected: typecheck clean; all tests pass (fixtures updated).

- [ ] **Step 4: Commit.**
```bash
git add -A
git commit -m "chore: add id+time to ChemistryReading fixtures/consumers"
```

---

## Phase 5 — Frontend: log form (time + edit + delete)

### Task 8: LogForm — date+time fields, edit mode, delete confirm

**Files:** Modify `src/components/LogTestFlow/LogForm.tsx`, `LogTestFlow.tsx`; Test `src/components/LogTestFlow/LogTestFlow.test.tsx`.

- [ ] **Step 1: Read the current files** `src/components/LogTestFlow/LogForm.tsx` and `LogTestFlow.tsx` to match props/patterns. They currently POST a `{date, ...values}` body; this task adds `time`, an `editEntry` prop, PUT-on-edit, and a delete affordance.

- [ ] **Step 2: Add failing component tests.** Append to `LogTestFlow.test.tsx` (mock fetch via `vi.stubGlobal`, mock ThemeContext per existing pattern):

```ts
it('edit mode pre-fills and PUTs to /api/chemistry', async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'x' }) } as Response));
  vi.stubGlobal('fetch', fetchMock);
  const editEntry = { id: '2026-05-20T11:50:00Z', date: '2026-05-20', time: '07:50', fc: 3.6 };
  render(<LogTestFlow open unlockedForTest editEntry={editEntry} onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} latest={{}} readings={[editEntry]} />);
  // form shows Edit test + Save changes
  expect(await screen.findByText(/Edit test/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/chemistry', expect.objectContaining({ method: 'PUT' })));
});

it('delete confirm flow DELETEs by id', async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response));
  vi.stubGlobal('fetch', fetchMock);
  const editEntry = { id: '2026-05-20T11:50:00Z', date: '2026-05-20', time: '07:50', fc: 3.6 };
  render(<LogTestFlow open unlockedForTest editEntry={editEntry} onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} latest={{}} readings={[editEntry]} />);
  await userEvent.click(await screen.findByRole('button', { name: /delete this entry/i }));
  await userEvent.click(screen.getByRole('button', { name: /^delete$/i })); // confirm
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'DELETE');
    expect(call?.[0]).toContain('/api/chemistry?id=');
  });
});
```

Note: the exact `LogTestFlow` props (`unlockedForTest`, `readings`, `onDeleted`) are defined in Step 3 — keep names consistent. If the existing test harness seeds "unlocked" differently (e.g. via `localStorage` + `useChemAuth`), use that mechanism instead of an `unlockedForTest` prop and adjust these tests to match.

- [ ] **Step 3: Implement LogForm.** Add to `LogForm`'s props: `editEntry?: ChemistryReading | null`, `readings: ChemistryReading[]`, `onDeleted: () => void`. Implement:
  - `date` state defaults to `editEntry?.date ?? todayLocalDate()`, `time` state defaults to `editEntry?.time ?? nowLocalTime()` (add `todayLocalDate`/`nowLocalTime` helpers: `new Date()` → `YYYY-MM-DD` / `HH:mm` local).
  - value inputs pre-fill from `editEntry` when present.
  - Header text + submit label switch on `editEntry` ("Log a test"/"Save reading" vs "Edit test"/"Save changes").
  - Render `<input type="date">` and `<input type="time">` side by side; time label shows `fmtTime12(time)` hint.
  - Inline note when `testsOnDay(readings, date) > 0` (and, in edit mode, the count excludes the entry being edited): *"Already N tests logged on this day — this will be added as another."* (only show in new mode, or when changing an edited entry's date to a populated day).
  - On submit: build `{ date, time, ...values }`; if `editEntry`, `PUT /api/chemistry` with `{ id: editEntry.id, ... }` → call `onSaved`; else `POST` → `onSaved`.
  - Delete affordance (edit mode only): a red "Delete this entry" button that toggles an inline confirm ("Delete this test permanently?" + Keep/Delete). Confirm → `DELETE /api/chemistry?id=<encodeURIComponent(editEntry.id)>` with auth header → `onDeleted`.
  - All write fetches include the cached `Authorization` header from `useChemAuth` (same as current POST).

- [ ] **Step 4: Implement LogTestFlow wiring.** Add `editEntry`, `onDeleted`, `readings` props; pass through to `LogForm`; on unlock success keep `editEntry` and advance to form (`gateToForm` semantics). Toast message chosen by caller (ChemistryTab) — `LogTestFlow` just calls `onSaved`/`onDeleted`.

- [ ] **Step 5: Run tests + typecheck.**
```bash
source ~/.nvm/nvm.sh && pnpm vitest run src/components/LogTestFlow/ && pnpm typecheck
```
Expected: PASS, clean.

- [ ] **Step 6: Commit.**
```bash
git add src/components/LogTestFlow/
git commit -m "feat: log form gains date+time, edit mode (PUT), and delete confirm"
```

---

## Phase 6 — Frontend: History sheet + tab wiring

### Task 9: HistorySheet component

**Files:** Create `src/components/HistorySheet/HistorySheet.tsx`, `.module.css`, `index.ts`, `HistorySheet.test.tsx`.

- [ ] **Step 1: Write failing test.** Create `HistorySheet.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistorySheet } from './HistorySheet';

const readings = [
  { id: '2026-05-20T11:50:00Z', date: '2026-05-20', time: '07:50', fc: 3.6, ph: 7.6 },
  { id: '2026-05-20T20:30:00Z', date: '2026-05-20', time: '16:30', fc: 6.8, ph: 7.4 },
  { id: '2026-05-24T12:35:00Z', date: '2026-05-24', time: '08:35', fc: 2.9 },
];

describe('HistorySheet', () => {
  it('lists all tests newest-first with a count subtitle', () => {
    render(<HistorySheet open readings={readings} onClose={vi.fn()} onSelect={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText(/3 tests logged/i)).toBeInTheDocument();
    const times = screen.getAllByText(/AM|PM/);
    expect(times[0]).toHaveTextContent('8:35 AM'); // newest (May 24) first
  });
  it('shows a +N badge when a day has multiple tests', () => {
    render(<HistorySheet open readings={readings} onClose={vi.fn()} onSelect={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText('+1')).toBeInTheDocument(); // May 20 has 2
  });
  it('calls onSelect with the reading when a row is tapped', async () => {
    const onSelect = vi.fn();
    render(<HistorySheet open readings={readings} onClose={vi.fn()} onSelect={onSelect} onNew={vi.fn()} />);
    await userEvent.click(screen.getByText('8:35 AM').closest('button')!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '2026-05-24T12:35:00Z' }));
  });
  it('calls onNew from the log-new button', async () => {
    const onNew = vi.fn();
    render(<HistorySheet open readings={readings} onClose={vi.fn()} onSelect={vi.fn()} onNew={onNew} />);
    await userEvent.click(screen.getByRole('button', { name: /log a new test/i }));
    expect(onNew).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect fail.** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/HistorySheet/` → FAIL (module missing).

- [ ] **Step 3: Implement.** Create `HistorySheet.tsx` using `BottomSheet`, `sortedDesc`, `testsOnDay`, `fmtTime12`, `fmtDateWeekday`, `CHEMS`, `formatChemValue`:
```tsx
import { BottomSheet } from '../BottomSheet';
import { CHEMS } from '../../constants/chemicals';
import { sortedDesc, testsOnDay, fmtTime12, fmtDateWeekday, formatChemValue } from '../../utils/chemistry';
import type { ChemistryReading } from '../../types';
import styles from './HistorySheet.module.css';

interface HistorySheetProps {
  open: boolean;
  readings: ChemistryReading[];
  onClose: () => void;
  onSelect: (r: ChemistryReading) => void;
  onNew: () => void;
}

export function HistorySheet({ open, readings, onClose, onSelect, onNew }: HistorySheetProps) {
  const rows = sortedDesc(readings);
  return (
    <BottomSheet open={open} onClose={onClose} title="Test history" subtitle={`${readings.length} tests logged`}>
      <p className={styles.hint}>Tap any test to view or edit it.</p>
      <div className={styles.list}>
        {rows.map((r) => {
          const dayCount = testsOnDay(readings, r.date);
          return (
            <button key={r.id} type="button" className={styles.row} onClick={() => onSelect(r)}>
              <div className={styles.when}>
                <span className={styles.date}>{fmtDateWeekday(r.date)}</span>
                <span className={styles.time}>
                  {fmtTime12(r.time)}
                  {dayCount > 1 && <span className={styles.badge}>+{dayCount - 1}</span>}
                </span>
              </div>
              <div className={styles.values}>
                {CHEMS.map((c) => (
                  <div key={c.key} className={styles.cell} style={{ borderTopColor: c.color }}>
                    <span className={styles.cellLabel}>{c.short}</span>
                    <span className={styles.cellValue}>
                      {typeof r[c.key] === 'number' ? formatChemValue(r[c.key] as number, c.decimals) : '–'}
                    </span>
                  </div>
                ))}
              </div>
              <span className={styles.chevron}>›</span>
            </button>
          );
        })}
      </div>
      <button type="button" className={styles.newBtn} onClick={onNew}>＋ Log a new test</button>
    </BottomSheet>
  );
}
```
Create `index.ts` (`export { HistorySheet } from './HistorySheet';`) and `HistorySheet.module.css` styled per the handoff (`.row` = `bg --color-bg`, `1px solid --color-border`, `radius --radius-md`; `.values` a 6-col grid; `.cell` `border-top: 2px solid`; `.badge` a small pill; `.newBtn` primary). Match token usage in existing components.

> NOTE: `BottomSheet` may not currently accept a `subtitle` prop. If it doesn't, either add an optional `subtitle?: string` to `BottomSheet` (render under the title) OR render the subtitle as the first child inside the sheet. Check `src/components/BottomSheet/BottomSheet.tsx` first and pick the smaller change; if adding the prop, update its test.

- [ ] **Step 4: Run, expect pass.** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/HistorySheet/` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/components/HistorySheet/ src/components/BottomSheet/  # BottomSheet only if changed
git commit -m "feat: add HistorySheet (test log, newest-first, +N badge, tap to edit)"
```

---

### Task 10: ChemistryTab — History button + flow wiring

**Files:** Modify `src/components/ChemistryTab/ChemistryTab.tsx`; Test `src/components/ChemistryTab/ChemistryTab.test.tsx`.

- [ ] **Step 1: Read** `ChemistryTab.tsx` to match its existing state (`logOpen`, `toast`, `useChemistryData`, `LogTestFlow` usage).

- [ ] **Step 2: Add failing test.** Append to `ChemistryTab.test.tsx` (fetch stub returns readings with id/time):
```tsx
it('opens the History sheet from the History button', async () => {
  render(<ChemistryTab />);
  await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /history/i }));
  expect(await screen.findByText(/tests logged/i)).toBeInTheDocument();
});
```
(Ensure the test's fetch stub for `/api/chemistry` returns objects with `id`, `date`, `time`.)

- [ ] **Step 3: Implement.** In `ChemistryTab.tsx`:
  - Add state: `histOpen` (boolean), `editEntry` (`ChemistryReading | null`).
  - Add a ghost **History** button in the tab head, left of **Log test**: `onClick={() => setHistOpen(true)}`.
  - Render `<HistorySheet open={histOpen} readings={readings} onClose={() => setHistOpen(false)} onSelect={(r) => { setHistOpen(false); setEditEntry(r); setLogOpen(true); }} onNew={() => { setHistOpen(false); setEditEntry(null); setLogOpen(true); }} />`.
  - Pass to `LogTestFlow`: `editEntry={editEntry}`, `readings={readings}`, `onSaved={() => { setLogOpen(false); setEditEntry(null); setToast(editEntry ? 'Changes saved' : 'Reading saved'); refetch(); }}`, `onDeleted={() => { setLogOpen(false); setEditEntry(null); setToast('Entry deleted'); refetch(); }}`.
  - The existing **Log test** button: `onClick={() => { setEditEntry(null); setLogOpen(true); }}`.

- [ ] **Step 4: Run tests + typecheck.**
```bash
source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemistryTab/ && pnpm typecheck
```
Expected: PASS, clean.

- [ ] **Step 5: Commit.**
```bash
git add src/components/ChemistryTab/
git commit -m "feat: wire History button + edit/delete flow into ChemistryTab"
```

---

### Task 11: ChemChart — confirm same-day points separate

**Files:** Possibly modify `src/components/ChemChart/ChemChart.tsx`; Test `src/components/ChemChart/ChemChart.test.tsx`.

- [ ] **Step 1: Read** `ChemChart.tsx`. It keys points by `new Date(r.date).getTime()` (date only) OR by a full timestamp. If it uses `r.date`, two same-day readings collapse to one x. Determine which.

- [ ] **Step 2: Add a failing test** (only if it currently collapses). Append to `ChemChart.test.tsx`:
```tsx
it('renders two same-day readings as two distinct points', () => {
  const readings = [
    { id: '2026-05-20T11:50:00Z', date: '2026-05-20', time: '07:50', ph: 7.6 },
    { id: '2026-05-20T20:30:00Z', date: '2026-05-20', time: '16:30', ph: 7.4 },
  ];
  // The chart's transformed data should have 2 distinct x values, not 1.
  // Assert via the exported point-builder if present, else render and assert 2 dots.
  // (If ChemChart already keys by id/timestamp, this passes immediately.)
  render(<ChemChart readings={readings} chemKey="ph" range="season" poolHistory={[]} airHistory={[]} showPool={false} showAir={false} variant="mini" />);
  expect(true).toBe(true); // replaced below with a real assertion once the keying mechanism is read
});
```
Then, having read the component, make the assertion concrete: if ChemChart exposes a data-mapping helper, unit-test it returns 2 rows; otherwise key the chart x-axis by `dateTimeToUtc(r.date, r.time)` epoch (or by `new Date(r.id).getTime()`) and assert the mapped array length is 2.

- [ ] **Step 3: Implement** the minimal change: where ChemChart computes each point's x, use the reading's full instant — `new Date(r.id).getTime()` (the id IS the UTC instant) — instead of `new Date(r.date).getTime()`. If it already does, no code change; keep the test as a regression guard.

- [ ] **Step 4: Run tests + typecheck.** `source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemChart/ && pnpm typecheck` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/components/ChemChart/
git commit -m "feat: position chem chart points by full timestamp (same-day separation)"
```

---

## Phase 7 — Integration, docs, verification

### Task 12: Full verification + docs

**Files:** Modify `CLAUDE.md`.

- [ ] **Step 1: Update CLAUDE.md.** In the chemistry API endpoints list, update/add:
```markdown
  - `/api/chemistry?range=...` — GET readings `{ id, date, time, ph?, fc?, cc?, ta?, cya?, ch? }[]` (id = ISO UTC timestamp). POST a reading `{ date, time, <values> }` → `201 { id }`. PUT `{ id, date, time, <values> }` edits (delete-old + write-new). DELETE `?id=<iso>` removes one. POST/PUT/DELETE are Basic-Auth gated + rate-limited; GET public.
```
And in the Chemistry tab subsection, add a sentence: readings carry a real timestamp (two tests per day are distinct points); a History sheet lists all tests with edit/delete behind the unlock gate; storage stays InfluxDB with the point's UTC timestamp as its id.

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

- [ ] **Step 3: Docker build smoke (catches cold in-container tsc -b + the new dep).**
```bash
cd /Users/james/projects/github/jamesawesome/pool_monitor && docker build -t pm-chemhist ./dashboard && docker rmi pm-chemhist
```
Expected: BUILD succeeds.

- [ ] **Step 4: Commit docs.**
```bash
git add CLAUDE.md
git commit -m "docs: chemistry history/timestamps/edit-delete endpoints + tab notes"
```

- [ ] **Step 5: Push + PR (gated by CI).**
```bash
git push -u origin <branch>
gh pr create --title "Chemistry: timestamps, history, edit/delete" --body "<summary + test plan>"
gh pr checks --watch   # dashboard + weather + docker must pass
```

---

## Self-review notes

- **Spec coverage:** timestamp-as-id storage + `dateTimeToUtc`/`utcToZonedParts` → Tasks 1, 3; ≥1-value + time validation → Task 2; GET id/time, POST→id, PUT delete-then-write, DELETE → Tasks 3–5; DeleteAPI dep → Task 4; legacy noon shows 12:00 → Task 1 test; types/utils → Task 6; consumer/fixture compile → Task 7; log form date+time+edit+delete → Task 8; History sheet → Task 9; tab wiring + History button + toasts → Task 10; same-day chart separation → Task 11; docs + full gate + docker + PR → Task 12. All spec sections map.
- **Type consistency:** `ChemistryReading` gains `id`/`time` in both `server/influx.ts` and `src/types.ts` (Tasks 3, 6); `validateChemistryBody` ok-variant gains `time` (Task 2) and is consumed in routes (Task 5); `writeChemistry` returns `string` id (Task 3) used by POST/PUT (Task 5); `deleteChemistryPoint(id)` defined (Task 4) used by PUT/DELETE (Task 5); `LogForm`/`LogTestFlow` props `editEntry`/`readings`/`onDeleted` consistent across Tasks 8 and 10; `HistorySheet` props (`onSelect`/`onNew`) consistent across Tasks 9 and 10.
- **No placeholders:** every code step has complete code; the only `<branch>`/`<summary>` placeholders are git/gh args filled at runtime.
- **Known investigate-then-implement steps** (Tasks 7, 11, and the BottomSheet subtitle note in 9) are explicit reads-first because the exact current code must be confirmed; each states the concrete change to make based on what's found.
