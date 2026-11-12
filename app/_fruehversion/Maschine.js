/**
 * app/_fruehversion/Maschine.js – eine Maschine mit Stammdaten, Kennzahlen (12 Monate) und Historie
 * (Versionen 2 und 3). Kennzahlen wie in den Views: MTTR = Ø (Ende − Beginn), Ausfallzeit = Σ (Ende − Meldung).
 * 3 Abfragen gleichzeitig.
 */
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { idAus } from '@/lib/eingabe';
import { datumZeit, dauer, zahl } from '@/lib/format';
import Rahmen, { pfad, prioKlasse, statusKlasse, LeereZeile } from './Rahmen';

export default async function Maschine({ version, params }) {
  await benutzerPflicht();
  const id = idAus((await params).id);
  if (!id) notFound();
  const [[m], [k], historie] = await Promise.all([
    sql`SELECT m.*, m.typ::text AS typ, g.bezeichnung AS gebaeude, st.name AS werk
        FROM maschine m JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id WHERE m.id = ${id}`,
    sql`SELECT COUNT(*)::int AS stoerungen,
               AVG(EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 60) FILTER (WHERE w.status = 'erledigt')::float AS mttr_min,
               SUM(EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 3600) FILTER (WHERE w.status = 'erledigt')::float AS ausfall_h
        FROM stoermeldung s JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
        WHERE s.maschine_id = ${id} AND s.zeitpunkt > now() - interval '12 months'`,
    sql`SELECT w.id, s.zeitpunkt, s.beschreibung, s.prioritaet::text AS prioritaet, w.status::text AS status, w.massnahme
        FROM stoermeldung s JOIN wartungsauftrag w ON w.stoermeldung_id = s.id WHERE s.maschine_id = ${id} ORDER BY s.zeitpunkt DESC`,
  ]);
  if (!m) notFound();
  return (
    <Rahmen version={version} titel={`${m.anlagennummer} – ${m.bezeichnung}`} emoji="⚙️">
      <p><a href={pfad(version, '/maschinen')}>« alle Maschinen</a> · <a href={pfad(version, `/melden?maschine=${m.id}`)}>Störung melden</a></p>
      <table className="fv-tabelle">
        <tbody>
          <tr><th>Typ</th><td>{m.typ}</td></tr>
          <tr><th>Baujahr</th><td>{m.baujahr}</td></tr>
          <tr><th>Ort</th><td>{m.werk}, {m.gebaeude}</td></tr>
          <tr><th>Störungen (12 Monate)</th><td>{k.stoerungen}</td></tr>
          <tr><th>MTTR</th><td>{dauer(k.mttr_min)}</td></tr>
          <tr><th>Ausfallzeit</th><td>{zahl(k.ausfall_h ?? 0, 1)} h</td></tr>
        </tbody>
      </table>
      <h2>Historie</h2>
      <div className="fv-breit">
        <table className="fv-tabelle">
          <thead><tr><th>Auftrag</th><th>Gemeldet</th><th>Beschreibung</th><th>Priorität</th><th>Status</th><th>Maßnahme</th></tr></thead>
          <tbody>
            {historie.length === 0 && <LeereZeile spalten={6} />}
            {historie.map((h) => (
              <tr key={h.id}>
                <td><a href={pfad(version, `/auftraege/${h.id}`)}>{h.id}</a></td><td>{datumZeit(h.zeitpunkt)}</td><td>{h.beschreibung}</td>
                <td><span className={prioKlasse(h.prioritaet)}>{h.prioritaet}</span></td><td><span className={statusKlasse(h.status)}>{h.status}</span></td>
                <td>{h.massnahme ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Rahmen>
  );
}
