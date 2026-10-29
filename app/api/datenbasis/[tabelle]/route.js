/**
 * app/api/datenbasis/[tabelle]/route.js – Vorschau der Datensätze einer Tabelle
 *
 * Aufruf: /api/datenbasis/maschine?seite=2  → 25 Datensätze (Seite 2)
 * Nur lesend und nur für angemeldete Benutzer. Der Tabellenname wird mit der
 * Liste aus der Datenbank verglichen – andere Namen werden abgelehnt.
 */
import { sql } from '@/lib/db';
import { aktuellerBenutzer } from '@/lib/auth';
import { tabellenNamen } from '@/lib/datenbasis';

export const dynamic = 'force-dynamic';
const PRO_SEITE = 25;

/** Werte für die Anzeige vorbereiten: lange Texte kürzen, Objekte als Text */
function kurz(wert) {
  if (wert === null || wert === undefined) return null;
  if (wert instanceof Date) return wert.toISOString();
  const text = typeof wert === 'object' ? JSON.stringify(wert) : String(wert);
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

export async function GET(anfrage, { params }) {
  if (!(await aktuellerBenutzer())) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });

  const { tabelle } = await params;
  if (!(await tabellenNamen()).includes(tabelle)) return Response.json({ fehler: 'Unbekannte Tabelle' }, { status: 404 });

  const seite = Math.max(1, Math.min(10000, Number.parseInt(new URL(anfrage.url).searchParams.get('seite') ?? '1', 10) || 1));
  // ORDER BY 1 DESC: nach der ersten Spalte (meist die ID), neueste zuerst
  const [zeilen, [{ anzahl }]] = await Promise.all([
    sql`SELECT * FROM ${sql(tabelle)} ORDER BY 1 DESC LIMIT ${PRO_SEITE} OFFSET ${(seite - 1) * PRO_SEITE}`,
    sql`SELECT COUNT(*)::int AS anzahl FROM ${sql(tabelle)}`,
  ]);
  return Response.json({
    tabelle, seite, proSeite: PRO_SEITE, anzahl,
    spalten: zeilen.columns.map((s) => s.name),
    zeilen: zeilen.map((z) => zeilen.columns.map((s) => kurz(z[s.name]))),
  });
}
