/**
 * app/_fruehversion/Statistik.js – Auswertung der letzten 12 Monate (Versionen 2 und 3)
 * Version 2: nur Tabellen. Version 3: zusätzlich Diagramme (Balken.js, Chart.js-Standard).
 * Definitionen wie in den Views: MTTR = Ø (Ende − Beginn) erledigter Aufträge,
 * Ausfallzeit = Σ (Ende − Meldung) erledigter Aufträge. 5 Abfragen gleichzeitig.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { dauer, zahl, euro } from '@/lib/format';
import Rahmen from './Rahmen';
import Balken from './Balken';

// Gemeinsamer Zeitraum: die letzten 12 Monate
const ZEITRAUM = sql`s.zeitpunkt > now() - interval '12 months'`;
const MTTR = sql`AVG(EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 60) FILTER (WHERE w.status = 'erledigt')::float`;
const AUSFALL = sql`COALESCE(SUM(EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 3600) FILTER (WHERE w.status = 'erledigt'), 0)::float`;

export default async function Statistik({ version }) {
  await benutzerPflicht();
  const [[gesamt], monate, ursachen, prioritaeten, werke] = await Promise.all([
    sql`SELECT COUNT(*)::int AS anzahl, ${MTTR} AS mttr_min, ${AUSFALL} AS ausfall_h,
               COALESCE(SUM(EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 3600 * m.kosten_pro_stunde) FILTER (WHERE w.status = 'erledigt'), 0)::float AS kosten
        FROM stoermeldung s JOIN wartungsauftrag w ON w.stoermeldung_id = s.id JOIN maschine m ON m.id = s.maschine_id WHERE ${ZEITRAUM}`,
    sql`SELECT to_char(date_trunc('month', s.zeitpunkt AT TIME ZONE 'Europe/Berlin'), 'MM/YYYY') AS monat, COUNT(*)::int AS anzahl, ${MTTR} AS mttr_min
        FROM stoermeldung s JOIN wartungsauftrag w ON w.stoermeldung_id = s.id WHERE ${ZEITRAUM}
        GROUP BY date_trunc('month', s.zeitpunkt AT TIME ZONE 'Europe/Berlin') ORDER BY date_trunc('month', s.zeitpunkt AT TIME ZONE 'Europe/Berlin')`,
    sql`SELECT s.ursache_kategorie::text AS ursache, COUNT(*)::int AS anzahl FROM stoermeldung s WHERE ${ZEITRAUM} GROUP BY 1 ORDER BY 2 DESC`,
    sql`SELECT s.prioritaet::text AS prioritaet, COUNT(*)::int AS anzahl FROM stoermeldung s WHERE ${ZEITRAUM} GROUP BY s.prioritaet ORDER BY s.prioritaet DESC`,
    sql`SELECT st.name AS werk, COUNT(*)::int AS anzahl, COUNT(*) FILTER (WHERE w.status <> 'erledigt')::int AS offen, ${MTTR} AS mttr_min, ${AUSFALL} AS ausfall_h
        FROM stoermeldung s JOIN wartungsauftrag w ON w.stoermeldung_id = s.id JOIN maschine m ON m.id = s.maschine_id
        JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id WHERE ${ZEITRAUM}
        GROUP BY st.name ORDER BY anzahl DESC`,
  ]);
  const v3 = version === 'v3';
  return (
    <Rahmen version={version} titel="Statistik (letzte 12 Monate)" emoji="📊">
      <table className="fv-tabelle fv-kennzahlen" id="fv-statistik">
        <tbody>
          <tr><th>Störungen</th><td className="fv-zahl" data-kennzahl="Störungen">{gesamt.anzahl}</td></tr>
          <tr><th>MTTR (Ø Reparaturdauer)</th><td className="fv-zahl">{dauer(gesamt.mttr_min)}</td></tr>
          <tr><th>Ausfallzeit</th><td className="fv-zahl">{zahl(gesamt.ausfall_h, 0)} h</td></tr>
          <tr><th>Ausfallkosten (Richtwert)</th><td className="fv-zahl">{euro(gesamt.kosten)}</td></tr>
        </tbody>
      </table>

      <h2>Störungen pro Monat</h2>
      {v3 && <Balken titel="Störungen pro Monat" labels={monate.map((m) => m.monat)} werte={monate.map((m) => m.anzahl)} />}
      <table className="fv-tabelle">
        <thead><tr><th>Monat</th><th>Störungen</th><th>MTTR</th></tr></thead>
        <tbody>{monate.map((m) => <tr key={m.monat}><td>{m.monat}</td><td>{m.anzahl}</td><td>{dauer(m.mttr_min)}</td></tr>)}</tbody>
      </table>

      <div className="fv-spalten">
        <div>
          <h2>Nach Ursache</h2>
          {v3 && <Balken art="pie" titel="Störungen nach Ursache" labels={ursachen.map((u) => u.ursache)} werte={ursachen.map((u) => u.anzahl)} />}
          <table className="fv-tabelle">
            <thead><tr><th>Ursache</th><th>Anzahl</th></tr></thead>
            <tbody>{ursachen.map((u) => <tr key={u.ursache}><td>{u.ursache}</td><td>{u.anzahl}</td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h2>Nach Priorität</h2>
          {v3 && <Balken art="doughnut" titel="Störungen nach Priorität" labels={prioritaeten.map((p) => p.prioritaet)} werte={prioritaeten.map((p) => p.anzahl)} />}
          <table className="fv-tabelle">
            <thead><tr><th>Priorität</th><th>Anzahl</th><th>Anteil</th></tr></thead>
            <tbody>{prioritaeten.map((p) => <tr key={p.prioritaet}><td>{p.prioritaet}</td><td>{p.anzahl}</td><td>{zahl((p.anzahl / Math.max(1, gesamt.anzahl)) * 100, 1)} %</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <h2>Je Werk</h2>
      {v3 && <Balken titel="Störungen je Werk" labels={werke.map((w) => w.werk)} werte={werke.map((w) => w.anzahl)} />}
      <div className="fv-breit">
        <table className="fv-tabelle">
          <thead><tr><th>Werk</th><th>Störungen</th><th>davon offen</th><th>MTTR</th><th>Ausfallzeit</th></tr></thead>
          <tbody>{werke.map((w) => <tr key={w.werk}><td>{w.werk}</td><td>{w.anzahl}</td><td>{w.offen}</td><td>{dauer(w.mttr_min)}</td><td>{zahl(w.ausfall_h, 0)} h</td></tr>)}</tbody>
        </table>
      </div>
    </Rahmen>
  );
}
