import type React from 'react';

export type ConditionKind = 'sun' | 'partly' | 'cloud' | 'rain';

const GLYPHS: Record<ConditionKind, React.ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  partly: (
    <>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1.5v1.6M2.6 8H1M3.6 3.6l-.9-.9M12.4 3.6l.9-.9M2.6 8 1.6 9" />
      <path d="M17.5 19H7.5a3.5 3.5 0 0 1-.3-7 5 5 0 0 1 9.6 1.2A3 3 0 0 1 17.5 19Z" />
    </>
  ),
  cloud: (
    <path d="M17.5 18.5H7a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6 1.3 3.4 3.4 0 0 1 .2 6.7Z" />
  ),
  rain: (
    <>
      <path d="M17 15.5H7.5a3.7 3.7 0 0 1-.3-7.4 5.2 5.2 0 0 1 10 1.2 3.1 3.1 0 0 1-.2 6.2Z" />
      <path d="M8 18.5l-1 2.5M12 18.5l-1 2.5M16 18.5l-1 2.5" />
    </>
  ),
};

const COLOR: Record<ConditionKind, string> = {
  sun: 'var(--color-warning)',
  partly: 'var(--color-warning)',
  cloud: 'var(--color-text-secondary)',
  rain: 'var(--color-primary)',
};

/** Render a condition glyph at the given size. color comes from CSS var via currentColor. */
export function ConditionGlyph({ kind, size = 18 }: { kind: ConditionKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[kind]}
    </svg>
  );
}

/**
 * Map a WeatherAPI condition_code to a glyph kind + accent color.
 * isDay is reserved for a future night variant; the four buckets are the minimum.
 */
export function conditionToIcon(
  code: number,
  _isDay: boolean,
): { kind: ConditionKind; colorVar: string } | null {
  let kind: ConditionKind | null = null;
  if (code === 1000) kind = 'sun';
  else if (code === 1003) kind = 'partly';
  else if (code === 1006 || code === 1009 || code === 1135 || code === 1147) kind = 'cloud';
  else if ((code >= 1063 && code <= 1201) || (code >= 1240 && code <= 1282)) kind = 'rain';
  if (!kind) return null;
  return { kind, colorVar: COLOR[kind] };
}
