import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './Toast.module.css';

interface ToastProps {
  open: boolean;
  message: string;
  onDismiss: () => void;
}

export function Toast({ open, message, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(onDismiss, 2200);
    return () => clearTimeout(id);
  }, [open, onDismiss]);

  if (!open) return null;

  return createPortal(
    <div className={styles.toast} role="status">
      <span className={styles.check}>✓</span>
      {message}
    </div>,
    document.body,
  );
}
