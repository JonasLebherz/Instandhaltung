/**
 * app/_fruehversion/Mitarbeiter.js – alle Personen als Tabelle (Versionen 2 und 3), ohne Chat und Filter.
 * Bei Instandhaltung: offene und (12 Monate) erledigte Aufträge ihres Technikers. 1 Abfrage.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import Rahmen from './Rahmen';

export default async function Mitarbeiter({ version }) {
  await benutzerPflicht();
  const personen = await sql`
    SELECT p.id, p.name, p.rolle::text AS rolle, st.name AS werk, t.qualifikation, t.schicht::text AS schicht,
           (SELECT COUNT(*)::int FROM wartungsauftrag w WHERE w.techniker_id = p.techniker_id AND w.status <> 'erledigt') AS offen,
           (SELECT COUNT(*)::int FROM wartungsauftrag w WHERE w.techniker_id = p.techniker_id AND w.status = 'erledigt' AND w.ende_zeit > now() - interval '12 months') AS erledigt
    FROM person p LEFT JOIN standort st ON st.id = p.standort_id LEFT JOIN techniker t ON t.id = p.techniker_id
    ORDER BY st.name, p.rolle, p.name`;
  return (
    <Rahmen version={version} titel="Mitarbeiter" emoji="👥">
      <p>{personen.length} Personen</p>
      <div className="fv-breit">
        <table className="fv-tabelle" id="fv-mitarbeiter">
          <thead><tr><th>Name</th><th>Rolle</th><th>Werk</th><th>Qualifikation</th><th>Schicht</th><th>Aufträge offen</th><th>erledigt (12 Mon.)</th></tr></thead>
          <tbody>
            {personen.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td><span className={`fv-badge fv-rolle-${p.rolle.toLowerCase()}`}>{p.rolle}</span></td><td>{p.werk ?? '–'}</td>
                <td>{p.qualifikation ?? '–'}</td><td>{p.schicht ?? '–'}</td>
                <td>{p.rolle === 'Instandhaltung' ? p.offen : '–'}</td><td>{p.rolle === 'Instandhaltung' ? p.erledigt : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Rahmen>
  );
}
