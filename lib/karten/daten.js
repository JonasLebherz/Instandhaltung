/**
 * lib/karten/daten.js – Datenbankabfragen für die Störungskarte
 *
 * Aufbau: Standort (Werk) → Gebäude → Maschine. Zu jeder Ebene wird gezählt,
 * wie viele Aufträge noch offen sind (Status ≠ "erledigt") und welche die
 * höchste Priorität darunter ist – daraus ergeben sich Zahl und Farbe auf der Karte.
 *
 * MAX(prioritaet) funktioniert, weil der Datentyp "prioritaet" geordnet ist
 * (niedrig < mittel < hoch, siehe supabase/schema.sql).
 */
import 'server-only';
import { sql } from '@/lib/db';

/** Alle Standorte mit Anzahl offener Aufträge, Gebäude und Maschinen */
export function standorteMitZahlen() {
  return sql`
    SELECT st.id, st.kuerzel, st.name, st.stadt, st.adresse, st.schwerpunkt, st.breitengrad, st.laengengrad,
           st.gelaende_breite_m, st.gelaende_tiefe_m,
           COUNT(DISTINCT g.id)::int                                           AS gebaeude,
           COUNT(DISTINCT m.id)::int                                           AS maschinen,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt')::int              AS offen,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt' AND s.prioritaet = 'hoch')::int AS hoch,
           MAX(s.prioritaet) FILTER (WHERE w.status <> 'erledigt')::text      AS hoechste_prioritaet
    FROM standort st
    LEFT JOIN gebaeude g        ON g.standort_id = st.id
    LEFT JOIN maschine m        ON m.gebaeude_id = g.id
    LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
    LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    GROUP BY st.id
    ORDER BY st.id`;
}

/** Ein Standort anhand seines Kürzels (z. B. "ham" oder "HAM") */
export async function standortNachKuerzel(kuerzel) {
  const [standort] = await sql`
    SELECT id, kuerzel, name, stadt, adresse, schwerpunkt, breitengrad, laengengrad,
           gelaende_breite_m, gelaende_tiefe_m
    FROM standort WHERE kuerzel = ${String(kuerzel).toUpperCase()}`;
  return standort ?? null;
}

/** Gebäude (alle oder die eines Standorts) mit Lage und Anzahl offener Aufträge */
export function gebaeudeMitZahlen(standortId = null) {
  const filter = standortId === null ? sql`TRUE` : sql`g.standort_id = ${standortId}`;
  return sql`
    SELECT g.id, g.standort_id, g.kuerzel, g.bezeichnung, g.lage_x_m, g.lage_y_m, g.breite_m, g.tiefe_m, g.bereiche,
           COUNT(DISTINCT m.id)::int                                           AS maschinen,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt')::int              AS offen,
           MAX(s.prioritaet) FILTER (WHERE w.status <> 'erledigt')::text      AS hoechste_prioritaet
    FROM gebaeude g
    LEFT JOIN maschine m        ON m.gebaeude_id = g.id
    LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
    LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    WHERE ${filter}
    GROUP BY g.id
    ORDER BY g.standort_id, g.kuerzel`;
}

/** Ein Gebäude eines Standorts anhand der Kürzel, inkl. Raumaufteilung für den Grundriss */
export async function gebaeudeNachKuerzel(standortId, kuerzel) {
  const [gebaeude] = await sql`
    SELECT id, standort_id, kuerzel, bezeichnung, breite_m, tiefe_m, bereiche
    FROM gebaeude WHERE standort_id = ${standortId} AND kuerzel = ${String(kuerzel).toUpperCase()}`;
  return gebaeude ?? null;
}

/**
 * Maschinen (alle oder die eines Gebäudes) mit Position im Grundriss,
 * Anzahl offener Aufträge und Störungen der letzten 12 Monate
 */
export function maschinenMitZahlen(gebaeudeId = null) {
  const filter = gebaeudeId === null ? sql`TRUE` : sql`m.gebaeude_id = ${gebaeudeId}`;
  return sql`
    SELECT m.id, m.gebaeude_id, m.anlagennummer, m.bezeichnung, m.typ::text AS typ, m.baujahr,
           m.pos_x_m, m.pos_y_m, m.breite_m, m.tiefe_m,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt')::int              AS offen,
           MAX(s.prioritaet) FILTER (WHERE w.status <> 'erledigt')::text      AS hoechste_prioritaet,
           COUNT(s.id) FILTER (WHERE s.zeitpunkt >= now() - interval '12 months')::int AS stoerungen_12m
    FROM maschine m
    LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
    LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    WHERE ${filter}
    GROUP BY m.id
    ORDER BY m.anlagennummer`;
}

/** Offene Aufträge eines Gebäudes oder Standorts (für die Seitenleiste) */
export function offeneAuftraege({ gebaeudeId = null, standortId = null }) {
  const filter = gebaeudeId !== null ? sql`m.gebaeude_id = ${gebaeudeId}`
    : standortId !== null ? sql`g.standort_id = ${standortId}` : sql`TRUE`;
  return sql`
    SELECT w.id AS auftrag_id, w.status, s.zeitpunkt, s.beschreibung, s.prioritaet::text AS prioritaet,
           m.id AS maschine_id, m.bezeichnung AS maschine, m.anlagennummer, g.kuerzel AS gebaeude_kuerzel,
           t.name AS techniker
    FROM wartungsauftrag w
    JOIN stoermeldung s   ON s.id = w.stoermeldung_id
    JOIN maschine m       ON m.id = s.maschine_id
    JOIN gebaeude g       ON g.id = m.gebaeude_id
    LEFT JOIN techniker t ON t.id = w.techniker_id
    WHERE w.status <> 'erledigt' AND ${filter}
    ORDER BY s.prioritaet DESC, s.zeitpunkt DESC`;
}
