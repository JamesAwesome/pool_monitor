# Pool Chemistry Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chemistry tab to the pool dashboard for manually logging six chemical readings and viewing each one's trend correlated against pool/air temperature, with an auth-gated write flow.

**Architecture:** A new InfluxDB `chemistry` measurement stores sparse manual readings. The Express server gains `GET /api/chemistry` (public), `POST /api/chemistry` + `GET /api/chemistry/auth-check` (behind Basic Auth middleware). The React SPA gains a tab bar (local state), a small-multiple grid of tappable chemical cards, a focus bottom-sheet with a full correlation chart, and an auth-gated log flow (unlock sheet → form → toast). Charts use Recharts to match the existing `TempChart`.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, CSS Modules, Recharts 2, Express 5, `@influxdata/influxdb-client`, Vitest + React Testing Library.

---

## Spec reference

`docs/superpowers/specs/2026-05-31-chemistry-tracking-design.md`. Read it before starting.

## Conventions (read once)

- All commands run from `dashboard/`, prefixed with `source ~/.nvm/nvm.sh &&` (pnpm/node are only on PATH inside nvm). Example: `source ~/.nvm/nvm.sh && pnpm test`.
- Run a single test file: `source ~/.nvm/nvm.sh && pnpm vitest run <path>`.
- Server tests are Node-environment: first line `// @vitest-environment node`. Component/hook tests use the default jsdom environment.
- Temperatures from the API are Celsius; F/C conversion is client-side via `src/utils/temperature.ts` (`celsiusToFahrenheit`, `formatTemperature`). Chemistry values are unitless numbers — no conversion.
- Commit after each task with the `feat:`/`test:`/`chore:` prefix shown. Commit messages here omit the Claude trailer for brevity; if your harness requires it, append it.

## File structure

**Backend (`dashboard/server/`)**
- `chemistry.ts` *(new)* — pure helpers: `CHEM_FIELDS`, `CHEM_BOUNDS`, `validateChemistryBody`, `zonedNoonToUtc`. No I/O.
- `auth.ts` *(new)* — `parseBasicAuth`, `credentialsMatch`, `requireAuth` middleware.
- `influx.ts` *(modify)* — extend `parseRange`/`windowPeriod` for `season`/`all`; add `getWriteApi`, `queryChemistry`, `writeChemistry`.
- `routes.ts` *(modify)* — wire the three chemistry routes.
- `chemistry.test.ts`, `auth.test.ts` *(new)*; `influx.test.ts` *(modify)*.

**Frontend (`dashboard/src/`)**
- `types.ts` *(modify)* — add `ChemistryReading`.
- `constants/chemicals.ts` *(new)* — `CHEMS` metadata, `ChemKey`.
- `utils/chemistry.ts` *(new)* — `computeDelta`, `computeStats`, `latestReading`, `formatChemValue`.
- `hooks/useChemAuth.ts` *(new)* — persisted credential.
- `hooks/useChemistryData.ts` *(new)* — fetch chemistry + pool + air history for a range.
- `components/TabBar/` *(new)*, `components/DeltaTag/` *(new)*, `components/ChemChart/` *(new)*, `components/ChemCard/` *(new)*, `components/ChemFocusSheet/` *(new)*, `components/Toast/` *(new)*, `components/LogTestFlow/` *(new, contains UnlockSheet + LogForm)*, `components/ChemistryTab/` *(new)*.
- `styles/tokens.css` *(modify)* — add `--air-stroke`, `--ghost-fill`, `--ghost-stroke` (light + dark).
- `App.tsx` *(modify)* — tab state + render the active tab.

**Config & docs**
- `docker-compose.yml`, `.env.example`, `CLAUDE.md` *(modify)*.

---

## Phase 1 — Backend data layer

### Task 1: Range tokens for `season` and `all`

**Files:**
- Modify: `dashboard/server/influx.ts` (`parseRange`, `windowPeriod`)
- Test: `dashboard/server/influx.test.ts`

- [ ] **Step 1: Add failing tests.** In `influx.test.ts`, inside the existing `describe('parseRange', ...)` block add:

```ts
  it('handles the season token as Jan 1 of the current year', () => {
    const year = new Date().getFullYear();
    expect(parseRange('season')).toBe(`start: ${year}-01-01T00:00:00Z`);
  });

  it('handles the all token as the unix epoch', () => {
    expect(parseRange('all')).toBe('start: 0');
  });
```

And inside `describe('windowPeriod', ...)`:

```ts
  it('returns 1d for season', () => {
    expect(windowPeriod('season')).toBe('1d');
  });

  it('returns 1d for all', () => {
    expect(windowPeriod('all')).toBe('1d');
  });
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts`
Expected: FAIL (`season`/`all` not handled).

- [ ] **Step 3: Implement.** In `influx.ts`, update `parseRange` (add the two branches before the final `return`):

```ts
export function parseRange(range: string): string {
  if (range === 'season') {
    return `start: ${new Date().getFullYear()}-01-01T00:00:00Z`;
  }
  if (range === 'all') {
    return 'start: 0';
  }
  if (range.startsWith('custom:')) {
    const [, from, to] = range.split(':')
    const stopDate = new Date(to)
    stopDate.setUTCDate(stopDate.getUTCDate() + 1)
    const stop = stopDate.toISOString().split('T')[0]
    return `start: ${from}T00:00:00Z, stop: ${stop}T00:00:00Z`
  }
  return `start: -${range}`
}
```

And in `windowPeriod`, add at the very top of the function body (before the `custom:` check):

```ts
  if (range === 'season' || range === 'all') return '1d';
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/influx.ts server/influx.test.ts
git commit -m "feat: support season and all range tokens"
```

---

### Task 2: `chemistry.ts` pure helpers — `zonedNoonToUtc` + constants

**Files:**
- Create: `dashboard/server/chemistry.ts`
- Test: `dashboard/server/chemistry.test.ts`

- [ ] **Step 1: Write the failing test.** Create `dashboard/server/chemistry.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { zonedNoonToUtc, CHEM_FIELDS } from './chemistry';

describe('zonedNoonToUtc', () => {
  it('maps a date to local noon in America/New_York (EDT, -4) → 16:00 UTC', () => {
    const d = zonedNoonToUtc('2026-05-29', 'America/New_York');
    expect(d.toISOString()).toBe('2026-05-29T16:00:00.000Z');
  });

  it('maps a date to local noon in winter (EST, -5) → 17:00 UTC', () => {
    const d = zonedNoonToUtc('2026-01-15', 'America/New_York');
    expect(d.toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  it('maps a date to noon UTC for UTC timezone', () => {
    const d = zonedNoonToUtc('2026-05-29', 'UTC');
    expect(d.toISOString()).toBe('2026-05-29T12:00:00.000Z');
  });
});

describe('CHEM_FIELDS', () => {
  it('lists the six chemical field keys', () => {
    expect(CHEM_FIELDS).toEqual(['ph', 'fc', 'cc', 'ta', 'cya', 'ch']);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/chemistry.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `dashboard/server/chemistry.ts`:

```ts
export const CHEM_FIELDS = ['ph', 'fc', 'cc', 'ta', 'cya', 'ch'] as const;
export type ChemField = (typeof CHEM_FIELDS)[number];

// Plausible physical bounds; values outside are rejected as input errors.
export const CHEM_BOUNDS: Record<ChemField, [number, number]> = {
  ph: [0, 14],
  fc: [0, 50],
  cc: [0, 50],
  ta: [0, 1000],
  cya: [0, 500],
  ch: [0, 2000],
};

/**
 * Convert a date-only string (YYYY-MM-DD) to the UTC instant that reads as
 * 12:00 noon in the given IANA timezone. Readings are logged by date only;
 * anchoring at local noon keeps them on the correct calendar day everywhere.
 */
export function zonedNoonToUtc(dateStr: string, timeZone: string): Date {
  // Pretend noon is UTC, then measure how that instant displays in the tz and
  // correct by the difference. (Standard offset-from-formatted-string trick.)
  const naiveNoon = new Date(`${dateStr}T12:00:00Z`);
  const asTz = new Date(naiveNoon.toLocaleString('en-US', { timeZone }));
  const diffMs = naiveNoon.getTime() - asTz.getTime();
  return new Date(naiveNoon.getTime() + diffMs);
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/chemistry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/chemistry.ts server/chemistry.test.ts
git commit -m "feat: add chemistry field constants and zonedNoonToUtc helper"
```

---

### Task 3: `validateChemistryBody`

**Files:**
- Modify: `dashboard/server/chemistry.ts`
- Test: `dashboard/server/chemistry.test.ts`

- [ ] **Step 1: Add failing tests.** Append to `chemistry.test.ts`:

```ts
import { validateChemistryBody } from './chemistry';

describe('validateChemistryBody', () => {
  it('accepts a valid partial reading', () => {
    const r = validateChemistryBody({ date: '2026-05-29', ph: 7.7, fc: 4 });
    expect(r).toEqual({ ok: true, date: '2026-05-29', values: { ph: 7.7, fc: 4 } });
  });

  it('rejects when no chemical values are present', () => {
    const r = validateChemistryBody({ date: '2026-05-29' });
    expect(r.ok).toBe(false);
  });

  it('rejects a missing or unparseable date', () => {
    expect(validateChemistryBody({ ph: 7 }).ok).toBe(false);
    expect(validateChemistryBody({ date: 'not-a-date', ph: 7 }).ok).toBe(false);
  });

  it('rejects out-of-bounds and non-finite values', () => {
    expect(validateChemistryBody({ date: '2026-05-29', ph: 99 }).ok).toBe(false);
    expect(validateChemistryBody({ date: '2026-05-29', fc: Number.NaN }).ok).toBe(false);
  });

  it('ignores unknown keys', () => {
    const r = validateChemistryBody({ date: '2026-05-29', ph: 7, bogus: 5 });
    expect(r).toEqual({ ok: true, date: '2026-05-29', values: { ph: 7 } });
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/chemistry.test.ts`
Expected: FAIL (`validateChemistryBody` not exported).

- [ ] **Step 3: Implement.** Append to `chemistry.ts`:

```ts
export type ValidatedChemistry =
  | { ok: true; date: string; values: Partial<Record<ChemField, number>> }
  | { ok: false; error: string };

export function validateChemistryBody(body: unknown): ValidatedChemistry {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Body must be an object' };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.date !== 'string' || Number.isNaN(new Date(b.date).getTime())) {
    return { ok: false, error: 'Invalid or missing date' };
  }

  const values: Partial<Record<ChemField, number>> = {};
  for (const field of CHEM_FIELDS) {
    const raw = b[field];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { ok: false, error: `Invalid value for ${field}` };
    }
    const [min, max] = CHEM_BOUNDS[field];
    if (raw < min || raw > max) {
      return { ok: false, error: `${field} out of range` };
    }
    values[field] = raw;
  }

  if (Object.keys(values).length === 0) {
    return { ok: false, error: 'At least one chemical value is required' };
  }
  return { ok: true, date: b.date, values };
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/chemistry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/chemistry.ts server/chemistry.test.ts
git commit -m "feat: add chemistry POST body validation"
```

---

### Task 4: Basic Auth middleware

**Files:**
- Create: `dashboard/server/auth.ts`
- Test: `dashboard/server/auth.test.ts`

- [ ] **Step 1: Write the failing test.** Create `dashboard/server/auth.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseBasicAuth, credentialsMatch, requireAuth } from './auth';

describe('parseBasicAuth', () => {
  it('decodes a valid Basic header', () => {
    const header = `Basic ${Buffer.from('alice:s3cret').toString('base64')}`;
    expect(parseBasicAuth(header)).toEqual({ user: 'alice', pass: 's3cret' });
  });

  it('handles passwords containing a colon', () => {
    const header = `Basic ${Buffer.from('alice:a:b:c').toString('base64')}`;
    expect(parseBasicAuth(header)).toEqual({ user: 'alice', pass: 'a:b:c' });
  });

  it('returns null for missing or non-Basic headers', () => {
    expect(parseBasicAuth(undefined)).toBeNull();
    expect(parseBasicAuth('Bearer xyz')).toBeNull();
  });
});

describe('credentialsMatch', () => {
  it('matches identical credentials', () => {
    expect(credentialsMatch({ user: 'a', pass: 'b' }, { user: 'a', pass: 'b' })).toBe(true);
  });
  it('rejects a wrong password or user', () => {
    expect(credentialsMatch({ user: 'a', pass: 'x' }, { user: 'a', pass: 'b' })).toBe(false);
    expect(credentialsMatch({ user: 'z', pass: 'b' }, { user: 'a', pass: 'b' })).toBe(false);
  });
});

describe('requireAuth', () => {
  beforeEach(() => {
    process.env.CHEM_AUTH_USER = 'alice';
    process.env.CHEM_AUTH_PASSWORD = 's3cret';
  });
  afterEach(() => {
    delete process.env.CHEM_AUTH_USER;
    delete process.env.CHEM_AUTH_PASSWORD;
  });

  function mockRes() {
    return {
      statusCode: 0,
      headers: {} as Record<string, string>,
      body: undefined as unknown,
      status(c: number) { this.statusCode = c; return this; },
      json(b: unknown) { this.body = b; return this; },
      setHeader(k: string, v: string) { this.headers[k] = v; },
    };
  }

  it('calls next() with valid credentials', () => {
    const header = `Basic ${Buffer.from('alice:s3cret').toString('base64')}`;
    const next = vi.fn();
    const res = mockRes();
    requireAuth({ headers: { authorization: header } } as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('responds 401 WITHOUT a WWW-Authenticate header for bad credentials', () => {
    const header = `Basic ${Buffer.from('alice:wrong').toString('base64')}`;
    const next = vi.fn();
    const res = mockRes();
    requireAuth({ headers: { authorization: header } } as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toBeUndefined();
  });

  it('responds 401 when no credentials are configured', () => {
    delete process.env.CHEM_AUTH_USER;
    delete process.env.CHEM_AUTH_PASSWORD;
    const header = `Basic ${Buffer.from('alice:s3cret').toString('base64')}`;
    const next = vi.fn();
    const res = mockRes();
    requireAuth({ headers: { authorization: header } } as never, res as never, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/auth.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `dashboard/server/auth.ts`:

```ts
import type { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

export interface Credentials {
  user: string;
  pass: string;
}

export function parseBasicAuth(header: string | undefined): Credentials | null {
  if (!header || !header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
}

// SHA-256 each field so timingSafeEqual always compares equal-length buffers
// (and length differences don't leak via the comparison itself).
function sha(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

export function credentialsMatch(provided: Credentials, expected: Credentials): boolean {
  const userOk = timingSafeEqual(sha(provided.user), sha(expected.user));
  const passOk = timingSafeEqual(sha(provided.pass), sha(expected.pass));
  return userOk && passOk;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedUser = process.env.CHEM_AUTH_USER ?? '';
  const expectedPass = process.env.CHEM_AUTH_PASSWORD ?? '';
  const creds = parseBasicAuth(req.headers.authorization);

  // Deny when unconfigured or credentials don't match. Deliberately NO
  // WWW-Authenticate header: the UI uses a custom unlock sheet, and that header
  // would trigger the browser's native Basic-Auth dialog.
  if (
    !expectedUser ||
    !expectedPass ||
    !creds ||
    !credentialsMatch(creds, { user: expectedUser, pass: expectedPass })
  ) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/auth.ts server/auth.test.ts
git commit -m "feat: add Basic Auth middleware for chemistry writes"
```

---

### Task 5: `queryChemistry` and `writeChemistry` in `influx.ts`

**Files:**
- Modify: `dashboard/server/influx.ts`
- Test: `dashboard/server/influx.test.ts`

- [ ] **Step 1: Extend the mock and add failing tests.** In `influx.test.ts`, **replace** the existing `vi.mock('@influxdata/influxdb-client', ...)` block and the line that re-imports from `./influx` with:

```ts
const queryApiStub = { collectRows: vi.fn() }
const writeApiStub = { writePoint: vi.fn(), flush: vi.fn().mockResolvedValue(undefined) }

vi.mock('@influxdata/influxdb-client', () => {
  class Point {
    measurement: string
    fields: Record<string, number> = {}
    ts: Date | undefined
    constructor(m: string) { this.measurement = m }
    timestamp(t: Date) { this.ts = t; return this }
    floatField(k: string, v: number) { this.fields[k] = v; return this }
  }
  function InfluxDB(this: {
    getQueryApi: () => typeof queryApiStub
    getWriteApi: () => typeof writeApiStub
  }) {
    this.getQueryApi = () => queryApiStub
    this.getWriteApi = () => writeApiStub
  }
  return { InfluxDB, Point }
})

const { queryWeatherCurrent, queryWeatherHistory, queryChemistry, writeChemistry } = await import('./influx')
```

Then update the existing `beforeEach` to also reset the write stub:

```ts
beforeEach(() => {
  queryApiStub.collectRows.mockReset()
  writeApiStub.writePoint.mockReset()
  writeApiStub.flush.mockClear()
})
```

Append new describe blocks:

```ts
describe('queryChemistry', () => {
  it('maps pivoted rows to readings, including only present fields', async () => {
    queryApiStub.collectRows.mockResolvedValueOnce([
      { _time: '2026-05-20T16:00:00Z', ph: 7.6, fc: 3.5 },
      { _time: '2026-05-29T16:00:00Z', ph: 7.7, fc: 4.0, ta: 88 },
    ])
    const result = await queryChemistry('season')
    expect(result).toEqual([
      { date: '2026-05-20T16:00:00Z', ph: 7.6, fc: 3.5 },
      { date: '2026-05-29T16:00:00Z', ph: 7.7, fc: 4.0, ta: 88 },
    ])
  })

  it('returns an empty array when there are no rows', async () => {
    queryApiStub.collectRows.mockResolvedValueOnce([])
    expect(await queryChemistry('all')).toEqual([])
  })
})

describe('writeChemistry', () => {
  it('writes a point with only the provided fields at local noon, then flushes', async () => {
    await writeChemistry({ date: '2026-05-29', values: { ph: 7.7, fc: 4 } }, 'America/New_York')
    expect(writeApiStub.writePoint).toHaveBeenCalledOnce()
    const point = writeApiStub.writePoint.mock.calls[0][0]
    expect(point.measurement).toBe('chemistry')
    expect(point.fields).toEqual({ ph: 7.7, fc: 4 })
    expect(point.ts?.toISOString()).toBe('2026-05-29T16:00:00.000Z')
    expect(writeApiStub.flush).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts`
Expected: FAIL (`queryChemistry`/`writeChemistry` not exported).

- [ ] **Step 3: Implement.** In `influx.ts`, update the top import:

```ts
import { InfluxDB, Point } from '@influxdata/influxdb-client'
```

Add (near the other exports):

```ts
import { CHEM_FIELDS, zonedNoonToUtc } from './chemistry.js'
import type { ChemField } from './chemistry.js'

export function getWriteApi() {
  return client.getWriteApi(org, bucket, 'ms')
}

export interface ChemistryReading {
  date: string
  ph?: number; fc?: number; cc?: number; ta?: number; cya?: number; ch?: number
}

export async function queryChemistry(range: string): Promise<ChemistryReading[]> {
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
    const reading: ChemistryReading = { date: row._time as string }
    for (const f of CHEM_FIELDS) {
      const v = row[f]
      if (typeof v === 'number') reading[f] = v
    }
    return reading
  })
}

export async function writeChemistry(
  input: { date: string; values: Partial<Record<ChemField, number>> },
  timeZone = process.env.TIMEZONE ?? 'America/New_York'
): Promise<void> {
  const writeApi = getWriteApi()
  const point = new Point('chemistry').timestamp(zonedNoonToUtc(input.date, timeZone))
  for (const f of CHEM_FIELDS) {
    const v = input.values[f]
    if (v !== undefined) point.floatField(f, v)
  }
  writeApi.writePoint(point)
  await writeApi.flush()
}
```

Note: the `.js` import extensions match the repo's existing ESM convention (see `routes.ts` importing `./influx.js`).

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run server/influx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/influx.ts server/influx.test.ts
git commit -m "feat: add queryChemistry and writeChemistry"
```

---

### Task 6: Wire chemistry routes

**Files:**
- Modify: `dashboard/server/routes.ts`

(No new test: the existing `routes.ts` has no route-level tests; the logic lives in the unit-tested `auth.ts`/`chemistry.ts`/`influx.ts`.)

- [ ] **Step 1: Implement.** In `routes.ts`, update the influx import to add the chemistry functions and import the new helpers:

```ts
import { querySensors, queryStats, queryHistory, queryBatteries, queryBatteryHistory, querySeasonHistory, queryStatDetail, queryWeatherCurrent, queryWeatherHistory, queryChemistry, writeChemistry } from './influx.js'
import { generateOgImage } from './og-image.js'
import { requireAuth } from './auth.js'
import { validateChemistryBody } from './chemistry.js'
```

Add `express.json()` parsing for the router so POST bodies are parsed. At the top of `routes.ts`, just after `const router = Router()`:

```ts
router.use('/api/chemistry', (await import('express')).default.json())
```

If a top-level `await` is awkward, instead add `import express from 'express'` at the top and use `router.use('/api/chemistry', express.json())`. Prefer the static import form:

```ts
import express, { Router } from 'express'
// ...
const router = Router()
router.use('/api/chemistry', express.json())
```

Add the three routes (before `router.get('/api/health', ...)`):

```ts
router.get('/api/chemistry', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : 'season'
    const readings = await queryChemistry(range)
    res.json(readings)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// Lightweight credential probe for the unlock sheet — writes nothing.
router.get('/api/chemistry/auth-check', requireAuth, (_req, res) => {
  res.json({ ok: true })
})

router.post('/api/chemistry', requireAuth, async (req, res) => {
  try {
    const result = validateChemistryBody(req.body)
    if (!result.ok) {
      res.status(400).json({ error: result.error })
      return
    }
    await writeChemistry({ date: result.date, values: result.values })
    res.status(201).json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})
```

**Route order matters:** define `/api/chemistry/auth-check` before any catch-all; with Express 5 the literal paths above don't conflict, but keep `auth-check` listed before the bare `/api/chemistry` handlers for clarity.

- [ ] **Step 2: Verify it compiles and the suite still passes.**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck && pnpm vitest run server/`
Expected: typecheck clean; all server tests PASS.

- [ ] **Step 3: Commit.**

```bash
git add server/routes.ts
git commit -m "feat: wire chemistry GET/POST/auth-check routes"
```

---

## Phase 2 — Frontend foundation

### Task 7: Tokens, types, and chemical constants

**Files:**
- Modify: `dashboard/src/styles/tokens.css`
- Modify: `dashboard/src/types.ts`
- Create: `dashboard/src/constants/chemicals.ts`

- [ ] **Step 1: Add tokens.** In `tokens.css`, inside the `:root` block (after `--color-air-temp`):

```css
  --air-stroke: rgba(234, 88, 12, 0.7);
  --ghost-fill: rgba(71, 91, 114, 0.07);
  --ghost-stroke: rgba(71, 91, 114, 0.45);
```

And inside `[data-theme="dark"]` (after its `--color-air-temp`):

```css
  --air-stroke: rgba(251, 146, 60, 0.7);
  --ghost-fill: rgba(148, 163, 184, 0.08);
  --ghost-stroke: rgba(148, 163, 184, 0.45);
```

- [ ] **Step 2: Add the reading type.** Append to `src/types.ts`:

```ts
export type ChemKey = 'ph' | 'fc' | 'cc' | 'ta' | 'cya' | 'ch';

export interface ChemistryReading {
  date: string; // ISO timestamp from the API
  ph?: number; fc?: number; cc?: number; ta?: number; cya?: number; ch?: number;
}
```

- [ ] **Step 3: Create the metadata constant.** Create `src/constants/chemicals.ts`:

```ts
import type { ChemKey } from '../types';

export interface ChemMeta {
  key: ChemKey;
  name: string;   // full name for headers
  short: string;  // short label for the log form
  unit: string;   // '' for pH
  decimals: number;
  color: string;  // oklch accent, used for chart strokes and card borders
}

export const CHEMS: ChemMeta[] = [
  { key: 'ph',  name: 'pH',                short: 'pH',  unit: '',    decimals: 1, color: 'oklch(0.58 0.15 260)' },
  { key: 'fc',  name: 'Free Chlorine',     short: 'FC',  unit: 'ppm', decimals: 1, color: 'oklch(0.64 0.13 205)' },
  { key: 'cc',  name: 'Combined Chlorine', short: 'CC',  unit: 'ppm', decimals: 1, color: 'oklch(0.68 0.14 70)'  },
  { key: 'ta',  name: 'Total Alkalinity',  short: 'TA',  unit: 'ppm', decimals: 0, color: 'oklch(0.58 0.15 305)' },
  { key: 'cya', name: 'Cyanuric Acid',     short: 'CYA', unit: 'ppm', decimals: 0, color: 'oklch(0.60 0.14 150)' },
  { key: 'ch',  name: 'Calcium Hardness',  short: 'CH',  unit: 'ppm', decimals: 0, color: 'oklch(0.62 0.15 350)' },
];

export const CHEM_BY_KEY: Record<ChemKey, ChemMeta> = Object.fromEntries(
  CHEMS.map((c) => [c.key, c]),
) as Record<ChemKey, ChemMeta>;
```

- [ ] **Step 4: Verify typecheck.**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add src/styles/tokens.css src/types.ts src/constants/chemicals.ts
git commit -m "feat: add chemistry tokens, types, and metadata"
```

---

### Task 8: Chemistry computation utils

**Files:**
- Create: `dashboard/src/utils/chemistry.ts`
- Test: `dashboard/src/utils/chemistry.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/utils/chemistry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { latestReading, computeDelta, computeStats, formatChemValue } from './chemistry';
import type { ChemistryReading } from '../types';

const READINGS: ChemistryReading[] = [
  { date: '2026-05-10T16:00:00Z', ph: 7.4, fc: 2.0 },
  { date: '2026-05-20T16:00:00Z', ph: 7.5, fc: 3.0 },
  { date: '2026-05-29T16:00:00Z', ph: 7.7, fc: 4.0 }, // newest last
];

describe('latestReading', () => {
  it('returns the newest reading value for a key', () => {
    expect(latestReading(READINGS, 'ph')).toBe(7.7);
  });
  it('returns null when no reading has the key', () => {
    expect(latestReading(READINGS, 'ta')).toBeNull();
  });
});

describe('computeDelta', () => {
  it('reports an upward change vs the previous reading', () => {
    expect(computeDelta(READINGS, 'ph', 1)).toEqual({ dir: 'up', magnitude: 0.2 });
  });
  it('reports flat when the change is below half a display unit', () => {
    const flat: ChemistryReading[] = [
      { date: '2026-05-20T16:00:00Z', ta: 88 },
      { date: '2026-05-29T16:00:00Z', ta: 88 },
    ];
    expect(computeDelta(flat, 'ta', 0)).toEqual({ dir: 'flat', magnitude: 0 });
  });
  it('returns null with fewer than two readings for the key', () => {
    expect(computeDelta([{ date: 'x', ph: 7 }], 'ph', 1)).toBeNull();
  });
});

describe('computeStats', () => {
  it('computes low/avg/high over readings that have the key', () => {
    expect(computeStats(READINGS, 'fc')).toEqual({ low: 2.0, avg: 3.0, high: 4.0, count: 3 });
  });
  it('returns null when no readings have the key', () => {
    expect(computeStats(READINGS, 'ch')).toBeNull();
  });
});

describe('formatChemValue', () => {
  it('formats to the chemical decimals', () => {
    expect(formatChemValue(7.66, 1)).toBe('7.7');
    expect(formatChemValue(88.2, 0)).toBe('88');
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/utils/chemistry.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `src/utils/chemistry.ts`:

```ts
import type { ChemKey, ChemistryReading } from '../types';

function valuesFor(readings: ChemistryReading[], key: ChemKey): number[] {
  return readings
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number');
}

export function latestReading(readings: ChemistryReading[], key: ChemKey): number | null {
  const vals = valuesFor(readings, key);
  return vals.length ? vals[vals.length - 1] : null;
}

export interface Delta {
  dir: 'up' | 'down' | 'flat';
  magnitude: number;
}

export function computeDelta(readings: ChemistryReading[], key: ChemKey, decimals: number): Delta | null {
  const vals = valuesFor(readings, key);
  if (vals.length < 2) return null;
  const diff = vals[vals.length - 1] - vals[vals.length - 2];
  const magnitude = Math.abs(diff);
  const threshold = 0.5 * Math.pow(10, -decimals); // half a display unit
  if (magnitude < threshold) return { dir: 'flat', magnitude: 0 };
  return { dir: diff > 0 ? 'up' : 'down', magnitude };
}

export interface ChemStats {
  low: number;
  avg: number;
  high: number;
  count: number;
}

export function computeStats(readings: ChemistryReading[], key: ChemKey): ChemStats | null {
  const vals = valuesFor(readings, key);
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return {
    low: Math.min(...vals),
    avg: sum / vals.length,
    high: Math.max(...vals),
    count: vals.length,
  };
}

export function formatChemValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/utils/chemistry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/utils/chemistry.ts src/utils/chemistry.test.ts
git commit -m "feat: add chemistry delta/stats utilities"
```

---

### Task 9: `useChemAuth` hook

**Files:**
- Create: `dashboard/src/hooks/useChemAuth.ts`
- Test: `dashboard/src/hooks/useChemAuth.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/hooks/useChemAuth.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChemAuth } from './useChemAuth';

describe('useChemAuth', () => {
  beforeEach(() => localStorage.clear());

  it('starts locked when nothing is persisted', () => {
    const { result } = renderHook(() => useChemAuth());
    expect(result.current.unlocked).toBe(false);
    expect(result.current.authHeader).toBeNull();
  });

  it('unlock() persists the base64 credential and exposes the header', () => {
    const { result } = renderHook(() => useChemAuth());
    act(() => result.current.unlock('alice', 's3cret'));
    expect(result.current.unlocked).toBe(true);
    const expected = `Basic ${btoa('alice:s3cret')}`;
    expect(result.current.authHeader).toBe(expected);
    expect(localStorage.getItem('pool-dashboard-chem-auth')).toBe(btoa('alice:s3cret'));
  });

  it('seeds unlocked from a persisted credential on mount', () => {
    localStorage.setItem('pool-dashboard-chem-auth', btoa('bob:pw'));
    const { result } = renderHook(() => useChemAuth());
    expect(result.current.unlocked).toBe(true);
    expect(result.current.authHeader).toBe(`Basic ${btoa('bob:pw')}`);
  });

  it('lock() clears the persisted credential', () => {
    localStorage.setItem('pool-dashboard-chem-auth', btoa('bob:pw'));
    const { result } = renderHook(() => useChemAuth());
    act(() => result.current.lock());
    expect(result.current.unlocked).toBe(false);
    expect(localStorage.getItem('pool-dashboard-chem-auth')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/hooks/useChemAuth.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `src/hooks/useChemAuth.ts`:

```ts
import { useState, useCallback } from 'react';

const AUTH_KEY = 'pool-dashboard-chem-auth';

export interface UseChemAuthReturn {
  unlocked: boolean;
  authHeader: string | null;
  unlock: (user: string, pass: string) => void;
  lock: () => void;
}

export function useChemAuth(): UseChemAuthReturn {
  const [credential, setCredential] = useState<string | null>(() => localStorage.getItem(AUTH_KEY));

  const unlock = useCallback((user: string, pass: string) => {
    const encoded = btoa(`${user}:${pass}`);
    localStorage.setItem(AUTH_KEY, encoded);
    setCredential(encoded);
  }, []);

  const lock = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setCredential(null);
  }, []);

  return {
    unlocked: credential !== null,
    authHeader: credential ? `Basic ${credential}` : null,
    unlock,
    lock,
  };
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/hooks/useChemAuth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/hooks/useChemAuth.ts src/hooks/useChemAuth.test.ts
git commit -m "feat: add useChemAuth persisted-credential hook"
```

---

### Task 10: `useChemistryData` hook

**Files:**
- Create: `dashboard/src/hooks/useChemistryData.ts`
- Test: `dashboard/src/hooks/useChemistryData.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/hooks/useChemistryData.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChemistryData } from './useChemistryData';

function jsonResponse(data: unknown) {
  return { ok: true, json: async () => data } as Response;
}

describe('useChemistryData', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.startsWith('/api/chemistry')) return Promise.resolve(jsonResponse([{ date: '2026-05-29T16:00:00Z', ph: 7.7 }]));
      if (url.startsWith('/api/history')) return Promise.resolve(jsonResponse([{ time: '2026-05-29T16:00:00Z', value: 28 }]));
      if (url.startsWith('/api/weather/history')) return Promise.resolve(jsonResponse([{ time: '2026-05-29T16:00:00Z', value: 30 }]));
      return Promise.resolve(jsonResponse([]));
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches chemistry, pool history, and air history for the range', async () => {
    const { result } = renderHook(() => useChemistryData('season'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.readings).toEqual([{ date: '2026-05-29T16:00:00Z', ph: 7.7 }]);
    expect(result.current.poolHistory).toEqual([{ time: '2026-05-29T16:00:00Z', value: 28 }]);
    expect(result.current.airHistory).toEqual([{ time: '2026-05-29T16:00:00Z', value: 30 }]);
    expect(fetch).toHaveBeenCalledWith('/api/chemistry?range=season');
  });

  it('refetch() re-runs the fetch', async () => {
    const { result } = renderHook(() => useChemistryData('season'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    await result.current.refetch();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/hooks/useChemistryData.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `src/hooks/useChemistryData.ts`:

```ts
import { useState, useEffect, useCallback } from 'react';
import type { ChemistryReading, TimeSeriesPoint } from '../types';

export interface UseChemistryDataReturn {
  readings: ChemistryReading[];
  poolHistory: TimeSeriesPoint[];
  airHistory: TimeSeriesPoint[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useChemistryData(range: string, refreshInterval = 30000): UseChemistryDataReturn {
  const [readings, setReadings] = useState<ChemistryReading[]>([]);
  const [poolHistory, setPoolHistory] = useState<TimeSeriesPoint[]>([]);
  const [airHistory, setAirHistory] = useState<TimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [chemRes, poolRes, airRes] = await Promise.all([
        fetch(`/api/chemistry?range=${encodeURIComponent(range)}`),
        fetch(`/api/history?range=${encodeURIComponent(range)}`),
        fetch(`/api/weather/history?range=${encodeURIComponent(range)}`),
      ]);
      const [chem, pool, air] = await Promise.all([
        chemRes.ok ? (chemRes.json() as Promise<ChemistryReading[]>) : [],
        poolRes.ok ? (poolRes.json() as Promise<TimeSeriesPoint[]>) : [],
        airRes.ok ? (airRes.json() as Promise<TimeSeriesPoint[]>) : [],
      ]);
      setReadings(chem);
      setPoolHistory(pool);
      setAirHistory(air);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const id = setInterval(fetchData, refreshInterval);
    return () => clearInterval(id);
  }, [fetchData, refreshInterval]);

  return { readings, poolHistory, airHistory, loading, error, refetch: fetchData };
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/hooks/useChemistryData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/hooks/useChemistryData.ts src/hooks/useChemistryData.test.ts
git commit -m "feat: add useChemistryData hook"
```

---

## Phase 3 — Components

### Task 11: `DeltaTag`

**Files:**
- Create: `dashboard/src/components/DeltaTag/DeltaTag.tsx`, `DeltaTag.module.css`, `index.ts`
- Test: `dashboard/src/components/DeltaTag/DeltaTag.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `DeltaTag.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeltaTag } from './DeltaTag';

describe('DeltaTag', () => {
  it('renders an up arrow and magnitude', () => {
    render(<DeltaTag delta={{ dir: 'up', magnitude: 0.2 }} decimals={1} />);
    expect(screen.getByText(/↑/)).toBeInTheDocument();
    expect(screen.getByText(/0\.2/)).toBeInTheDocument();
  });

  it('renders a dimmed ±0 when flat', () => {
    render(<DeltaTag delta={{ dir: 'flat', magnitude: 0 }} decimals={0} />);
    expect(screen.getByText('±0')).toBeInTheDocument();
  });

  it('renders nothing when delta is null', () => {
    const { container } = render(<DeltaTag delta={null} decimals={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/DeltaTag/DeltaTag.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `DeltaTag.tsx`:

```tsx
import type { Delta } from '../../utils/chemistry';
import { formatChemValue } from '../../utils/chemistry';
import styles from './DeltaTag.module.css';

interface DeltaTagProps {
  delta: Delta | null;
  decimals: number;
}

export function DeltaTag({ delta, decimals }: DeltaTagProps) {
  if (!delta) return null;
  if (delta.dir === 'flat') {
    return <span className={`${styles.tag} ${styles.flat}`}>±0</span>;
  }
  const arrow = delta.dir === 'up' ? '↑' : '↓';
  return (
    <span className={styles.tag}>
      {arrow}{formatChemValue(delta.magnitude, decimals)}
    </span>
  );
}
```

Create `DeltaTag.module.css`:

```css
.tag {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.flat {
  opacity: 0.5;
}
```

Create `index.ts`:

```ts
export { DeltaTag } from './DeltaTag';
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/DeltaTag/DeltaTag.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/DeltaTag/
git commit -m "feat: add DeltaTag component"
```

---

### Task 12: `ChemChart` (Recharts, mini + full variants)

**Files:**
- Create: `dashboard/src/components/ChemChart/ChemChart.tsx`, `ChemChart.module.css`, `index.ts`
- Test: `dashboard/src/components/ChemChart/ChemChart.test.tsx`

- [ ] **Step 1: Write the implementation.** Create `ChemChart.tsx`:

```tsx
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { celsiusToFahrenheit } from '../../utils/temperature';
import type { ChemistryReading, ChemKey, TimeSeriesPoint } from '../../types';
import styles from './ChemChart.module.css';

interface ChemChartProps {
  readings: ChemistryReading[];
  chemKey: ChemKey;
  color: string;
  decimals: number;
  poolHistory: TimeSeriesPoint[];
  airHistory: TimeSeriesPoint[];
  showPool: boolean;
  showAir: boolean;
  variant: 'mini' | 'full';
}

interface ChartPoint {
  t: number;        // epoch ms (numeric x for a shared time domain)
  chem?: number;
  pool?: number;
  air?: number;
}

function padDomain([min, max]: [number, number]): [number, number] {
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.15;
  return [min - pad, max + pad];
}

export function ChemChart({
  readings, chemKey, color, decimals, poolHistory, airHistory, showPool, showAir, variant,
}: ChemChartProps) {
  const { unit } = useTheme();
  const isF = unit === 'F';
  const isFull = variant === 'full';

  const data = useMemo<ChartPoint[]>(() => {
    const byTime = new Map<number, ChartPoint>();
    const get = (iso: string) => {
      const t = new Date(iso).getTime();
      let p = byTime.get(t);
      if (!p) { p = { t }; byTime.set(t, p); }
      return p;
    };
    for (const r of readings) {
      const v = r[chemKey];
      if (typeof v === 'number') get(r.date).chem = v;
    }
    if (showPool) for (const p of poolHistory) get(p.time).pool = isF ? celsiusToFahrenheit(p.value) : p.value;
    if (showAir) for (const p of airHistory) get(p.time).air = isF ? celsiusToFahrenheit(p.value) : p.value;
    return Array.from(byTime.values()).sort((a, b) => a.t - b.t);
  }, [readings, chemKey, poolHistory, airHistory, showPool, showAir, isF]);

  const chemValues = useMemo(
    () => data.map((d) => d.chem).filter((v): v is number => typeof v === 'number'),
    [data],
  );
  const chemDomain = useMemo<[number, number]>(
    () => (chemValues.length ? padDomain([Math.min(...chemValues), Math.max(...chemValues)]) : [0, 1]),
    [chemValues],
  );

  const lastChemT = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i--) if (typeof data[i].chem === 'number') return data[i].t;
    return null;
  }, [data]);

  const formatDateTick = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className={isFull ? styles.full : styles.mini} data-testid={`chem-chart-${chemKey}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={isFull ? { top: 8, right: 8, bottom: 4, left: 0 } : { top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            hide={!isFull}
            tickFormatter={formatDateTick}
            tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          {/* Temperature overlay axis — hidden, independent scale (correlation, not shared units). */}
          <YAxis yAxisId="temp" hide domain={['auto', 'auto']} />
          <YAxis yAxisId="chem" hide={!isFull} orientation="left" domain={chemDomain} width={36}
            tickFormatter={(v: number) => v.toFixed(decimals)}
            tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
            tickLine={false} axisLine={false} ticks={isFull ? [chemDomain[0], (chemDomain[0] + chemDomain[1]) / 2, chemDomain[1]] : undefined} />

          {showPool && (
            <Area yAxisId="temp" type="monotone" dataKey="pool" stroke="var(--ghost-stroke)" strokeWidth={1.5}
              strokeDasharray="2 3" fill="var(--ghost-fill)" dot={false} connectNulls isAnimationActive={false} />
          )}
          {showAir && (
            <Line yAxisId="temp" type="monotone" dataKey="air" stroke="var(--air-stroke)" strokeWidth={1.5}
              strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
          )}
          <Line yAxisId="chem" type="monotone" dataKey="chem" stroke={color} strokeWidth={2}
            connectNulls isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; payload?: ChartPoint }) => {
              const { cx, cy, payload } = props;
              if (cx == null || cy == null || payload?.chem == null) return <g />;
              const isLast = payload.t === lastChemT;
              return <circle cx={cx} cy={cy} r={isLast ? 3.4 : 2.2} fill={color} />;
            }}
            activeDot={{ r: 3.4, fill: color }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Create `ChemChart.module.css`:

```css
.mini {
  width: 100%;
  height: 66px;
}

.full {
  width: 100%;
  height: 180px;
}
```

Create `index.ts`:

```ts
export { ChemChart } from './ChemChart';
```

- [ ] **Step 2: Write a smoke test.** Create `ChemChart.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChemChart } from './ChemChart';
import { ThemeProvider } from '../../context/ThemeContext';

const readings = [
  { date: '2026-05-20T16:00:00Z', ph: 7.5 },
  { date: '2026-05-29T16:00:00Z', ph: 7.7 },
];

describe('ChemChart', () => {
  it('renders a chart container for the chemical', () => {
    render(
      <ThemeProvider>
        <ChemChart readings={readings} chemKey="ph" color="oklch(0.58 0.15 260)" decimals={1}
          poolHistory={[]} airHistory={[]} showPool={false} showAir={false} variant="mini" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('chem-chart-ph')).toBeInTheDocument();
  });
});
```

> Note: Recharts `ResponsiveContainer` renders with zero size in jsdom; the smoke test only asserts the wrapper mounts. This matches how `TempChart.test.tsx` handles charts.

- [ ] **Step 3: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemChart/ChemChart.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/components/ChemChart/
git commit -m "feat: add ChemChart with mini and full variants"
```

---

### Task 13: `ChemCard`

**Files:**
- Create: `dashboard/src/components/ChemCard/ChemCard.tsx`, `ChemCard.module.css`, `index.ts`
- Test: `dashboard/src/components/ChemCard/ChemCard.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `ChemCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChemCard } from './ChemCard';
import { ThemeProvider } from '../../context/ThemeContext';
import { CHEM_BY_KEY } from '../../constants/chemicals';

const readings = [
  { date: '2026-05-20T16:00:00Z', fc: 3.0 },
  { date: '2026-05-29T16:00:00Z', fc: 4.0 },
];

function renderCard(onOpen = vi.fn()) {
  render(
    <ThemeProvider>
      <ChemCard meta={CHEM_BY_KEY.fc} readings={readings}
        poolHistory={[]} airHistory={[]} overlay="off" onOpen={onOpen} />
    </ThemeProvider>,
  );
  return onOpen;
}

describe('ChemCard', () => {
  it('shows the name, latest value, and unit', () => {
    renderCard();
    expect(screen.getByText('FREE CHLORINE')).toBeInTheDocument();
    expect(screen.getByText('4.0')).toBeInTheDocument();
    expect(screen.getByText('ppm')).toBeInTheDocument();
  });

  it('calls onOpen when tapped', async () => {
    const onOpen = renderCard();
    await userEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('fc');
  });

  it('renders -- when no reading exists for the chemical', () => {
    render(
      <ThemeProvider>
        <ChemCard meta={CHEM_BY_KEY.ch} readings={readings}
          poolHistory={[]} airHistory={[]} overlay="off" onOpen={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByText('--')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemCard/ChemCard.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `ChemCard.tsx`:

```tsx
import type { ChemMeta } from '../../constants/chemicals';
import type { ChemistryReading, ChemKey, TimeSeriesPoint } from '../../types';
import { latestReading, computeDelta, formatChemValue } from '../../utils/chemistry';
import { DeltaTag } from '../DeltaTag';
import { ChemChart } from '../ChemChart';
import styles from './ChemCard.module.css';

interface ChemCardProps {
  meta: ChemMeta;
  readings: ChemistryReading[];
  poolHistory: TimeSeriesPoint[];
  airHistory: TimeSeriesPoint[];
  overlay: 'pool' | 'air' | 'off';
  onOpen: (key: ChemKey) => void;
}

export function ChemCard({ meta, readings, poolHistory, airHistory, overlay, onOpen }: ChemCardProps) {
  const latest = latestReading(readings, meta.key);
  const delta = computeDelta(readings, meta.key, meta.decimals);

  return (
    <button
      type="button"
      className={styles.card}
      style={{ borderTop: `3px solid ${meta.color}` }}
      onClick={() => onOpen(meta.key)}
    >
      <div className={styles.top}>
        <span className={styles.name}>{meta.name.toUpperCase()}</span>
        <DeltaTag delta={delta} decimals={meta.decimals} />
      </div>
      <div className={styles.valueRow}>
        <span className={styles.value} style={{ color: meta.color }}>
          {latest !== null ? formatChemValue(latest, meta.decimals) : '--'}
        </span>
        {meta.unit && <span className={styles.unit}>{meta.unit}</span>}
      </div>
      <ChemChart
        readings={readings}
        chemKey={meta.key}
        color={meta.color}
        decimals={meta.decimals}
        poolHistory={poolHistory}
        airHistory={airHistory}
        showPool={overlay === 'pool'}
        showAir={overlay === 'air'}
        variant="mini"
      />
    </button>
  );
}
```

Create `ChemCard.module.css`:

```css
.card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: 13px 13px 6px;
  background: var(--gradient-card);
  border: var(--border-glow);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm), var(--glow-primary);
  cursor: pointer;
  text-align: left;
  width: 100%;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

@media (hover: hover) {
  .card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md), var(--glow-accent);
  }
}

.card:active {
  transform: translateY(0) scale(0.98);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-xs);
}

.name {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.valueRow {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.value {
  font-size: 1.55rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.unit {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
}
```

Create `index.ts`:

```ts
export { ChemCard } from './ChemCard';
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemCard/ChemCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/ChemCard/
git commit -m "feat: add ChemCard mini card"
```

---

### Task 14: `TabBar`

**Files:**
- Create: `dashboard/src/components/TabBar/TabBar.tsx`, `TabBar.module.css`, `index.ts`
- Test: `dashboard/src/components/TabBar/TabBar.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `TabBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabBar } from './TabBar';

describe('TabBar', () => {
  it('marks the active tab as pressed', () => {
    render(<TabBar active="temperature" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Temperature' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Chemistry' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange when a tab is clicked', async () => {
    const onChange = vi.fn();
    render(<TabBar active="temperature" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Chemistry' }));
    expect(onChange).toHaveBeenCalledWith('chemistry');
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/TabBar/TabBar.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `TabBar.tsx`:

```tsx
import styles from './TabBar.module.css';

export type TabKey = 'temperature' | 'chemistry';

interface TabBarProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'temperature', label: 'Temperature' },
  { key: 'chemistry', label: 'Chemistry' },
];

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <div className={styles.bar} role="tablist">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={`${styles.tab} ${active === t.key ? styles.active : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

Create `TabBar.module.css`:

```css
.bar {
  display: flex;
  padding: 10px 14px 0;
}

.tab {
  flex: 1;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 9px 0 13px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
```

Create `index.ts`:

```ts
export { TabBar } from './TabBar';
export type { TabKey } from './TabBar';
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/TabBar/TabBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/TabBar/
git commit -m "feat: add TabBar component"
```

---

### Task 15: `Toast`

**Files:**
- Create: `dashboard/src/components/Toast/Toast.tsx`, `Toast.module.css`, `index.ts`
- Test: `dashboard/src/components/Toast/Toast.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `Toast.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from './Toast';

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the message when open', () => {
    render(<Toast open message="Reading saved" onDismiss={vi.fn()} />);
    expect(screen.getByText('Reading saved')).toBeInTheDocument();
  });

  it('auto-dismisses after the timeout', () => {
    const onDismiss = vi.fn();
    render(<Toast open message="Reading saved" onDismiss={onDismiss} />);
    vi.advanceTimersByTime(2200);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<Toast open={false} message="x" onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/Toast/Toast.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `Toast.tsx`:

```tsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './Toast.module.css';

interface ToastProps {
  open: boolean;
  message: string;
  onDismiss: () => void;
}

export function Toast({ open, message, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(onDismiss, 2200);
    return () => clearTimeout(id);
  }, [open, onDismiss]);

  if (!open) return null;

  return createPortal(
    <div className={styles.toast} role="status">
      <span className={styles.check}>✓</span>
      {message}
    </div>,
    document.body,
  );
}
```

Create `Toast.module.css`:

```css
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: rgba(15, 29, 46, 0.94);
  color: #fff;
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 600;
  box-shadow: var(--shadow-lg);
  z-index: 1000;
}

.check {
  color: var(--color-success);
  font-weight: 700;
}
```

Create `index.ts`:

```ts
export { Toast } from './Toast';
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/Toast/Toast.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/Toast/
git commit -m "feat: add Toast component"
```

---

### Task 16: `LogTestFlow` — UnlockSheet + LogForm + orchestration

**Files:**
- Create: `dashboard/src/components/LogTestFlow/LogTestFlow.tsx`, `UnlockSheet.tsx`, `LogForm.tsx`, `LogTestFlow.module.css`, `index.ts`
- Test: `dashboard/src/components/LogTestFlow/LogTestFlow.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `LogTestFlow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogTestFlow } from './LogTestFlow';
import { ThemeProvider } from '../../context/ThemeContext';

function renderFlow(props: Partial<React.ComponentProps<typeof LogTestFlow>> = {}) {
  const onSaved = vi.fn();
  render(
    <ThemeProvider>
      <LogTestFlow open onClose={vi.fn()} onSaved={onSaved} latest={{ ph: 7.7 }} {...props} />
    </ThemeProvider>,
  );
  return onSaved;
}

describe('LogTestFlow', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('shows the unlock sheet first when locked', () => {
    renderFlow();
    expect(screen.getByText(/Unlock to log a test/i)).toBeInTheDocument();
  });

  it('shows an inline error on 401', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 401 } as Response)));
    renderFlow();
    await userEvent.type(screen.getByLabelText(/username/i), 'alice');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    await waitFor(() => expect(screen.getByText(/incorrect username or password/i)).toBeInTheDocument());
  });

  it('advances to the form on success and disables Save until a value is entered', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response)));
    renderFlow();
    await userEvent.type(screen.getByLabelText(/username/i), 'alice');
    await userEvent.type(screen.getByLabelText(/password/i), 's3cret');
    await userEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    await waitFor(() => expect(screen.getByText(/Log a test/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save reading/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^FC/i), '4.0');
    expect(screen.getByRole('button', { name: /save reading/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/LogTestFlow/LogTestFlow.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `UnlockSheet.tsx`:**

```tsx
import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import styles from './LogTestFlow.module.css';

interface UnlockSheetProps {
  open: boolean;
  onClose: () => void;
  onUnlocked: (authHeader: string) => void;
}

export function UnlockSheet({ open, onClose, onUnlocked }: UnlockSheetProps) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const header = `Basic ${btoa(`${user}:${pass}`)}`;
    try {
      const res = await fetch('/api/chemistry/auth-check', { headers: { Authorization: header } });
      if (res.status === 401) {
        setError('Incorrect username or password.');
        return;
      }
      if (!res.ok) {
        setError('Could not reach the server. Try again.');
        return;
      }
      onUnlocked(header);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Unlock">
      <div className={styles.unlockBody}>
        <div className={styles.lockBadge} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <p className={styles.unlockTitle}>Unlock to log a test</p>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Username</span>
          <input className={styles.input} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Password</span>
          <input className={styles.input} type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.helper}>
          Stays unlocked on this device — you won't be asked again here. The public dashboard stays read-only for everyone else.
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.ghostBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primaryBtn} onClick={submit} disabled={busy || !user || !pass}>Unlock</button>
        </div>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Implement `LogForm.tsx`:**

```tsx
import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { CHEMS } from '../../constants/chemicals';
import type { ChemKey, ChemistryReading } from '../../types';
import styles from './LogTestFlow.module.css';

interface LogFormProps {
  open: boolean;
  onClose: () => void;
  authHeader: string;
  latest: Partial<Record<ChemKey, number>>;
  onSaved: () => void;
  onAuthExpired: () => void;
}

function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function LogForm({ open, onClose, authHeader, latest, onSaved, onAuthExpired }: LogFormProps) {
  const [date, setDate] = useState(todayLocalISODate);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAtLeastOne = CHEMS.some((c) => values[c.key]?.trim());

  const save = async () => {
    setBusy(true);
    setError(null);
    const body: ChemistryReading = { date };
    for (const c of CHEMS) {
      const raw = values[c.key]?.trim();
      if (raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) { setError(`Invalid value for ${c.short}`); setBusy(false); return; }
        body[c.key] = n;
      }
    }
    try {
      const res = await fetch('/api/chemistry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(body),
      });
      if (res.status === 401) { onAuthExpired(); return; }
      if (!res.ok) { setError('Could not save. Try again.'); return; }
      onSaved();
    } catch {
      setError('Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Log a test">
      <div className={styles.formBody}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Date</span>
          <input className={styles.input} type="date" value={date} max={todayLocalISODate()} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className={styles.grid}>
          {CHEMS.map((c) => (
            <label key={c.key} className={styles.field}>
              <span className={styles.fieldLabel}>
                <span className={styles.dot} style={{ background: c.color }} aria-hidden="true" /> {c.short}
                {latest[c.key] !== undefined && <span className={styles.hint}>last {latest[c.key]}</span>}
              </span>
              <span className={styles.inputWrap}>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  aria-label={c.short}
                  placeholder={latest[c.key] !== undefined ? String(latest[c.key]) : ''}
                  value={values[c.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
                />
                {c.unit && <span className={styles.suffix}>{c.unit}</span>}
              </span>
            </label>
          ))}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.ghostBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy || !hasAtLeastOne}>Save reading</button>
        </div>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 5: Implement `LogTestFlow.tsx` (orchestrator):**

```tsx
import { useState, useEffect } from 'react';
import { UnlockSheet } from './UnlockSheet';
import { LogForm } from './LogForm';
import { useChemAuth } from '../../hooks/useChemAuth';
import type { ChemKey } from '../../types';

interface LogTestFlowProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  latest: Partial<Record<ChemKey, number>>;
}

export function LogTestFlow({ open, onClose, onSaved, latest }: LogTestFlowProps) {
  const { unlocked, authHeader, unlock, lock } = useChemAuth();
  const [stage, setStage] = useState<'unlock' | 'form'>(unlocked ? 'form' : 'unlock');

  // When opened, jump straight to the form if already unlocked.
  useEffect(() => {
    if (open) setStage(unlocked ? 'form' : 'unlock');
  }, [open, unlocked]);

  if (!open) return null;

  if (stage === 'unlock' || !authHeader) {
    return (
      <UnlockSheet
        open
        onClose={onClose}
        onUnlocked={(header) => {
          // header is `Basic base64(user:pass)`; decode to persist via useChemAuth
          const [user, pass] = atob(header.slice(6)).split(/:(.*)/s);
          unlock(user, pass);
          setStage('form');
        }}
      />
    );
  }

  return (
    <LogForm
      open
      onClose={onClose}
      authHeader={authHeader}
      latest={latest}
      onSaved={onSaved}
      onAuthExpired={() => { lock(); setStage('unlock'); }}
    />
  );
}
```

Create `LogTestFlow.module.css`:

```css
.unlockBody, .formBody { display: flex; flex-direction: column; gap: var(--spacing-md); }

.lockBadge {
  width: 40px; height: 40px; border-radius: 999px;
  background: rgba(26, 111, 196, 0.1);
  display: flex; align-items: center; justify-content: center;
}

.unlockTitle { font-size: 1.05rem; font-weight: 700; margin: 0; }

.field { display: flex; flex-direction: column; gap: 4px; }

.fieldLabel {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.78rem; font-weight: 600; color: var(--color-text-secondary);
}

.hint { margin-left: auto; font-weight: 400; opacity: 0.8; }

.dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }

.inputWrap { position: relative; display: flex; align-items: center; }

.input {
  width: 100%;
  padding: 11px 12px;
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(26, 111, 196, 0.12);
}

.suffix {
  position: absolute; right: 12px;
  font-size: 0.8rem; color: var(--color-text-secondary); pointer-events: none;
}

.grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm) var(--spacing-md); }

.error { color: var(--color-danger); font-size: 0.85rem; margin: 0; }

.helper { font-size: 0.78rem; color: var(--color-text-secondary); margin: 0; }

.actions { display: flex; gap: var(--spacing-sm); }

.ghostBtn, .primaryBtn {
  flex: 1; padding: 11px 0; border-radius: var(--radius-sm);
  font-size: 0.9rem; font-weight: 600; cursor: pointer;
}

.ghostBtn { background: none; border: 1px solid var(--color-border); color: var(--color-text); }

.primaryBtn { background: var(--color-primary); border: none; color: #fff; }

.primaryBtn:disabled { opacity: 0.5; cursor: not-allowed; }
```

Create `index.ts`:

```ts
export { LogTestFlow } from './LogTestFlow';
```

- [ ] **Step 6: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/LogTestFlow/LogTestFlow.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/components/LogTestFlow/
git commit -m "feat: add auth-gated log-test flow (unlock + form)"
```

---

### Task 17: `ChemFocusSheet`

**Files:**
- Create: `dashboard/src/components/ChemFocusSheet/ChemFocusSheet.tsx`, `ChemFocusSheet.module.css`, `index.ts`
- Test: `dashboard/src/components/ChemFocusSheet/ChemFocusSheet.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `ChemFocusSheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChemFocusSheet } from './ChemFocusSheet';
import { ThemeProvider } from '../../context/ThemeContext';
import { CHEM_BY_KEY } from '../../constants/chemicals';

const readings = [
  { date: '2026-05-20T16:00:00Z', fc: 3.0 },
  { date: '2026-05-29T16:00:00Z', fc: 4.0 },
];

describe('ChemFocusSheet', () => {
  it('shows the chemical name, value, and Low/Avg/High stats', () => {
    render(
      <ThemeProvider>
        <ChemFocusSheet meta={CHEM_BY_KEY.fc} readings={readings}
          poolHistory={[]} airHistory={[]} onClose={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByText('FREE CHLORINE')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Avg')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('toggles the Pool overlay pill', async () => {
    render(
      <ThemeProvider>
        <ChemFocusSheet meta={CHEM_BY_KEY.fc} readings={readings}
          poolHistory={[]} airHistory={[]} onClose={vi.fn()} />
      </ThemeProvider>,
    );
    const poolPill = screen.getByRole('button', { name: /pool temp/i });
    expect(poolPill).toHaveAttribute('aria-pressed', 'true'); // default on
    await userEvent.click(poolPill);
    expect(poolPill).toHaveAttribute('aria-pressed', 'false');
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemFocusSheet/ChemFocusSheet.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `ChemFocusSheet.tsx`:

```tsx
import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { ChemChart } from '../ChemChart';
import { DeltaTag } from '../DeltaTag';
import type { ChemMeta } from '../../constants/chemicals';
import type { ChemistryReading, TimeSeriesPoint } from '../../types';
import { latestReading, computeDelta, computeStats, formatChemValue } from '../../utils/chemistry';
import styles from './ChemFocusSheet.module.css';

interface ChemFocusSheetProps {
  meta: ChemMeta;
  readings: ChemistryReading[];
  poolHistory: TimeSeriesPoint[];
  airHistory: TimeSeriesPoint[];
  onClose: () => void;
}

export function ChemFocusSheet({ meta, readings, poolHistory, airHistory, onClose }: ChemFocusSheetProps) {
  const [poolOn, setPoolOn] = useState(true);
  const [airOn, setAirOn] = useState(false);

  const latest = latestReading(readings, meta.key);
  const delta = computeDelta(readings, meta.key, meta.decimals);
  const stats = computeStats(readings, meta.key);

  const recent = readings
    .filter((r) => typeof r[meta.key] === 'number')
    .slice(-6)
    .reverse();

  return (
    <BottomSheet open onClose={onClose} title={meta.name}>
      <div className={styles.body}>
        <div className={styles.header}>
          <span className={styles.name}>{meta.name.toUpperCase()}</span>
          <div className={styles.valueRow}>
            <span className={styles.value} style={{ color: meta.color }}>
              {latest !== null ? formatChemValue(latest, meta.decimals) : '--'}
            </span>
            {meta.unit && <span className={styles.unit}>{meta.unit}</span>}
            <DeltaTag delta={delta} decimals={meta.decimals} />
          </div>
        </div>

        <div className={styles.overlayRow}>
          <span className={styles.overlayLabel}>Overlay</span>
          <button type="button" aria-pressed={poolOn}
            className={`${styles.pill} ${poolOn ? styles.poolOn : ''}`} onClick={() => setPoolOn((v) => !v)}>
            <span className={styles.swatchPool} /> Pool temp
          </button>
          <button type="button" aria-pressed={airOn}
            className={`${styles.pill} ${airOn ? styles.airOn : ''}`} onClick={() => setAirOn((v) => !v)}>
            <span className={styles.swatchAir} /> Air temp
          </button>
        </div>

        <ChemChart readings={readings} chemKey={meta.key} color={meta.color} decimals={meta.decimals}
          poolHistory={poolHistory} airHistory={airHistory} showPool={poolOn} showAir={airOn} variant="full" />

        <div className={styles.stats}>
          {(['low', 'avg', 'high'] as const).map((k) => (
            <div key={k} className={styles.statBox}>
              <span className={styles.statKey}>{k === 'low' ? 'Low' : k === 'avg' ? 'Avg' : 'High'}</span>
              <span className={styles.statVal}>{stats ? formatChemValue(stats[k], meta.decimals) : '--'}</span>
            </div>
          ))}
        </div>

        <div className={styles.list}>
          {recent.map((r) => (
            <div key={r.date} className={styles.listRow}>
              <span>{new Date(r.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <span className={styles.listVal}>{formatChemValue(r[meta.key] as number, meta.decimals)}{meta.unit && ` ${meta.unit}`}</span>
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
```

Create `ChemFocusSheet.module.css`:

```css
.body { display: flex; flex-direction: column; gap: var(--spacing-md); }

.name { font-size: 0.78rem; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; }

.valueRow { display: flex; align-items: baseline; gap: var(--spacing-sm); }

.value { font-size: 2.3rem; font-weight: 700; font-variant-numeric: tabular-nums; }

.unit { font-size: 0.9rem; color: var(--color-text-secondary); }

.overlayRow { display: flex; align-items: center; gap: var(--spacing-sm); flex-wrap: wrap; }

.overlayLabel { font-size: 0.78rem; font-weight: 600; color: var(--color-text-secondary); }

.pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 999px;
  border: 1px solid var(--color-border); background: var(--color-surface);
  font-size: 0.78rem; font-weight: 600; color: var(--color-text-secondary); cursor: pointer;
}

.poolOn { background: rgba(26, 111, 196, 0.1); border-color: rgba(26, 111, 196, 0.3); color: var(--color-primary); }

.airOn { background: rgba(234, 88, 12, 0.1); border-color: rgba(234, 88, 12, 0.35); color: var(--color-air-temp); }

.swatchPool, .swatchAir { width: 15px; border-top: 2px dashed; display: inline-block; }

.swatchPool { border-color: var(--ghost-stroke); }

.swatchAir { border-color: var(--air-stroke); }

.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-sm); }

.statBox {
  display: flex; flex-direction: column; gap: 2px;
  background: var(--color-bg); border-radius: var(--radius-sm); padding: 8px 10px;
}

.statKey { font-size: 0.66rem; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); }

.statVal { font-size: 1.05rem; font-weight: 700; font-variant-numeric: tabular-nums; }

.list { display: flex; flex-direction: column; }

.listRow {
  display: flex; justify-content: space-between; align-items: center;
  padding: 9px 0; font-size: 0.84rem; border-bottom: 1px solid var(--color-border);
}

.listVal { font-size: 0.86rem; font-weight: 600; font-variant-numeric: tabular-nums; }
```

Create `index.ts`:

```ts
export { ChemFocusSheet } from './ChemFocusSheet';
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemFocusSheet/ChemFocusSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/ChemFocusSheet/
git commit -m "feat: add ChemFocusSheet detail sheet"
```

---

### Task 18: `ChemistryTab` — grid home + overlay + range controls

**Files:**
- Create: `dashboard/src/components/ChemistryTab/ChemistryTab.tsx`, `ChemistryTab.module.css`, `index.ts`
- Test: `dashboard/src/components/ChemistryTab/ChemistryTab.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `ChemistryTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChemistryTab } from './ChemistryTab';
import { ThemeProvider } from '../../context/ThemeContext';

function jsonResponse(data: unknown) { return { ok: true, json: async () => data } as Response; }

describe('ChemistryTab', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.startsWith('/api/chemistry')) return Promise.resolve(jsonResponse([
        { date: '2026-05-20T16:00:00Z', ph: 7.5, fc: 3.0 },
        { date: '2026-05-29T16:00:00Z', ph: 7.7, fc: 4.0 },
      ]));
      return Promise.resolve(jsonResponse([]));
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the six chemical cards', async () => {
    render(<ThemeProvider><ChemistryTab /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
    expect(screen.getByText('FREE CHLORINE')).toBeInTheDocument();
    expect(screen.getByText('CALCIUM HARDNESS')).toBeInTheDocument();
  });

  it('opens the focus sheet when a card is tapped', async () => {
    render(<ThemeProvider><ChemistryTab /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('FREE CHLORINE')).toBeInTheDocument());
    await userEvent.click(screen.getByText('FREE CHLORINE'));
    // Focus sheet shows the Low/Avg/High stats
    await waitFor(() => expect(screen.getByText('Avg')).toBeInTheDocument());
  });

  it('opens the unlock sheet from Log test when locked', async () => {
    render(<ThemeProvider><ChemistryTab /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /log test/i }));
    expect(screen.getByText(/Unlock to log a test/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemistryTab/ChemistryTab.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `ChemistryTab.tsx`:

```tsx
import { useState } from 'react';
import { CHEMS, CHEM_BY_KEY } from '../../constants/chemicals';
import { useChemistryData } from '../../hooks/useChemistryData';
import { latestReading } from '../../utils/chemistry';
import { ChemCard } from '../ChemCard';
import { ChemFocusSheet } from '../ChemFocusSheet';
import { LogTestFlow } from '../LogTestFlow';
import { Toast } from '../Toast';
import { DateRangePicker } from '../DateRangePicker';
import type { ChemKey } from '../../types';
import styles from './ChemistryTab.module.css';

type Overlay = 'pool' | 'air' | 'off';

const RANGES = [
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'season', label: 'Season' },
  { key: 'all', label: 'All' },
];

export function ChemistryTab() {
  const [range, setRange] = useState('season');
  const [showCustom, setShowCustom] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>('pool');
  const [selected, setSelected] = useState<ChemKey | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [toast, setToast] = useState(false);

  const { readings, poolHistory, airHistory, loading, refetch } = useChemistryData(range);

  const lastDate = readings.length ? new Date(readings[readings.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

  const latestValues: Partial<Record<ChemKey, number>> = {};
  for (const c of CHEMS) {
    const v = latestReading(readings, c.key);
    if (v !== null) latestValues[c.key] = v;
  }

  return (
    <div className={styles.tab}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Chemistry</h2>
          <p className={styles.subtitle}>Last test {lastDate} · tap a card to correlate with temp</p>
        </div>
        <button type="button" className={styles.logBtn} onClick={() => setLogOpen(true)}>＋ Log test</button>
      </div>

      <div className={styles.controls}>
        <div className={styles.overlayControl}>
          <span className={styles.overlayLabel}>OVERLAY TEMP</span>
          <div className={styles.segment}>
            {(['pool', 'air', 'off'] as Overlay[]).map((o) => (
              <button key={o} type="button"
                className={`${styles.segBtn} ${overlay === o ? styles.segActive : ''}`}
                onClick={() => setOverlay(o)}>
                {o === 'pool' ? 'Pool' : o === 'air' ? 'Air' : 'Off'}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.rangeRow}>
          {RANGES.map((r) => (
            <button key={r.key} type="button"
              className={`${styles.rangeBtn} ${range === r.key && !showCustom ? styles.rangeActive : ''}`}
              onClick={() => { setRange(r.key); setShowCustom(false); }}>{r.label}</button>
          ))}
          <button type="button" className={`${styles.rangeBtn} ${showCustom ? styles.rangeActive : ''}`}
            onClick={() => setShowCustom((v) => !v)}>Custom</button>
        </div>
      </div>

      {showCustom && (
        <DateRangePicker onApply={(from, to) => { setRange(`custom:${from}:${to}`); setShowCustom(false); }} />
      )}

      {loading && readings.length === 0 ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        <div className={styles.grid}>
          {CHEMS.map((c) => (
            <ChemCard key={c.key} meta={c} readings={readings}
              poolHistory={poolHistory} airHistory={airHistory} overlay={overlay} onOpen={setSelected} />
          ))}
        </div>
      )}

      {selected && (
        <ChemFocusSheet meta={CHEM_BY_KEY[selected]} readings={readings}
          poolHistory={poolHistory} airHistory={airHistory} onClose={() => setSelected(null)} />
      )}

      <LogTestFlow open={logOpen} onClose={() => setLogOpen(false)} latest={latestValues}
        onSaved={() => { setLogOpen(false); setToast(true); refetch(); }} />

      <Toast open={toast} message="Reading saved" onDismiss={() => setToast(false)} />
    </div>
  );
}
```

Create `ChemistryTab.module.css`:

```css
.tab { display: flex; flex-direction: column; gap: var(--spacing-md); }

.head { display: flex; justify-content: space-between; align-items: flex-start; }

.title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin: 0; }

.subtitle { font-size: 0.8rem; color: var(--color-text-secondary); margin: 2px 0 0; }

.logBtn {
  padding: 8px 13px; background: var(--color-primary); color: #fff;
  font-size: 0.82rem; font-weight: 600; border: none; border-radius: var(--radius-sm); cursor: pointer;
  white-space: nowrap;
}

.controls { display: flex; flex-direction: column; gap: var(--spacing-sm); }

.overlayControl { display: flex; align-items: center; gap: var(--spacing-sm); }

.overlayLabel { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-secondary); }

.segment { display: inline-flex; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 999px; padding: 2px; }

.segBtn { padding: 6px 13px; font-size: 0.78rem; font-weight: 600; border: none; border-radius: 999px; background: transparent; color: var(--color-text-secondary); cursor: pointer; }

.segActive { background: var(--color-bg); color: var(--color-text); box-shadow: var(--shadow-sm); }

.rangeRow { display: flex; gap: 6px; flex-wrap: wrap; }

.rangeBtn { padding: 6px 11px; font-size: 0.78rem; font-weight: 600; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-secondary); border-radius: var(--radius-sm); cursor: pointer; }

.rangeActive { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }

.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.loading { color: var(--color-text-secondary); text-align: center; padding: var(--spacing-xl) 0; }
```

Create `index.ts`:

```ts
export { ChemistryTab } from './ChemistryTab';
```

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/components/ChemistryTab/ChemistryTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/ChemistryTab/
git commit -m "feat: add ChemistryTab grid home"
```

---

### Task 19: Integrate tabs into `App`

**Files:**
- Modify: `dashboard/src/App.tsx`
- Test: `dashboard/src/App.test.tsx` (extend)

- [ ] **Step 1: Add a failing test.** In `App.test.tsx`, add a test that switching to the Chemistry tab renders the Chemistry heading. Append inside the existing top-level `describe` (mock fetch so the chemistry hook resolves):

```tsx
  it('switches to the Chemistry tab', async () => {
    // (Ensure fetch is mocked in this file's setup to return [] for unknown URLs.)
    render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Chemistry' }));
    expect(await screen.findByRole('heading', { name: 'Chemistry' })).toBeInTheDocument();
  });
```

If `App.test.tsx` does not already import `userEvent`/`screen`/`render`, add:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

and ensure `global.fetch` is stubbed in that file (mirror the pattern used by the existing App tests; if none, add a `beforeEach` stubbing `fetch` to resolve `{ ok: true, json: async () => [] }`).

- [ ] **Step 2: Run to verify failure.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/App.test.tsx`
Expected: FAIL (no Chemistry tab yet).

- [ ] **Step 3: Implement.** Update `App.tsx`:

```tsx
import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { usePoolData } from './hooks/usePoolData';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CurrentTemp } from './components/CurrentTemp';
import { StatsGrid } from './components/StatsGrid';
import { TempChart } from './components/TempChart';
import { BatteryStatus } from './components/BatteryStatus';
import { SensorSelector } from './components/SensorSelector';
import { TabBar, type TabKey } from './components/TabBar';
import { ChemistryTab } from './components/ChemistryTab';
import styles from './App.module.css';

function TemperatureTab() {
  const { stats, history, batteries, range, setRange, loading, error, sensors, selectedSensor, setSelectedSensor, airCurrent, airHistory } = usePoolData();

  return (
    <>
      {error && !loading && stats && <p className={styles.error}>{error}</p>}
      <SensorSelector sensors={sensors} selected={selectedSensor} onSelect={setSelectedSensor} />
      <CurrentTemp value={stats?.current ?? null} loading={loading} airCurrent={airCurrent} />
      <StatsGrid stats={stats} loading={loading} selectedSensor={selectedSensor} range={range} />
      <TempChart data={history} range={range} onRangeChange={setRange} loading={loading} airHistory={airHistory} />
      <BatteryStatus batteries={batteries} loading={loading} />
    </>
  );
}

function Dashboard() {
  const [tab, setTab] = useState<TabKey>('temperature');
  return (
    <main className={styles.main}>
      <TabBar active={tab} onChange={setTab} />
      <div className="container">
        {tab === 'temperature' ? <TemperatureTab /> : <ChemistryTab />}
      </div>
    </main>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <div className={styles.app}>
        <Header />
        <Dashboard />
        <Footer />
      </div>
    </ThemeProvider>
  );
}
```

> Note: `usePoolData` now only runs while the Temperature tab is mounted. That's intended — its polling pauses on the Chemistry tab and resumes on return.

- [ ] **Step 4: Run to verify pass.**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: add tab navigation between Temperature and Chemistry"
```

---

## Phase 4 — Config, docs & verification

### Task 20: Config and documentation

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: docker-compose.** In the `dashboard` service `environment:` block, add:

```yaml
      CHEM_AUTH_USER: ${CHEM_AUTH_USER:-}
      CHEM_AUTH_PASSWORD: ${CHEM_AUTH_PASSWORD:-}
```

- [ ] **Step 2: .env.example.** Add a chemistry section (place near the dashboard vars):

```bash
# --- Chemistry logging (write auth) ---
# Single shared credential that gates POST /api/chemistry (the log-test form).
# The rest of the dashboard stays public/read-only.
CHEM_AUTH_USER=pooladmin
CHEM_AUTH_PASSWORD=change-me
```

Also add a note near `INFLUXDB_TOKEN` (find the existing comment for it and append):

```bash
# NOTE: the dashboard now also WRITES chemistry readings, so this token needs
# write scope on the bucket (not just read).
```

- [ ] **Step 3: CLAUDE.md.** In the dashboard API endpoints list, add:

```markdown
  - `/api/chemistry?range=...` — GET list of manual chemistry readings `{ date, ph?, fc?, cc?, ta?, cya?, ch? }[]`; POST a reading (Basic-Auth gated). Ranges include `30d`/`90d`/`season`/`all`/`custom:`.
  - `/api/chemistry/auth-check` — GET, Basic-Auth gated; returns `{ ok: true }` (used by the unlock sheet to validate credentials without writing).
```

In the environment-variables table, add:

```markdown
| `CHEM_AUTH_USER` | Yes (for logging) | Username for the Basic-Auth gate on chemistry writes |
| `CHEM_AUTH_PASSWORD` | Yes (for logging) | Password for the Basic-Auth gate on chemistry writes |
```

Add a new subsection after "Multi-sensor 'All' view":

```markdown
### Chemistry tab

A second tab (local `activeTab` state in `App`) logs six manual chemical readings
(`ph`, `fc`, `cc`, `ta`, `cya`, `ch`) to a new InfluxDB `chemistry` measurement and
shows each as a small-multiple trend card correlated against pool/air temperature.
Tapping a card opens a focus `BottomSheet` (full chart + Low/Avg/High + recent
readings). Logging is gated by an Express Basic-Auth middleware (`server/auth.ts`)
on `POST /api/chemistry`; the UI uses a custom unlock sheet (the 401 response
intentionally omits `WWW-Authenticate` to suppress the native browser dialog).
Date-only readings are stored at local noon in `TIMEZONE`. No ideal-range/dosing
logic — numbers and trends only.
```

Note in CLAUDE.md the new tokens under the design-tokens area if such a list exists; otherwise skip.

- [ ] **Step 4: Commit.**

```bash
git add docker-compose.yml .env.example CLAUDE.md
git commit -m "chore: document chemistry env vars, endpoints, and tab"
```

---

### Task 21: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + lint.**

Run: `source ~/.nvm/nvm.sh && pnpm typecheck && pnpm lint`
Expected: both clean. Fix any reported issues before continuing.

- [ ] **Step 2: Full test suite with coverage.**

Run: `source ~/.nvm/nvm.sh && pnpm test:coverage`
Expected: all tests PASS; coverage ≥ 80%. If any new file is under-covered, add targeted tests.

- [ ] **Step 3: Production build.**

Run: `source ~/.nvm/nvm.sh && pnpm build`
Expected: TypeScript build, Vite build, and server compile all succeed.

- [ ] **Step 4: Manual smoke (optional but recommended).** With InfluxDB reachable and `CHEM_AUTH_USER`/`CHEM_AUTH_PASSWORD` set:

```bash
source ~/.nvm/nvm.sh && pnpm dev:server   # terminal 1
source ~/.nvm/nvm.sh && pnpm dev          # terminal 2
```

Verify in the browser: Chemistry tab renders six cards; overlay Pool/Air/Off changes the ghost line; tapping a card opens the focus sheet; Log test → unlock (wrong creds → inline error; correct creds → form) → save → toast → card updates. Confirm `curl -i -X POST localhost:3001/api/chemistry` (no auth) returns `401` with **no** `WWW-Authenticate` header.

- [ ] **Step 5: Final commit (if smoke fixes were needed).**

```bash
git add -A
git commit -m "fix: address chemistry verification findings"
```

---

## Self-review notes

- **Spec coverage:** measurement/fields/partial (Tasks 2,3,5); local-noon (Task 2); GET/POST/auth-check (Task 6); no-`WWW-Authenticate` (Tasks 4,6,21); selectable range incl. season/all (Tasks 1,18); tab bar (Tasks 14,19); grid + cards + delta (Tasks 11,13,18); mini/full charts + overlays (Task 12); focus sheet stats/list (Task 17); unlock/form/toast + persisted credential (Tasks 9,15,16); tokens (Task 7); config + docs (Task 20); tests ≥80% (Task 21). All spec sections map to a task.
- **Type consistency:** `ChemKey`/`ChemistryReading` defined in `types.ts` (Task 7) and reused everywhere; server `ChemField`/`CHEM_FIELDS` defined in `chemistry.ts` (Task 2) and reused in `influx.ts`/validation; `Delta`/`ChemStats` defined in `utils/chemistry.ts` (Task 8) and consumed by `DeltaTag`/cards/sheet; `TabKey` exported from `TabBar` (Task 14) and used in `App` (Task 19).
- **No placeholders:** every code step contains complete code.
