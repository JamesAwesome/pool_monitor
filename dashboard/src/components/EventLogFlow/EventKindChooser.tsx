import { BottomSheet } from '../BottomSheet';
import { EVENT_KINDS, EVENT_KIND_ORDER } from '../../constants/events';
import type { EventKind } from '../../types';
import styles from './EventLogFlow.module.css';

interface EventKindChooserProps { open: boolean; onPick: (k: EventKind) => void; onClose: () => void }

export function EventKindChooser({ open, onPick, onClose }: EventKindChooserProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Log a maintenance event">
      <div className={styles.kindGrid}>
        {EVENT_KIND_ORDER.map((kk) => {
          const k = EVENT_KINDS[kk];
          return (
            <button key={kk} type="button" className={styles.kindCard} style={{ borderColor: k.color }} onClick={() => onPick(kk)}>
              <span className={styles.kindIco} style={{ background: k.tint }}>{k.icon}</span>
              <span className={styles.kindLabel}>{k.noun}</span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
