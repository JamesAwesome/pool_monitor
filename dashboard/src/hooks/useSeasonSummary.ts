import { useState, useEffect } from 'react';
import type { SeasonSummary } from '../types';

export interface UseSeasonSummaryReturn {
  summary: SeasonSummary | null;
  loading: boolean;
  error: string | null;
}

/** One-shot fetch per year — a finished season doesn't need polling. */
export function useSeasonSummary(year: number): UseSeasonSummaryReturn {
  const [summary, setSummary] = useState<SeasonSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch(`/api/season-summary?year=${year}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as SeasonSummary;
      })
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch((err: unknown) => {
        if (!cancelled) { setSummary(null); setError(err instanceof Error ? err.message : 'Unknown error'); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  return { summary, loading, error };
}
