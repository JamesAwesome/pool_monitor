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
  const handleRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);
  // Latest-ref for onClose so the touch-drag effect can call the current
  // handler without re-subscribing its listeners on every onClose change.
  // Assigned in an effect (not during render) to satisfy react-hooks/refs.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleKeyDown]);

  // Separate scroll lock effect — iOS Safari ignores overflow:hidden on body,
  // so we pin the body with position:fixed and restore scroll on close.
  // We store scrollY in a ref so cleanup always reads the freshest value,
  // and we use requestAnimationFrame to let the browser finish layout reflow
  // before restoring scroll position (prevents ghost whitespace on iOS Safari).
  const savedScrollY = useRef(0);
  useEffect(() => {
    if (!open) return;
    // Another BottomSheet already owns the scroll lock
    if (document.body.style.position === 'fixed') return;
    savedScrollY.current = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY.current}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      const y = savedScrollY.current;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      // Let the browser recalculate layout before restoring scroll.
      // This prevents iOS Safari from retaining a stale document height.
      requestAnimationFrame(() => {
        window.scrollTo(0, y);
      });
    };
  }, [open]);

  // Use native event listener for touchmove so we can call preventDefault
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!open || !sheet) return;

    function onTouchStart(e: TouchEvent) {
      // Only start drag from the handle or header area
      const target = e.target as HTMLElement;
      const handle = handleRef.current;
      if (handle && (handle === target || handle.contains(target))) {
        dragStartY.current = e.touches[0].clientY;
        isDragging.current = true;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!isDragging.current) return;
      e.preventDefault();
      const dy = e.touches[0].clientY - dragStartY.current;
      setDragOffset(Math.max(0, dy));
    }

    function onTouchEnd() {
      if (!isDragging.current) return;
      isDragging.current = false;
      setDragOffset((current) => {
        if (current > DISMISS_THRESHOLD) {
          onCloseRef.current();
        }
        return 0;
      });
    }

    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', onTouchEnd);
    };
  }, [open]);

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
      >
        <div className={styles.dragZone} ref={handleRef}>
          <div className={styles.handle} />
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        <div className={styles.content}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
