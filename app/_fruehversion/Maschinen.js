/**
 * app/_fruehversion/Maschinen.js – alle Maschinen als Tabelle mit Zustand (Versionen 2 und 3). 1 Abfrage.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import Rahmen, { pfad } from './Rahmen';

/** Zustand wie die Ampel der App: höchste offene Priorität → Text */
export const ZUSTAND = { hoch: 'Stillstand', mittel: 'Störung', niedrig: 'kleine Störung' };

export default async function Maschinen({ version }) {
  await benutzerPflicht();
  const maschinen = await sql`
    SELECT m.id, m.anlagennummer, m.bezeichnung, m.typ::text AS typ, m.baujahr, g.kuerzel AS halle, st.name AS werk,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt')::int AS offen,
           MAX(s.prioritaet) FILTER (WHERE w.status <> 'erledigt')::text AS hoechste
    FROM maschine m JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id
    LEFT JOIN stoermeldung s ON s.maschine_id = m.id LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    GROUP BY m.id, g.kuerzel, st.name ORDER BY st.name, m.anlagennummer`;
  return (
    <Rahmen version={version} titel="Maschinen" emoji="⚙️">
      <p id="fv-anzahl">{maschinen.length} Maschinen</p>
      <div className="fv-breit">
        <table className="fv-tabelle">
          <thead><tr><th>Anlage</th><th>Bezeichnung</th><th>Typ</th><th>Baujahr</th><th>Werk</th><th>Halle</th><th>Zustand</th><th>Offen</th><th /></tr></thead>
          <tbody>
            {maschinen.map((m) => (
              <tr key={m.id}>
                <td><a href={pfad(version, `/maschinen/${m.id}`)}>{m.anlagennummer}</a></td>
                <td>{m.bezeichnung}</td><td>{m.typ}</td><td>{m.baujahr}</td><td>{m.werk}</td><td>{m.halle}</td>
                <td><span className={`fv-badge fv-prio-${m.hoechste ?? 'keine'}`}>{ZUSTAND[m.hoechste] ?? 'läuft'}</span></td>
                <td>{m.offen}</td>
                <td><a href={pfad(version, `/melden?maschine=${m.id}`)}>melden</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Rahmen>
  );
}
