import { UnlockSheet } from '../LogTestFlow/UnlockSheet';
import { SwimLogForm } from './SwimLogForm';
import { useChemAuth } from '../../hooks/useChemAuth';
import type { SwimSession } from '../../types';

interface SwimLogFlowProps {
  open: boolean;
  swims: SwimSession[];
  editEntry?: SwimSession | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function SwimLogFlow({ open, swims, editEntry, onClose, onSaved, onDeleted }: SwimLogFlowProps) {
  const { unlocked, authHeader, unlock, lock } = useChemAuth();
  if (!open) return null;

  if (!unlocked || !authHeader) {
    return (
      <UnlockSheet
        open
        unlockTitle="Unlock to log a swim"
        onClose={onClose}
        onUnlocked={(header) => {
          const [user, pass] = atob(header.slice(6)).split(/:(.*)/s);
          unlock(user, pass);
        }}
      />
    );
  }

  return (
    <SwimLogForm
      key={editEntry?.id ?? 'new'}
      open
      authHeader={authHeader}
      swims={swims}
      editEntry={editEntry}
      onClose={onClose}
      onSaved={onSaved}
      onDeleted={onDeleted}
      onAuthExpired={lock}
    />
  );
}
