/**
 * lib/wartung.js – Wartungspläne (vorbeugende Wartung) mit Fälligkeit
 *
 * Fällig ist eine Wartung am Tag der letzten Durchführung + Intervall; wurde sie noch nie
 * durchgeführt, am Startdatum. Datumswerte kommen als Text 'JJJJ-MM-TT' (keine Zeitzonen-Fallen).
 * Benutzt von der Seite „Wartungsplan“ (app/wartung) und der Maschinen-Seite.
 */
import 'server-only';
import { sql } from '@/lib/db';

/** Alle aktiven Pläne mit Maschine, Werk und Fälligkeit. bedingung: sql-Baustein (Tabellen m, g, st) */
export function wartungsplaene(bedingung = sql`TRUE`) {
  return sql`
    SELECT p.id, p.aufgabe, p.intervall_tage, p.dauer_min,
           m.id AS maschine_id, m.anlagennummer, m.bezeichnung AS maschine, m.typ::text AS typ,
           g.kuerzel AS gebaeude_kuerzel, st.id AS standort_id, st.name AS standort, st.kuerzel AS standort_kuerzel,
           st.land_kuerzel AS land,
           to_char(d.letzte, 'YYYY-MM-DD') AS letzte,
           to_char(COALESCE(d.letzte + p.intervall_tage, p.start_datum), 'YYYY-MM-DD') AS faellig,
           (COALESCE(d.letzte + p.intervall_tage, p.start_datum) - current_date)::int AS tage_bis
    FROM wartungsplan p
    JOIN maschine m  ON m.id = p.maschine_id
    JOIN gebaeude g  ON g.id = m.gebaeude_id
    JOIN standort st ON st.id = g.standort_id
    LEFT JOIN LATERAL (SELECT MAX(datum) AS letzte FROM wartung_durchfuehrung WHERE plan_id = p.id) d ON TRUE
    WHERE p.aktiv AND ${bedingung}
    ORDER BY tage_bis, st.name, m.anlagennummer`;
}
