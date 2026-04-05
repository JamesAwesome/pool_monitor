import { Router } from 'express'
import { queryStats, queryHistory, queryBattery } from './influx.js'

const router = Router()

router.get('/api/stats', async (_req, res) => {
  try {
    const stats = await queryStats()
    res.json(stats)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/history', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : '12h'
    const history = await queryHistory(range)
    res.json(history)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/battery', async (_req, res) => {
  try {
    const battery = await queryBattery()
    res.json(battery)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

export default router
