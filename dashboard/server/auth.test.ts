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

  it('matches the username case-insensitively', () => {
    const header = `Basic ${Buffer.from('ALICE:s3cret').toString('base64')}`;
    const next = vi.fn();
    const res = mockRes();
    requireAuth({ headers: { authorization: header } } as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('matches when the configured username has mixed case', () => {
    process.env.CHEM_AUTH_USER = 'Alice';
    const header = `Basic ${Buffer.from('alice:s3cret').toString('base64')}`;
    const next = vi.fn();
    const res = mockRes();
    requireAuth({ headers: { authorization: header } } as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('keeps the password case-sensitive', () => {
    const header = `Basic ${Buffer.from('alice:S3CRET').toString('base64')}`;
    const next = vi.fn();
    const res = mockRes();
    requireAuth({ headers: { authorization: header } } as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
