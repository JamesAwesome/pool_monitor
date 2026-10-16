import type { SeasonSummary, TemperatureUnit } from '../types';
import { formatTemperature } from './temperature';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Absolute temp, e.g. "84.2°F". */
export function fmtTemp(c: number, unit: TemperatureUnit): string {
  return `${formatTemperature(c, unit)}°${unit}`;
}

/** Zone threshold label: exact °F (80°F) rather than a round-tripped 80.1°F. */
export function thresholdLabel(f: 70 | 80, unit: TemperatureUnit): string {
  return unit === 'F' ? `${f}°F` : `${f === 80 ? '26.7' : '21.1'}°C`;
}

/** Temperature DIFFERENCE (no +32 offset), e.g. "3.4°F". */
export function fmtDelta(c: number, unit: TemperatureUnit): string {
  const v = unit === 'F' ? (c * 9) / 5 : c;
  return `${v.toFixed(1)}°${unit}`;
}

/** "Jun 7" from YYYY-MM-DD (date-only, so no timezone drift). */
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Jun" … from 'YYYY-MM'. */
export function monthName(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
}

/** 0-23 → "5 PM". */
export function hourLabel(h: number): string {
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

export function weekdayName(d: number): string {
  return WEEKDAYS[d] ?? '';
}

/** Arcade-style zero-padded score: 42 → "000042". */
export function score(n: number, width = 6): string {
  return String(Math.max(0, Math.round(n))).padStart(width, '0');
}

/** Trim trailing zeros: 2.50 → "2.5", 3.00 → "3". */
export function num(n: number, decimals = 1): string {
  return String(Number(n.toFixed(decimals)));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface FunFact { icon: string; text: string }

/** Human-readable fun facts, omitting any whose data is missing. */
export function funFacts(s: SeasonSummary, unit: TemperatureUnit): FunFact[] {
  const facts: FunFact[] = [];
  const { pool, air, sky, chemistry: chem, events: ev, swims } = s;

  if (ev.chemical.additions > 0) {
    const every = ev.chemical.avgDaysBetween;
    facts.push({
      icon: '🧪',
      text: `You added chemicals ${plural(ev.chemical.additions, 'time')}${every !== null ? ` — about once every ${num(every)} days` : ''}.`,
    });
    const top = ev.chemical.products[0];
    if (top) {
      facts.push({ icon: '🥇', text: `Go-to product: ${top.product} — ${plural(top.count, 'dose')}, ${num(top.total, 2)} ${top.unit} total.` });
    }
    if (ev.chemical.busiestMonth) {
      facts.push({ icon: '📅', text: `Busiest chem month: ${monthName(ev.chemical.busiestMonth.month)} with ${plural(ev.chemical.busiestMonth.count, 'addition')}.` });
    }
  }
  if (pool) {
    facts.push({ icon: '🎢', text: `The pool swung an average of ${fmtDelta(pool.avgDailySwing, unit)} every day — ${fmtDelta(pool.biggestSwing.value, unit)} on ${shortDate(pool.biggestSwing.date)}.` });
    facts.push({ icon: '⏰', text: `Typical day: warmest around ${hourLabel(pool.warmestHour)}, coolest around ${hourLabel(pool.coolestHour)}.` });
    if (pool.longestWarmStreak && pool.longestWarmStreak.days > 1) {
      facts.push({ icon: '🔥', text: `Longest heat streak: ${pool.longestWarmStreak.days} straight days averaging ${thresholdLabel(80, unit)}+ (from ${shortDate(pool.longestWarmStreak.start)}).` });
    }
    if (pool.biggestCoolDown) {
      facts.push({ icon: '🧊', text: `Biggest one-day cool-down: daily average fell ${fmtDelta(pool.biggestCoolDown.value, unit)} on ${shortDate(pool.biggestCoolDown.date)}.` });
    }
  }
  if (air?.poolMinusAir != null) {
    const warmer = air.poolMinusAir >= 0;
    facts.push({ icon: '🌡️', text: `The pool ran ${fmtDelta(Math.abs(air.poolMinusAir), unit)} ${warmer ? 'warmer' : 'cooler'} than the air on average.` });
  }
  if (swims.leaderboard[0]) {
    const champ = swims.leaderboard[0];
    facts.push({ icon: '🏆', text: `${champ.emoji} was the swim champ with ${plural(champ.count, 'dip')}.` });
  }
  if (swims.coldestSwim) {
    facts.push({ icon: '🥶', text: `Bravest dip: ${swims.coldestSwim.people.join('')} at ${fmtTemp(swims.coldestSwim.value, unit)} on ${shortDate(swims.coldestSwim.date)}.` });
  }
  if (swims.favoriteWeekday !== null) {
    facts.push({ icon: '🗓️', text: `Favorite swim day: ${weekdayName(swims.favoriteWeekday)}${swims.favoriteHour !== null ? `, usually around ${hourLabel(swims.favoriteHour)}` : ''}.` });
  }
  if (swims.biggestGroup && swims.biggestGroup.size > 1) {
    facts.push({ icon: '🎉', text: `Biggest pool party: ${swims.biggestGroup.size} swimmers on ${shortDate(swims.biggestGroup.date)} ${swims.biggestGroup.people.join('')}.` });
  }
  if (chem.tests > 0 && chem.avgDaysBetween !== null) {
    facts.push({ icon: '🔬', text: `You tested the water ${plural(chem.tests, 'time')} — every ${num(chem.avgDaysBetween)} days on average.` });
  }
  if (chem.longestGap && chem.longestGap.days > 1) {
    facts.push({ icon: '😴', text: `Longest stretch without a test: ${chem.longestGap.days} days (${shortDate(chem.longestGap.from)} → ${shortDate(chem.longestGap.to)}).` });
  }
  if (ev.backwash.count > 0) {
    facts.push({ icon: '🔄', text: `Filter backwashed ${plural(ev.backwash.count, 'time')}${ev.backwash.avgDaysBetween !== null ? `, every ${num(ev.backwash.avgDaysBetween)} days` : ''}.` });
  }
  if (ev.water.count > 0) {
    const totals = ev.water.totals.map((t) => `${num(t.total)} ${t.unit}`).join(' + ');
    facts.push({ icon: '💧', text: `Topped off ${plural(ev.water.count, 'time')}${totals ? ` (${totals})` : ''}.` });
  }
  if (sky) {
    facts.push({ icon: '☀️', text: `Sky report: ${sky.sunnyDays} sunny ${sky.sunnyDays === 1 ? 'day' : 'days'}, rain on ${sky.rainyDays}. Most common: ${sky.topCondition.label} (${sky.topCondition.pct}%).` });
  }
  return facts;
}
