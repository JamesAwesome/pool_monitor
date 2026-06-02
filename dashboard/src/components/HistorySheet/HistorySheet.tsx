import { BottomSheet } from '../BottomSheet';
import { CHEMS } from '../../constants/chemicals';
import { sortedDesc, testsOnDay, fmtTime12, fmtDateWeekday, formatChemValue } from '../../utils/chemistry';
import type { ChemistryReading } from '../../types';
import styles from './HistorySheet.module.css';

interface HistorySheetProps {
  open: boolean;
  readings: ChemistryReading[];
  onClose: () => void;
  onSelect: (r: ChemistryReading) => void;
  onNew: () => void;
}

export function HistorySheet({ open, readings, onClose, onSelect, onNew }: HistorySheetProps) {
  const rows = sortedDesc(readings);
  return (
    <BottomSheet open={open} onClose={onClose} title="Test history">
      <p className={styles.subtitle}>{readings.length} tests logged</p>
      <p className={styles.hint}>Tap any test to view or edit it.</p>
      <div className={styles.list}>
        {rows.map((r) => {
          const dayCount = testsOnDay(readings, r.date);
          return (
            <button key={r.id} type="button" className={styles.row} onClick={() => onSelect(r)}>
              <div className={styles.when}>
                <span className={styles.date}>{fmtDateWeekday(r.date)}</span>
                <span className={styles.time}>
                  {fmtTime12(r.time)}
                  {dayCount > 1 && <span className={styles.badge}>+{dayCount - 1}</span>}
                </span>
              </div>
              <div className={styles.values}>
                {CHEMS.map((c) => (
                  <div key={c.key} className={styles.cell} style={{ borderTopColor: c.color }}>
                    <span className={styles.cellLabel}>{c.short}</span>
                    <span className={styles.cellValue}>
                      {typeof r[c.key] === 'number' ? formatChemValue(r[c.key] as number, c.decimals) : '–'}
                    </span>
                  </div>
                ))}
              </div>
              <span className={styles.chevron}>›</span>
            </button>
          );
        })}
      </div>
      <button type="button" className={styles.newBtn} onClick={onNew}>＋ Log a new test</button>
    </BottomSheet>
  );
}
