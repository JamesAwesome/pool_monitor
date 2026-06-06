import { UnlockSheet } from '../LogTestFlow/UnlockSheet';
import { EventLogForm } from './EventLogForm';
import { EventKindChooser } from './EventKindChooser';
import { useChemAuth } from '../../hooks/useChemAuth';
import type { EventKind, PoolEvent } from '../../types';

interface EventLogFlowProps {
  open: boolean;
  mode: 'chooser' | 'form';
  kind: EventKind;
  editEntry?: PoolEvent | null;
  onPickKind: (k: EventKind) => void;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function EventLogFlow({ open, mode, kind, editEntry, onPickKind, onClose, onSaved, onDeleted }: EventLogFlowProps) {
  const { unlocked, authHeader, unlock, lock } = useChemAuth();
  if (!open) return null;

  if (!unlocked || !authHeader) {
    return (
      <UnlockSheet
        open
        unlockTitle="Unlock to log an event"
        onClose={onClose}
        onUnlocked={(header) => {
          const [u, p] = atob(header.slice(6)).split(/:(.*)/s);
          unlock(u, p);
        }}
      />
    );
  }
  if (mode === 'chooser') {
    return <EventKindChooser open onPick={onPickKind} onClose={onClose} />;
  }
  return (
    <EventLogForm
      key={editEntry?.id ?? `new-${kind}`}
      kind={kind}
      authHeader={authHeader}
      editEntry={editEntry}
      onClose={onClose}
      onSaved={onSaved}
      onDeleted={onDeleted}
      onAuthExpired={lock}
    />
  );
}
