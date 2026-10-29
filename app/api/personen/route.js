/**
 * app/api/personen/route.js – Liste aller Personen für die Auswahl im Konto
 * (Seitenleiste → Konto → Person wechseln). Nur für angemeldete Benutzer.
 */
import { sql } from '@/lib/db';
import { aktuellerBenutzer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await aktuellerBenutzer())) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
  try {
    const personen = await sql`
      SELECT p.id, p.name, p.rolle::text AS rolle, st.stadt, st.name AS standort, t.qualifikation,
             l.name AS land, COALESCE(l.hauptsitz, false) AS hauptsitz,
             -- Offene Aufträge, die dem Techniker der Person zugewiesen sind (nur Instandhaltung)
             (SELECT COUNT(*)::int FROM wartungsauftrag w
              WHERE w.techniker_id = p.techniker_id AND w.status <> 'erledigt') AS offene_auftraege
      FROM person p
      LEFT JOIN standort st  ON st.id = p.standort_id
      LEFT JOIN land l       ON l.kuerzel = st.land_kuerzel
      LEFT JOIN techniker t  ON t.id = p.techniker_id
      ORDER BY hauptsitz DESC, l.name NULLS LAST, st.name NULLS LAST, p.rolle, p.name`;
    return Response.json({ personen });
  } catch (fehler) {
    // Häufigste Ursache: Die Migration mit der Tabelle "person" wurde in Supabase noch nicht ausgeführt
    const fehltTabelle = fehler.code === '42P01' || fehler.code === '42703';
    return Response.json({ fehler: fehltTabelle ? 'migration' : 'datenbank' }, { status: 500 });
  }
}
