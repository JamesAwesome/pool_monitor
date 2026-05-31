import { useState, useEffect } from 'react';
import { UnlockSheet } from './UnlockSheet';
import { LogForm } from './LogForm';
import { useChemAuth } from '../../hooks/useChemAuth';
import type { ChemKey } from '../../types';

interface LogTestFlowProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  latest: Partial<Record<ChemKey, number>>;
}

export function LogTestFlow({ open, onClose, onSaved, latest }: LogTestFlowProps) {
  const { unlocked, authHeader, unlock, lock } = useChemAuth();
  const [stage, setStage] = useState<'unlock' | 'form'>(unlocked ? 'form' : 'unlock');

  // When opened, jump straight to the form if already unlocked.
  useEffect(() => {
    if (open) setStage(unlocked ? 'form' : 'unlock');
  }, [open, unlocked]);

  if (!open) return null;

  if (stage === 'unlock' || !authHeader) {
    return (
      <UnlockSheet
        open
        onClose={onClose}
        onUnlocked={(header) => {
          // header is `Basic base64(user:pass)`; decode to persist via useChemAuth
          const [user, pass] = atob(header.slice(6)).split(/:(.*)/s);
          unlock(user, pass);
          setStage('form');
        }}
      />
    );
  }

  return (
    <LogForm
      open
      onClose={onClose}
      authHeader={authHeader}
      latest={latest}
      onSaved={onSaved}
      onAuthExpired={() => { lock(); setStage('unlock'); }}
    />
  );
}
