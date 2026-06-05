import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { EVENT_KINDS, CHEM_PRODUCTS, CHEM_UNITS, WATER_UNITS } from '../../constants/events';
import type { EventKind, PoolEvent } from '../../types';
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

function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className={styles.seg}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`${styles.segBtn} ${value === o ? styles.segOn : ''}`}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

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

  // chemical
  const presetMatch = editing && editEntry!.kind === 'chemical' && !!editEntry!.product && CHEM_PRODUCTS.includes(editEntry!.product);
  const [product, setProduct] = useState(
    editing && editEntry!.kind === 'chemical' ? (presetMatch ? editEntry!.product! : 'Other') : '',
  );
  const [otherProduct, setOtherProduct] = useState(
    editing && editEntry!.kind === 'chemical' && !presetMatch ? (editEntry!.product ?? '') : '',
  );
  const [cAmount, setCAmount] = useState(
    editing && editEntry!.kind === 'chemical' && editEntry!.amount != null ? String(editEntry!.amount) : '',
  );
  const [cUnit, setCUnit] = useState(editing && editEntry!.kind === 'chemical' && editEntry!.unit ? editEntry!.unit : 'oz');
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

  const resolvedProduct = product === 'Other' ? otherProduct.trim() : product;

  let canSave = true;
  if (kind === 'chemical') canSave = !!resolvedProduct && cAmount !== '' && Number(cAmount) > 0;
  if (kind === 'water') canSave = wAmount !== '' && Number(wAmount) > 0;
  if (kind === 'note') canSave = note.trim().length > 0;

  const buildBody = () => {
    const base: Record<string, unknown> = { date, time, kind };
    if (kind === 'chemical') return { ...base, product: resolvedProduct, amount: Number(cAmount), unit: cUnit };
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
            <span className={styles.pickerLabel}>Product</span>
            <span className={styles.pickerHint}>what went in</span>
          </div>
          <div className={styles.chipWrap}>
            {CHEM_PRODUCTS.map((p) => (
              <button
                key={p}
                type="button"
                className={`${styles.chip} ${product === p ? styles.chipOn : ''}`}
                style={{ '--accent': meta.color } as React.CSSProperties}
                onClick={() => setProduct(p)}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.chip} ${product === 'Other' ? styles.chipOn : ''}`}
              style={{ '--accent': meta.color } as React.CSSProperties}
              onClick={() => setProduct('Other')}
            >
              Other…
            </button>
          </div>
          {product === 'Other' && (
            <input
              className={`${styles.input} ${styles.mt}`}
              placeholder="Product name"
              value={otherProduct}
              onChange={(e) => setOtherProduct(e.target.value)}
            />
          )}
          <div className={`${styles.formGrid} ${styles.mt}`}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Amount</span>
              <input
                className={styles.input}
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="0"
                value={cAmount}
                onChange={(e) => setCAmount(e.target.value)}
              />
            </label>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Unit</span>
              <Segmented options={CHEM_UNITS} value={cUnit} onChange={setCUnit} />
            </div>
          </div>
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
              <Segmented options={WATER_UNITS} value={wUnit} onChange={setWUnit} />
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
