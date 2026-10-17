import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import router from './routes.js'
import { queryStats } from './influx.js'
import { celsiusToFahrenheit } from './utils.js'
import { isOffSeason } from './mode.js'
import { getSeasonYear } from './og-image.js'

const app = express()
const port = parseInt(process.env.PORT ?? '8080', 10)

// The app runs behind the cloudflared tunnel (a single hop). Trust one proxy so
// req.ip reflects the forwarded client address rather than the tunnel container.
// (The chemistry rate limiter additionally prefers the CF-Connecting-IP header.)
app.set('trust proxy', 1)

app.use(router)

if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const clientDir = path.resolve(__dirname, '../client')
  const htmlTemplate = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf-8')

  app.use(express.static(clientDir, { index: false }))

  // Cache current temp for OG tags (5 min)
  let ogCache: { temp: string; at: number } = { temp: '--', at: 0 }

  async function getCurrentTemp(): Promise<string> {
    const now = Date.now()
    if (now - ogCache.at < 300000) return ogCache.temp
    try {
      const stats = await queryStats(undefined, '24h')
      if (stats.current !== null) {
        const f = celsiusToFahrenheit(stats.current)
        ogCache = { temp: `${f.toFixed(1)}°F`, at: now }
      }
    } catch {
      // keep stale
    }
    return ogCache.temp
  }

  // Off-season the preview is the Season tab's high-score card, not a stale temp.
  async function getOgDescription(): Promise<string> {
    if (!isOffSeason()) return `Current pool temperature: ${await getCurrentTemp()}`
    return `Season ${await getSeasonYear()} final stats and high scores`
  }

  app.get('{*path}', async (req, res) => {
    const description = await getOgDescription()
    const publicUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`
    const ogTags = `
    <meta property="og:title" content="Pool Dashboard" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${publicUrl}/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:type" content="website" />`

    const html = htmlTemplate.replace('</head>', `${ogTags}\n  </head>`)
    res.setHeader('Content-Type', 'text/html')
    res.send(html)
  })
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})
