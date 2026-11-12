/**
 * app/_fruehversion/Wartung.js – Wartungsplan als Liste nach Fälligkeit (Versionen 2 und 3)
 * Fälligkeit aus lib/wartung.js (letzte Durchführung + Intervall). „Erledigt“ über wartungErledigenFrueh.
 * Gezeigt: überfällige und die nächsten 30 Tage. 1 Abfrage.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { wartungsplaene } from '@/lib/wartung';
import { wartungErledigenFrueh } from '@/app/aktionen';
import Rahmen, { pfad } from './Rahmen';

export default async function Wartung({ version }) {
  await benutzerPflicht();
  const plaene = (await wartungsplaene(sql`TRUE`)).filter((p) => p.tage_bis <= 30);
  return (
    <Rahmen version={version} titel="Wartungsplan" emoji="📅">
      <p>Überfällige Wartungen und alle in den nächsten 30 Tagen ({plaene.length}).</p>
      <div className="fv-breit">
        <table className="fv-tabelle">
          <thead><tr><th>Fällig</th><th>Maschine</th><th>Werk</th><th>Aufgabe</th><th>Intervall</th><th>Dauer</th><th>Zuletzt</th><th /></tr></thead>
          <tbody>
            {plaene.map((p) => (
              <tr key={p.id} className={p.tage_bis < 0 ? 'fv-ueberfaellig' : undefined}>
                <td>{p.faellig.split('-').reverse().join('.')}{p.tage_bis < 0 && <b> (überfällig)</b>}</td>
                <td><a href={pfad(version, `/maschinen/${p.maschine_id}`)}>{p.anlagennummer}</a> {p.maschine}</td>
                <td>{p.standort}</td>
                <td>{p.aufgabe}</td>
                <td>{p.intervall_tage} Tage</td>
                <td>{p.dauer_min >= 480 ? `${Math.ceil(p.dauer_min / 480)} Arbeitstage` : `${p.dauer_min} Min.`}</td>
                <td>{p.letzte ? p.letzte.split('-').reverse().join('.') : '–'}</td>
                <td>
                  <form action={wartungErledigenFrueh}>
                    <input type="hidden" name="version" value={version} />
                    <input type="hidden" name="plan_id" value={p.id} />
                    <button type="submit" className="fv-knopf fv-klein">Erledigt</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Rahmen>
  );
}
