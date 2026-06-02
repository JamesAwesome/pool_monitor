import { UnlockSheet } from './UnlockSheet';
import { LogForm } from './LogForm';
import { useChemAuth } from '../../hooks/useChemAuth';
import type { ChemKey, ChemistryReading } from '../../types';

interface LogTestFlowProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  latest: Partial<Record<ChemKey, number>>;
  editEntry?: ChemistryReading | null;
  readings: ChemistryReading[];
}

export function LogTestFlow({ open, onClose, onSaved, onDeleted, latest, editEntry, readings }: LogTestFlowProps) {
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
      key={editEntry?.id ?? 'new'}
      open
      onClose={onClose}
      authHeader={authHeader}
      latest={latest}
      onSaved={onSaved}
      onAuthExpired={() => { lock(); }}
      editEntry={editEntry}
      readings={readings}
      onDeleted={onDeleted}
    />
  );
}
