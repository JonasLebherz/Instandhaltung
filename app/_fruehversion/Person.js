/**
 * app/_fruehversion/Person.js – Person wählen (Versionen 2 und 3): als welche Person man arbeitet.
 * Gleiches Cookie wie die App (personWaehlenFrueh), d. h. die Wahl gilt auch dort. 2 Abfragen.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { aktuellePerson } from '@/lib/person';
import { personWaehlenFrueh } from '@/app/aktionen';
import Rahmen from './Rahmen';

export default async function Person({ version }) {
  await benutzerPflicht();
  const [personen, ich] = await Promise.all([
    sql`SELECT p.id, p.name, p.rolle::text AS rolle, st.name AS werk FROM person p LEFT JOIN standort st ON st.id = p.standort_id ORDER BY st.name, p.rolle, p.name`,
    aktuellePerson(),
  ]);
  const werke = [];
  for (const p of personen) {
    if (werke.at(-1)?.name !== p.werk) werke.push({ name: p.werk ?? 'ohne Werk', personen: [] });
    werke.at(-1).personen.push(p);
  }
  return (
    <Rahmen version={version} titel="Person wählen" emoji="👤">
      <p>Produktion darf Störungen melden, aber keine Aufträge bearbeiten. Schichtleitung und Instandhaltung dürfen alles.</p>
      <form action={personWaehlenFrueh} className="fv-formular">
        <input type="hidden" name="version" value={version} />
        <label htmlFor="person_id">Person</label>
        <select id="person_id" name="person_id" defaultValue={ich?.id ?? ''}>
          <option value="">– keine Person –</option>
          {werke.map((w) => (
            <optgroup key={w.name} label={w.name}>
              {w.personen.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rolle})</option>)}
            </optgroup>
          ))}
        </select>
        <div><button type="submit" className="fv-knopf" id="fv-person-speichern">Übernehmen</button></div>
      </form>
    </Rahmen>
  );
}
