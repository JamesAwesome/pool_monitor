import { useState, useEffect } from 'react';

export interface AppMode {
  offSeason: boolean;
  latestYear: number | null; // newest year with pool data (looked up off-season only)
}

const IN_SEASON: AppMode = { offSeason: false, latestYear: null };

/**
 * One-shot fetch of /api/mode. `mode` is null until the request settles; a
 * failed request settles as in-season so the app never waits forever.
 */
export function useMode(): AppMode | null {
  const [mode, setMode] = useState<AppMode | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/mode')
      .then(async (res) => (res.ok ? ((await res.json()) as AppMode) : IN_SEASON))
      .catch(() => IN_SEASON)
      .then((m) => { if (!cancelled) setMode({ offSeason: m.offSeason === true, latestYear: m.latestYear ?? null }); });
    return () => { cancelled = true; };
  }, []);
  return mode;
}
