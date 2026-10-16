export interface PoolStats {
  current: number | null;
  currentTime: string | null; // ISO UTC of the latest reading; null when none
  average: number | null;
  peak: number | null;
  seasonAvg: number | null;
  seasonPeak: number | null;
}

export interface TimeSeriesPoint {
  time: string;
  value: number;
}

export interface WeatherHistoryPoint extends TimeSeriesPoint {
  // value = air temp °C (unchanged)
  conditionCode?: number;
  condition?: string;
}

export interface BatteryData {
  current: number;
  history: TimeSeriesPoint[];
}

export interface SensorBattery {
  id: string;
  model: string;
  current: number | null;
}

export interface SensorInfo {
  id: string;
  model: string;
}

export interface StatDetailPeriod {
  start: string;
  stop: string;
  average?: number | null;
  high?: number | null;
  low?: number | null;
}

export interface SeasonYear {
  year: number;
  average: number | null;
  peak: number | null;
  low: number | null;
}

export type TemperatureUnit = 'C' | 'F';
export type Theme = 'light' | 'dark';
export type TemperatureZone = 'hot' | 'warm' | 'normal' | 'cool';

export interface WeatherCurrent {
  temperature_C: number;
  feelslike_C: number;
  humidity: number;
  condition: string;
  location: string;
  timestamp: string;
}

export type ChemKey = 'ph' | 'fc' | 'cc' | 'ta' | 'cya' | 'ch';

export interface ChemistryReading {
  id: string;   // ISO UTC timestamp (stable id)
  date: string; // YYYY-MM-DD in app timezone
  time: string; // HH:mm 24h in app timezone
  ph?: number; fc?: number; cc?: number; ta?: number; cya?: number; ch?: number;
}

export interface SwimSession {
  id: string;        // ISO-UTC instant of the point (stable id)
  date: string;      // YYYY-MM-DD in app timezone
  time: string;      // HH:mm 24h in app timezone
  people: string[];  // emoji, 1..N (e.g. ['🦦','🐢'])
}

export type EventKind = 'chemical' | 'water' | 'backwash' | 'note';

export interface ChemItem { product: string; amount: number; unit: string }

export interface PoolEvent {
  id: string;        // ISO-UTC instant of the point (stable id)
  date: string;      // YYYY-MM-DD in app timezone
  time: string;      // HH:mm 24h in app timezone
  kind: EventKind;
  items?: ChemItem[]; // chemical
  product?: string;  // legacy chemical (read-only fallback)
  amount?: number;   // water
  unit?: string;     // water: in|gal|min
  note?: string;     // note
}

// ── Season summary (/api/season-summary) — all temps/deltas °C ──
export interface DatedValue { date: string; value: number }

export interface SeasonSummary {
  year: number;
  pool: {
    days: number; firstDate: string; lastDate: string;
    avg: number; high: DatedValue | null; low: DatedValue | null;
    hottestDay: DatedValue; coldestDay: DatedValue;
    avgDailySwing: number; biggestSwing: DatedValue;
    warmDays: number; swimmableDays: number;
    longestWarmStreak: { days: number; start: string; end: string } | null;
    biggestWarmUp: DatedValue | null; biggestCoolDown: DatedValue | null;
    warmestHour: number; coolestHour: number;
  } | null;
  air: { avg: number; high: DatedValue; low: DatedValue; poolMinusAir: number | null } | null;
  sky: { topCondition: { label: string; pct: number }; rainyDays: number; sunnyDays: number; daysObserved: number } | null;
  chemistry: {
    tests: number; testDays: number; avgDaysBetween: number | null;
    longestGap: { days: number; from: string; to: string } | null;
    params: { key: ChemKey; count: number; avg: number; min: number; max: number }[];
  };
  events: {
    total: number;
    chemical: {
      additions: number; doses: number; days: number; avgDaysBetween: number | null;
      products: { product: string; unit: string; total: number; count: number }[];
      busiestMonth: { month: string; count: number } | null;
    };
    water: { count: number; totals: { unit: string; total: number }[] };
    backwash: { count: number; avgDaysBetween: number | null };
    notes: number;
  };
  swims: {
    sessions: number; dips: number; swimmers: number;
    leaderboard: { emoji: string; count: number }[];
    biggestGroup: { size: number; date: string; people: string[] } | null;
    busiestDay: { date: string; dips: number } | null;
    favoriteHour: number | null; favoriteWeekday: number | null;
    first: string | null; last: string | null;
    longestStreak: { days: number; start: string } | null;
    coldestSwim: { date: string; time: string; people: string[]; value: number } | null;
    warmestSwim: { date: string; time: string; people: string[]; value: number } | null;
  };
}
