import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { Avatars } from '../SwimLane';
import { EmojiKeyboard } from './EmojiKeyboard';
import { recentEmoji } from '../../utils/swim';
import { SWIM_EMOJI } from '../../constants/swim';
import type { SwimSession } from '../../types';
import styles from './SwimLogFlow.module.css';

interface SwimLogFormProps {
  open: boolean;
  authHeader: string;
  swims: SwimSession[];
  editEntry?: SwimSession | null;
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
  onAuthExpired: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function SwimLogForm({ open, authHeader, swims, editEntry, onSaved, onDeleted, onClose, onAuthExpired }: SwimLogFormProps) {
  const editing = !!editEntry;
  const now = new Date();
  const [date, setDate] = useState(editEntry ? editEntry.date : `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`);
  const [time, setTime] = useState(editEntry ? editEntry.time : `${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
  const [people, setPeople] = useState<string[]>(editEntry ? [...editEntry.people] : []);
  const [kbOpen, setKbOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (em: string) =>
    setPeople((cur) => (cur.includes(em) ? cur.filter((x) => x !== em) : [...cur, em]));

  const recents = recentEmoji(swims, SWIM_EMOJI, 11);
  const tiles = [...people.filter((p) => !recents.includes(p)), ...recents];

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = editing ? { id: editEntry!.id, date, time, people } : { date, time, people };
      const res = await fetch('/api/swims', {
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
      const res = await fetch(`/api/swims?id=${encodeURIComponent(editEntry!.id)}`, {
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
    <BottomSheet open={open} onClose={onClose} title={editing ? 'Edit swim' : 'New swim'}>
      <div className={styles.pickerHead}>
        <span className={styles.pickerLabel}>Recent swimmers</span>
        <span className={styles.pickerHint}>no names — tap ＋ for any emoji</span>
      </div>
      <div className={styles.emojiGrid}>
        {tiles.map((em, i) => (
          <button key={em + i} type="button" data-testid="swim-tile"
            className={`${styles.emojiBtn} ${people.includes(em) ? styles.emojiOn : ''}`}
            onClick={() => toggle(em)} aria-label={`swimmer ${em}`}>{em}</button>
        ))}
        <button type="button" className={`${styles.emojiBtn} ${styles.emojiAdd}`}
          onClick={() => setKbOpen(true)} aria-label="Open emoji keyboard">＋</button>
      </div>

      <div className={styles.pickedRow}>
        {people.length === 0
          ? <span className={styles.pickedEmpty}>No one picked yet</span>
          : <><Avatars people={people} size={22} /><span className={styles.pickedCount}>{people.length} {people.length === 1 ? 'swimmer' : 'swimmers'}</span></>}
      </div>

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
        <button type="button" className={styles.primaryBtn} disabled={people.length === 0 || busy} onClick={save}>
          {editing ? 'Save changes' : 'Log swim'}
        </button>
      </div>

      {editing && (
        confirmDel ? (
          <div className={styles.delConfirm}>
            <span>Delete this swim permanently?</span>
            <button type="button" className={styles.ghostBtn} onClick={() => setConfirmDel(false)}>Keep</button>
            <button type="button" className={styles.dangerBtn} disabled={busy} onClick={del}>Delete</button>
          </div>
        ) : (
          <button type="button" className={styles.delLink} onClick={() => setConfirmDel(true)}>Delete this swim</button>
        )
      )}

      <EmojiKeyboard open={kbOpen} picked={people} onToggle={toggle} onClose={() => setKbOpen(false)} />
    </BottomSheet>
  );
}
