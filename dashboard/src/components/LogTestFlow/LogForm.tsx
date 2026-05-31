import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { CHEMS } from '../../constants/chemicals';
import type { ChemKey, ChemistryReading } from '../../types';
import styles from './LogTestFlow.module.css';

interface LogFormProps {
  open: boolean;
  onClose: () => void;
  authHeader: string;
  latest: Partial<Record<ChemKey, number>>;
  onSaved: () => void;
  onAuthExpired: () => void;
}

function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function LogForm({ open, onClose, authHeader, latest, onSaved, onAuthExpired }: LogFormProps) {
  const [date, setDate] = useState(todayLocalISODate);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAtLeastOne = CHEMS.some((c) => values[c.key]?.trim());

  const save = async () => {
    setBusy(true);
    setError(null);
    const body: ChemistryReading = { date };
    for (const c of CHEMS) {
      const raw = values[c.key]?.trim();
      if (raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) { setError(`Invalid value for ${c.short}`); setBusy(false); return; }
        body[c.key] = n;
      }
    }
    try {
      const res = await fetch('/api/chemistry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(body),
      });
      if (res.status === 401) { onAuthExpired(); return; }
      if (!res.ok) { setError('Could not save. Try again.'); return; }
      onSaved();
    } catch {
      setError('Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Log a test">
      <div className={styles.formBody}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Date</span>
          <input className={styles.input} type="date" value={date} max={todayLocalISODate()} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className={styles.grid}>
          {CHEMS.map((c) => (
            <label key={c.key} className={styles.field}>
              <span className={styles.fieldLabel}>
                <span className={styles.dot} style={{ background: c.color }} aria-hidden="true" /> {c.short}
                {latest[c.key] !== undefined && <span className={styles.hint}>last {latest[c.key]}</span>}
              </span>
              <span className={styles.inputWrap}>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  aria-label={c.short}
                  placeholder={latest[c.key] !== undefined ? String(latest[c.key]) : ''}
                  value={values[c.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
                />
                {c.unit && <span className={styles.suffix}>{c.unit}</span>}
              </span>
            </label>
          ))}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.ghostBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy || !hasAtLeastOne}>Save reading</button>
        </div>
      </div>
    </BottomSheet>
  );
}
