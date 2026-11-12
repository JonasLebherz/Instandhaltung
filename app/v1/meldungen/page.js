/**
 * app/v1/meldungen/page.js – Version 1: die letzten Störmeldungen als einfache Tabelle
 *
 * Nach dem Speichern einer Meldung leitet das Formular hierher (?neu=<Nummer>); dann steht oben
 * eine Bestätigung und die neue Zeile ist hervorgehoben. 1 Abfrage.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { datumZeit } from '@/lib/format';
import { idAus } from '@/lib/eingabe';
import Rahmen from '../Rahmen';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Störmeldungen – Instandhaltung Version 1' } };

const ANZAHL = 50;   // so viele Meldungen zeigt die Liste

export default async function V1Meldungen({ searchParams }) {
  await benutzerPflicht();
  const neu = idAus((await searchParams).neu);

  const meldungen = await sql`
    SELECT s.id, s.zeitpunkt, s.gemeldet_von, s.beschreibung, s.ursache_kategorie, s.prioritaet,
           m.anlagennummer, m.bezeichnung AS maschine, st.name AS werk, a.status,
           COUNT(*) OVER ()::int AS gesamt
    FROM stoermeldung s
    JOIN maschine m ON m.id = s.maschine_id
    JOIN gebaeude g ON g.id = m.gebaeude_id
    JOIN standort st ON st.id = g.standort_id
    JOIN wartungsauftrag a ON a.stoermeldung_id = s.id
    ORDER BY s.zeitpunkt DESC, s.id DESC
    LIMIT ${ANZAHL}`;

  return (
    <Rahmen titel="Störmeldungen">
      {neu && (
        <p id="v1-gespeichert" className="v1-hinweis">
          <b>Störmeldung Nr. {neu} wurde in der Datenbank gespeichert.</b>
        </p>
      )}
      <p>
        Die letzten {meldungen.length} von {meldungen[0]?.gesamt ?? 0} Meldungen (neueste zuerst). ·{' '}
        <a href="/v1/melden">Neue Störung melden</a>
      </p>
      <div className="v1-breit">
        <table className="v1-tabelle">
          <thead>
            <tr>
              <th>Nr.</th><th>Zeitpunkt</th><th>Maschine</th><th>Werk</th><th>Beschreibung</th><th>Ursache</th>
              <th>Priorität</th><th>Status</th><th>Gemeldet von</th>
            </tr>
          </thead>
          <tbody>
            {meldungen.map((s) => (
              <tr key={s.id} className={s.id === neu ? 'v1-neu' : undefined}>
                <td align="right">{s.id}</td>
                <td>{datumZeit(s.zeitpunkt)}</td>
                <td>{s.anlagennummer}<br />{s.maschine}</td>
                <td>{s.werk}</td>
                <td>{s.beschreibung}</td>
                <td>{s.ursache_kategorie}</td>
                <td>{s.prioritaet}</td>
                <td>{s.status}</td>
                <td>{s.gemeldet_von}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Rahmen>
  );
}
