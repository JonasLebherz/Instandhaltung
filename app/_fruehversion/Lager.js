/**
 * app/_fruehversion/Lager.js – Lager je Werk als Tabelle (Versionen 2 und 3)
 * Werk wählen per GET-Formular (?werk=<id>), ohne Wahl das Werk der Person bzw. das erste Werk.
 * Nachbestellen (teilNachbestellen) und Wareneingang (lieferungBuchen) wie in der App. 3 Abfragen.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { idAus } from '@/lib/eingabe';
import { aktuellePerson } from '@/lib/person';
import { datum } from '@/lib/format';
import { teilNachbestellen, lieferungBuchen } from '@/app/aktionen';
import Rahmen, { LeereZeile } from './Rahmen';

export default async function Lager({ version, searchParams }) {
  await benutzerPflicht();
  const [werke, person] = await Promise.all([sql`SELECT id, name FROM standort ORDER BY name`, aktuellePerson()]);
  const gewuenscht = idAus((await searchParams).werk);
  const werkId = werke.some((w) => w.id === gewuenscht) ? gewuenscht : (person?.standort_id ?? werke[0]?.id);
  const [teile, bestellungen] = await Promise.all([
    sql`SELECT l.ersatzteil_id AS id, e.bezeichnung, l.bestand, l.mindestbestand, l.lagerplatz,
               EXISTS (SELECT 1 FROM bestellung b WHERE b.ersatzteil_id = l.ersatzteil_id AND b.standort_id = l.standort_id AND b.status = 'bestellt') AS bestellt
        FROM lagerbestand l JOIN ersatzteil e ON e.id = l.ersatzteil_id WHERE l.standort_id = ${werkId} ORDER BY l.lagerplatz NULLS LAST, e.bezeichnung`,
    sql`SELECT b.id, e.bezeichnung, b.menge, b.bestelldatum FROM bestellung b JOIN ersatzteil e ON e.id = b.ersatzteil_id
        WHERE b.standort_id = ${werkId} AND b.status = 'bestellt' ORDER BY b.bestelldatum`,
  ]);
  const zurueck = `/${version}/lager?werk=${werkId}`;
  return (
    <Rahmen version={version} titel="Lager" emoji="📦">
      <form method="get" action={`/${version}/lager`} className="fv-zeile">
        <label htmlFor="werk">Werk: </label>
        <select id="werk" name="werk" defaultValue={werkId}>
          {werke.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button type="submit" className="fv-knopf fv-klein">Anzeigen</button>
      </form>

      <h2>Bestand ({teile.length} Teile)</h2>
      <div className="fv-breit">
        <table className="fv-tabelle" id="fv-lager">
          <thead><tr><th>Platz</th><th>Ersatzteil</th><th>Bestand</th><th>Mindestbestand</th><th>Zustand</th><th>Nachbestellen</th></tr></thead>
          <tbody>
            {teile.length === 0 && <LeereZeile spalten={6} />}
            {teile.map((t) => (
              <tr key={t.id} className={t.bestand < t.mindestbestand ? 'fv-knapp' : undefined}>
                <td>{t.lagerplatz ?? '–'}</td><td>{t.bezeichnung}</td><td>{t.bestand}</td><td>{t.mindestbestand}</td>
                <td>{t.bestand < t.mindestbestand ? 'zu wenig' : 'ok'}{t.bestellt && ' (bestellt)'}</td>
                <td>
                  {!t.bestellt && (
                    <form action={teilNachbestellen} className="fv-zeile">
                      <input type="hidden" name="version" value={version} />
                      <input type="hidden" name="ersatzteil_id" value={t.id} />
                      <input type="hidden" name="standort_id" value={werkId} />
                      <input type="number" name="menge" min={1} max={999} defaultValue={Math.max(1, t.mindestbestand * 2 - t.bestand)} aria-label="Menge" />
                      <button type="submit" className="fv-knopf fv-klein">Bestellen</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Offene Bestellungen</h2>
      <table className="fv-tabelle" id="fv-bestellungen">
        <thead><tr><th>Teil</th><th>Menge</th><th>Bestellt am</th><th /></tr></thead>
        <tbody>
          {bestellungen.length === 0 && <LeereZeile spalten={4} />}
          {bestellungen.map((b) => (
            <tr key={b.id}>
              <td>{b.bezeichnung}</td><td>{b.menge}</td><td>{datum(b.bestelldatum)}</td>
              <td>
                <form action={lieferungBuchen}>
                  <input type="hidden" name="bestellung_id" value={b.id} />
                  <input type="hidden" name="zurueck" value={zurueck} />
                  <button type="submit" className="fv-knopf fv-klein">Wareneingang buchen</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Rahmen>
  );
}
