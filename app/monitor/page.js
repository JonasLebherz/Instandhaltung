/**
 * app/monitor/page.js – Hallen-Monitor: alle Maschinen einer Halle auf einen Blick
 *
 * Gedacht für einen großen Bildschirm in der Produktion: große Kacheln mit Ampelfarbe,
 * offenen Störungen (seit wann) und fälligen Wartungen. Die Seitenleiste ist ausgeblendet,
 * die Daten laden sich alle 30 Sekunden neu (MonitorAnsicht.js). Aufruf: /monitor?werk=alb&halle=h1
 * (Link „Hallen-Monitor“ in der Störungskarte, Info-Spalte einer Halle). 2 Abfragen.
 */
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { seitentitel } from '@/lib/sprache/server';
import MonitorAnsicht from './MonitorAnsicht';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Hallen-Monitor');

export default async function MonitorSeite({ searchParams }) {
  await benutzerPflicht();
  const q = await searchParams;
  const werk = typeof q.werk === 'string' ? q.werk.toUpperCase().slice(0, 10) : '';
  const halle = typeof q.halle === 'string' ? q.halle.toUpperCase().slice(0, 10) : '';

  const [[ort], maschinen] = await Promise.all([
    sql`
      SELECT g.id, g.kuerzel, g.bezeichnung, st.name AS standort, st.stadt, st.kuerzel AS werk, st.land_kuerzel AS land
      FROM gebaeude g JOIN standort st ON st.id = g.standort_id
      WHERE st.kuerzel = ${werk} AND g.kuerzel = ${halle}`,
    // Je Maschine: offene Störungen, höchste Priorität, älteste offene Meldung, überfällige Wartungen
    sql`
      SELECT m.id, m.anlagennummer, m.bezeichnung, m.typ::text AS typ,
             COUNT(w.id) FILTER (WHERE w.status <> 'erledigt')::int AS offen,
             COUNT(w.id) FILTER (WHERE w.status <> 'erledigt' AND s.prioritaet = 'hoch')::int AS hoch,
             COUNT(w.id) FILTER (WHERE w.status <> 'erledigt' AND s.prioritaet = 'mittel')::int AS mittel,
             COUNT(w.id) FILTER (WHERE w.status <> 'erledigt' AND s.prioritaet = 'niedrig')::int AS niedrig,
             MAX(s.prioritaet) FILTER (WHERE w.status <> 'erledigt')::text AS hoechste_prioritaet,
             MIN(s.zeitpunkt) FILTER (WHERE w.status <> 'erledigt') AS seit,
             (SELECT w2.status::text FROM stoermeldung s2 JOIN wartungsauftrag w2 ON w2.stoermeldung_id = s2.id
              WHERE s2.maschine_id = m.id AND w2.status <> 'erledigt' ORDER BY s2.prioritaet DESC, s2.zeitpunkt LIMIT 1) AS status,
             (SELECT COUNT(*)::int FROM wartungsplan p
              LEFT JOIN LATERAL (SELECT MAX(datum) AS letzte FROM wartung_durchfuehrung WHERE plan_id = p.id) d ON TRUE
              WHERE p.maschine_id = m.id AND p.aktiv AND COALESCE(d.letzte + p.intervall_tage, p.start_datum) <= current_date) AS wartung_faellig
      FROM maschine m
      JOIN gebaeude g  ON g.id = m.gebaeude_id
      JOIN standort st ON st.id = g.standort_id
      LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
      LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
      WHERE st.kuerzel = ${werk} AND g.kuerzel = ${halle}
      GROUP BY m.id
      ORDER BY m.anlagennummer`,
  ]);
  if (!ort) notFound();

  return (
    <MonitorAnsicht ort={ort} maschinen={maschinen.map((m) => ({ ...m, seit: m.seit?.toISOString() ?? null }))}
                    stand={new Date().toISOString()} />
  );
}
