/**
 * lib/karten/daten.js – Datenbankabfragen für die Störungskarte
 *
 * Aufbau: Land → Standort (Werk) → Gebäude → Maschine. Die Länder ergeben sich aus
 * den Werken (lib/karten/laender.js → laenderAus), deshalb gibt es dafür keine eigene Abfrage. Zu jeder Ebene wird gezählt,
 * wie viele Aufträge noch offen sind (Status ≠ "erledigt") und welche die
 * höchste Priorität darunter ist – daraus ergeben sich Zahl und Farbe auf der Karte.
 *
 * MAX(prioritaet) funktioniert, weil der Datentyp "prioritaet" geordnet ist
 * (niedrig < mittel < hoch, siehe supabase/schema.sql).
 *
 * Die Karte lädt alle Ebenen auf einmal (alleKartenDaten ganz unten). Bei
 * 19 Standorten, gut 50 Gebäuden und gut 200 Maschinen sind das nur wenige Kilobyte.
 */
import 'server-only';
import { sql } from '@/lib/db';

/** Alle Standorte mit Anzahl offener Aufträge, Gebäude und Maschinen */
export function standorteMitZahlen() {
  return sql`
    SELECT st.id, st.kuerzel, st.name, st.stadt, st.adresse, st.schwerpunkt, st.breitengrad, st.laengengrad,
           st.gelaende_breite_m, st.gelaende_tiefe_m,
           st.land_kuerzel AS land, l.name AS land_name, l.hauptsitz,
           COUNT(DISTINCT g.id)::int                                           AS gebaeude,
           COUNT(DISTINCT m.id)::int                                           AS maschinen,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt')::int              AS offen,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt' AND s.prioritaet = 'hoch')::int AS hoch,
           MAX(s.prioritaet) FILTER (WHERE w.status <> 'erledigt')::text      AS hoechste_prioritaet
    FROM standort st
    JOIN land l                 ON l.kuerzel = st.land_kuerzel
    LEFT JOIN gebaeude g        ON g.standort_id = st.id
    LEFT JOIN maschine m        ON m.gebaeude_id = g.id
    LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
    LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    GROUP BY st.id, l.kuerzel
    ORDER BY st.id`;
}

/** Alle Gebäude mit Lage, Raumaufteilung (bereiche) und Anzahl offener Aufträge */
export function gebaeudeMitZahlen() {
  return sql`
    SELECT g.id, g.standort_id, g.kuerzel, g.bezeichnung, g.lage_x_m, g.lage_y_m, g.breite_m, g.tiefe_m, g.bereiche,
           COUNT(DISTINCT m.id)::int                                           AS maschinen,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt')::int              AS offen,
           MAX(s.prioritaet) FILTER (WHERE w.status <> 'erledigt')::text      AS hoechste_prioritaet
    FROM gebaeude g
    LEFT JOIN maschine m        ON m.gebaeude_id = g.id
    LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
    LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    GROUP BY g.id
    ORDER BY g.standort_id, g.kuerzel`;
}

/**
 * Alle Maschinen mit Position im Grundriss,
 * Anzahl offener Aufträge und Störungen der letzten 12 Monate
 */
export function maschinenMitZahlen() {
  return sql`
    SELECT m.id, m.gebaeude_id, m.anlagennummer, m.bezeichnung, m.typ::text AS typ, m.baujahr,
           m.pos_x_m, m.pos_y_m, m.breite_m, m.tiefe_m,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt')::int              AS offen,
           MAX(s.prioritaet) FILTER (WHERE w.status <> 'erledigt')::text      AS hoechste_prioritaet,
           COUNT(s.id) FILTER (WHERE s.zeitpunkt >= now() - interval '12 months')::int AS stoerungen_12m
    FROM maschine m
    LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
    LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    GROUP BY m.id
    ORDER BY m.anlagennummer`;
}

/** Alle offenen Aufträge – dringendste zuerst (für die Info-Spalte neben der Karte) */
export function offeneAuftraege() {
  return sql`
    SELECT w.id AS auftrag_id, w.status, s.zeitpunkt, s.beschreibung, s.prioritaet::text AS prioritaet,
           m.id AS maschine_id, m.bezeichnung AS maschine, m.anlagennummer, g.kuerzel AS gebaeude_kuerzel,
           m.gebaeude_id, g.standort_id,
           t.name AS techniker
    FROM wartungsauftrag w
    JOIN stoermeldung s   ON s.id = w.stoermeldung_id
    JOIN maschine m       ON m.id = s.maschine_id
    JOIN gebaeude g       ON g.id = m.gebaeude_id
    LEFT JOIN techniker t ON t.id = w.techniker_id
    WHERE w.status <> 'erledigt'
    ORDER BY s.prioritaet DESC, s.zeitpunkt DESC`;
}

/**
 * Kartendaten auf die Ansicht aus dem Konto beschränken (lib/ansicht.js):
 * nur das gewählte Land bzw. Werk – mit seinen Gebäuden, Maschinen, offenen Aufträgen und Technikern.
 */
export function nachAnsicht(daten, ansicht) {
  if (!ansicht?.land && !ansicht?.standortId) return daten;
  const standorte = daten.standorte.filter((st) => (ansicht.standortId ? st.id === ansicht.standortId : st.land === ansicht.land));
  const ids = new Set(standorte.map((st) => st.id));
  const gebaeude = (daten.gebaeude ?? []).filter((g) => ids.has(g.standort_id));
  const gebaeudeIds = new Set(gebaeude.map((g) => g.id));
  return {
    ...daten,
    standorte,
    gebaeude,
    maschinen: (daten.maschinen ?? []).filter((m) => gebaeudeIds.has(m.gebaeude_id)),
    offene: (daten.offene ?? []).filter((a) => ids.has(a.standort_id)),
    techniker: (daten.techniker ?? []).filter((x) => ids.has(x.standort_id)),
  };
}

/**
 * Alles, was der Karten-Explorer braucht, in einem Rutsch. Danach läuft das
 * Hinein- und Herauszoomen komplett im Browser – ohne weitere Ladezeiten.
 */
export async function alleKartenDaten() {
  const [standorte, gebaeude, maschinen, offene, techniker] = await Promise.all([
    standorteMitZahlen(),
    gebaeudeMitZahlen(),
    maschinenMitZahlen(),
    offeneAuftraege(),
    sql`SELECT id, standort_id, name, qualifikation, schicht::text AS schicht FROM techniker ORDER BY name`,
  ]);
  return { standorte, gebaeude, maschinen, offene, techniker };
}
