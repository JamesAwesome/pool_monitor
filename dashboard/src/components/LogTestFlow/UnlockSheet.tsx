import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import styles from './LogTestFlow.module.css';

interface UnlockSheetProps {
  open: boolean;
  onClose: () => void;
  onUnlocked: (authHeader: string) => void;
  unlockTitle?: string;
}

export function UnlockSheet({ open, onClose, onUnlocked, unlockTitle = 'Unlock to log a test' }: UnlockSheetProps) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const header = `Basic ${btoa(`${user}:${pass}`)}`;
    try {
      const res = await fetch('/api/chemistry/auth-check', { headers: { Authorization: header } });
      if (res.status === 401) {
        setError('Incorrect username or password.');
        return;
      }
      if (!res.ok) {
        setError('Could not reach the server. Try again.');
        return;
      }
      onUnlocked(header);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Unlock">
      <div className={styles.unlockBody}>
        <div className={styles.lockBadge} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <p className={styles.unlockTitle}>{unlockTitle}</p>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Username</span>
          <input
            className={styles.input}
            value={user}
            onChange={(e) => setUser(e.target.value.toLowerCase())}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Password</span>
          <input className={styles.input} type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.helper}>
          Stays unlocked on this device — you won't be asked again here. The public dashboard stays read-only for everyone else.
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.ghostBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primaryBtn} onClick={submit} disabled={busy || !user || !pass}>Unlock</button>
        </div>
      </div>
    </BottomSheet>
  );
}
