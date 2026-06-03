import { windowPeriod } from './influx.js'

export interface ConditionSample {
  time: string
  code: number
  label: string
}

export interface BucketCondition {
  time: string
  conditionCode: number
  condition: string
}

/** Parse a windowPeriod token like '5m' | '1h' | '2h' | '1d' into milliseconds. */
function windowMs(period: string): number {
  const m = period.match(/^(\d+)([mhd])$/)
  if (!m) return 60 * 60 * 1000 // sensible 1h fallback
  const n = parseInt(m[1], 10)
  const unit = m[2]
  if (unit === 'm') return n * 60 * 1000
  if (unit === 'h') return n * 60 * 60 * 1000
  return n * 24 * 60 * 60 * 1000
}

/**
 * Bucket raw condition samples into the same windows the temp line uses
 * (windowPeriod(range)) and pick the MODE code per bucket. Ties resolve to the
 * earliest-seen code, making the result deterministic. Bucket time is the
 * window START (floor(ms / windowMs) * windowMs), matching aggregateWindow.
 */
export function bucketConditions(samples: ConditionSample[], range: string): BucketCondition[] {
  if (samples.length === 0) return []
  const w = windowMs(windowPeriod(range))

  // bucketStartMs -> { counts: Map<code, n>, firstSeen: Map<code, order>, label: Map<code, label> }
  const buckets = new Map<number, { counts: Map<number, number>; order: Map<number, number>; labels: Map<number, string> }>()
  let seq = 0
  for (const s of samples) {
    const t = new Date(s.time).getTime()
    const start = Math.floor(t / w) * w
    let b = buckets.get(start)
    if (!b) { b = { counts: new Map(), order: new Map(), labels: new Map() }; buckets.set(start, b) }
    b.counts.set(s.code, (b.counts.get(s.code) ?? 0) + 1)
    if (!b.order.has(s.code)) b.order.set(s.code, seq)
    b.labels.set(s.code, s.label)
    seq += 1
  }

  const out: BucketCondition[] = []
  for (const [start, b] of buckets) {
    let bestCode = -1, bestCount = -1, bestOrder = Infinity
    for (const [code, count] of b.counts) {
      const order = b.order.get(code)!
      if (count > bestCount || (count === bestCount && order < bestOrder)) {
        bestCode = code; bestCount = count; bestOrder = order
      }
    }
    out.push({ time: new Date(start).toISOString(), conditionCode: bestCode, condition: b.labels.get(bestCode)! })
  }
  out.sort((a, b) => a.time.localeCompare(b.time))
  return out
}
