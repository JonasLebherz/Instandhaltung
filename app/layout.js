/**
 * app/layout.js – Grundgerüst jeder Seite
 *
 * Enthält <html>, <head>, die Navigation, die Hinweise (Flash-Meldungen)
 * und die Fußzeile. Der eigentliche Seiteninhalt wird als "children" eingesetzt.
 */
import 'bootstrap/dist/css/bootstrap.min.css';      // Raster (row/col) und Formular-Grundlagen
import 'bootstrap-icons/font/bootstrap-icons.min.css'; // dezente Symbole
import './globals.css';                              // eigenes Design (überschreibt Bootstrap)

import Navigation from '@/components/Navigation';
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
 * sofort richtig, damit die Seite nicht kurz weiß aufblitzt.
 * Gespeicherte Wahl: 'hell', 'dunkel' oder nichts (= wie das Betriebssystem).
 */
const darstellungSkript = `
(function () {
  var wahl = null;
  try { wahl = localStorage.getItem('darstellung'); } catch (e) {}
  var dunkel = wahl === 'dunkel' || (wahl !== 'hell' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var html = document.documentElement;
  html.setAttribute('data-theme', dunkel ? 'dark' : 'light');
  html.setAttribute('data-bs-theme', dunkel ? 'dark' : 'light');
})();`;

export default async function RootLayout({ children }) {
  const benutzer = await aktuellerBenutzer();
  const flashMeldungen = await flashLesen();

  return (
    // suppressHydrationWarning: data-theme wird vom Skript oben gesetzt, nicht von React
    <html lang="de" data-theme="light" data-bs-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: darstellungSkript }} />
      </head>
      <body>
        {benutzer && <Navigation benutzer={benutzer} />}

        {benutzer ? (
          <main className="container app-main">
            <FlashMeldungen neu={flashMeldungen} />
            {children}
          </main>
        ) : (
          children /* Login-Seite: ohne Navigation */
        )}

        {benutzer && (
          <footer className="app-footer">
            <div className="container">
              Instandhaltung · Hochschulprojekt „Company database“ · Digital Production
            </div>
          </footer>
        )}
      </body>
    </html>
  );
}
