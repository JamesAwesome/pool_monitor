import { Router } from 'express'
import { querySensors, queryStats, queryHistory, queryBatteries, queryBatteryHistory, querySeasonHistory, queryStatDetail } from './influx.js'
import { generateOgImage } from './og-image.js'

function isValidSensorId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

const router = Router()

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

router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

export default router
