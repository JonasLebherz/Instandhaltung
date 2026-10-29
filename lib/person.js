/**
 * lib/person.js – Als welche Person arbeitet man gerade?
 *
 * Im Team sind nur wenige echte Konten. Damit man die Abläufe trotzdem aus
 * Sicht verschiedener Personen ausprobieren kann, wählt man unten in der
 * Seitenleiste (Konto) eine fiktive Person aus der Tabelle "person":
 *   - Produktion:      meldet Störungen
 *   - Schichtleitung:  weist Techniker zu, behält das eigene Werk im Blick
 *   - Instandhaltung:  bearbeitet die eigenen Aufträge (ist mit einem Techniker verbunden)
 *
 * Die Wahl steht im Cookie "person" als JSON { id, name, rolle, stadt } – die
 * Seitenleiste zeigt daraus Name und Rolle ohne Datenbankabfrage an.
 * Für alles, was gespeichert wird, zählt nur die ID: Sie wird hier mit der
 * Datenbank abgeglichen, die übrigen Angaben im Cookie werden nicht geglaubt.
 */
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';

/** Rohdaten aus dem Cookie (nur zur Anzeige) oder null */
export async function personAusCookie() {
  try {
    const roh = (await cookies()).get('person')?.value ?? 'null';
    // Das Cookie ist URL-kodiert gespeichert (siehe components/PersonWahl.js)
    const wert = JSON.parse(roh.startsWith('%') ? decodeURIComponent(roh) : roh);
    return wert && Number.isInteger(wert.id) ? wert : null;
  } catch {
    return null;
  }
}

/** Die gewählte Person aus der Datenbank – oder null, wenn keine (gültige) gewählt ist */
export const aktuellePerson = cache(async () => {
  const auswahl = await personAusCookie();
  if (!auswahl) return null;
  const [person] = await sql`
    SELECT p.id, p.name, p.rolle::text AS rolle, p.standort_id, p.techniker_id, st.name AS standort, st.stadt
    FROM person p LEFT JOIN standort st ON st.id = p.standort_id
    WHERE p.id = ${auswahl.id}`;
  return person ?? null;
});

/** Darf die Person Aufträge bearbeiten? (Ohne gewählte Person: ja – sonst könnte man ohne Wahl nichts tun.) */
export function darfBearbeiten(person) {
  return !person || person.rolle !== 'Produktion';
}
