// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
  writeChemistry: vi.fn(async () => {}),
}));
vi.mock('./og-image.js', () => ({ generateOgImage: vi.fn(async () => Buffer.from('')) }));

const router = (await import('./routes')).default;

let server: Server;
let base: string;

beforeAll(async () => {
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
