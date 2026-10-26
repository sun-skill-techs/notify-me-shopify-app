import { useEffect, type ReactNode } from "react";

import styles from "./public-page.module.css";

const CONTACT_EMAIL = "management.sunskilltechs@gmail.com";
const TAWK_SRC = "https://embed.tawk.to/6adefe094ec12134717f6669/1k5rh0lca";

// Shared header and footer for the public pages: home, privacy and DPA.
export function PublicPage({ children }: { children: ReactNode }) {
  // Tawk.to live chat widget.
  useEffect(() => {
    if (document.querySelector(`script[src="${TAWK_SRC}"]`)) return;
    const w = window as unknown as Record<string, unknown>;
    w.Tawk_API ??= {};
    w.Tawk_LoadStart = new Date();
    const s = document.createElement("script");
    s.async = true;
    s.src = TAWK_SRC;
    s.charset = "UTF-8";
    s.setAttribute("crossorigin", "*");
    document.body.appendChild(s);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a href="/" className={styles.brand}>
            <img src="/apple-touch-icon.png" alt="" />
            BackSoon
          </a>
          <nav className={styles.nav}>
            <a href="/privacy">Privacy</a>
            <a href="/dpa">Data processing</a>
            <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
          </nav>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>© {new Date().getFullYear()} Sun Skill Tech</span>
          <nav className={styles.nav}>
            <a href="/privacy">Privacy policy</a>
            <a href="/dpa">Data processing terms</a>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export { styles as publicStyles };
