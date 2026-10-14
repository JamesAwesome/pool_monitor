// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';

// Mock the data layer so the routes run without a real InfluxDB. The point of
// these tests is the route-layer behavior (range validation), not the queries.
vi.mock('./influx.js', () => ({
  querySensors: vi.fn(async () => []),
  queryStats: vi.fn(async () => ({ current: null, currentTime: null, average: null, peak: null, seasonAvg: null, seasonPeak: null })),
  queryHistory: vi.fn(async () => []),
  queryBatteries: vi.fn(async () => []),
  queryBatteryHistory: vi.fn(async () => []),
  querySeasonHistory: vi.fn(async () => []),
  queryStatDetail: vi.fn(async () => []),
  queryWeatherCurrent: vi.fn(async () => null),
  queryWeatherHistory: vi.fn(async () => []),
  queryChemistry: vi.fn(async () => []),
  writeChemistry: vi.fn(async () => '2026-05-20T20:30:00.000Z'),
  querySwims: vi.fn(async () => []),
  writeSwim: vi.fn(async () => '2026-05-20T18:30:00.000Z'),
  queryEvents: vi.fn(async () => []),
  writeEvent: vi.fn(async () => '2026-05-20T18:30:00.000Z'),
  deletePoint: vi.fn(async () => {}),
  querySeasonSummaryData: vi.fn(async (year: number) => ({ year, poolHourly: [], airHourly: [], poolHigh: null, poolLow: null, conditions: [], chemistry: [], swims: [], events: [] })),
}));
vi.mock('./og-image.js', () => ({ generateOgImage: vi.fn(async () => Buffer.from('')) }));

import { querySeasonSummaryData, writeChemistry, querySwims as _querySwims, writeSwim as _writeSwim, queryEvents as _queryEvents, writeEvent as _writeEvent, deletePoint } from './influx.js';

const router = (await import('./routes')).default;

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.CHEM_AUTH_USER = 'tester';
  process.env.CHEM_AUTH_PASSWORD = 'secret';
  const app = express();
  app.use(router);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
  delete process.env.CHEM_AUTH_USER;
  delete process.env.CHEM_AUTH_PASSWORD;
});

// Shared unique-IP helper: gives each rate-limited request a distinct CF-Connecting-IP
// so the module-level rate-limiter bucket is never exhausted across the whole suite.
let _ipSeq = 0;
function nextIp(): string { _ipSeq += 1; return `198.51.100.${_ipSeq}`; }

// Each entry: a label, the path (with any required non-range params), and the
// query separator to append the range with.
const RANGE_ROUTES = [
  { label: '/api/stats', path: '/api/stats', sep: '?' },
  { label: '/api/history', path: '/api/history', sep: '?' },
  { label: '/api/stat-detail', path: '/api/stat-detail?stat=average', sep: '&' },
  { label: '/api/weather/history', path: '/api/weather/history', sep: '?' },
];

describe('range validation on data routes', () => {
  const evil = encodeURIComponent('30d) |> evil');

  for (const { label, path, sep } of RANGE_ROUTES) {
    it(`rejects an injection-ish range on ${label} with 400`, async () => {
      const res = await fetch(`${base}${path}${sep}range=${evil}`);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Invalid range');
    });

    it(`accepts a valid range on ${label}`, async () => {
      const res = await fetch(`${base}${path}${sep}range=24h`);
      expect(res.status).toBe(200);
    });
  }
});

describe('chemistry write routes', () => {
  const auth = { Authorization: 'Basic ' + Buffer.from('tester:secret').toString('base64') };

  // The chemistryAuthLimiter is module-level state keyed on client IP. Give each
  // request a unique CF-Connecting-IP so the shared bucket is never exhausted and
  // the suite stays flake-free regardless of how many tests are added.
  let ipSeq = 0;
  function nextIp(): string {
    ipSeq += 1;
    return `198.51.100.${ipSeq}`;
  }

  beforeEach(() => {
    // Reset invocation counters so order indices are clean for each test.
    (writeChemistry as Mock).mockClear();
    (deletePoint as Mock).mockClear();
  });

  it('POST returns 201 with the new id', async () => {
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ date: '2026-05-20', time: '16:30', fc: 6.8 }),
    });
    expect(res.status).toBe(201);
    expect((await res.json() as { id: string }).id).toBe('2026-05-20T20:30:00.000Z');
  });

  it('POST 400 on missing time', async () => {
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ date: '2026-05-20', fc: 6.8 }),
    });
    expect(res.status).toBe(400);
  });

  it('POST 401 without auth', async () => {
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ date: '2026-05-20', time: '16:30', fc: 6.8 }),
    });
    expect(res.status).toBe(401);
  });

  it('PUT deletes the old id then writes the new reading (200)', async () => {
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ id: '2026-05-20T11:50:00.000Z', date: '2026-05-20', time: '16:30', fc: 6.8 }),
    });
    expect(res.status).toBe(200);

    // Assert that deletePoint was called BEFORE writeChemistry.
    // invocationCallOrder values are monotonically increasing global counters, so
    // a lower value means the call happened first. If the route ever swaps to
    // write-then-delete, the delete order will be greater than the write order and
    // this assertion will fail.
    const delOrder = (deletePoint as Mock).mock.invocationCallOrder[0];
    const writeOrder = (writeChemistry as Mock).mock.invocationCallOrder.at(-1)!;
    expect(delOrder).toBeLessThan(writeOrder);
  });

  it('PUT 400 on invalid id', async () => {
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ id: 'nope', date: '2026-05-20', time: '16:30', fc: 6.8 }),
    });
    expect(res.status).toBe(400);
  });

  it('DELETE 200 with a valid id', async () => {
    const res = await fetch(`${base}/api/chemistry?id=${encodeURIComponent('2026-05-20T11:50:00.000Z')}`, {
      method: 'DELETE',
      headers: { ...auth, 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(200);
  });

  it('DELETE 400 without a valid id', async () => {
    const res = await fetch(`${base}/api/chemistry?id=nope`, {
      method: 'DELETE',
      headers: { ...auth, 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(400);
  });

  it('DELETE 401 without auth', async () => {
    const res = await fetch(`${base}/api/chemistry?id=${encodeURIComponent('2026-05-20T11:50:00.000Z')}`, {
      method: 'DELETE',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(401);
  });

  it('PUT 500 when writeChemistry rejects', async () => {
    (writeChemistry as Mock).mockRejectedValueOnce(new Error('boom'));
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ id: '2026-05-20T11:50:00.000Z', date: '2026-05-20', time: '16:30', fc: 6.8 }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('boom');
  });

  it('DELETE 500 when deletePoint rejects', async () => {
    (deletePoint as Mock).mockRejectedValueOnce(new Error('boom'));
    const res = await fetch(`${base}/api/chemistry?id=${encodeURIComponent('2026-05-20T11:50:00.000Z')}`, {
      method: 'DELETE',
      headers: { ...auth, 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('boom');
  });

  // Non-transactional gap: if delete succeeds but write throws, the point is gone
  // and the response is still 500. This documents the known limitation.
  it('PUT 500 (non-transactional gap): delete succeeds but write throws — old point already gone', async () => {
    (deletePoint as Mock).mockResolvedValueOnce(undefined);
    (writeChemistry as Mock).mockRejectedValueOnce(new Error('write failed'));
    const res = await fetch(`${base}/api/chemistry`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json', 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ id: '2026-05-20T11:50:00.000Z', date: '2026-05-20', time: '16:30', fc: 6.8 }),
    });
    expect(res.status).toBe(500);
  });
});

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
    expect(((await res.json()) as { id: string }).id).toBe('2026-05-20T18:30:00.000Z');
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
    expect(((await res.json()) as { id: string }).id).toBe('2026-05-20T18:30:00.000Z');
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

describe('GET /api/season-summary', () => {
  it('defaults to the current year and returns a summary', async () => {
    const res = await fetch(`${base}/api/season-summary`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { year: number; pool: unknown; swims: { sessions: number } };
    expect(body.year).toBe(new Date().getFullYear());
    expect(body.pool).toBeNull();
    expect(body.swims.sessions).toBe(0);
  });

  it('caches per year', async () => {
    (querySeasonSummaryData as Mock).mockClear();
    await fetch(`${base}/api/season-summary?year=2024`);
    await fetch(`${base}/api/season-summary?year=2024`);
    expect(querySeasonSummaryData).toHaveBeenCalledTimes(1);
    expect(querySeasonSummaryData).toHaveBeenCalledWith(2024);
  });

  for (const bad of ['1999', '3000', '20x6', '2026) |> evil']) {
    it(`rejects year=${bad} with 400`, async () => {
      const res = await fetch(`${base}/api/season-summary?year=${encodeURIComponent(bad)}`);
      expect(res.status).toBe(400);
    });
  }
});
