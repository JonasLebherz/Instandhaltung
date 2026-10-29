/**
 * app/layout.js – Grundgerüst jeder Seite
 *
 * Enthält <html>, <head>, die Seitenleiste links, die Hinweise (Flash-Meldungen)
 * und die Fußzeile. Der eigentliche Seiteninhalt wird als "children" eingesetzt.
 */
import 'bootstrap/dist/css/bootstrap.min.css';      // Raster (row/col) und Formular-Grundlagen
import 'bootstrap-icons/font/bootstrap-icons.min.css'; // dezente Symbole
import './globals.css';                              // eigenes Design (überschreibt Bootstrap)

import Seitenleiste from '@/components/Seitenleiste';
import FlashMeldungen from '@/components/FlashMeldungen';
import { aktuellerBenutzer } from '@/lib/auth';
import { cookies } from 'next/headers';

/** Hinweise aus dem Cookie "flash" lesen (siehe lib/flash.js) */
async function flashLesen() {
  try {
    return JSON.parse((await cookies()).get('flash')?.value ?? '[]');
  } catch {
    return [];
  }
}

/**
 * Anzahl offener Aufträge für die Zahl neben "Aufträge" in der Seitenleiste.
 * Ist die Datenbank nicht erreichbar, fehlt nur die Zahl – die Seite selbst
 * zeigt dann ihre eigene Fehlermeldung.
 */
async function anzahlOffen() {
  try {
    // Erst hier laden: So hängt die Login-Seite nicht von der Datenbank ab
    const { sql } = await import('@/lib/db');
    const [{ anzahl }] = await sql`SELECT COUNT(*)::int AS anzahl FROM wartungsauftrag WHERE status <> 'erledigt'`;
    return anzahl;
  } catch {
    return null;
  }
}

export const metadata = {
  title: { default: 'Instandhaltung', template: '%s · Instandhaltung' },
  description: 'Instandhaltungsmanagement – Störungen melden, Aufträge bearbeiten, Kennzahlen auswerten',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

/*
 * Kleines Skript, das VOR dem ersten Anzeigen läuft: Es setzt Hell/Dunkel
 * und den Zustand der Seitenleiste sofort richtig, damit nichts aufblitzt oder springt.
 * Darstellung: 'hell', 'dunkel' oder nichts (= wie das Betriebssystem).
 * Seitenleiste: 'auf' oder 'zu'; ohne Wahl ab 1200 px Breite offen.
 */
const startSkript = `
(function () {
  var wahl = null, leiste = null;
  try { wahl = localStorage.getItem('darstellung'); leiste = localStorage.getItem('seitenleiste'); } catch (e) {}
  var dunkel = wahl === 'dunkel' || (wahl !== 'hell' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var html = document.documentElement;
  html.setAttribute('data-theme', dunkel ? 'dark' : 'light');
  html.setAttribute('data-bs-theme', dunkel ? 'dark' : 'light');
  if (leiste !== 'auf' && leiste !== 'zu') leiste = window.innerWidth >= 1200 ? 'auf' : 'zu';
  html.setAttribute('data-leiste', leiste);
})();`;

export default async function RootLayout({ children }) {
  const benutzer = await aktuellerBenutzer();
  const flashMeldungen = await flashLesen();
  const offen = benutzer ? await anzahlOffen() : null;

  return (
    // suppressHydrationWarning: data-theme und data-leiste werden vom Skript oben gesetzt, nicht von React
    <html lang="de" data-theme="light" data-bs-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: startSkript }} />
      </head>
      <body>
        {benutzer ? (
          <>
            <Seitenleiste benutzer={benutzer} offeneAuftraege={offen} />
            {/* Inhalt rechts neben der Seitenleiste (Abstand: siehe .app-rahmen in globals.css) */}
            <div className="app-rahmen">
              <main className="container app-main">
                <FlashMeldungen neu={flashMeldungen} />
                {children}
              </main>
              <footer className="app-footer">
                <div className="container">
                  Instandhaltung · Hochschulprojekt „Company database“ · Digital Production
                </div>
              </footer>
            </div>
          </>
        ) : (
          children /* Login-Seite: ohne Seitenleiste */
        )}
      </body>
    </html>
  );
}
