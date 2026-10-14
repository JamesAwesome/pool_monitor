import express, { Router } from 'express'
import { querySensors, queryStats, queryHistory, queryBatteries, queryBatteryHistory, querySeasonHistory, queryStatDetail, queryWeatherCurrent, queryWeatherHistory, queryChemistry, writeChemistry, querySwims, writeSwim, queryEvents, writeEvent, deletePoint, querySeasonSummaryData } from './influx.js'
import { buildSeasonSummary } from './seasonSummary.js'
import type { SeasonSummary } from './seasonSummary.js'
import { generateOgImage } from './og-image.js'
import { requireAuth } from './auth.js'
import { validateChemistryBody, isValidId } from './chemistry.js'
import { validateSwimBody } from './swim.js'
import { validateEventBody } from './event.js'
import { chemistryAuthLimiter } from './rateLimit.js'

function isValidSensorId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export function isValidRange(range: string): boolean {
  return (
    range === 'season' ||
    range === 'all' ||
    /^\d+[hdwm]$/.test(range) ||
    /^custom:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(range)
  );
}

const router = Router()
router.use('/api/chemistry', express.json())
router.use('/api/swims', express.json())
router.use('/api/events', express.json())

router.get('/og-image.png', async (_req, res) => {
  try {
    const buffer = await generateOgImage()
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.send(buffer)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/sensors', async (_req, res) => {
  try {
    const sensors = await querySensors()
    res.json(sensors)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/stats', async (req, res) => {
  try {
    const sensor = typeof req.query.sensor === 'string' ? req.query.sensor : undefined
    if (sensor && !isValidSensorId(sensor)) {
      res.status(400).json({ error: 'Invalid sensor ID' })
      return
    }
    const range = typeof req.query.range === 'string' ? req.query.range : '24h'
    if (!isValidRange(range)) {
      res.status(400).json({ error: 'Invalid range' })
      return
    }
    const stats = await queryStats(sensor, range)
    res.json(stats)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/history', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : '12h'
    if (!isValidRange(range)) {
      res.status(400).json({ error: 'Invalid range' })
      return
    }
    const sensor = typeof req.query.sensor === 'string' ? req.query.sensor : undefined
    if (sensor && !isValidSensorId(sensor)) {
      res.status(400).json({ error: 'Invalid sensor ID' })
      return
    }
    const history = await queryHistory(range, sensor)
    res.json(history)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/battery', async (req, res) => {
  try {
    const sensor = typeof req.query.sensor === 'string' ? req.query.sensor : undefined
    if (sensor && !isValidSensorId(sensor)) {
      res.status(400).json({ error: 'Invalid sensor ID' })
      return
    }
    const battery = await queryBatteries(sensor)
    res.json(battery)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/battery-history', async (req, res) => {
  try {
    const sensorId = typeof req.query.sensor === 'string' ? req.query.sensor : ''
    if (!sensorId) {
      res.status(400).json({ error: 'sensor query parameter is required' })
      return
    }
    if (!isValidSensorId(sensorId)) {
      res.status(400).json({ error: 'Invalid sensor ID' })
      return
    }
    const history = await queryBatteryHistory(sensorId)
    res.json(history)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/season-history', async (req, res) => {
  try {
    const sensor = typeof req.query.sensor === 'string' ? req.query.sensor : undefined
    if (sensor && !isValidSensorId(sensor)) {
      res.status(400).json({ error: 'Invalid sensor ID' })
      return
    }
    const history = await querySeasonHistory(sensor)
    res.json(history)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/stat-detail', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : '3d'
    if (!isValidRange(range)) {
      res.status(400).json({ error: 'Invalid range' })
      return
    }
    const stat = typeof req.query.stat === 'string' ? req.query.stat : ''
    if (stat !== 'average' && stat !== 'peak') {
      res.status(400).json({ error: 'stat must be "average" or "peak"' })
      return
    }
    const sensor = typeof req.query.sensor === 'string' ? req.query.sensor : undefined
    if (sensor && !isValidSensorId(sensor)) {
      res.status(400).json({ error: 'Invalid sensor ID' })
      return
    }
    const detail = await queryStatDetail(range, stat, sensor)
    res.json(detail)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/weather/current', async (_req, res) => {
  try {
    const data = await queryWeatherCurrent()
    res.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/weather/history', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : '24h'
    if (!isValidRange(range)) {
      res.status(400).json({ error: 'Invalid range' })
      return
    }
    const history = await queryWeatherHistory(range)
    res.json(history)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/chemistry', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : 'season'
    if (req.query.range !== undefined && !isValidRange(range)) {
      res.status(400).json({ error: 'Invalid range' })
      return
    }
    const readings = await queryChemistry(range)
    res.json(readings)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// Lightweight credential probe for the unlock sheet — writes nothing.
// Rate-limited (before auth) to blunt brute-force password guessing.
router.get('/api/chemistry/auth-check', chemistryAuthLimiter, requireAuth, (_req, res) => {
  res.json({ ok: true })
})

router.post('/api/chemistry', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const result = validateChemistryBody(req.body)
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    const id = await writeChemistry({ date: result.date, time: result.time, values: result.values })
    res.status(201).json({ id })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// Edit = delete the old point then write the new one. This supports changing the
// timestamp and clearing fields (InfluxDB fields otherwise linger on a point).
// LIMITATION: not transactional — if the process dies between the delete and the
// write, that reading is lost. Acceptable for this single-user app; the delete-
// then-write order is deliberate (write-first could leave a duplicate, and a
// same-instant edit would self-delete).
router.put('/api/chemistry', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const id = (req.body as { id?: unknown })?.id
    if (!isValidId(id)) { res.status(400).json({ error: 'Invalid or missing id' }); return }
    const result = validateChemistryBody(req.body)
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    await deletePoint(id as string, 'chemistry')
    const newId = await writeChemistry({ date: result.date, time: result.time, values: result.values })
    res.status(200).json({ id: newId })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.delete('/api/chemistry', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!isValidId(id)) { res.status(400).json({ error: 'Invalid or missing id' }); return }
    await deletePoint(id, 'chemistry')
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

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

router.get('/api/events', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : 'season'
    if (req.query.range !== undefined && !isValidRange(range)) { res.status(400).json({ error: 'Invalid range' }); return }
    res.json(await queryEvents(range))
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})

router.post('/api/events', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const result = validateEventBody(req.body)
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    const { ok: _ok, date, time, ...rest } = result
    const id = await writeEvent({ date, time, ...rest })
    res.status(201).json({ id })
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})

router.put('/api/events', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const id = (req.body as { id?: unknown })?.id
    if (!isValidId(id)) { res.status(400).json({ error: 'Invalid or missing id' }); return }
    const result = validateEventBody(req.body)
    if (!result.ok) { res.status(400).json({ error: result.error }); return }
    await deletePoint(id as string, 'event')
    const { ok: _ok, date, time, ...rest } = result
    const newId = await writeEvent({ date, time, ...rest })
    res.status(200).json({ id: newId })
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})

router.delete('/api/events', chemistryAuthLimiter, requireAuth, async (req, res) => {
  try {
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!isValidId(id)) { res.status(400).json({ error: 'Invalid or missing id' }); return }
    await deletePoint(id, 'event')
    res.status(200).json({ ok: true })
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})

// Season summary: a year's worth of hourly data is the heaviest query in the
// app, so results are cached briefly per year.
const SUMMARY_TTL_MS = 10 * 60 * 1000
const summaryCache = new Map<number, { at: number; data: SeasonSummary }>()

export function isValidYear(raw: string): boolean {
  if (!/^\d{4}$/.test(raw)) return false
  const y = parseInt(raw, 10)
  return y >= 2000 && y <= new Date().getFullYear()
}

router.get('/api/season-summary', async (req, res) => {
  try {
    const raw = typeof req.query.year === 'string' ? req.query.year : String(new Date().getFullYear())
    if (!isValidYear(raw)) { res.status(400).json({ error: 'Invalid year' }); return }
    const year = parseInt(raw, 10)
    const hit = summaryCache.get(year)
    if (hit && Date.now() - hit.at < SUMMARY_TTL_MS) { res.json(hit.data); return }
    const data = buildSeasonSummary(await querySeasonSummaryData(year))
    summaryCache.set(year, { at: Date.now(), data })
    res.json(data)
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})

router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

export default router
