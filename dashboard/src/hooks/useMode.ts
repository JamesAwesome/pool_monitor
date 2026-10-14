import { useState, useEffect } from 'react';

export interface AppMode {
  offSeason: boolean;
  latestYear: number | null; // newest year with pool data
}

/** One-shot fetch of /api/mode; null until it arrives (or if it fails). */
export function useMode(): AppMode | null {
  const [mode, setMode] = useState<AppMode | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/mode')
      .then(async (res) => (res.ok ? ((await res.json()) as AppMode) : null))
      .then((m) => { if (!cancelled && m) setMode(m); })
      .catch(() => { /* fail-silent: behave as in-season */ });
    return () => { cancelled = true; };
  }, []);
  return mode;
}
