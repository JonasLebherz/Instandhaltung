/**
 * app/_fruehversion/Auftraege.js – alle Aufträge als Tabelle (Versionen 2 und 3)
 * Ohne Filter: offene zuerst (nach Priorität), danach die neuesten erledigten, höchstens 100 Zeilen.
 * ?neu=<Meldungs-Nr.> nach dem Melden: Bestätigung und hervorgehobene Zeile. 1 Abfrage.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { idAus } from '@/lib/eingabe';
import { datumZeit } from '@/lib/format';
import Rahmen, { pfad, prioKlasse, statusKlasse } from './Rahmen';

export default async function Auftraege({ version, searchParams }) {
  await benutzerPflicht();
  const neu = idAus((await searchParams).neu);
  const auftraege = await sql`
    SELECT w.id, s.id AS meldung_id, s.zeitpunkt, s.beschreibung, s.prioritaet::text AS prioritaet, w.status::text AS status,
           m.anlagennummer, m.bezeichnung AS maschine, st.name AS werk, t.name AS techniker,
           COUNT(*) OVER ()::int AS gesamt
    FROM wartungsauftrag w JOIN stoermeldung s ON s.id = w.stoermeldung_id
    JOIN maschine m ON m.id = s.maschine_id JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id
    LEFT JOIN techniker t ON t.id = w.techniker_id
    ORDER BY (w.status = 'erledigt'), s.prioritaet DESC, s.zeitpunkt DESC
    LIMIT 100`;
  return (
    <Rahmen version={version} titel="Aufträge" emoji="🔧">
      {neu && <p className="fv-hinweis fv-hinweis-erfolg" id="fv-gespeichert">Störmeldung Nr. {neu} wurde gespeichert, der Auftrag ist angelegt.</p>}
      <p>{auftraege.length} von {auftraege[0]?.gesamt ?? 0} Aufträgen (offene zuerst).</p>
      <div className="fv-breit">
        <table className="fv-tabelle">
          <thead><tr><th>Nr.</th><th>Gemeldet</th><th>Maschine</th><th>Werk</th><th>Beschreibung</th><th>Priorität</th><th>Status</th><th>Techniker</th></tr></thead>
          <tbody>
            {auftraege.map((a) => (
              <tr key={a.id} className={a.meldung_id === neu ? 'fv-neu' : undefined}>
                <td><a href={pfad(version, `/auftraege/${a.id}`)}>{a.id}</a></td>
                <td>{datumZeit(a.zeitpunkt)}</td>
                <td>{a.anlagennummer}<br />{a.maschine}</td>
                <td>{a.werk}</td>
                <td>{a.beschreibung}</td>
                <td><span className={prioKlasse(a.prioritaet)}>{a.prioritaet}</span></td>
                <td><span className={statusKlasse(a.status)}>{a.status}</span></td>
                <td>{a.techniker ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Rahmen>
  );
}
