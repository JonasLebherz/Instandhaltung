/**
 * app/v1/maschinen/page.js – Version 1: Liste der Maschinen als einfache Tabelle
 *
 * Auswahl des Werks über ein gewöhnliches Formular (GET): Die Wahl steht danach in der Adresse
 * (?werk=<id>). Ohne Wahl werden alle Maschinen gezeigt. 2 Abfragen.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { idAus } from '@/lib/eingabe';
import Rahmen from '../Rahmen';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Maschinen – Instandhaltung Version 1' } };

export default async function V1Maschinen({ searchParams }) {
  await benutzerPflicht();
  const werkId = idAus((await searchParams).werk);   // nur echte Nummern (lib/eingabe.js)

  const [werke, maschinen] = await Promise.all([
    sql`SELECT id, name FROM standort ORDER BY name`,
    sql`
      SELECT m.id, m.anlagennummer, m.bezeichnung, m.typ, m.baujahr,
             g.bezeichnung AS gebaeude, st.name AS werk
      FROM maschine m
      JOIN gebaeude g ON g.id = m.gebaeude_id
      JOIN standort st ON st.id = g.standort_id
      ${werkId ? sql`WHERE st.id = ${werkId}` : sql``}
      ORDER BY st.name, m.anlagennummer`,
  ]);

  return (
    <Rahmen titel="Maschinen">
      <form action="/v1/maschinen" method="get">
        <label htmlFor="werk">Werk: </label>
        <select id="werk" name="werk" defaultValue={werkId ?? ''}>
          <option value="">(alle Werke)</option>
          {werke.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>{' '}
        <button type="submit">Anzeigen</button>
      </form>

      <p id="v1-anzahl">{maschinen.length} Datensätze gefunden.</p>
      <div className="v1-breit">
        <table className="v1-tabelle">
          <thead>
            <tr>
              <th>ID</th><th>Anlagennummer</th><th>Bezeichnung</th><th>Typ</th><th>Baujahr</th><th>Werk</th><th>Gebäude</th><th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {maschinen.map((m) => (
              <tr key={m.id}>
                <td align="right">{m.id}</td>
                <td>{m.anlagennummer}</td>
                <td>{m.bezeichnung}</td>
                <td>{m.typ}</td>
                <td>{m.baujahr}</td>
                <td>{m.werk}</td>
                <td>{m.gebaeude}</td>
                <td><a href={`/v1/melden?maschine=${m.id}`}>Störung melden</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Rahmen>
  );
}
