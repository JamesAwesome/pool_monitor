import { loadConfig } from './config.js'
import { fetchCurrent } from './weatherapi.js'
import { createWriter } from './influx.js'
import { createTicker } from './loop.js'

async function main() {
  const cfg = loadConfig()

  if (cfg.offSeason) {
    // Stay up but idle: exiting would just make Docker restart us in a loop.
    console.log('[weather] OFF_SEASON is on — not polling or writing. Set OFF_SEASON=false to resume.')
    const idle = setInterval(() => {}, 24 * 60 * 60 * 1000)
    const stop = (signal: string) => {
      console.log(`[weather] received ${signal}, shutting down`)
      clearInterval(idle)
      process.exit(0)
    }
    process.on('SIGTERM', () => stop('SIGTERM'))
    process.on('SIGINT', () => stop('SIGINT'))
    return
  }

  const writer = createWriter(cfg.influx)

  const tick = createTicker({
    fetchCurrent: () => fetchCurrent({ apiKey: cfg.weatherApiKey, location: cfg.location }),
    writer,
    log: (msg) => console.log(`[weather] ${new Date().toISOString()} ${msg}`),
    location: cfg.location,
  })

  console.log(`[weather] starting, location="${cfg.location}", interval=${cfg.intervalMs / 60000}m`)
  await tick()
  const handle = setInterval(() => {
    void tick()
  }, cfg.intervalMs)

  const shutdown = async (signal: string) => {
    console.log(`[weather] received ${signal}, shutting down`)
    clearInterval(handle)
    await writer.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error(`[weather] fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
