/**
 * app/_fruehversion/Rahmen.js – gemeinsamer Rahmen der Versionen 2 und 3 (/v2, /v3)
 *
 * Frühere Stände der Anwendung, um den Weg des Projekts zu zeigen:
 *  - Version 2: alle Funktionen, aber schlicht – Tabellen, Standard-Formulare, eingebettete Google-Karte
 *  - Version 3: erste Gestaltung mit KI-Hilfe – Farbverlauf, Karten, Emojis, Diagramme, eigene SVG-Karte
 * Beide nutzen dieselben Seiten (dieser Ordner, „_“ = keine eigene Adresse) und dieselbe Datenbank;
 * gespeichert wird mit den Aktionen der aktuellen App (app/aktionen.js, Hüllen „…Frueh“).
 * Das Aussehen kommt aus globals.css (Abschnitt „Frühere Versionen“, html[data-v2] bzw. html[data-v3]).
 *
 * Bewusste Ausnahmen von den Regeln der App (wie in Version 1): Texte nur deutsch, natives <select>,
 * feste Farben, kein Dunkelmodus, normale Links <a href>. Hier oben werden die Hinweise nach dem
 * Speichern (Cookie „flash“) angezeigt; FlashLoeschen entfernt das Cookie danach.
 */
import { cookies } from 'next/headers';
import { personAusCookie } from '@/lib/person';
import FlashLoeschen from './FlashLoeschen';

/** Navigation: Pfad, Text und (nur Version 3) Emoji */
const NAVIGATION = [
  ['', 'Übersicht', '🏠'],
  ['/karte', 'Karte', '🗺️'],
  ['/melden', 'Störung melden', '🚨'],
  ['/auftraege', 'Aufträge', '🔧'],
  ['/maschinen', 'Maschinen', '⚙️'],
  ['/wartung', 'Wartungsplan', '📅'],
  ['/lager', 'Lager', '📦'],
  ['/statistik', 'Statistik', '📊'],
  ['/mitarbeiter', 'Mitarbeiter', '👥'],
  ['/datenbasis', 'Datenbasis', '🗄️'],
];

/** Hinweise aus dem Cookie „flash“ (gesetzt von lib/flash.js) */
async function hinweise() {
  try {
    return JSON.parse((await cookies()).get('flash')?.value ?? '[]');
  } catch {
    return [];
  }
}

export default async function Rahmen({ version, titel, emoji = '', children }) {
  const [meldungen, person] = await Promise.all([hinweise(), personAusCookie()]);
  const v3 = version === 'v3';
  return (
    <div className="fv">
      <header className="fv-kopf">
        <div className="fv-marke">
          {v3 ? <>🛠️ <b>Instandhaltung</b> <span className="fv-abzeichen">v3 · Beta</span></> : <b>Instandhaltung – Company database</b>}
        </div>
        <nav className="fv-nav">
          {NAVIGATION.map(([pfad, text, symbol]) => (
            <a key={pfad} href={`/${version}${pfad}`}>{v3 && `${symbol} `}{text}</a>
          ))}
        </nav>
        <div className="fv-person">
          {v3 && '👤 '}{person ? <>Angemeldet als <b>{person.name}</b> ({person.rolle})</> : 'Keine Person gewählt'}
          {' '}<a href={`/${version}/person`}>[{person ? 'wechseln' : 'Person wählen'}]</a>
        </div>
      </header>
      <main className="fv-inhalt">
        <h1>{v3 && emoji && `${emoji} `}{titel}</h1>
        {meldungen.map((m) => (
          <p key={m.id} className={`fv-hinweis fv-hinweis-${m.typ}`}>{m.text}</p>
        ))}
        {meldungen.length > 0 && <FlashLoeschen />}
        {children}
      </main>
      <footer className="fv-fuss">
        {v3 ? 'Version 3 · erstellt mit Next.js, Supabase und KI-Unterstützung' : 'Version 2 · Hochschulprojekt Digital Production'}
      </footer>
    </div>
  );
}

/** Pfad innerhalb der Version, z. B. pfad('v2', '/auftraege/5') → '/v2/auftraege/5' */
export const pfad = (version, rest = '') => `/${version}${rest}`;

/** Farbe einer Priorität bzw. eines Status als Klasse (nur Version 3 zeigt sie farbig) */
export const prioKlasse = (p) => `fv-badge fv-prio-${p}`;
export const statusKlasse = (s) => `fv-badge fv-status-${String(s).replace(/\s+/g, '-')}`;

/** Leere Tabelle: eine Zeile mit Hinweis */
export function LeereZeile({ spalten, text = 'Keine Einträge.' }) {
  return <tr><td colSpan={spalten} className="fv-leer">{text}</td></tr>;
}
