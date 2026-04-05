import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <p className={styles.text}>
        Pool Monitor &copy; {new Date().getFullYear()}
      </p>
    </footer>
  );
}
