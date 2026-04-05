import { useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './BottomSheet.module.css';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const DISMISS_THRESHOLD = 100;

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    // Only allow dragging downward
    setDragOffset(Math.max(0, dy));
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    if (dragOffset > DISMISS_THRESHOLD) {
      onClose();
    }
    setDragOffset(0);
  }, [dragOffset, onClose]);

  if (!open) return null;

  const sheetStyle = dragOffset > 0
    ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
    : undefined;

  const overlayOpacity = dragOffset > 0
    ? { opacity: Math.max(0.1, 1 - dragOffset / 300) }
    : undefined;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={onClose}
      data-testid="bottom-sheet-overlay"
      style={overlayOpacity}
    >
      <div
        ref={sheetRef}
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
        style={sheetStyle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={styles.handle} />
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.content}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
