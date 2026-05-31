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
  // The username is compared case-insensitively (normalized to lowercase on
  // both sides); the password remains case-sensitive.
  if (
    !expectedUser ||
    !expectedPass ||
    !creds ||
    !credentialsMatch(
      { user: creds.user.toLowerCase(), pass: creds.pass },
      { user: expectedUser.toLowerCase(), pass: expectedPass },
    )
  ) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
