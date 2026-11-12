/**
 * app/_fruehversion/Auftrag.js – ein Auftrag mit Bearbeitung und Teilebuchung (Versionen 2 und 3)
 * Formulare speichern über auftragSpeichernFrueh bzw. teilBuchenFrueh (gleiche Regeln wie die App).
 * 4 Abfragen gleichzeitig.
 */
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { idAus } from '@/lib/eingabe';
import { STATUS_WERTE } from '@/lib/konstanten';
import { datumZeit, fuerDatetimeInput, dauer } from '@/lib/format';
import { auftragSpeichernFrueh, teilBuchenFrueh } from '@/app/aktionen';
import Rahmen, { pfad, prioKlasse, statusKlasse, LeereZeile } from './Rahmen';

export default async function Auftrag({ version, params }) {
  await benutzerPflicht();
  const id = idAus((await params).id);
  if (!id) notFound();
  const [[a], teile, verlauf, ersatzteile] = await Promise.all([
    sql`SELECT w.id, w.techniker_id, w.status::text AS status, w.start_zeit, w.ende_zeit, w.massnahme,
               s.id AS meldung_id, s.zeitpunkt, s.gemeldet_von, s.beschreibung, s.ursache_kategorie::text AS ursache, s.prioritaet::text AS prioritaet,
               m.id AS maschine_id, m.anlagennummer, m.bezeichnung AS maschine, g.bezeichnung AS gebaeude, st.name AS werk, st.id AS standort_id,
               (SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name) FROM techniker t WHERE t.standort_id = st.id) AS techniker
        FROM wartungsauftrag w JOIN stoermeldung s ON s.id = w.stoermeldung_id
        JOIN maschine m ON m.id = s.maschine_id JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id
        WHERE w.id = ${id}`,
    sql`SELECT e.bezeichnung, ae.menge FROM auftrag_ersatzteil ae JOIN ersatzteil e ON e.id = ae.ersatzteil_id WHERE ae.auftrag_id = ${id} ORDER BY e.bezeichnung`,
    sql`SELECT v.zeitpunkt, v.aktion, v.details, p.name FROM auftrag_verlauf v LEFT JOIN person p ON p.id = v.person_id WHERE v.auftrag_id = ${id} ORDER BY v.zeitpunkt`,
    sql`SELECT id, bezeichnung FROM ersatzteil ORDER BY bezeichnung`,
  ]);
  if (!a) notFound();
  const reparatur = a.start_zeit && a.ende_zeit ? Math.round((a.ende_zeit - a.start_zeit) / 60000) : null;

  return (
    <Rahmen version={version} titel={`Auftrag Nr. ${a.id}`} emoji="🔧">
      <p><a href={pfad(version, '/auftraege')}>« zurück zu den Aufträgen</a></p>
      <table className="fv-tabelle">
        <tbody>
          <tr><th>Maschine</th><td><a href={pfad(version, `/maschinen/${a.maschine_id}`)}>{a.anlagennummer} – {a.maschine}</a></td></tr>
          <tr><th>Ort</th><td>{a.werk}, {a.gebaeude}</td></tr>
          <tr><th>Gemeldet</th><td>{datumZeit(a.zeitpunkt)} von {a.gemeldet_von}</td></tr>
          <tr><th>Beschreibung</th><td>{a.beschreibung}</td></tr>
          <tr><th>Ursache</th><td>{a.ursache}</td></tr>
          <tr><th>Priorität</th><td><span className={prioKlasse(a.prioritaet)}>{a.prioritaet}</span></td></tr>
          <tr><th>Status</th><td><span className={statusKlasse(a.status)} id="fv-status">{a.status}</span></td></tr>
          {reparatur !== null && <tr><th>Reparaturdauer</th><td>{dauer(reparatur)}</td></tr>}
        </tbody>
      </table>

      <h2>Bearbeiten</h2>
      <form action={auftragSpeichernFrueh} className="fv-formular">
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="auftrag_id" value={a.id} />
        <label htmlFor="techniker_id">Techniker</label>
        <select id="techniker_id" name="techniker_id" defaultValue={a.techniker_id ?? ''}>
          <option value="">– keiner –</option>
          {(a.techniker ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={a.status}>
          {STATUS_WERTE.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label htmlFor="start_zeit">Arbeitsbeginn</label>
        <input type="datetime-local" id="start_zeit" name="start_zeit" defaultValue={fuerDatetimeInput(a.start_zeit)} />
        <label htmlFor="ende_zeit">Ende (bei „erledigt“)</label>
        <input type="datetime-local" id="ende_zeit" name="ende_zeit" defaultValue={fuerDatetimeInput(a.ende_zeit)} />
        <label htmlFor="massnahme">Maßnahme</label>
        <textarea id="massnahme" name="massnahme" rows={4} maxLength={2000} defaultValue={a.massnahme ?? ''} />
        <div><button type="submit" className="fv-knopf" id="fv-speichern">Speichern</button></div>
      </form>

      <h2>Ersatzteile</h2>
      <table className="fv-tabelle">
        <thead><tr><th>Teil</th><th>Menge</th></tr></thead>
        <tbody>
          {teile.length === 0 && <LeereZeile spalten={2} text="Noch keine Teile gebucht." />}
          {teile.map((t) => <tr key={t.bezeichnung}><td>{t.bezeichnung}</td><td>{t.menge}</td></tr>)}
        </tbody>
      </table>
      <form action={teilBuchenFrueh} className="fv-formular fv-zeile">
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="auftrag_id" value={a.id} />
        <select name="ersatzteil_id" aria-label="Ersatzteil" defaultValue="">
          <option value="">– Ersatzteil –</option>
          {ersatzteile.map((e) => <option key={e.id} value={e.id}>{e.bezeichnung}</option>)}
        </select>
        <input type="number" name="menge" min={1} max={999} defaultValue={1} aria-label="Menge" />
        <button type="submit" className="fv-knopf">Teil buchen</button>
      </form>

      <h2>Verlauf</h2>
      <table className="fv-tabelle">
        <thead><tr><th>Zeit</th><th>Aktion</th><th>Details</th><th>Person</th></tr></thead>
        <tbody>
          <tr><td>{datumZeit(a.zeitpunkt)}</td><td>gemeldet</td><td>Störmeldung Nr. {a.meldung_id}</td><td>{a.gemeldet_von}</td></tr>
          {verlauf.filter((v) => v.aktion !== 'gemeldet').map((v, i) => (
            <tr key={i}><td>{datumZeit(v.zeitpunkt)}</td><td>{v.aktion}</td><td>{v.details ?? ''}</td><td>{v.name ?? '–'}</td></tr>
          ))}
        </tbody>
      </table>
    </Rahmen>
  );
}
