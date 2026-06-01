// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { clientIp } from './rateLimit';

// No data-layer mock needed: every request here is rejected at the rate-limit or
// auth layer before any influx call, and we send no valid credentials.
const router = (await import('./routes')).default;

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.CHEM_AUTH_USER = 'tester';
  process.env.CHEM_AUTH_PASSWORD = 'secret';
  const app = express();
  app.set('trust proxy', 1);
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

// The limiter is module-level state shared across the suite. Use a distinct
// CF-Connecting-IP per test so counts don't bleed between cases.
let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

async function hitAuthCheck(ip: string): Promise<number> {
  const res = await fetch(`${base}/api/chemistry/auth-check`, {
    headers: { 'CF-Connecting-IP': ip },
  });
  return res.status;
}

describe('clientIp', () => {
  it('prefers the CF-Connecting-IP header', () => {
    const req = { headers: { 'cf-connecting-ip': '198.51.100.7' }, ip: '10.0.0.1' } as never;
    expect(clientIp(req)).toBe('198.51.100.7');
  });

  it('falls back to req.ip when the header is absent', () => {
    const req = { headers: {}, ip: '10.0.0.1' } as never;
    expect(clientIp(req)).toBe('10.0.0.1');
  });
});

describe('chemistry auth rate limiting', () => {
  beforeEach(() => {
    // give each test its own client identity
  });

  it('allows the first 10 attempts then returns 429 (without valid creds → never 200)', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push(await hitAuthCheck(ip));
    // First 10 reach requireAuth and are rejected 401 (no credentials sent).
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    // 11th is throttled before auth.
    expect(statuses[10]).toBe(429);
  });

  it('throttles before auth: a flood with WRONG creds still yields 429, not 401', async () => {
    const ip = freshIp();
    const header = `Basic ${Buffer.from('tester:wrong').toString('base64')}`;
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await fetch(`${base}/api/chemistry/auth-check`, {
        headers: { 'CF-Connecting-IP': ip, Authorization: header },
      });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it('keys per client IP — a different IP is not throttled by another IP\'s attempts', async () => {
    const ipA = freshIp();
    for (let i = 0; i < 11; i++) await hitAuthCheck(ipA);
    // A's 11th was 429; a fresh IP should still be served (401, not 429).
    expect(await hitAuthCheck(freshIp())).toBe(401);
  });

  it('does not rate-limit the public read endpoint', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      const res = await fetch(`${base}/api/chemistry?range=season`, {
        headers: { 'CF-Connecting-IP': ip },
      });
      statuses.push(res.status);
    }
    expect(statuses.every((s) => s !== 429)).toBe(true);
  });
});
