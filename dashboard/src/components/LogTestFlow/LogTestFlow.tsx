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

  if (!open) return null;

  if (!unlocked || !authHeader) {
    return (
      <UnlockSheet
        open
        onClose={onClose}
        onUnlocked={(header) => {
          // header is `Basic base64(user:pass)`; decode to persist via useChemAuth
          const [user, pass] = atob(header.slice(6)).split(/:(.*)/s);
          unlock(user, pass);
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
      onAuthExpired={() => { lock(); }}
    />
  );
}
