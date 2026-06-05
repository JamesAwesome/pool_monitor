import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { Avatars } from '../SwimLane';
import { sortedSwims, totalDips, leaderboard } from '../../utils/swim';
import type { SwimSession } from '../../types';
import styles from './SwimHistorySheet.module.css';

interface SwimHistorySheetProps {
  open: boolean;
  swims: SwimSession[];
  onClose: () => void;
  onSelect: (s: SwimSession) => void;
  onNew: () => void;
}

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (t: string) => new Date(`2000-01-01T${t}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const MEDAL = ['🥇', '🥈', '🥉'];

export function SwimHistorySheet({ open, swims, onClose, onSelect, onNew }: SwimHistorySheetProps) {
  const [view, setView] = useState<'swims' | 'board'>('swims');
  const rows = sortedSwims(swims);
  const dayCounts: Record<string, number> = {};
  for (const r of rows) dayCounts[r.date] = (dayCounts[r.date] ?? 0) + 1;
  const lb = leaderboard(swims);
  const maxC = lb.length ? lb[0].count : 1;

  return (
    <BottomSheet open={open} onClose={onClose} title={`${rows.length} swims · ${totalDips(swims)} dips`}>
      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab} ${view === 'swims' ? styles.on : ''}`} onClick={() => setView('swims')}>All swims</button>
        <button type="button" className={`${styles.tab} ${view === 'board' ? styles.on : ''}`} onClick={() => setView('board')}>Leaderboard</button>
      </div>

      {view === 'swims' ? (
        <>
          <p className={styles.hint}>Tap any swim to edit who went in — or delete it.</p>
          <div className={styles.list}>
            {rows.map((r) => (
              <button key={r.id} type="button" data-testid="swim-hist-row" className={styles.row} onClick={() => onSelect(r)}>
                <div className={styles.date}>{fmtDate(r.date)}</div>
                <div className={styles.time}>
                  {fmtTime(r.time)}
                  {dayCounts[r.date] > 1 && <span className={styles.multi}>+{dayCounts[r.date] - 1}</span>}
                </div>
                <div className={styles.people}><Avatars people={r.people} size={18} /><span className={styles.peopleN}>{r.people.length}</span></div>
                <span className={styles.chevron} aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className={styles.hint}>Total dips per swimmer this season. Same emoji = same person.</p>
          <div className={styles.lbList}>
            {lb.map((r, i) => (
              <div key={r.emoji} className={styles.lbRow}>
                <span className={styles.lbRank}>{i < 3 ? MEDAL[i] : i + 1}</span>
                <span className={styles.lbEmoji}>{r.emoji}</span>
                <span className={styles.lbBarWrap}><span className={styles.lbBar} style={{ width: `${(r.count / maxC) * 100}%` }} /></span>
                <span className={styles.lbCount}>{r.count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} onClick={onNew}>＋ Log a new swim</button>
      </div>
    </BottomSheet>
  );
}
