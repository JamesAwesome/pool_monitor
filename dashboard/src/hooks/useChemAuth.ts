import { useState, useCallback } from 'react';

const AUTH_KEY = 'pool-dashboard-chem-auth';

export interface UseChemAuthReturn {
  unlocked: boolean;
  authHeader: string | null;
  unlock: (user: string, pass: string) => void;
  lock: () => void;
}

export function useChemAuth(): UseChemAuthReturn {
  const [credential, setCredential] = useState<string | null>(() => localStorage.getItem(AUTH_KEY));

  const unlock = useCallback((user: string, pass: string) => {
    const encoded = btoa(`${user}:${pass}`);
    localStorage.setItem(AUTH_KEY, encoded);
    setCredential(encoded);
  }, []);

  const lock = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setCredential(null);
  }, []);

  return {
    unlocked: credential !== null,
    authHeader: credential ? `Basic ${credential}` : null,
    unlock,
    lock,
  };
}
