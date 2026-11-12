/**
 * app/v1/page.js – Version 1: Startseite mit Prüfung der Datenbankverbindung
 *
 * Zeigt, dass die Anwendung mit der Datenbank (PostgreSQL bei Supabase) verbunden ist:
 * Status, Antwortzeit, Version, Serverzeit und die Zahl der Datensätze in den Kerntabellen.
 * Es werden nie Zugangsdaten angezeigt – nur, ob die Verbindung steht und wo die Datenbank liegt.
 * 2 Abfragen.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { datumZeit } from '@/lib/format';
import Rahmen from './Rahmen';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Instandhaltung – Version 1' } };

/** Wo liegt die Datenbank? Nur Anbieter und Region aus DATABASE_URL – ohne Benutzer und Passwort */
function datenbankOrt() {
  try {
    const host = new URL(process.env.DATABASE_URL ?? '').hostname;
    if (/^(localhost|127\.0\.0\.1)$/.test(host)) return 'lokaler Testrechner';
    const region = host.match(/aws-\d+-([a-z]+-[a-z]+-\d+)/)?.[1];
    return /supabase/.test(host) ? `Supabase${region ? ` (Region ${region})` : ''}` : 'externer Server';
  } catch {
    return 'unbekannt';
  }
}

export default async function V1Start() {
  await benutzerPflicht();

  // Verbindung prüfen und Zeit messen; ein Fehler wird angezeigt statt die Seite abstürzen zu lassen
  let verbindung = null;
  let tabellen = [];
  let fehler = null;
  const start = Date.now();
  try {
    [verbindung] = await sql`SELECT current_database() AS datenbank, current_setting('server_version') AS version, now() AS zeit`;
    const ms = Date.now() - start;
    verbindung = { ...verbindung, ms };
    // Zahl der Datensätze je Kerntabelle (eine Abfrage)
    tabellen = await sql`
      SELECT * FROM (VALUES
        ('standort',        'Werke',              (SELECT COUNT(*)::int FROM standort)),
        ('gebaeude',        'Gebäude / Hallen',   (SELECT COUNT(*)::int FROM gebaeude)),
        ('maschine',        'Maschinen',          (SELECT COUNT(*)::int FROM maschine)),
        ('techniker',       'Techniker',          (SELECT COUNT(*)::int FROM techniker)),
        ('stoermeldung',    'Störmeldungen',      (SELECT COUNT(*)::int FROM stoermeldung)),
        ('wartungsauftrag', 'Wartungsaufträge',   (SELECT COUNT(*)::int FROM wartungsauftrag))
      ) AS t(tabelle, inhalt, anzahl)`;
  } catch (e) {
    fehler = e.message?.slice(0, 200) ?? String(e);
  }

  return (
    <Rahmen titel="Datenbankverbindung">
      <table className="v1-tabelle">
        <tbody>
          <tr>
            <th>Status</th>
            <td id="v1-status">
              {fehler ? <b className="v1-rot">keine Verbindung</b> : <b className="v1-gruen">verbunden</b>}
            </td>
          </tr>
          <tr><th>Datenbank</th><td>PostgreSQL{verbindung ? ` ${verbindung.version}` : ''}</td></tr>
          <tr><th>Ort</th><td>{datenbankOrt()}</td></tr>
          {verbindung && <tr><th>Name der Datenbank</th><td>{verbindung.datenbank}</td></tr>}
          {verbindung && <tr><th>Antwortzeit</th><td>{verbindung.ms} ms</td></tr>}
          {verbindung && <tr><th>Zeit des Datenbankservers</th><td>{datumZeit(verbindung.zeit)}</td></tr>}
          {fehler && <tr><th>Fehlermeldung</th><td>{fehler}</td></tr>}
        </tbody>
      </table>

      {tabellen.length > 0 && (
        <>
          <h3>Tabellen</h3>
          <table className="v1-tabelle">
            <thead>
              <tr><th>Tabelle</th><th>Inhalt</th><th>Datensätze</th></tr>
            </thead>
            <tbody>
              {tabellen.map((z) => (
                <tr key={z.tabelle}>
                  <td><code>{z.tabelle}</code></td>
                  <td>{z.inhalt}</td>
                  <td align="right">{z.anzahl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>Funktionen</h3>
      <ul>
        <li><a href="/v1/maschinen">Maschinen anzeigen</a> (Liste aus der Datenbank)</li>
        <li><a href="/v1/meldungen">Störmeldungen anzeigen</a></li>
        <li><a href="/v1/melden">Störung melden</a> (Formular, speichert in der Datenbank)</li>
      </ul>
      <form action="/v1" method="get">
        <button type="submit">Verbindung erneut prüfen</button>
      </form>
    </Rahmen>
  );
}
