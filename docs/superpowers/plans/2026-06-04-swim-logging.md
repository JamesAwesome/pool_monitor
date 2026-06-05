# Swim Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anonymous emoji swim-session logging — markers riding the pool-temp and chemistry curves, a log/edit/delete flow behind the existing chemistry unlock, and a History sheet (All swims + Leaderboard).

**Architecture:** Store swims in a new InfluxDB `swim` measurement, mirroring the chemistry feature exactly (timestamp = the swim's date+time in `TIMEZONE`, which is also the stable id; `people` is one comma-joined string field). Server routes mirror `/api/chemistry` and reuse the same Basic-Auth gate + rate limiter. On the client, markers render via a new `SwimLane` recharts child modeled on `WeatherLane`; the log/history UI is ported from the high-fidelity prototype into React + TypeScript + CSS Modules.

**Tech Stack:** Express + `@influxdata/influxdb-client`, React 19, recharts, TypeScript, Vitest, CSS Modules. Run all dashboard commands prefixed with `source ~/.nvm/nvm.sh &&` from `dashboard/`.

**Design spec:** `docs/superpowers/specs/2026-06-04-swim-logging-design.md`
**Prototype reference:** `~/Desktop/swim_logging.zip` → `design_handoff_swim_logging/` (extract with `unzip ~/Desktop/swim_logging.zip -d /tmp/swim_handoff`). Key files: `swim.jsx` (component markup), `swim-data.js` (helpers + emoji sets), `Pool Sessions - Emoji Log.html` (the `<style>` block = exact CSS to port).

---

## File Structure

**New — server:**
- `dashboard/server/swim.ts` — `validateSwimBody` + people parsing helpers.
- `dashboard/server/swim.test.ts` — validation tests.

**New — client:**
- `dashboard/src/constants/swim.ts` — starter emoji roster + categorized keyboard set.
- `dashboard/src/utils/swim.ts` — `sortedSwims`, `totalDips`, `recentEmoji`, `leaderboard`.
- `dashboard/src/utils/swim.test.ts`.
- `dashboard/src/utils/markerPositions.ts` — pure x/y positioning math for `SwimLane`.
- `dashboard/src/utils/markerPositions.test.ts`.
- `dashboard/src/hooks/useSwimData.ts` + `useSwimData.test.ts`.
- `dashboard/src/components/SwimLane/SwimLane.tsx`, `Avatars.tsx`, `SwimLane.module.css`, `index.ts`.
- `dashboard/src/components/SwimLogFlow/SwimLogFlow.tsx`, `SwimLogForm.tsx`, `EmojiKeyboard.tsx`, `SwimLogFlow.module.css`, `index.ts` + `SwimLogForm.test.tsx`.
- `dashboard/src/components/SwimHistorySheet/SwimHistorySheet.tsx`, `SwimHistorySheet.module.css`, `index.ts` + `SwimHistorySheet.test.tsx`.

**Modified:**
- `dashboard/src/types.ts` — add `SwimSession`.
- `dashboard/server/influxDelete.ts` — generalize `deletePoint(id, measurement)`.
- `dashboard/server/influx.ts` — add `querySwims`, `writeSwim`; re-export `deletePoint`.
- `dashboard/server/influx.test.ts` — add `querySwims`/`writeSwim` tests.
- `dashboard/server/routes.ts` — add `/api/swims` GET/POST/PUT/DELETE.
- `dashboard/server/routes.integration.test.ts` — add swim route tests.
- `dashboard/src/components/LogTestFlow/UnlockSheet.tsx` — optional `unlockTitle` prop.
- `dashboard/src/components/TempChart/TempChart.tsx` — render `SwimLane`, swim legend key.
- `dashboard/src/components/ChemChart/ChemChart.tsx` — render `SwimLane` (scale mode).
- `dashboard/src/components/ChemFocusSheet/ChemFocusSheet.tsx` — thread `swims` to `ChemChart`.
- `dashboard/src/components/ChemistryTab/ChemistryTab.tsx` — fetch swims, pass to focus sheet.
- `dashboard/src/App.tsx` — TemperatureTab: fetch swims, header actions, sheets, wiring.

---

## Phase A — Backend

### Task A1: `SwimSession` type

**Files:**
- Modify: `dashboard/src/types.ts`

- [ ] **Step 1: Add the interface** at the end of `src/types.ts`:

```ts
export interface SwimSession {
  id: string;        // ISO-UTC instant of the point (stable id)
  date: string;      // YYYY-MM-DD in app timezone
  time: string;      // HH:mm 24h in app timezone
  people: string[];  // emoji, 1..N (e.g. ['🦦','🐢'])
}
```

- [ ] **Step 2: Typecheck**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/types.ts
git commit -m "feat(swim): add SwimSession type"
```

---

### Task A2: Swim body validation (`server/swim.ts`)

**Files:**
- Create: `dashboard/server/swim.ts`
- Test: `dashboard/server/swim.test.ts`

- [ ] **Step 1: Write the failing test** `server/swim.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateSwimBody } from './swim';

describe('validateSwimBody', () => {
  it('accepts a valid swim with one person', () => {
    const r = validateSwimBody({ date: '2026-05-20', time: '14:30', people: ['🦦'] });
    expect(r).toEqual({ ok: true, date: '2026-05-20', time: '14:30', people: ['🦦'] });
  });

  it('accepts multiple people', () => {
    const r = validateSwimBody({ date: '2026-05-20', time: '14:30', people: ['🦦', '🐢'] });
    expect(r.ok).toBe(true);
  });

  it('trims people entries', () => {
    const r = validateSwimBody({ date: '2026-05-20', time: '14:30', people: [' 🦦 '] });
    expect(r).toMatchObject({ ok: true, people: ['🦦'] });
  });

  it('rejects a non-object body', () => {
    expect(validateSwimBody(null)).toEqual({ ok: false, error: 'Body must be an object' });
  });

  it('rejects an invalid date', () => {
    expect(validateSwimBody({ date: 'nope', time: '14:30', people: ['🦦'] }).ok).toBe(false);
  });

  it('rejects an invalid time', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '25:00', people: ['🦦'] }).ok).toBe(false);
  });

  it('rejects an empty people array', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: [] }).ok).toBe(false);
  });

  it('rejects a non-array people', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: '🦦' }).ok).toBe(false);
  });

  it('rejects an entry containing a comma (delimiter safety)', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: ['a,b'] }).ok).toBe(false);
  });

  it('rejects an empty-string entry', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: ['🦦', ' '] }).ok).toBe(false);
  });

  it('rejects an entry longer than 16 chars', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: ['x'.repeat(17)] }).ok).toBe(false);
  });

  it('rejects more than 30 people', () => {
    const many = Array.from({ length: 31 }, () => '🦦');
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: many }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/swim.test.ts`
Expected: FAIL ("validateSwimBody is not a function" / module not found)

- [ ] **Step 3: Write `server/swim.ts`**

```ts
import { isValidTime } from './chemistry.js';

export const MAX_PEOPLE = 30;
export const MAX_PERSON_LEN = 16;

export type ValidatedSwim =
  | { ok: true; date: string; time: string; people: string[] }
  | { ok: false; error: string };

export function validateSwimBody(body: unknown): ValidatedSwim {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Body must be an object' };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.date !== 'string' || Number.isNaN(new Date(b.date).getTime())) {
    return { ok: false, error: 'Invalid or missing date' };
  }
  if (!isValidTime(b.time)) {
    return { ok: false, error: 'Invalid or missing time' };
  }
  if (!Array.isArray(b.people) || b.people.length === 0) {
    return { ok: false, error: 'At least one person is required' };
  }
  if (b.people.length > MAX_PEOPLE) {
    return { ok: false, error: `At most ${MAX_PEOPLE} people` };
  }

  const people: string[] = [];
  for (const raw of b.people) {
    if (typeof raw !== 'string') return { ok: false, error: 'Each person must be a string' };
    const p = raw.trim();
    if (p.length === 0) return { ok: false, error: 'Person cannot be empty' };
    if (p.length > MAX_PERSON_LEN) return { ok: false, error: 'Person is too long' };
    if (p.includes(',')) return { ok: false, error: 'Person cannot contain a comma' };
    people.push(p);
  }

  return { ok: true, date: b.date, time: b.time as string, people };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/swim.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/swim.ts dashboard/server/swim.test.ts
git commit -m "feat(swim): server-side swim body validation"
```

---

### Task A3: Generalize the delete helper

**Files:**
- Modify: `dashboard/server/influxDelete.ts`
- Test: `dashboard/server/influxDelete.test.ts`

- [ ] **Step 1: Add a failing test** to `server/influxDelete.test.ts` (append inside the existing file; it already mocks `DeleteAPI`). Add a case asserting the measurement predicate is parameterized. First read the existing test to match its mock variable names, then add:

```ts
  it('deletes from a custom measurement when given one', async () => {
    await deletePoint('2026-05-20T20:30:00.000Z', 'swim');
    const body = postDelete.mock.calls.at(-1)![0].body;
    expect(body.predicate).toBe('_measurement="swim"');
  });

  it('defaults to the chemistry measurement', async () => {
    await deletePoint('2026-05-20T20:30:00.000Z');
    const body = postDelete.mock.calls.at(-1)![0].body;
    expect(body.predicate).toBe('_measurement="chemistry"');
  });
```

Also add `deletePoint` to the import at the top of the test file (alongside `deleteChemistryPoint`). If the existing mock's spy is not named `postDelete`, use whatever name the file already uses.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/influxDelete.test.ts`
Expected: FAIL ("deletePoint is not a function")

- [ ] **Step 3: Rewrite `server/influxDelete.ts`**

```ts
import { DeleteAPI } from '@influxdata/influxdb-client-apis'
import { InfluxDB } from '@influxdata/influxdb-client'

const url = process.env.INFLUXDB_URL ?? 'http://localhost:8086'
const token = process.env.INFLUXDB_TOKEN ?? ''
const org = process.env.INFLUXDB_ORG ?? ''
const bucket = process.env.INFLUXDB_BUCKET ?? ''

/**
 * Delete the single point at the given ISO instant from `measurement`. InfluxDB
 * deletes a half-open [start, stop) window, so we delete [id, id+1ms) filtered to
 * the measurement — narrow enough to hit exactly that point.
 */
export async function deletePoint(id: string, measurement = 'chemistry'): Promise<void> {
  const deleteApi = new DeleteAPI(new InfluxDB({ url, token }))
  const start = new Date(id).toISOString()
  const stop = new Date(new Date(id).getTime() + 1).toISOString()
  await deleteApi.postDelete({
    org,
    bucket,
    body: { start, stop, predicate: `_measurement="${measurement}"` },
  })
}

/** @deprecated use deletePoint(id) — kept for existing chemistry callers. */
export function deleteChemistryPoint(id: string): Promise<void> {
  return deletePoint(id, 'chemistry')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/influxDelete.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/influxDelete.ts dashboard/server/influxDelete.test.ts
git commit -m "refactor(influx): generalize deletePoint to any measurement"
```

---

### Task A4: `querySwims` + `writeSwim` (`server/influx.ts`)

**Files:**
- Modify: `dashboard/server/influx.ts`
- Test: `dashboard/server/influx.test.ts`

- [ ] **Step 1: Add failing tests** to `server/influx.test.ts`. Add `querySwims, writeSwim` to the dynamic import line (currently `const { queryHistory, ... writeChemistry } = await import('./influx')`), then append:

```ts
describe('querySwims', () => {
  it('maps each point to id + derived date/time + split people', async () => {
    queryApiStub.collectRows.mockResolvedValueOnce([
      { _time: '2026-05-20T18:30:00.000Z', people: '🦦,🐢' },  // 14:30 EDT
      { _time: '2026-05-21T16:05:00.000Z', people: '🐬' },     // 12:05 EDT
    ]);
    const out = await querySwims('season', 'America/New_York');
    expect(out).toEqual([
      { id: '2026-05-20T18:30:00.000Z', date: '2026-05-20', time: '14:30', people: ['🦦', '🐢'] },
      { id: '2026-05-21T16:05:00.000Z', date: '2026-05-21', time: '12:05', people: ['🐬'] },
    ]);
  });

  it('filters the swim measurement', async () => {
    queryApiStub.collectRows.mockResolvedValueOnce([]);
    await querySwims('season', 'America/New_York');
    expect(queryApiStub.collectRows.mock.calls.at(-1)![0]).toContain('_measurement == "swim"');
  });
});

describe('writeSwim', () => {
  it('writes a point at the date+time instant with a joined people field', async () => {
    const id = await writeSwim({ date: '2026-05-20', time: '14:30', people: ['🦦', '🐢'] }, 'America/New_York');
    expect(writeApiStub.writePoint).toHaveBeenCalledOnce();
    expect(writeApiStub.flush).toHaveBeenCalledOnce();
    expect(id).toBe('2026-05-20T18:30:00.000Z');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts`
Expected: FAIL ("querySwims is not a function")

- [ ] **Step 3: Implement in `server/influx.ts`.** Near the existing chemistry functions, import `SwimSession` and add. (`Point`, `getQueryApi`, `getWriteApi`, `bucket`, `parseRange`, `dateTimeToUtc`, `utcToZonedParts` already exist in this file.)

At the top, add to the type import from chemistry: nothing new needed; add a `SwimSession` import from the client types is not available server-side — define the shape inline. Add:

```ts
export interface SwimSession {
  id: string
  date: string
  time: string
  people: string[]
}

export async function querySwims(
  range: string,
  timeZone = process.env.TIMEZONE ?? 'America/New_York',
): Promise<SwimSession[]> {
  const api = getQueryApi()
  const query = `
    from(bucket: "${bucket}")
      |> range(${parseRange(range)})
      |> filter(fn: (r) => r._measurement == "swim")
      |> filter(fn: (r) => r._field == "people")
      |> sort(columns: ["_time"])
  `
  const rows = await api.collectRows<Record<string, unknown>>(query)
  return rows.map((row) => {
    const id = row._time as string
    const { date, time } = utcToZonedParts(id, timeZone)
    const people = typeof row._value === 'string' && row._value.length > 0
      ? row._value.split(',')
      : []
    return { id, date, time, people }
  })
}

export async function writeSwim(
  input: { date: string; time: string; people: string[] },
  timeZone = process.env.TIMEZONE ?? 'America/New_York',
): Promise<string> {
  const writeApi = getWriteApi()
  const when = dateTimeToUtc(input.date, input.time, timeZone)
  const point = new Point('swim').timestamp(when).stringField('people', input.people.join(','))
  writeApi.writePoint(point)
  await writeApi.flush()
  return when.toISOString()
}
```

Also add a re-export near the existing `export { deleteChemistryPoint } from './influxDelete.js'`:

```ts
export { deletePoint } from './influxDelete.js'
```

- [ ] **Step 4: Run to verify pass**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/influx.ts dashboard/server/influx.test.ts
git commit -m "feat(swim): querySwims + writeSwim influx functions"
```

---

### Task A5: Swim API routes

**Files:**
- Modify: `dashboard/server/routes.ts`
- Test: `dashboard/server/routes.integration.test.ts`

- [ ] **Step 1: Add failing integration tests** to `server/routes.integration.test.ts`. First extend the `vi.mock('./influx.js', ...)` factory with the swim functions and a deletePoint:

```ts
  querySwims: vi.fn(async () => []),
  writeSwim: vi.fn(async () => '2026-05-20T18:30:00.000Z'),
  deletePoint: vi.fn(async () => {}),
```

Add `querySwims, writeSwim, deletePoint` to the `import { writeChemistry, deleteChemistryPoint } from './influx.js'` line. Then append a describe block:

```ts
describe('/api/swims', () => {
  const auth = 'Basic ' + Buffer.from('tester:secret').toString('base64');

  it('GET is public and returns an array', async () => {
    const res = await fetch(`${base}/api/swims?range=season`);
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('GET rejects an injection-ish range with 400', async () => {
    const res = await fetch(`${base}/api/swims?range=${encodeURIComponent('30d) |> evil')}`);
    expect(res.status).toBe(400);
  });

  it('POST without auth is 401', async () => {
    const res = await fetch(`${base}/api/swims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-05-20', time: '14:30', people: ['🦦'] }),
    });
    expect(res.status).toBe(401);
  });

  it('POST with auth + valid body is 201 with an id', async () => {
    const res = await fetch(`${base}/api/swims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ date: '2026-05-20', time: '14:30', people: ['🦦', '🐢'] }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe('2026-05-20T18:30:00.000Z');
  });

  it('POST with auth + invalid body is 400', async () => {
    const res = await fetch(`${base}/api/swims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ date: '2026-05-20', time: '14:30', people: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('DELETE with a valid id + auth is 200', async () => {
    const id = encodeURIComponent('2026-05-20T18:30:00.000Z');
    const res = await fetch(`${base}/api/swims?id=${id}`, { method: 'DELETE', headers: { Authorization: auth } });
    expect(res.status).toBe(200);
    expect(deletePoint).toHaveBeenCalledWith('2026-05-20T18:30:00.000Z', 'swim');
  });
});
```

Note: the rate limiter allows 10 attempts/15min per IP; these tests share one IP. Keep the count of authenticated write attempts at/below 10 (the block above makes 4 — fine). If you add more, reset between tests is not available (the limiter is module-level), so keep writes minimal.

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/routes.integration.test.ts`
Expected: FAIL (404 on /api/swims)

- [ ] **Step 3: Implement routes in `server/routes.ts`.** Update the influx import to include the swim functions and `deletePoint`:

```ts
import { querySensors, queryStats, queryHistory, queryBatteries, queryBatteryHistory, querySeasonHistory, queryStatDetail, queryWeatherCurrent, queryWeatherHistory, queryChemistry, writeChemistry, deleteChemistryPoint, querySwims, writeSwim, deletePoint } from './influx.js'
```

Add the swim validator import:

```ts
import { validateSwimBody } from './swim.js'
```

Add a body-parser line next to the chemistry one (near line 22):

```ts
router.use('/api/swims', express.json())
```

Add the routes (place after the chemistry routes, before `/api/health`):

```ts
router.get('/api/swims', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : 'season'
    if (req.query.range !== undefined && !isValidRange(range)) {
      res.status(400).json({ error: 'Invalid range' })
      return
    }
    res.json(await querySwims(range))
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.post('/api/swims', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const result = validateSwimBody(req.body)
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    const id = await writeSwim({ date: result.date, time: result.time, people: result.people })
    res.status(201).json({ id })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.put('/api/swims', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const id = (req.body as { id?: unknown })?.id
    if (!isValidId(id)) { res.status(400).json({ error: 'Invalid or missing id' }); return }
    const result = validateSwimBody(req.body)
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    await deletePoint(id as string, 'swim')
    const newId = await writeSwim({ date: result.date, time: result.time, people: result.people })
    res.status(200).json({ id: newId })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.delete('/api/swims', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!isValidId(id)) { res.status(400).json({ error: 'Invalid or missing id' }); return }
    await deletePoint(id, 'swim')
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})
```

`isValidId` is already imported from `./chemistry.js` in routes.ts (used by chemistry PUT/DELETE). Verify it is in the import list; if not, add it.

- [ ] **Step 4: Run to verify pass**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/routes.integration.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + commit**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck`

```bash
git add dashboard/server/routes.ts dashboard/server/routes.integration.test.ts
git commit -m "feat(swim): /api/swims GET/POST/PUT/DELETE routes"
```

---

## Phase B — Client data layer

### Task B1: Constants (`constants/swim.ts`)

**Files:**
- Create: `dashboard/src/constants/swim.ts`

- [ ] **Step 1: Create the file.** Copy the two arrays from the prototype `swim-data.js` (`window.SWIM_EMOJI` and `window.EMOJI_KEYBOARD`) verbatim into typed exports:

```ts
/** Curated anonymous starter roster — seeds "recent swimmers" before any history. */
export const SWIM_EMOJI: string[] = [
  '🦦', '🐢', '🐬', '🦆', '🐸', '🦭',
  '🐙', '🐠', '🦀', '🦩', '🏊', '🤿',
];

export interface EmojiCategory { cat: string; list: string[] }

/** Categorized picker set behind the ＋ tile (a representative subset, not all Unicode). */
export const EMOJI_KEYBOARD: EmojiCategory[] = [
  { cat: 'Sea & animals', list: ['🦦', '🐢', '🐬', '🦭', '🐳', '🐋', '🦈', '🐙', '🐠', '🐟', '🐡', '🦑', '🦀', '🦞', '🦐', '🐚', '🐊', '🐸', '🦎', '🐍', '🦆', '🦢', '🦩', '🐧', '🐥', '🦔', '🐶', '🐱', '🦊', '🐼', '🐨', '🐵', '🦄'] },
  { cat: 'Water people', list: ['🏊', '🏊‍♀️', '🏊‍♂️', '🤿', '🤽', '🤽‍♀️', '🤽‍♂️', '🏄', '🏄‍♀️', '🏄‍♂️', '🚣', '🤾', '🧜', '🧜‍♀️', '🧜‍♂️', '🧗', '🤸', '⛹️'] },
  { cat: 'People', list: ['🧑', '👦', '👧', '👶', '👩', '👨', '🧓', '👵', '👴', '🧒', '👱', '🧔', '👮', '🕵️', '👷', '🤴', '👸', '🧙', '🦸', '🦹', '🤡', '👻', '🤖', '👽'] },
  { cat: 'Smileys', list: ['😀', '😄', '😁', '😆', '😅', '😂', '🙂', '😊', '😇', '😍', '🤩', '😎', '🥳', '😜', '🤪', '😝', '🤗', '🤔', '😴', '🥶', '🥵', '😤', '😈', '🤠'] },
  { cat: 'Fun & objects', list: ['⭐', '🌟', '✨', '⚡', '🔥', '💧', '🌊', '☀️', '🌈', '🍉', '🍑', '🥥', '🍦', '🎈', '🎉', '🏆', '🥇', '🏅', '⚽', '🏐', '🛟', '🦺', '👑', '💎'] },
];
```

- [ ] **Step 2: Typecheck + commit**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck`

```bash
git add dashboard/src/constants/swim.ts
git commit -m "feat(swim): emoji roster + keyboard constants"
```

---

### Task B2: Pure helpers (`utils/swim.ts`)

**Files:**
- Create: `dashboard/src/utils/swim.ts`
- Test: `dashboard/src/utils/swim.test.ts`

- [ ] **Step 1: Write the failing test** `src/utils/swim.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sortedSwims, totalDips, recentEmoji, leaderboard } from './swim';
import type { SwimSession } from '../types';

const s = (id: string, date: string, time: string, people: string[]): SwimSession => ({ id, date, time, people });

const data: SwimSession[] = [
  s('1', '2026-05-10', '12:00', ['🦦']),
  s('2', '2026-05-16', '14:00', ['🐢', '🦦']),
  s('3', '2026-05-16', '17:00', ['🐬']),
];

describe('sortedSwims', () => {
  it('orders newest first by date+time', () => {
    expect(sortedSwims(data).map((x) => x.id)).toEqual(['3', '2', '1']);
  });
  it('does not mutate the input', () => {
    const copy = [...data];
    sortedSwims(data);
    expect(data).toEqual(copy);
  });
});

describe('totalDips', () => {
  it('counts people across sessions (with dupes)', () => {
    expect(totalDips(data)).toBe(4);
  });
});

describe('recentEmoji', () => {
  it('lists most-recently-used first, unique, then seeds', () => {
    const out = recentEmoji(data, ['🦦', '🌊'], 5);
    expect(out[0]).toBe('🐬'); // newest session
    expect(new Set(out).size).toBe(out.length); // unique
    expect(out).toContain('🌊'); // seed appended
  });
  it('respects the limit', () => {
    expect(recentEmoji(data, ['a', 'b', 'c', 'd', 'e', 'f'], 3)).toHaveLength(3);
  });
});

describe('leaderboard', () => {
  it('tallies dips per emoji, descending', () => {
    expect(leaderboard(data)).toEqual([
      { emoji: '🦦', count: 2 },
      { emoji: '🐢', count: 1 },
      { emoji: '🐬', count: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/utils/swim.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/utils/swim.ts`** (ported from prototype `SwimUtil`, typed; `recentEmoji` takes the seed roster as a param for testability — callers pass `SWIM_EMOJI`):

```ts
import type { SwimSession } from '../types';

/** Newest first by date+time. Non-mutating. */
export function sortedSwims(list: SwimSession[]): SwimSession[] {
  return [...list].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

/** Total dips = people across all sessions (with dupes). */
export function totalDips(list: SwimSession[]): number {
  return list.reduce((n, s) => n + s.people.length, 0);
}

/** Emoji most-recently-used first (unique), then seeded with the starter roster. */
export function recentEmoji(list: SwimSession[], seed: string[], limit = 11): string[] {
  const seen: string[] = [];
  for (const s of sortedSwims(list)) {
    for (const p of s.people) if (!seen.includes(p)) seen.push(p);
  }
  for (const p of seed) if (!seen.includes(p)) seen.push(p);
  return seen.slice(0, limit);
}

/** Ranked tally of dips per emoji, most first. */
export function leaderboard(list: SwimSession[]): { emoji: string; count: number }[] {
  const tally: Record<string, number> = {};
  for (const s of list) for (const p of s.people) tally[p] = (tally[p] ?? 0) + 1;
  return Object.entries(tally)
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/utils/swim.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/utils/swim.ts dashboard/src/utils/swim.test.ts
git commit -m "feat(swim): pure helpers (sorted/totalDips/recentEmoji/leaderboard)"
```

---

### Task B3: Marker positioning math (`utils/markerPositions.ts`)

**Files:**
- Create: `dashboard/src/utils/markerPositions.ts`
- Test: `dashboard/src/utils/markerPositions.test.ts`

This is the heart of the overlay. `SwimLane` supplies the plotted chart points (each with a numeric `t` = epoch ms and numeric `value` = chart-unit y, possibly `undefined` for gaps) and a list of swim epochs; this returns, per swim, the value to plot and the x position. Two x modes: `index` (categorical axis — TempChart) and `scale` (numeric axis — ChemChart, where x pixel comes from the host scale, so we only need the value + epoch and let the caller apply the scale).

- [ ] **Step 1: Write the failing test** `src/utils/markerPositions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { interpolateValueAt, indexFractionAt } from './markerPositions';

const pts = [
  { t: 0, value: 10 },
  { t: 100, value: 20 },
  { t: 200, value: 10 },
];

describe('interpolateValueAt', () => {
  it('returns the endpoint value at or before the first point', () => {
    expect(interpolateValueAt(pts, -5)).toBe(10);
  });
  it('returns the endpoint value at or after the last point', () => {
    expect(interpolateValueAt(pts, 999)).toBe(10);
  });
  it('linearly interpolates between two points', () => {
    expect(interpolateValueAt(pts, 50)).toBe(15);
    expect(interpolateValueAt(pts, 150)).toBe(15);
  });
  it('returns null when there are no points', () => {
    expect(interpolateValueAt([], 50)).toBeNull();
  });
  it('skips undefined-valued gap points when bracketing', () => {
    const gappy = [{ t: 0, value: 10 }, { t: 100, value: undefined }, { t: 200, value: 30 }];
    // nearest defined points are t=0 (10) and t=200 (30); at t=100 → 20
    expect(interpolateValueAt(gappy, 100)).toBe(20);
  });
});

describe('indexFractionAt', () => {
  it('maps a time to its fractional index 0..(n-1)', () => {
    expect(indexFractionAt(pts, 0)).toBe(0);
    expect(indexFractionAt(pts, 100)).toBe(1);
    expect(indexFractionAt(pts, 50)).toBe(0.5);
    expect(indexFractionAt(pts, 150)).toBe(1.5);
  });
  it('clamps before the first / after the last', () => {
    expect(indexFractionAt(pts, -10)).toBe(0);
    expect(indexFractionAt(pts, 500)).toBe(2);
  });
  it('returns null for fewer than 2 points', () => {
    expect(indexFractionAt([{ t: 0, value: 1 }], 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/utils/markerPositions.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/utils/markerPositions.ts`**:

```ts
export interface ChartPointTV {
  t: number;                 // epoch ms
  value: number | undefined; // chart-unit y (undefined = gap)
}

/** Points with a defined value, ascending by t. */
function defined(points: ChartPointTV[]): { t: number; value: number }[] {
  return points
    .filter((p): p is { t: number; value: number } => typeof p.value === 'number')
    .sort((a, b) => a.t - b.t);
}

/**
 * Linear-interpolate the series value at epoch `t`. Uses only defined points, so
 * gaps (undefined values) are bridged. Clamps to the endpoints. Null if empty.
 */
export function interpolateValueAt(points: ChartPointTV[], t: number): number | null {
  const d = defined(points);
  if (d.length === 0) return null;
  if (t <= d[0].t) return d[0].value;
  const last = d[d.length - 1];
  if (t >= last.t) return last.value;
  for (let i = 0; i < d.length - 1; i++) {
    const a = d[i], b = d[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return a.value + (b.value - a.value) * f;
    }
  }
  return last.value;
}

/**
 * Fractional category index (0..n-1) of epoch `t` across ALL plotted points
 * (including gaps — recharts spaces categories by index regardless of value).
 * Clamps to [0, n-1]. Null for fewer than 2 points.
 */
export function indexFractionAt(points: ChartPointTV[], t: number): number | null {
  const n = points.length;
  if (n < 2) return null;
  const ts = points.map((p) => p.t);
  if (t <= ts[0]) return 0;
  if (t >= ts[n - 1]) return n - 1;
  for (let i = 0; i < n - 1; i++) {
    if (t >= ts[i] && t <= ts[i + 1]) {
      const f = ts[i + 1] === ts[i] ? 0 : (t - ts[i]) / (ts[i + 1] - ts[i]);
      return i + f;
    }
  }
  return n - 1;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/utils/markerPositions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/utils/markerPositions.ts dashboard/src/utils/markerPositions.test.ts
git commit -m "feat(swim): marker positioning math (value interp + index fraction)"
```

---

### Task B4: `useSwimData` hook

**Files:**
- Create: `dashboard/src/hooks/useSwimData.ts`
- Test: `dashboard/src/hooks/useSwimData.test.ts`

- [ ] **Step 1: Write the failing test** `src/hooks/useSwimData.test.ts` (mirror `useChemistryData.test.ts` style; use `@testing-library/react` `renderHook`, which the repo already uses):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSwimData } from './useSwimData';

const swims = [{ id: '1', date: '2026-05-20', time: '14:30', people: ['🦦'] }];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => swims })) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useSwimData', () => {
  it('fetches swims for the range and exposes them', async () => {
    const { result } = renderHook(() => useSwimData('season', 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.swims).toEqual(swims);
    expect(fetch).toHaveBeenCalledWith('/api/swims?range=season');
  });

  it('returns an empty list when the request is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => [] })) as unknown as typeof fetch);
    const { result } = renderHook(() => useSwimData('season', 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.swims).toEqual([]);
  });
});
```

(Pass `0` as the refresh interval in tests to avoid background polling; the hook treats `0`/falsy as "no interval".)

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/hooks/useSwimData.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/hooks/useSwimData.ts`**:

```ts
import { useState, useEffect, useCallback } from 'react';
import type { SwimSession } from '../types';

export interface UseSwimDataReturn {
  swims: SwimSession[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSwimData(range: string, refreshInterval = 30000): UseSwimDataReturn {
  const [swims, setSwims] = useState<SwimSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/swims?range=${encodeURIComponent(range)}`);
      const data = res.ok ? ((await res.json()) as SwimSession[]) : [];
      setSwims(data);
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

  return { swims, loading, error, refetch: fetchData };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/hooks/useSwimData.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/hooks/useSwimData.ts dashboard/src/hooks/useSwimData.test.ts
git commit -m "feat(swim): useSwimData hook"
```

---

## Phase C — `SwimLane` overlay

### Task C1: `Avatars` + `SwimLane`

**Files:**
- Create: `dashboard/src/components/SwimLane/Avatars.tsx`
- Create: `dashboard/src/components/SwimLane/SwimLane.tsx`
- Create: `dashboard/src/components/SwimLane/SwimLane.module.css`
- Create: `dashboard/src/components/SwimLane/index.ts`

**Reference:** prototype `swim.jsx` `Avatars`, `SwimLineChart` marker overlay, and `SwimMarker` (pin variant); CSS for `.swim-avatars/.swim-av/.swim-marker/.swim-stem/.swim-foot/.swim-chrome` lives in the prototype HTML `<style>` block. Port those rules into `SwimLane.module.css` (tokens: bubble `--color-surface`, 1px `--color-border`, `--shadow-sm`; stem 1.5px×18px `currentColor` @45%; foot 6px ring `currentColor`).

- [ ] **Step 1: Create `Avatars.tsx`**:

```tsx
interface AvatarsProps { people: string[]; size?: number }

/** Overlapping emoji avatars (−0.34em per extra). */
export function Avatars({ people, size = 15 }: AvatarsProps) {
  return (
    <span style={{ fontSize: size, display: 'inline-flex', alignItems: 'center' }}>
      {people.map((p, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.34 }}>{p}</span>
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Create `SwimLane.tsx`.** It is a recharts child (like `WeatherLane`), reads scales + plot area, and renders one pin per in-domain swim. `xMode='index'` uses `indexFractionAt` across `plot.width`; `xMode='scale'` uses the x-scale on the swim epoch. y always uses `interpolateValueAt` → `yScale`.

```tsx
import { useXAxisScale, useYAxisScale, usePlotArea } from 'recharts';
import type { SwimSession } from '../../types';
import { interpolateValueAt, indexFractionAt, type ChartPointTV } from '../../utils/markerPositions';
import { Avatars } from './Avatars';
import styles from './SwimLane.module.css';

interface SwimLaneProps {
  swims: SwimSession[];
  /** The plotted series for y-interpolation: epoch ms `t` + chart-unit `value`. */
  series: ChartPointTV[];
  /** index = categorical axis (TempChart); scale = numeric axis (ChemChart). */
  xMode: 'index' | 'scale';
  color: string;
  iconSize?: number;
}

/** The swim's id IS its ISO-UTC instant — directly comparable to the chart
 *  series `t` (also derived from ISO instants), so it's timezone-robust. */
function swimEpoch(s: SwimSession): number {
  return new Date(s.id).getTime();
}

export function SwimLane({ swims, series, xMode, color, iconSize = 22 }: SwimLaneProps) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  if (!xScale || !yScale || !plot || series.length === 0) return null;

  const n = series.length;

  return (
    <g className={styles.lane} style={{ color }} pointerEvents="none">
      {swims.map((s) => {
        const e = swimEpoch(s);
        const yVal = interpolateValueAt(series, e);
        if (yVal == null) return null;
        const cy = yScale(yVal);

        let cx: number | undefined;
        if (xMode === 'index') {
          const frac = indexFractionAt(series, e);
          if (frac == null) return null;
          cx = plot.x + (frac / (n - 1)) * plot.width;
        } else {
          cx = xScale(e) as number;
        }
        if (cx == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;

        const bubbleW = Math.max(iconSize, iconSize * 0.66 * s.people.length + iconSize * 0.5);
        return (
          <foreignObject key={s.id} x={cx - bubbleW / 2} y={cy - iconSize - 20} width={bubbleW} height={iconSize + 24}>
            <div className={styles.marker}>
              <span className={styles.chrome}><Avatars people={s.people} size={13} /></span>
              <span className={styles.stem} aria-hidden="true" />
              <span className={styles.foot} aria-hidden="true" />
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}
```

- [ ] **Step 3: Create `SwimLane.module.css`** porting the pin styles from the prototype. Minimum:

```css
.lane { }
.marker { position: relative; display: flex; flex-direction: column; align-items: center; height: 100%; }
.chrome {
  display: inline-flex; align-items: center; padding: 2px 5px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 999px; box-shadow: var(--shadow-sm); line-height: 1;
}
.stem { width: 1.5px; height: 18px; background: currentColor; opacity: 0.45; }
.foot {
  width: 6px; height: 6px; border-radius: 50%;
  border: 2px solid currentColor; background: var(--color-surface);
  margin-top: -3px;
}
```

(Cross-check exact spacing/sizes against the prototype `<style>` and adjust.)

- [ ] **Step 4: Create `index.ts`**: `export { SwimLane } from './SwimLane'; export { Avatars } from './Avatars';`

- [ ] **Step 5: Typecheck**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/SwimLane
git commit -m "feat(swim): SwimLane recharts overlay + Avatars"
```

---

## Phase D — Log flow

### Task D1: Parameterize `UnlockSheet`

**Files:**
- Modify: `dashboard/src/components/LogTestFlow/UnlockSheet.tsx`

- [ ] **Step 1: Add an optional `unlockTitle` prop** (default preserves chemistry copy). Change the interface and the title line:

```tsx
interface UnlockSheetProps {
  open: boolean;
  onClose: () => void;
  onUnlocked: (authHeader: string) => void;
  unlockTitle?: string;
}

export function UnlockSheet({ open, onClose, onUnlocked, unlockTitle = 'Unlock to log a test' }: UnlockSheetProps) {
```

And replace the hard-coded title paragraph:

```tsx
        <p className={styles.unlockTitle}>{unlockTitle}</p>
```

(The shared `/api/chemistry/auth-check` endpoint stays — it validates the same shared credential.)

- [ ] **Step 2: Typecheck + run existing UnlockSheet/LogTestFlow tests**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck && pnpm vitest run src/components/LogTestFlow`
Expected: PASS (existing tests unaffected by the defaulted prop)

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/LogTestFlow/UnlockSheet.tsx
git commit -m "feat(swim): UnlockSheet accepts a custom title"
```

---

### Task D2: `EmojiKeyboard`

**Files:**
- Create: `dashboard/src/components/SwimLogFlow/EmojiKeyboard.tsx`
- Create: `dashboard/src/components/SwimLogFlow/SwimLogFlow.module.css` (start it here; extended in D3)

**Reference:** prototype `swim.jsx` `EmojiKeyboard` + the `.kb-*` CSS. Render inside the shared `BottomSheet`.

- [ ] **Step 1: Create `EmojiKeyboard.tsx`**:

```tsx
import { BottomSheet } from '../BottomSheet';
import { EMOJI_KEYBOARD } from '../../constants/swim';
import styles from './SwimLogFlow.module.css';

interface EmojiKeyboardProps {
  open: boolean;
  picked: string[];
  onToggle: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiKeyboard({ open, picked, onToggle, onClose }: EmojiKeyboardProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Pick any emoji">
      <div className={styles.kbScroll}>
        {EMOJI_KEYBOARD.map((g) => (
          <div key={g.cat} className={styles.kbCat}>
            <div className={styles.kbCatLabel}>{g.cat}</div>
            <div className={styles.kbGrid}>
              {g.list.map((em, i) => (
                <button
                  key={em + i}
                  type="button"
                  className={`${styles.kbEmoji} ${picked.includes(em) ? styles.kbOn : ''}`}
                  onClick={() => onToggle(em)}
                >{em}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} onClick={onClose}>Done</button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Create `SwimLogFlow.module.css`** with the keyboard + form classes ported from the prototype (`.kb-scroll`→`.kbScroll`, `.kb-cat`, `.kb-cat-label`, `.kb-grid` (8-col), `.kb-emoji`, plus `.actions`, `.primaryBtn`, `.ghostBtn` reusing token values; and the form classes used in D3: `.pickerHead`, `.pickerLabel`, `.pickerHint`, `.emojiGrid` (6-col), `.emojiBtn`, `.emojiOn`, `.emojiAdd`, `.pickedRow`, `.pickedEmpty`, `.pickedCount`, `.formGrid`, `.field`, `.fieldLabel`, `.input`, `.delLink`, `.delConfirm`, `.dangerBtn`). Match the chemistry `LogTestFlow.module.css` look for buttons/inputs.

- [ ] **Step 3: Typecheck + commit**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck`

```bash
git add dashboard/src/components/SwimLogFlow/EmojiKeyboard.tsx dashboard/src/components/SwimLogFlow/SwimLogFlow.module.css
git commit -m "feat(swim): emoji keyboard picker"
```

---

### Task D3: `SwimLogForm` (create/edit/delete)

**Files:**
- Create: `dashboard/src/components/SwimLogFlow/SwimLogForm.tsx`
- Test: `dashboard/src/components/SwimLogFlow/SwimLogForm.test.tsx`

**Reference:** prototype `swim.jsx` `SwimLogForm`. Does the authed fetches (mirrors chemistry `LogForm`).

- [ ] **Step 1: Write a failing smoke test** `SwimLogForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SwimLogForm } from './SwimLogForm';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: 'x' }) })) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const noop = () => {};

describe('SwimLogForm', () => {
  it('disables Log swim until at least one person is picked', () => {
    render(<SwimLogForm open authHeader="Basic x" swims={[]} onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    expect(screen.getByRole('button', { name: /log swim/i })).toBeDisabled();
  });

  it('enables and POSTs after picking a swimmer', async () => {
    render(<SwimLogForm open authHeader="Basic x" swims={[]} onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    fireEvent.click(screen.getAllByRole('button', { name: /🦦|swimmer|emoji/i })[0]); // first recent tile
    const log = screen.getByRole('button', { name: /log swim/i });
    await waitFor(() => expect(log).not.toBeDisabled());
    fireEvent.click(log);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/swims', expect.objectContaining({ method: 'POST' })));
  });
});
```

(Adjust the tile selector to a stable accessible name or `data-testid` you add to the emoji tiles.)

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/SwimLogFlow/SwimLogForm.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `SwimLogForm.tsx`**:

```tsx
import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { Avatars } from '../SwimLane';
import { EmojiKeyboard } from './EmojiKeyboard';
import { recentEmoji } from '../../utils/swim';
import { SWIM_EMOJI } from '../../constants/swim';
import type { SwimSession } from '../../types';
import styles from './SwimLogFlow.module.css';

interface SwimLogFormProps {
  open: boolean;
  authHeader: string;
  swims: SwimSession[];
  editEntry?: SwimSession | null;
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
  onAuthExpired: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function SwimLogForm({ open, authHeader, swims, editEntry, onSaved, onDeleted, onClose, onAuthExpired }: SwimLogFormProps) {
  const editing = !!editEntry;
  const now = new Date();
  const [date, setDate] = useState(editEntry ? editEntry.date : `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`);
  const [time, setTime] = useState(editEntry ? editEntry.time : `${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
  const [people, setPeople] = useState<string[]>(editEntry ? [...editEntry.people] : []);
  const [kbOpen, setKbOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (em: string) =>
    setPeople((cur) => (cur.includes(em) ? cur.filter((x) => x !== em) : [...cur, em]));

  const recents = recentEmoji(swims, SWIM_EMOJI, 11);
  const tiles = [...people.filter((p) => !recents.includes(p)), ...recents];

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = editing ? { id: editEntry!.id, date, time, people } : { date, time, people };
      const res = await fetch('/api/swims', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(body),
      });
      if (res.status === 401) { onAuthExpired(); return; }
      if (!res.ok) { setError('Could not save. Try again.'); return; }
      onSaved();
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  const del = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/swims?id=${encodeURIComponent(editEntry!.id)}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      });
      if (res.status === 401) { onAuthExpired(); return; }
      if (!res.ok) { setError('Could not delete. Try again.'); return; }
      onDeleted();
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? 'Edit swim' : 'New swim'}>
      <div className={styles.pickerHead}>
        <span className={styles.pickerLabel}>Recent swimmers</span>
        <span className={styles.pickerHint}>no names — tap ＋ for any emoji</span>
      </div>
      <div className={styles.emojiGrid}>
        {tiles.map((em, i) => (
          <button key={em + i} type="button" data-testid="swim-tile"
            className={`${styles.emojiBtn} ${people.includes(em) ? styles.emojiOn : ''}`}
            onClick={() => toggle(em)} aria-label={`swimmer ${em}`}>{em}</button>
        ))}
        <button type="button" className={`${styles.emojiBtn} ${styles.emojiAdd}`}
          onClick={() => setKbOpen(true)} aria-label="Open emoji keyboard">＋</button>
      </div>

      <div className={styles.pickedRow}>
        {people.length === 0
          ? <span className={styles.pickedEmpty}>No one picked yet</span>
          : <><Avatars people={people} size={22} /><span className={styles.pickedCount}>{people.length} {people.length === 1 ? 'swimmer' : 'swimmers'}</span></>}
      </div>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Date</span>
          <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Time</span>
          <input className={styles.input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.ghostBtn} onClick={onClose}>Cancel</button>
        <button type="button" className={styles.primaryBtn} disabled={people.length === 0 || busy} onClick={save}>
          {editing ? 'Save changes' : 'Log swim'}
        </button>
      </div>

      {editing && (
        confirmDel ? (
          <div className={styles.delConfirm}>
            <span>Delete this swim permanently?</span>
            <button type="button" className={styles.ghostBtn} onClick={() => setConfirmDel(false)}>Keep</button>
            <button type="button" className={styles.dangerBtn} disabled={busy} onClick={del}>Delete</button>
          </div>
        ) : (
          <button type="button" className={styles.delLink} onClick={() => setConfirmDel(true)}>Delete this swim</button>
        )
      )}

      <EmojiKeyboard open={kbOpen} picked={people} onToggle={toggle} onClose={() => setKbOpen(false)} />
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Run to verify pass** (adjust the test's tile selector to `getAllByTestId('swim-tile')[0]` if the name-based one is flaky)

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/SwimLogFlow/SwimLogForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/SwimLogFlow/SwimLogForm.tsx dashboard/src/components/SwimLogFlow/SwimLogForm.test.tsx
git commit -m "feat(swim): swim log form (create/edit/delete)"
```

---

### Task D4: `SwimLogFlow` (gate → form) + index

**Files:**
- Create: `dashboard/src/components/SwimLogFlow/SwimLogFlow.tsx`
- Create: `dashboard/src/components/SwimLogFlow/index.ts`

- [ ] **Step 1: Create `SwimLogFlow.tsx`** (mirrors `LogTestFlow`):

```tsx
import { UnlockSheet } from '../LogTestFlow/UnlockSheet';
import { SwimLogForm } from './SwimLogForm';
import { useChemAuth } from '../../hooks/useChemAuth';
import type { SwimSession } from '../../types';

interface SwimLogFlowProps {
  open: boolean;
  swims: SwimSession[];
  editEntry?: SwimSession | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function SwimLogFlow({ open, swims, editEntry, onClose, onSaved, onDeleted }: SwimLogFlowProps) {
  const { unlocked, authHeader, unlock, lock } = useChemAuth();
  if (!open) return null;

  if (!unlocked || !authHeader) {
    return (
      <UnlockSheet
        open
        unlockTitle="Unlock to log a swim"
        onClose={onClose}
        onUnlocked={(header) => {
          const [user, pass] = atob(header.slice(6)).split(/:(.*)/s);
          unlock(user, pass);
        }}
      />
    );
  }

  return (
    <SwimLogForm
      key={editEntry?.id ?? 'new'}
      open
      authHeader={authHeader}
      swims={swims}
      editEntry={editEntry}
      onClose={onClose}
      onSaved={onSaved}
      onDeleted={onDeleted}
      onAuthExpired={lock}
    />
  );
}
```

- [ ] **Step 2: Create `index.ts`**: `export { SwimLogFlow } from './SwimLogFlow';`

- [ ] **Step 3: Typecheck + commit**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck`

```bash
git add dashboard/src/components/SwimLogFlow/SwimLogFlow.tsx dashboard/src/components/SwimLogFlow/index.ts
git commit -m "feat(swim): SwimLogFlow unlock gate wrapper"
```

---

## Phase E — History sheet

### Task E1: `SwimHistorySheet` (All swims + Leaderboard)

**Files:**
- Create: `dashboard/src/components/SwimHistorySheet/SwimHistorySheet.tsx`
- Create: `dashboard/src/components/SwimHistorySheet/SwimHistorySheet.module.css`
- Create: `dashboard/src/components/SwimHistorySheet/index.ts`
- Test: `dashboard/src/components/SwimHistorySheet/SwimHistorySheet.test.tsx`

**Reference:** prototype `swim.jsx` `SwimHistorySheet` + `.hist-*` / `.lb-*` / `.sheet-tab*` CSS. Date/time formatting: use the same helpers chemistry's `HistorySheet` uses (check `HistorySheet.tsx` imports — likely `src/utils/chemistry.ts` or inline `toLocaleDateString`). Reuse that approach for consistency.

- [ ] **Step 1: Write a failing smoke test** `SwimHistorySheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SwimHistorySheet } from './SwimHistorySheet';
import type { SwimSession } from '../../types';

const swims: SwimSession[] = [
  { id: '1', date: '2026-05-10', time: '12:00', people: ['🦦'] },
  { id: '2', date: '2026-05-16', time: '14:00', people: ['🐢', '🦦'] },
];

describe('SwimHistorySheet', () => {
  it('shows the swim/dip summary and rows newest-first', () => {
    render(<SwimHistorySheet open swims={swims} onClose={() => {}} onSelect={() => {}} onNew={() => {}} />);
    expect(screen.getByText(/2 swims · 3 dips/)).toBeInTheDocument();
  });

  it('switches to the leaderboard tab', () => {
    render(<SwimHistorySheet open swims={swims} onClose={() => {}} onSelect={() => {}} onNew={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(screen.getByText(/same person/i)).toBeInTheDocument();
  });

  it('calls onSelect when a swim row is tapped', () => {
    const onSelect = vi.fn();
    render(<SwimHistorySheet open swims={swims} onClose={() => {}} onSelect={onSelect} onNew={() => {}} />);
    fireEvent.click(screen.getAllByTestId('swim-hist-row')[0]);
    expect(onSelect).toHaveBeenCalledWith(swims[1]); // newest first → id '2'
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/SwimHistorySheet`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `SwimHistorySheet.tsx`**:

```tsx
import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { Avatars } from '../SwimLane';
import { sortedSwims, totalDips, leaderboard } from '../../utils/swim';
import type { SwimSession } from '../../types';
import styles from './SwimHistorySheet.module.css';

interface SwimHistorySheetProps {
  open: boolean;
  swims: SwimSession[];
  onClose: () => void;
  onSelect: (s: SwimSession) => void;
  onNew: () => void;
}

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (t: string) => new Date(`2000-01-01T${t}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const MEDAL = ['🥇', '🥈', '🥉'];

export function SwimHistorySheet({ open, swims, onClose, onSelect, onNew }: SwimHistorySheetProps) {
  const [view, setView] = useState<'swims' | 'board'>('swims');
  const rows = sortedSwims(swims);
  const dayCounts: Record<string, number> = {};
  for (const r of rows) dayCounts[r.date] = (dayCounts[r.date] ?? 0) + 1;
  const lb = leaderboard(swims);
  const maxC = lb.length ? lb[0].count : 1;

  return (
    <BottomSheet open={open} onClose={onClose} title={`${rows.length} swims · ${totalDips(swims)} dips`}>
      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab} ${view === 'swims' ? styles.on : ''}`} onClick={() => setView('swims')}>All swims</button>
        <button type="button" className={`${styles.tab} ${view === 'board' ? styles.on : ''}`} onClick={() => setView('board')}>Leaderboard</button>
      </div>

      {view === 'swims' ? (
        <>
          <p className={styles.hint}>Tap any swim to edit who went in — or delete it.</p>
          <div className={styles.list}>
            {rows.map((r) => (
              <button key={r.id} type="button" data-testid="swim-hist-row" className={styles.row} onClick={() => onSelect(r)}>
                <span className={styles.date}>{fmtDate(r.date)}</span>
                <span className={styles.time}>{fmtTime(r.time)}{dayCounts[r.date] > 1 && <span className={styles.multi}>+{dayCounts[r.date] - 1}</span>}</span>
                <span className={styles.people}><Avatars people={r.people} size={18} /><span className={styles.peopleN}>{r.people.length}</span></span>
                <span className={styles.chevron} aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className={styles.hint}>Total dips per swimmer this season. Same emoji = same person.</p>
          <div className={styles.lbList}>
            {lb.map((r, i) => (
              <div key={r.emoji} className={styles.lbRow}>
                <span className={styles.lbRank}>{i < 3 ? MEDAL[i] : i + 1}</span>
                <span className={styles.lbEmoji}>{r.emoji}</span>
                <span className={styles.lbBarWrap}><span className={styles.lbBar} style={{ width: `${(r.count / maxC) * 100}%` }} /></span>
                <span className={styles.lbCount}>{r.count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} onClick={onNew}>＋ Log a new swim</button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Create `SwimHistorySheet.module.css`** porting `.hist-*`/`.lb-*`/`.sheet-tab*` from the prototype. Leaderboard bar: `background: linear-gradient(90deg, var(--color-primary), var(--color-accent));`. Underline tabs mirror the app's main `TabBar`.

- [ ] **Step 5: Create `index.ts`**: `export { SwimHistorySheet } from './SwimHistorySheet';`

- [ ] **Step 6: Run to verify pass**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/SwimHistorySheet`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/components/SwimHistorySheet
git commit -m "feat(swim): swim history sheet (all swims + leaderboard)"
```

---

## Phase F — Wiring

### Task F1: Render `SwimLane` in `TempChart`

**Files:**
- Modify: `dashboard/src/components/TempChart/TempChart.tsx`

- [ ] **Step 1: Add a `swims` prop and render the lane.** Extend the props interface:

```tsx
import { SwimLane } from '../SwimLane';
import type { TimeSeriesPoint, WeatherHistoryPoint, SwimSession } from '../../types';

interface TempChartProps {
  data: TimeSeriesPoint[];
  range: string;
  onRangeChange: (range: string) => void;
  loading: boolean;
  airHistory?: WeatherHistoryPoint[];
  swims?: SwimSession[];
}
```

Build the y-series in chart units from `chartData` (already °F/°C-converted) and render `<SwimLane>` as a child of `<ComposedChart>` (TempChart's x-axis is categorical → `xMode="index"`). Inside the component, after `chartData` is computed:

```tsx
  const swimSeries = useMemo(
    () => chartData.map((d) => ({ t: new Date(d.time).getTime(), value: d.value })),
    [chartData],
  );
```

Then inside `<ComposedChart>` (e.g. just after the `<CartesianGrid>` / weather lane):

```tsx
              {swims && swims.length > 0 && (
                <SwimLane swims={swims} series={swimSeries} xMode="index" color="#38bdf8" />
              )}
```

Accept the prop in the signature: `export function TempChart({ data, range, onRangeChange, loading, airHistory, swims }: TempChartProps)`.

- [ ] **Step 2: Add the swim legend key.** In the overlay row (where the Air `OverlayPill` is), add a static key (no toggle):

```tsx
        <span className={styles.swimKey} aria-hidden="true">🦦 Swim</span>
```

Add a `.swimKey` rule to `TempChart.module.css` (small, `--color-text-secondary`). The README's "see all in History" copy lives in the legend — keep it short here; the History button (Task F2) is the entry point.

- [ ] **Step 3: Typecheck + run existing TempChart tests**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck && pnpm vitest run src/components/TempChart`
Expected: PASS (swims optional → existing tests unaffected)

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/TempChart
git commit -m "feat(swim): render SwimLane + swim legend key in TempChart"
```

---

### Task F2: Temperature tab — fetch swims, header actions, sheets

**Files:**
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Wire swims into `TemperatureTab`.** Replace the `TemperatureTab` function with state + sheets (mirrors `ChemistryTab`):

```tsx
import { useState } from 'react';
// ...existing imports...
import { useSwimData } from './hooks/useSwimData';
import { SwimLogFlow } from './components/SwimLogFlow';
import { SwimHistorySheet } from './components/SwimHistorySheet';
import { Toast } from './components/Toast';
import type { SwimSession } from './types';

function TemperatureTab() {
  const { stats, history, batteries, range, setRange, loading, error, sensors, selectedSensor, setSelectedSensor, airCurrent, airHistory } = usePoolData();
  const { swims, refetch: refetchSwims } = useSwimData(range);
  const [logOpen, setLogOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<SwimSession | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      {error && !loading && stats && <p className={styles.error}>{error}</p>}
      <SensorSelector sensors={sensors} selected={selectedSensor} onSelect={setSelectedSensor} />
      <CurrentTemp value={stats?.current ?? null} loading={loading} airCurrent={airCurrent} />
      <StatsGrid stats={stats} loading={loading} selectedSensor={selectedSensor} range={range} />

      <div className={styles.swimActions}>
        <button type="button" className={styles.histBtn} onClick={() => setHistOpen(true)}>History</button>
        <button type="button" className={styles.logBtn} onClick={() => { setEditEntry(null); setLogOpen(true); }}>＋ Log swim</button>
      </div>

      <TempChart data={history} range={range} onRangeChange={setRange} loading={loading} airHistory={airHistory} swims={swims} />
      <BatteryStatus batteries={batteries} loading={loading} />

      <SwimHistorySheet
        open={histOpen}
        swims={swims}
        onClose={() => setHistOpen(false)}
        onSelect={(s) => { setHistOpen(false); setEditEntry(s); setLogOpen(true); }}
        onNew={() => { setHistOpen(false); setEditEntry(null); setLogOpen(true); }}
      />
      <SwimLogFlow
        open={logOpen}
        swims={swims}
        editEntry={editEntry}
        onClose={() => { setLogOpen(false); setEditEntry(null); }}
        onSaved={() => { setLogOpen(false); setToast(editEntry ? 'Swim updated' : 'Swim logged'); setEditEntry(null); refetchSwims(); }}
        onDeleted={() => { setLogOpen(false); setToast('Swim deleted'); setEditEntry(null); refetchSwims(); }}
      />
      <Toast open={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
    </>
  );
}
```

- [ ] **Step 2: Add styles** `.swimActions`, `.histBtn`, `.logBtn` to `src/App.module.css` (mirror `ChemistryTab.module.css` `.headBtns/.histBtn/.logBtn`: a right-aligned flex row, ghost + primary buttons).

- [ ] **Step 3: Typecheck + build + run full suite**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck && pnpm vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/App.tsx dashboard/src/App.module.css
git commit -m "feat(swim): log/history actions + markers on the temperature tab"
```

---

### Task F3: Swim markers in the chemistry focus sheet

**Files:**
- Modify: `dashboard/src/components/ChemChart/ChemChart.tsx`
- Modify: `dashboard/src/components/ChemFocusSheet/ChemFocusSheet.tsx`
- Modify: `dashboard/src/components/ChemistryTab/ChemistryTab.tsx`

- [ ] **Step 1: Thread `swims` into `ChemChart`.** Add an optional `swims?: SwimSession[]` prop to `ChemChartProps`. Build the chem y-series from the chart `data` (the chemical value per point; `data` already has `t` epoch + `chem` value) and render `<SwimLane>` in **scale mode** (ChemChart x-axis is `type="number"`):

```tsx
import { SwimLane } from '../SwimLane';
import type { SwimSession } from '../../types';
// in props: swims?: SwimSession[];
// after `data` is built:
  const swimSeries = useMemo(
    () => data.map((d) => ({ t: d.t, value: typeof d.chem === 'number' ? d.chem : undefined })),
    [data],
  );
// inside <ComposedChart>, only on the full variant:
  {isFull && swims && swims.length > 0 && (
    <SwimLane swims={swims} series={swimSeries} xMode="scale" color={color} />
  )}
```

- [ ] **Step 2: Pass `swims` down `ChemFocusSheet`.** Add `swims?: SwimSession[]` to `ChemFocusSheetProps`, accept it in the signature, and forward to the `<ChemChart ...>` it renders (`swims={swims}`).

- [ ] **Step 3: Fetch swims in `ChemistryTab` and pass to the focus sheet.** Add:

```tsx
import { useSwimData } from '../../hooks/useSwimData';
// inside the component:
  const { swims } = useSwimData(range);
// update the focus sheet render:
        <ChemFocusSheet meta={CHEM_BY_KEY[selected]} readings={readings}
          poolHistory={poolHistory} airHistory={airHistory} swims={swims} onClose={() => setSelected(null)} />
```

- [ ] **Step 4: Typecheck + run chem tests + build**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck && pnpm vitest run src/components/ChemChart src/components/ChemFocusSheet src/components/ChemistryTab`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/ChemChart dashboard/src/components/ChemFocusSheet dashboard/src/components/ChemistryTab
git commit -m "feat(swim): swim markers on the chemistry focus chart"
```

---

## Phase G — Final verification

### Task G1: Full gate + visual check

- [ ] **Step 1: Lint, typecheck, test (coverage), build**

Run: `source ~/.nvm/nvm.sh && pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build`
Expected: all PASS; coverage ≥ 80% (add tests if the new files drag it below).

- [ ] **Step 2: Manual smoke (optional but recommended).** Use the `verify` skill or run `pnpm dev` + `pnpm dev:server` with real InfluxDB env, then: log a swim (unlock), confirm a marker rides the pool curve, edit it, delete it, open History → both tabs, open a chemistry card → marker on the chemical curve. Confirm the public (locked) view shows markers + History read-only and the log buttons route through unlock.

- [ ] **Step 3: Update docs.** Add a short "Swim logging" subsection to `CLAUDE.md` under the dashboard section: the `swim` measurement, `/api/swims` endpoints (GET public; POST/PUT/DELETE share the chemistry auth + limiter), and that markers ride both charts via `SwimLane`. Commit:

```bash
git add CLAUDE.md
git commit -m "docs(swim): document swim logging feature"
```

- [ ] **Step 4: Finish the branch.** Use the `superpowers:finishing-a-development-branch` skill to open a PR.

---

## Notes / known limitations (carried from the spec)

- Markers render-all (no collision/clustering); dense same-day swims may overlap.
- `people` stored as a comma-joined string field; leaderboard computed client-side.
- Swim writes share the chemistry credential and the 10/15-min rate-limit budget.
- Edit = delete-then-write (non-transactional), same as chemistry.
- The prototype `design-canvas.jsx` is presentation scaffolding — ignore it.
