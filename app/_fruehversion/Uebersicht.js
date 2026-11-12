/**
 * app/_fruehversion/Uebersicht.js – Startseite der Versionen 2 und 3
 * Kennzahlen, offene Störmeldungen und – mit gewählter Person aus der Instandhaltung – die eigenen Aufträge.
 * 4 Abfragen gleichzeitig, danach höchstens 2 nacheinander (Person).
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { aktuellePerson } from '@/lib/person';
import { datumZeit } from '@/lib/format';
import Rahmen, { pfad, prioKlasse, statusKlasse, LeereZeile } from './Rahmen';

export default async function Uebersicht({ version }) {
  await benutzerPflicht();
  const [[zahlen], offene, [lager], [wartung]] = await Promise.all([
    sql`SELECT COUNT(*) FILTER (WHERE w.status <> 'erledigt')::int AS offen,
               COUNT(*) FILTER (WHERE w.status <> 'erledigt' AND s.prioritaet = 'hoch')::int AS hoch,
               COUNT(*) FILTER (WHERE w.status = 'erledigt' AND w.ende_zeit > now() - interval '30 days')::int AS erledigt
        FROM wartungsauftrag w JOIN stoermeldung s ON s.id = w.stoermeldung_id`,
    sql`SELECT w.id, s.zeitpunkt, s.prioritaet::text AS prioritaet, w.status::text AS status, s.beschreibung,
               m.anlagennummer, m.bezeichnung AS maschine, st.name AS werk
        FROM wartungsauftrag w JOIN stoermeldung s ON s.id = w.stoermeldung_id
        JOIN maschine m ON m.id = s.maschine_id JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id
        WHERE w.status <> 'erledigt' ORDER BY s.prioritaet DESC, s.zeitpunkt DESC LIMIT 15`,
    sql`SELECT COUNT(*)::int AS knapp FROM lagerbestand WHERE bestand < mindestbestand`,
    sql`SELECT COUNT(*)::int AS ueberfaellig FROM wartungsplan p
        LEFT JOIN LATERAL (SELECT MAX(datum) AS letzte FROM wartung_durchfuehrung WHERE plan_id = p.id) d ON TRUE
        WHERE p.aktiv AND COALESCE(d.letzte + p.intervall_tage, p.start_datum) < current_date`,
  ]);
  // Eigene Aufträge, wenn eine Person aus der Instandhaltung gewählt ist
  const person = await aktuellePerson();
  const eigene = person?.techniker_id ? await sql`
    SELECT w.id, s.prioritaet::text AS prioritaet, w.status::text AS status, m.bezeichnung AS maschine
    FROM wartungsauftrag w JOIN stoermeldung s ON s.id = w.stoermeldung_id JOIN maschine m ON m.id = s.maschine_id
    WHERE w.techniker_id = ${person.techniker_id} AND w.status <> 'erledigt' ORDER BY s.prioritaet DESC, s.zeitpunkt` : null;

  const kacheln = [
    ['Offene Meldungen', zahlen.offen, '🔔'],
    ['Priorität hoch', zahlen.hoch, '🔥'],
    ['Erledigt (30 Tage)', zahlen.erledigt, '✅'],
    ['Teile unter Mindestbestand', lager.knapp, '📦'],
    ['Wartungen überfällig', wartung.ueberfaellig, '⏰'],
  ];
  return (
    <Rahmen version={version} titel="Übersicht" emoji="🏠">
      <table className="fv-tabelle fv-kennzahlen">
        <tbody>
          {kacheln.map(([text, wert, symbol]) => (
            <tr key={text}><th>{version === 'v3' && `${symbol} `}{text}</th><td className="fv-zahl" data-kennzahl={text}>{wert}</td></tr>
          ))}
        </tbody>
      </table>
      <p><a href={pfad(version, '/melden')} className="fv-knopf">Neue Störung melden</a></p>

      {eigene && (
        <>
          <h2>Meine Aufträge ({person.name})</h2>
          <table className="fv-tabelle">
            <thead><tr><th>Nr.</th><th>Maschine</th><th>Priorität</th><th>Status</th></tr></thead>
            <tbody>
              {eigene.length === 0 && <LeereZeile spalten={4} />}
              {eigene.map((a) => (
                <tr key={a.id}><td><a href={pfad(version, `/auftraege/${a.id}`)}>{a.id}</a></td><td>{a.maschine}</td>
                  <td><span className={prioKlasse(a.prioritaet)}>{a.prioritaet}</span></td><td><span className={statusKlasse(a.status)}>{a.status}</span></td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Offene Störmeldungen</h2>
      <div className="fv-breit">
        <table className="fv-tabelle">
          <thead><tr><th>Auftrag</th><th>Gemeldet</th><th>Maschine</th><th>Werk</th><th>Beschreibung</th><th>Priorität</th><th>Status</th></tr></thead>
          <tbody>
            {offene.length === 0 && <LeereZeile spalten={7} />}
            {offene.map((a) => (
              <tr key={a.id}>
                <td><a href={pfad(version, `/auftraege/${a.id}`)}>Nr. {a.id}</a></td>
                <td>{datumZeit(a.zeitpunkt)}</td>
                <td>{a.anlagennummer} {a.maschine}</td>
                <td>{a.werk}</td>
                <td>{a.beschreibung}</td>
                <td><span className={prioKlasse(a.prioritaet)}>{a.prioritaet}</span></td>
                <td><span className={statusKlasse(a.status)}>{a.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p><a href={pfad(version, '/auftraege')}>Alle Aufträge anzeigen</a></p>
    </Rahmen>
  );
}
