/**
 * lib/ansicht.js – Ansicht auf ein Land oder Werk beschränken
 *
 * Unten in der Seitenleiste (Konto → Ansicht) kann man einstellen, dass immer
 * nur ein Land oder ein Werk angezeigt wird. Standard: alles.
 * Die Wahl steht im Cookie "ansicht" als JSON { land: 'DE', werk: 8 }
 * (components/AnsichtWahl.js). Sie wirkt auf Übersicht, Aufträge, die Zahl in
 * der Seitenleiste und den Start von Karte, Statistik und Melden.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';

/** Gewählte Ansicht: { land: 'DE' | null, standortId: Zahl | null } – ungültige Werte werden ignoriert */
export async function ansichtAusCookie() {
  try {
    const roh = (await cookies()).get('ansicht')?.value ?? '{}';
    const wert = JSON.parse(roh.startsWith('%') ? decodeURIComponent(roh) : roh) ?? {};
    return {
      land: /^[A-Z]{2}$/.test(wert.land ?? '') ? wert.land : null,
      standortId: Number.isInteger(wert.werk) ? wert.werk : null,
    };
  } catch {
    return { land: null, standortId: null };
  }
}

/** SQL-Bedingung für die Ansicht. Die Abfrage muss die Tabelle standort als "st" enthalten. */
export function ansichtBedingung(ansicht) {
  if (ansicht.standortId) return sql`st.id = ${ansicht.standortId}`;
  if (ansicht.land) return sql`st.land_kuerzel = ${ansicht.land}`;
  return sql`TRUE`;
}

/** Ist die Ansicht eingeschränkt? */
export const ansichtAktiv = (ansicht) => Boolean(ansicht.land || ansicht.standortId);
