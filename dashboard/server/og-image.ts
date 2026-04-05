import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { queryStats } from './influx.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Register Inter fonts
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'Inter-Bold.ttf'), 'Inter-Bold')
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'Inter-Regular.ttf'), 'Inter')

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

  // Title
  ctx.fillStyle = '#94a3b8'
  ctx.font = '32px Inter'
  ctx.textAlign = 'center'
  ctx.fillText('🌊 Pool Dashboard', WIDTH / 2, 160)

  // Temperature (big)
  ctx.fillStyle = '#38bdf8'
  ctx.font = '120px Inter-Bold'
  ctx.textAlign = 'center'
  ctx.fillText(tempText, WIDTH / 2, 340)

  // Subtitle
  ctx.fillStyle = '#94a3b8'
  ctx.font = '28px Inter'
  ctx.textAlign = 'center'
  ctx.fillText('Current Pool Temperature', WIDTH / 2, 410)

  // Date/time
  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  ctx.fillStyle = '#64748b'
  ctx.font = '24px Inter'
  ctx.fillText(dateStr, WIDTH / 2, 470)

  const buffer = Buffer.from(canvas.toBuffer('image/png'))
  cachedBuffer = buffer
  cachedAt = now

  return buffer
}

