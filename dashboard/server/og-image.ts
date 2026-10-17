import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import type { SKRSContext2D } from '@napi-rs/canvas'
import { queryStats, queryLatestReadingYear, querySeasonSummaryData } from './influx.js'
import { buildSeasonSummary } from './seasonSummary.js'
import type { SeasonSummary } from './seasonSummary.js'
import { celsiusToFahrenheit } from './utils.js'
import { isOffSeason } from './mode.js'

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
    // Arcade fonts for the off-season high-score card (same as the Season tab).
    GlobalFonts.registerFromPath(path.join(dir, 'PressStart2P-Regular.ttf'), 'Press Start 2P')
    GlobalFonts.registerFromPath(path.join(dir, 'VT323-Regular.ttf'), 'VT323')
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

const WIDTH = 1200
const HEIGHT = 630

export async function generateOgImage(): Promise<Buffer> {
  const now = Date.now()
  if (cachedBuffer && now - cachedAt < CACHE_TTL) {
    return cachedBuffer
  }

  const buffer = isOffSeason() ? renderSeasonOgImage(await getSeasonOgData()) : await renderTempOgImage()
  cachedBuffer = buffer
  cachedAt = now
  return buffer
}

async function renderTempOgImage(): Promise<Buffer> {
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

  return Buffer.from(canvas.toBuffer('image/png'))
}

// ── Off-season: arcade high-score card (mirrors the Season tab) ──

export interface SeasonOgData { year: number; summary: SeasonSummary | null }

// The season is over, so its numbers barely change; shared with index.ts's OG tags.
let seasonCache: { at: number; data: SeasonOgData } | null = null
const SEASON_TTL = 60 * 60 * 1000

/** The season that just ended (newest year with pool data) and its summary; never throws. */
export async function getSeasonOgData(): Promise<SeasonOgData> {
  if (seasonCache && Date.now() - seasonCache.at < SEASON_TTL) return seasonCache.data
  let year = new Date().getFullYear()
  try {
    year = (await queryLatestReadingYear()) ?? year
    const summary = buildSeasonSummary(await querySeasonSummaryData(year))
    seasonCache = { at: Date.now(), data: { year, summary } }
    return seasonCache.data
  } catch {
    // Don't cache failures; render the card without stats.
    return { year, summary: null }
  }
}

const ARC = {
  bg: '#07021a',
  cyan: '#22d3ee',
  magenta: '#f472f6',
  yellow: '#fde047',
  green: '#4ade80',
  red: '#f87171',
  orange: '#fb923c',
  text: '#e0e7ff',
  dim: '#8b8fc7',
}
const RANK_COLORS = [ARC.yellow, ARC.cyan, ARC.magenta, ARC.green, ARC.orange]
const RANKS = ['1ST', '2ND', '3RD', '4TH', '5TH']
const PIXEL = '"Press Start 2P", monospace'
const TERMINAL = '"VT323", monospace'
const EMOJI = '"Noto Color Emoji", "Apple Color Emoji", sans-serif'

const score = (n: number, width = 6) => String(Math.max(0, Math.round(n))).padStart(width, '0')

function glowText(ctx: SKRSContext2D, text: string, x: number, y: number, color: string, blur: number) {
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = blur
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

export function renderSeasonOgImage({ year, summary }: SeasonOgData): Buffer {
  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')

  // Cabinet bezel
  const bezel = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
  bezel.addColorStop(0, '#3b0764')
  bezel.addColorStop(0.45, '#1e1b4b')
  bezel.addColorStop(1, '#0c4a6e')
  ctx.fillStyle = bezel
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // CRT screen
  const inset = 18
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(inset, inset, WIDTH - inset * 2, HEIGHT - inset * 2, 22)
  ctx.clip()
  ctx.fillStyle = ARC.bg
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const glow = ctx.createRadialGradient(WIDTH / 2, 0, 0, WIDTH / 2, 0, 520)
  glow.addColorStop(0, 'rgba(124, 58, 237, 0.32)')
  glow.addColorStop(1, 'rgba(124, 58, 237, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Marquee
  ctx.font = `20px ${PIXEL}`
  glowText(ctx, 'GAME OVER', WIDTH / 2, 82, ARC.red, 10)
  ctx.font = `48px ${PIXEL}`
  ctx.fillStyle = ARC.magenta
  ctx.fillText(`SEASON ${year}`, WIDTH / 2 + 4, 154)
  glowText(ctx, `SEASON ${year}`, WIDTH / 2, 150, ARC.yellow, 18)
  ctx.font = `16px ${PIXEL}`
  ctx.fillStyle = ARC.cyan
  ctx.fillText('THANKS FOR PLAYING · FINAL STATS', WIDTH / 2, 196)

  // High scores (left)
  const hsX = 400
  ctx.font = `24px ${PIXEL}`
  glowText(ctx, '★ HIGH SCORES ★', hsX, 262, ARC.magenta, 12)
  const board = summary?.swims.leaderboard.slice(0, RANKS.length) ?? []
  const cols = [hsX - 190, hsX, hsX + 190]
  if (board.length === 0) {
    ctx.font = `18px ${PIXEL}`
    ctx.fillStyle = ARC.dim
    ctx.fillText(summary ? 'NO SWIMMERS LOGGED' : 'PRESS START', hsX, 400)
  } else {
    ctx.font = `14px ${PIXEL}`
    ctx.fillStyle = ARC.dim
    ;['RANK', 'SWIMMER', 'DIPS'].forEach((h, i) => ctx.fillText(h, cols[i], 304))
    board.forEach((p, i) => {
      const y = 344 + i * 47
      ctx.font = `24px ${PIXEL}`
      const color = RANK_COLORS[i]
      glowText(ctx, RANKS[i], cols[0], y, color, i === 0 ? 10 : 0)
      glowText(ctx, score(p.count, 5), cols[2], y, color, i === 0 ? 10 : 0)
      ctx.font = `38px ${EMOJI}`
      ctx.fillText(p.emoji, cols[1], y + 4)
    })
  }

  // Score bar (right)
  const hiTemp = summary?.pool?.high ? `${celsiusToFahrenheit(summary.pool.high.value).toFixed(1)}°F` : '---'
  const stats: [string, string][] = [
    ['DIPS', summary ? score(summary.swims.dips) : '---'],
    ['HI-TEMP', hiTemp],
    ['DOSES', summary ? score(summary.events.chemical.doses) : '---'],
  ]
  const barX = 925
  stats.forEach(([label, value], i) => {
    const y = 270 + i * 100
    ctx.font = `16px ${PIXEL}`
    ctx.fillStyle = ARC.red
    ctx.fillText(label, barX, y)
    // °F isn't in Press Start 2P's glyph set; VT323 has it and suits the CRT.
    const isTemp = label === 'HI-TEMP'
    ctx.font = isTemp ? `56px ${TERMINAL}` : `30px ${PIXEL}`
    ctx.fillStyle = ARC.text
    ctx.fillText(value, barX, y + (isTemp ? 52 : 48))
  })

  // Footer
  ctx.font = `14px ${PIXEL}`
  ctx.fillStyle = ARC.yellow
  ctx.fillText(`INSERT COIN FOR SEASON ${year + 1}`, WIDTH / 2, HEIGHT - 40)

  // Scanlines over everything
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)'
  for (let y = 0; y < HEIGHT; y += 3) ctx.fillRect(0, y, WIDTH, 1)
  ctx.restore()

  return Buffer.from(canvas.toBuffer('image/png'))
}
