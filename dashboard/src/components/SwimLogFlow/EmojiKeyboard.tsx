import { BottomSheet } from '../BottomSheet';
import { EMOJI_KEYBOARD } from '../../constants/swim';
import styles from './SwimLogFlow.module.css';

interface EmojiKeyboardProps {
  open: boolean;
  picked: string[];
  onToggle: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiKeyboard({ open, picked, onToggle, onClose }: EmojiKeyboardProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Pick any emoji">
      <div className={styles.kbScroll}>
        {EMOJI_KEYBOARD.map((g) => (
          <div key={g.cat} className={styles.kbCat}>
            <div className={styles.kbCatLabel}>{g.cat}</div>
            <div className={styles.kbGrid}>
              {g.list.map((em, i) => (
                <button
                  key={em + i}
                  type="button"
                  className={`${styles.kbEmoji} ${picked.includes(em) ? styles.kbOn : ''}`}
                  onClick={() => onToggle(em)}
                >{em}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} onClick={onClose}>Done</button>
      </div>
    </BottomSheet>
  );
}
