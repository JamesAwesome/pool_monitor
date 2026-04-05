import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { queryStats } from './influx.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Try multiple font paths (dev vs compiled vs Docker)
const fontDirs = [
  path.join(__dirname, 'fonts'),
  path.join(__dirname, '..', 'server', 'fonts'),
  path.join(process.cwd(), 'server', 'fonts'),
  path.join(process.cwd(), 'dist', 'server', 'fonts'),
]

let fontsLoaded = false
for (const dir of fontDirs) {
  const bold = path.join(dir, 'Inter-Bold.ttf')
  const regular = path.join(dir, 'Inter-Regular.ttf')
  if (fs.existsSync(bold) && fs.existsSync(regular)) {
    GlobalFonts.registerFromPath(bold, 'Inter')
    GlobalFonts.registerFromPath(regular, 'Inter')
    fontsLoaded = true
    console.log(`Fonts loaded from ${dir}`)
    break
  }
}

if (!fontsLoaded) {
  console.warn('Warning: Inter fonts not found, OG image text may not render')
}

// Cache: regenerate at most every 5 minutes
let cachedBuffer: Buffer | null = null
let cachedAt = 0
const CACHE_TTL = 5 * 60 * 1000

function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 * 10 + 320) / 10
}

export async function generateOgImage(): Promise<Buffer> {
  const now = Date.now()
  if (cachedBuffer && now - cachedAt < CACHE_TTL) {
    return cachedBuffer
  }

  const WIDTH = 1200
  const HEIGHT = 630

  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  grad.addColorStop(0, '#0f1729')
  grad.addColorStop(1, '#1a2744')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // Subtle border glow
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)'
  ctx.lineWidth = 2
  ctx.strokeRect(40, 40, WIDTH - 80, HEIGHT - 80)

  // Fetch current temp
  let tempText = '--'
  try {
    const stats = await queryStats(undefined, '24h')
    if (stats.current !== null) {
      const f = celsiusToFahrenheit(stats.current)
      tempText = `${f.toFixed(1)}°F`
    }
  } catch {
    // Keep defaults
  }

  const fontFamily = fontsLoaded ? 'Inter' : 'sans-serif'

  // Title
  ctx.fillStyle = '#94a3b8'
  ctx.font = `32px "${fontFamily}"`
  ctx.textAlign = 'center'
  ctx.fillText('Pool Dashboard', WIDTH / 2, 160)

  // Temperature (big)
  ctx.fillStyle = '#38bdf8'
  ctx.font = `bold 120px "${fontFamily}"`
  ctx.textAlign = 'center'
  ctx.fillText(tempText, WIDTH / 2, 340)

  // Subtitle
  ctx.fillStyle = '#94a3b8'
  ctx.font = `28px "${fontFamily}"`
  ctx.textAlign = 'center'
  ctx.fillText('Current Pool Temperature', WIDTH / 2, 410)

  // Date/time
  const tz = process.env.TIMEZONE || 'America/New_York'
  const dateStr = new Date().toLocaleString('en-US', {
    timeZone: tz,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  ctx.fillStyle = '#64748b'
  ctx.font = `24px "${fontFamily}"`
  ctx.fillText(dateStr, WIDTH / 2, 470)

  const buffer = Buffer.from(canvas.toBuffer('image/png'))
  cachedBuffer = buffer
  cachedAt = now

  return buffer
}
