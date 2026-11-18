/**
 * app/layout.js – Grundgerüst jeder Seite
 *
 * Enthält <html>, <head>, die Seitenleiste links, die Hinweise (Flash-Meldungen)
 * und die Fußzeile. Der eigentliche Seiteninhalt wird als "children" eingesetzt.
 */
// Eigenes Design. Bootstrap (Raster, Formular-Grundlagen) und Bootstrap Icons werden
// ganz oben in globals.css per @import geladen – so steht die Reihenfolge fest und
// unser Design überschreibt Bootstrap immer (getrennte Imports hat Next.js teils vertauscht).
import './globals.css';

import Seitenleiste from '@/components/Seitenleiste';
import FlashMeldungen from '@/components/FlashMeldungen';
import Suche from '@/components/Suche';
import { PRODUKTNAME } from '@/components/Logo';
import { SpracheProvider } from '@/components/SpracheKontext';
import { aktuellerBenutzer } from '@/lib/auth';
import { personAusCookie } from '@/lib/person';
import { ansichtAusCookie } from '@/lib/ansicht';
import { aktuelleSprache, uebersetzer } from '@/lib/sprache/server';
import { cookies, headers } from 'next/headers';

/** Hinweise aus dem Cookie "flash" lesen (siehe lib/flash.js) */
async function flashLesen() {
  try {
    return JSON.parse((await cookies()).get('flash')?.value ?? '[]');
  } catch {
    return [];
  }
}

// Titel und Beschreibung in der gewählten Sprache (Seitentitel: siehe generateMetadata der Seiten)
export async function generateMetadata() {
  const t = await uebersetzer();
  return {
    title: { default: PRODUKTNAME, template: `%s · ${PRODUKTNAME}` },
    description: t('Instandhaltungsmanagement – Störungen melden, Aufträge bearbeiten, Kennzahlen auswerten'),
  };
}

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
  // Frühere Stände der Anwendung (app/v1, app/v2, app/v3) – ohne Seitenleiste und ohne unser Design.
  // Den Pfad liefert die Middleware in der Kopfzeile „x-pfad“. Das Attribut data-v1|v2|v3 schaltet in
  // globals.css alle Gestaltung ab und setzt das Aussehen der jeweiligen Version (Abschnitt „Frühere
  // Versionen“). Zwischen den Versionen und der App führen normale Links (<a href>) mit ganzem
  // Seitenwechsel – nur so wird dieses Layout neu ausgewählt.
  const pfad = (await headers()).get('x-pfad') ?? '';
  const version = pfad.match(/^\/v([123])(\/|$)/)?.[1];
  if (version) {
    return (
      <html lang="de" {...{ [`data-v${version}`]: 'an' }}>
        <body>{children}</body>
      </html>
    );
  }

  const benutzer = await aktuellerBenutzer();
  const flashMeldungen = await flashLesen();
  const sprache = await aktuelleSprache();
  const t = await uebersetzer();
  // Gewählte (fiktive) Person nur aus dem Cookie – im Layout keine Datenbankabfrage
  const person = await personAusCookie();
  const ansicht = await ansichtAusCookie();   // Einschränkung auf Land/Werk (Konto → Ansicht)

  return (
    // suppressHydrationWarning: data-theme und data-leiste werden vom Skript oben gesetzt, nicht von React
    <html lang={sprache} data-theme="light" data-bs-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: startSkript }} />
      </head>
      <body>
        {/* Sprache für alle Client-Komponenten (useT) */}
        <SpracheProvider sprache={sprache}>
        {benutzer ? (
          <>
            <Seitenleiste benutzer={benutzer} person={person} ansicht={ansicht} />
            {/* Suchfenster über die ganze App (Strg+K) */}
            <Suche />
            {/* Inhalt rechts neben der Seitenleiste (Abstand: siehe .app-rahmen in globals.css) */}
            <div className="app-rahmen">
              <main className="container app-main">
                <FlashMeldungen neu={flashMeldungen} />
                {children}
              </main>
              <footer className="app-footer">
                <div className="container">
                  {PRODUKTNAME} · {t('Hochschulprojekt „Company database“ · Digital Production')}
                </div>
              </footer>
            </div>
          </>
        ) : (
          children /* Login-Seite: ohne Seitenleiste */
        )}
        </SpracheProvider>
      </body>
    </html>
  );
}
