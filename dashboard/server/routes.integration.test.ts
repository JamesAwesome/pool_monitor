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
  queryStats: vi.fn(async () => ({ current: null, average: null, peak: null, seasonAvg: null, seasonPeak: null })),
  queryHistory: vi.fn(async () => []),
  queryBatteries: vi.fn(async () => []),
  queryBatteryHistory: vi.fn(async () => []),
  querySeasonHistory: vi.fn(async () => []),
  queryStatDetail: vi.fn(async () => []),
  queryWeatherCurrent: vi.fn(async () => null),
  queryWeatherHistory: vi.fn(async () => []),
  queryChemistry: vi.fn(async () => []),
  writeChemistry: vi.fn(async () => '2026-05-20T20:30:00.000Z'),
  deleteChemistryPoint: vi.fn(async () => {}),
}));
vi.mock('./og-image.js', () => ({ generateOgImage: vi.fn(async () => Buffer.from('')) }));

import { writeChemistry, deleteChemistryPoint } from './influx.js';

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
    (deleteChemistryPoint as Mock).mockClear();
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

    // Assert that deleteChemistryPoint was called BEFORE writeChemistry.
    // invocationCallOrder values are monotonically increasing global counters, so
    // a lower value means the call happened first. If the route ever swaps to
    // write-then-delete, the delete order will be greater than the write order and
    // this assertion will fail.
    const delOrder = (deleteChemistryPoint as Mock).mock.invocationCallOrder[0];
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
});
