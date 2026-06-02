import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { CHEMS } from '../../constants/chemicals';
import { fmtTime12 } from '../../utils/chemistry';
import type { ChemKey, ChemistryReading } from '../../types';
import styles from './LogTestFlow.module.css';

interface LogFormProps {
  open: boolean;
  onClose: () => void;
  authHeader: string;
  latest: Partial<Record<ChemKey, number>>;
  onSaved: () => void;
  onAuthExpired: () => void;
  editEntry?: ChemistryReading | null;
  readings: ChemistryReading[];
  onDeleted: () => void;
}

function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nowLocalTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function LogForm({ open, onClose, authHeader, latest, onSaved, onAuthExpired, editEntry, readings, onDeleted }: LogFormProps) {
  const isEdit = editEntry != null;

  const [date, setDate] = useState(() => editEntry?.date ?? todayLocalISODate());
  const [time, setTime] = useState(() => editEntry?.time ?? nowLocalTime());
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (editEntry) {
      const init: Record<string, string> = {};
      for (const c of CHEMS) {
        const v = editEntry[c.key as ChemKey];
        if (typeof v === 'number') init[c.key] = String(v);
      }
      return init;
    }
    return {};
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const hasAtLeastOne = CHEMS.some((c) => values[c.key]?.trim());

  // Count tests on the chosen date, excluding the entry being edited (in edit mode)
  const otherTestsOnDay = readings.filter(
    (r) => r.date === date && (!isEdit || r.id !== editEntry!.id),
  ).length;

  const save = async () => {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { date, time };
    if (isEdit) body.id = editEntry!.id;
    for (const c of CHEMS) {
      const raw = values[c.key]?.trim();
      if (raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) { setError(`Invalid value for ${c.short}`); setBusy(false); return; }
        body[c.key] = n;
      }
    }
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch('/api/chemistry', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(body),
      });
      if (res.status === 401) { onAuthExpired(); return; }
      if (!res.ok) {
        // Surface the server's specific validation message (e.g. "ph out of
        // range") when present, since the client doesn't mirror CHEM_BOUNDS.
        const msg = await res.json().then((b) => (b as { error?: string }).error).catch(() => null);
        setError(msg || 'Could not save. Try again.');
        return;
      }
      onSaved();
    } catch {
      setError('Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!isEdit) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/chemistry?id=${encodeURIComponent(editEntry!.id)}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      });
      if (res.status === 401) { onAuthExpired(); return; }
      if (!res.ok) { setError('Could not delete. Try again.'); return; }
      onDeleted();
    } catch {
      setError('Could not delete. Try again.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const title = isEdit ? 'Edit test' : 'Log a test';
  const saveLabel = isEdit ? 'Save changes' : 'Save reading';

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className={styles.formBody}>
        <div className={styles.dateTimeRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Date</span>
            <input
              className={styles.input}
              type="date"
              value={date}
              max={todayLocalISODate()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Time
              {time && <span className={styles.hint}>{fmtTime12(time)}</span>}
            </span>
            <input
              className={styles.input}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </div>

        {otherTestsOnDay > 0 && (
          <p className={styles.inlineNote}>
            Already {otherTestsOnDay} {otherTestsOnDay === 1 ? 'test' : 'tests'} logged on this day — this will be {isEdit ? 'kept as another' : 'added as another'}.
          </p>
        )}

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
          <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy || !hasAtLeastOne}>{saveLabel}</button>
        </div>

        {isEdit && (
          <div className={styles.deleteSection}>
            {!deleteConfirm ? (
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={() => setDeleteConfirm(true)}
              >
                Delete this entry
              </button>
            ) : (
              <div className={styles.deleteConfirm}>
                <p className={styles.deleteConfirmText}>Delete this test permanently?</p>
                <div className={styles.deleteConfirmActions}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => setDeleteConfirm(false)}
                    disabled={deleteBusy}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    onClick={confirmDelete}
                    disabled={deleteBusy}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
