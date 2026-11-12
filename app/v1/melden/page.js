/**
 * app/v1/melden/page.js – Version 1: Formular „Störung melden“ als gewöhnliches HTML-Formular
 *
 * Aufbau wie früher üblich: Beschriftung links, Feld rechts (Tabelle), Pflichtfelder mit Stern,
 * Knöpfe „Absenden“ und „Zurücksetzen“. Gespeichert wird über die Server-Aktion meldungAnlegenV1.
 * Bei Fehlern leitet sie hierher zurück: ?fehler=maschine,text… und die bisherigen Eingaben stehen
 * in der Adresse, damit nichts neu getippt werden muss. 1 Abfrage.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { URSACHEN_LISTE, PRIORITAET_WERTE } from '@/lib/konstanten';
import { meldungAnlegenV1 } from '@/app/aktionen';
import Rahmen from '../Rahmen';

export const dynamic = 'force-dynamic';
export const metadata = { title: { absolute: 'Störung melden – Instandhaltung Version 1' } };

/** Texte zu den Kennwörtern, die meldungAnlegenV1 bei Fehlern in die Adresse schreibt */
const FEHLERTEXTE = {
  maschine: 'Bitte eine Maschine auswählen.',
  von: 'Bitte den Namen angeben (höchstens 100 Zeichen).',
  text: 'Bitte die Störung beschreiben (10 bis 1000 Zeichen).',
  ursache: 'Bitte eine Ursache auswählen.',
  prio: 'Bitte eine Priorität auswählen.',
  speichern: 'Die Meldung konnte nicht gespeichert werden. Bitte erneut versuchen.',
};

export default async function V1Melden({ searchParams }) {
  await benutzerPflicht();
  const q = await searchParams;
  const text = (name) => (typeof q[name] === 'string' ? q[name] : '');
  const fehler = text('fehler').split(',').filter((f) => FEHLERTEXTE[f]);

  // Alle Maschinen für die Auswahlliste, gruppiert nach Werk
  const maschinen = await sql`
    SELECT m.id, m.anlagennummer, m.bezeichnung, st.name AS werk
    FROM maschine m
    JOIN gebaeude g ON g.id = m.gebaeude_id
    JOIN standort st ON st.id = g.standort_id
    ORDER BY st.name, m.anlagennummer`;
  const werke = [];
  for (const m of maschinen) {
    if (werke.at(-1)?.name !== m.werk) werke.push({ name: m.werk, maschinen: [] });
    werke.at(-1).maschinen.push(m);
  }

  return (
    <Rahmen titel="Störung melden">
      {fehler.length > 0 && (
        <div id="v1-fehler" className="v1-fehler">
          <b>Die Meldung wurde nicht gespeichert:</b>
          <ul>{fehler.map((f) => <li key={f}>{FEHLERTEXTE[f]}</li>)}</ul>
        </div>
      )}
      <p>Felder mit <span className="v1-rot">*</span> sind Pflichtfelder.</p>

      <form action={meldungAnlegenV1}>
        <table className="v1-formular">
          <tbody>
            <tr>
              <td><label htmlFor="maschine_id">Maschine <span className="v1-rot">*</span></label></td>
              <td>
                <select id="maschine_id" name="maschine_id" defaultValue={text('maschine')}>
                  <option value="">-- bitte wählen --</option>
                  {werke.map((w) => (
                    <optgroup key={w.name} label={w.name}>
                      {w.maschinen.map((m) => <option key={m.id} value={m.id}>{m.anlagennummer} – {m.bezeichnung}</option>)}
                    </optgroup>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <td><label htmlFor="gemeldet_von">Gemeldet von <span className="v1-rot">*</span></label></td>
              <td><input type="text" id="gemeldet_von" name="gemeldet_von" size={40} maxLength={100} defaultValue={text('von')} /></td>
            </tr>
            <tr>
              <td><label htmlFor="beschreibung">Beschreibung <span className="v1-rot">*</span></label></td>
              <td><textarea id="beschreibung" name="beschreibung" rows={6} cols={50} maxLength={1000} defaultValue={text('text')} /></td>
            </tr>
            <tr>
              <td><label htmlFor="ursache_kategorie">Ursache <span className="v1-rot">*</span></label></td>
              <td>
                <select id="ursache_kategorie" name="ursache_kategorie" defaultValue={text('ursache')}>
                  <option value="">-- bitte wählen --</option>
                  {URSACHEN_LISTE.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </td>
            </tr>
            <tr>
              <td>Priorität <span className="v1-rot">*</span></td>
              <td>
                {PRIORITAET_WERTE.map((p) => (
                  <label key={p} className="v1-radio">
                    <input type="radio" name="prioritaet" value={p} defaultChecked={(text('prio') || 'mittel') === p} /> {p}
                  </label>
                ))}
              </td>
            </tr>
            <tr>
              <td />
              <td>
                <button type="submit" id="v1-absenden">Absenden</button>{' '}
                <button type="reset">Zurücksetzen</button>
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    </Rahmen>
  );
}
