import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { EVENT_KINDS, CHEM_PRODUCTS, WATER_UNITS } from '../../constants/events';
import { chemItems } from '../../utils/events';
import type { EventKind, PoolEvent } from '../../types';
import { Segmented } from './Segmented';
import { ChemItemRow, newChemRow, type ChemRow } from './ChemItemRow';
import styles from './EventLogFlow.module.css';

interface EventLogFormProps {
  kind: EventKind;
  authHeader: string;
  editEntry?: PoolEvent | null;
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
  onAuthExpired: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

const waterHint = (u: string) => (u === 'in' ? 'inches raised' : u === 'gal' ? 'gallons' : 'min of hose');

export function EventLogForm({ kind, authHeader, editEntry, onSaved, onDeleted, onClose, onAuthExpired }: EventLogFormProps) {
  const editing = !!editEntry;
  const meta = EVENT_KINDS[kind];

  // Lazy initializers so `new Date()` is snapshotted once on mount, matching SwimLogForm.
  const [date, setDate] = useState(() => {
    if (editEntry) return editEntry.date;
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  });
  const [time, setTime] = useState(() => {
    if (editEntry) return editEntry.time;
    const now = new Date();
    return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  });

  // chemical — one or more line-items at a single timestamp
  const [chemRows, setChemRows] = useState<ChemRow[]>(() => {
    if (editing && editEntry!.kind === 'chemical') {
      const items = chemItems(editEntry!);
      if (items.length) {
        return items.map((it) => {
          const preset = CHEM_PRODUCTS.includes(it.product);
          return { product: preset ? it.product : 'Other', other: preset ? '' : it.product, amount: String(it.amount), unit: it.unit };
        });
      }
    }
    return [newChemRow()];
  });
  const updateRow = (i: number, patch: Partial<ChemRow>) =>
    setChemRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setChemRows((rows) => [...rows, newChemRow()]);
  const removeRow = (i: number) => setChemRows((rows) => rows.filter((_, idx) => idx !== i));
  const chemResolved = chemRows.map((r) => ({
    product: r.product === 'Other' ? r.other.trim() : r.product,
    amount: Number(r.amount),
    unit: r.unit,
  }));

  // water
  const [wAmount, setWAmount] = useState(
    editing && editEntry!.kind === 'water' && editEntry!.amount != null ? String(editEntry!.amount) : '',
  );
  const [wUnit, setWUnit] = useState(editing && editEntry!.kind === 'water' && editEntry!.unit ? editEntry!.unit : 'in');
  // note
  const [note, setNote] = useState(editing && editEntry!.kind === 'note' ? (editEntry!.note ?? '') : '');

  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  let canSave = true;
  if (kind === 'chemical') {
    canSave = chemResolved.length > 0 && chemResolved.every((it) => !!it.product && it.amount > 0);
  }
  if (kind === 'water') canSave = wAmount !== '' && Number(wAmount) > 0;
  if (kind === 'note') canSave = note.trim().length > 0;

  const buildBody = () => {
    const base: Record<string, unknown> = { date, time, kind };
    if (kind === 'chemical') return { ...base, items: chemResolved };
    if (kind === 'water') return { ...base, amount: Number(wAmount), unit: wUnit };
    if (kind === 'note') return { ...base, note: note.trim() };
    return base; // backwash
  };

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = editing ? { id: editEntry!.id, ...buildBody() } : buildBody();
      const res = await fetch('/api/events', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(body),
      });
      if (res.status === 401) { onAuthExpired(); return; }
      if (!res.ok) { setError('Could not save. Try again.'); return; }
      onSaved();
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  const del = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/events?id=${encodeURIComponent(editEntry!.id)}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      });
      if (res.status === 401) { onAuthExpired(); return; }
      if (!res.ok) { setError('Could not delete. Try again.'); return; }
      onDeleted();
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <BottomSheet open onClose={onClose} title={`${editing ? 'Edit' : 'Log'} · ${meta.noun}`}>
      <div className={styles.badgeRow}>
        <span className={styles.evBadge} style={{ background: meta.tint, borderColor: meta.color }}>{meta.icon}</span>
        <div>
          <span className={styles.badgeKicker}>{editing ? 'Edit' : 'Log'} · maintenance</span>
          <div className={styles.badgeTitle}>{meta.noun}</div>
        </div>
      </div>

      {kind === 'chemical' && (
        <>
          <div className={styles.pickerHead}>
            <span className={styles.pickerLabel}>Products</span>
            <span className={styles.pickerHint}>what went in</span>
          </div>
          {chemRows.map((row, i) => (
            <ChemItemRow
              key={i}
              row={row}
              index={i}
              accent={meta.color}
              onChange={(patch) => updateRow(i, patch)}
              onRemove={chemRows.length > 1 ? () => removeRow(i) : undefined}
            />
          ))}
          <button type="button" className={styles.addRow} onClick={addRow}>
            + Add another chemical
          </button>
        </>
      )}

      {kind === 'water' && (
        <>
          <p className={styles.formHelp}>How much water you added.</p>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Amount</span>
              <input
                className={styles.input}
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="0"
                value={wAmount}
                onChange={(e) => setWAmount(e.target.value)}
              />
            </label>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Unit<span className={styles.fieldHint}>{waterHint(wUnit)}</span></span>
              <Segmented options={WATER_UNITS} value={wUnit} onChange={setWUnit} accent={meta.color} />
            </div>
          </div>
        </>
      )}

      {kind === 'backwash' && (
        <div className={styles.bwNote}>
          <span className={styles.bwIco}>🔄</span>
          <p>Logs a filter backwash at the time below. No other details needed.</p>
        </div>
      )}

      {kind === 'note' && (
        <label className={styles.field} style={{ marginBottom: 2 }}>
          <span className={styles.fieldLabel}>Note</span>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            rows={3}
            placeholder="What happened?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      )}

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Date</span>
          <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Time</span>
          <input className={styles.input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.ghostBtn} onClick={onClose}>Cancel</button>
        <button type="button" className={styles.primaryBtn} disabled={!canSave || busy} onClick={save}>
          {editing ? 'Save changes' : 'Log it'}
        </button>
      </div>

      {editing && (
        confirmDel ? (
          <div className={styles.delConfirm}>
            <span>Delete this entry permanently?</span>
            <div className={styles.delConfirmActions}>
              <button type="button" className={styles.ghostBtnSm} onClick={() => setConfirmDel(false)}>Keep</button>
              <button type="button" className={styles.dangerBtnSm} disabled={busy} onClick={del}>Delete</button>
            </div>
          </div>
        ) : (
          <button type="button" className={styles.delLink} onClick={() => setConfirmDel(true)}>Delete this entry</button>
        )
      )}
    </BottomSheet>
  );
}
