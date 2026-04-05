import { Router } from 'express'
import { querySensors, queryStats, queryHistory, queryBatteries, queryBatteryHistory } from './influx.js'

const router = Router()

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
    const stats = await queryStats(sensor)
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
    const history = await queryBatteryHistory(sensorId)
    res.json(history)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

export default router
