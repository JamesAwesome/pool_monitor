import type { Request } from 'express'
import { rateLimit, ipKeyGenerator } from 'express-rate-limit'

/**
 * Resolve the real client IP. The dashboard is reached only via the cloudflared
 * tunnel, which forwards the originating address in `CF-Connecting-IP`. Without
 * this, Express would see the tunnel container's address and bucket every remote
 * client under one key (so one attacker's failures would throttle everyone, and
 * the attacker could evade the limit by riding the shared bucket).
 *
 * Falls back to `req.ip` for direct/local access (e.g. on-LAN, tests).
 */
export function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip']
  if (typeof cf === 'string' && cf.length > 0) return cf
  return req.ip ?? ''
}

/**
 * Throttle the chemistry write surface (`POST`/`PUT`/`DELETE /api/chemistry` and
 * the `/api/chemistry/auth-check` credential probe) to blunt brute-force guessing
 * of the shared Basic-Auth password. 10 attempts per 15 minutes per client IP.
 * The public read endpoint (`GET /api/chemistry`) is unaffected.
 */
export const chemistryAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Key on the resolved client IP, normalized via the IPv6-safe helper so a
  // single IPv6 host can't cycle addresses within its /64 to evade the limit.
  keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
  message: { error: 'Too many attempts. Try again later.' },
})
