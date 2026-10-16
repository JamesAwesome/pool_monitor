/** true/1/yes/on (any case) → true; anything else, or unset → false. */
export function parseFlag(raw: string | undefined): boolean {
  return ['true', '1', 'yes', 'on'].includes((raw ?? '').trim().toLowerCase())
}

/** OFF_SEASON=true: Telegraf and the weather poller stop writing (see .env.example). */
export function isOffSeason(env: Record<string, string | undefined> = process.env): boolean {
  return parseFlag(env.OFF_SEASON)
}
