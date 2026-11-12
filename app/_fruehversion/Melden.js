/**
 * app/_fruehversion/Melden.js – Störung melden (Versionen 2 und 3)
 * Gewöhnliches HTML-Formular, gespeichert mit meldungAnlegenV1 (Feld „version“ führt zurück).
 * Fehler und bisherige Eingaben kommen über die Adresse zurück (?fehler=…). 2 Abfragen.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { aktuellePerson } from '@/lib/person';
import { URSACHEN_LISTE, PRIORITAET_WERTE } from '@/lib/konstanten';
import { meldungAnlegenV1 } from '@/app/aktionen';
import Rahmen from './Rahmen';

const FEHLERTEXTE = {
  maschine: 'Bitte eine Maschine auswählen.',
  von: 'Bitte den Namen angeben (höchstens 100 Zeichen).',
  text: 'Bitte die Störung beschreiben (10 bis 1000 Zeichen).',
  ursache: 'Bitte eine Ursache auswählen.',
  prio: 'Bitte eine Priorität auswählen.',
  speichern: 'Die Meldung konnte nicht gespeichert werden. Bitte erneut versuchen.',
};

export default async function Melden({ version, searchParams }) {
  await benutzerPflicht();
  const q = await searchParams;
  const text = (name) => (typeof q[name] === 'string' ? q[name] : '');
  const fehler = text('fehler').split(',').filter((f) => FEHLERTEXTE[f]);
  const [maschinen, person] = await Promise.all([
    sql`SELECT m.id, m.anlagennummer, m.bezeichnung, st.name AS werk
        FROM maschine m JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id
        ORDER BY st.name, m.anlagennummer`,
    aktuellePerson(),
  ]);
  const werke = [];
  for (const m of maschinen) {
    if (werke.at(-1)?.name !== m.werk) werke.push({ name: m.werk, maschinen: [] });
    werke.at(-1).maschinen.push(m);
  }
  return (
    <Rahmen version={version} titel="Störung melden" emoji="🚨">
      {fehler.length > 0 && (
        <div className="fv-hinweis fv-hinweis-fehler" id="fv-fehler">
          Die Meldung wurde nicht gespeichert:
          <ul>{fehler.map((f) => <li key={f}>{FEHLERTEXTE[f]}</li>)}</ul>
        </div>
      )}
      <form action={meldungAnlegenV1} className="fv-formular">
        <input type="hidden" name="version" value={version} />
        <label htmlFor="maschine_id">Maschine *</label>
        <select id="maschine_id" name="maschine_id" defaultValue={text('maschine')}>
          <option value="">– bitte wählen –</option>
          {werke.map((w) => (
            <optgroup key={w.name} label={w.name}>
              {w.maschinen.map((m) => <option key={m.id} value={m.id}>{m.anlagennummer} – {m.bezeichnung}</option>)}
            </optgroup>
          ))}
        </select>
        <label htmlFor="gemeldet_von">Gemeldet von *</label>
        <input type="text" id="gemeldet_von" name="gemeldet_von" maxLength={100} defaultValue={text('von') || person?.name || ''} />
        <label htmlFor="beschreibung">Beschreibung *</label>
        <textarea id="beschreibung" name="beschreibung" rows={5} maxLength={1000} defaultValue={text('text')} />
        <label htmlFor="ursache_kategorie">Ursache *</label>
        <select id="ursache_kategorie" name="ursache_kategorie" defaultValue={text('ursache')}>
          <option value="">– bitte wählen –</option>
          {URSACHEN_LISTE.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <label htmlFor="prioritaet">Priorität *</label>
        <select id="prioritaet" name="prioritaet" defaultValue={text('prio') || 'mittel'}>
          {PRIORITAET_WERTE.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div><button type="submit" id="fv-absenden" className="fv-knopf">Meldung absenden</button></div>
      </form>
    </Rahmen>
  );
}
