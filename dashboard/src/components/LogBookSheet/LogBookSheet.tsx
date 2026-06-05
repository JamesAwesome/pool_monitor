import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { sortedEvents, summary, whenLabel, countByKind } from '../../utils/events';
import { EVENT_KINDS, EVENT_KIND_ORDER } from '../../constants/events';
import type { EventKind, PoolEvent } from '../../types';
import styles from './LogBookSheet.module.css';

interface LogBookSheetProps {
  open: boolean;
  events: PoolEvent[];
  onClose: () => void;
  onEdit: (e: PoolEvent) => void;
  onNew: () => void;
}

export function LogBookSheet({ open, events, onClose, onEdit, onNew }: LogBookSheetProps) {
  const [filter, setFilter] = useState<'all' | EventKind>('all');
  const counts = countByKind(events);
  const rows = sortedEvents(events).filter((e) => filter === 'all' || e.kind === filter);

  return (
    <BottomSheet open={open} onClose={onClose} title={`${events.length} ${events.length === 1 ? 'entry' : 'entries'} · Log book`}>
      <div className={styles.filterRow}>
        <button type="button" className={`${styles.filterChip} ${filter === 'all' ? styles.on : ''}`} onClick={() => setFilter('all')}>
          All<span className={styles.fcN}>{events.length}</span>
        </button>
        {EVENT_KIND_ORDER.map((kk) => {
          const k = EVENT_KINDS[kk];
          return (
            <button key={kk} type="button" className={`${styles.filterChip} ${filter === kk ? styles.on : ''}`}
              style={filter === kk ? { borderColor: k.color, color: k.color, background: k.tint } : undefined}
              onClick={() => setFilter(kk)}>
              <span aria-hidden="true">{k.icon}</span> {k.label}<span className={styles.fcN}>{counts[kk]}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.list}>
        {rows.length === 0 && <p className={styles.hint}>No entries of this kind yet.</p>}
        {rows.map((ev) => {
          const k = EVENT_KINDS[ev.kind];
          return (
            <button key={ev.id} type="button" className={styles.row} aria-label={`Edit entry from ${whenLabel(ev)}`} onClick={() => onEdit(ev)}>
              <span className={styles.rowIco} style={{ background: k.tint, borderColor: k.color }}>{k.icon}</span>
              <span className={styles.rowMain}>
                <span className={styles.rowSummary}>{summary(ev)}</span>
                <span className={styles.rowWhen}>{whenLabel(ev)}</span>
              </span>
              <span className={styles.chevron} aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} onClick={onNew}>＋ Log an event</button>
      </div>
    </BottomSheet>
  );
}
