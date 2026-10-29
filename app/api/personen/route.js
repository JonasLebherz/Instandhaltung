/**
 * app/api/personen/route.js – Liste aller Personen für die Auswahl im Konto
 * (Seitenleiste → Konto → Person wechseln). Nur für angemeldete Benutzer.
 */
import { sql } from '@/lib/db';
import { aktuellerBenutzer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await aktuellerBenutzer())) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
  const personen = await sql`
    SELECT p.id, p.name, p.rolle::text AS rolle, st.stadt, st.name AS standort, t.qualifikation
    FROM person p
    LEFT JOIN standort st  ON st.id = p.standort_id
    LEFT JOIN techniker t  ON t.id = p.techniker_id
    ORDER BY st.name NULLS LAST, p.rolle, p.name`;
  return Response.json({ personen });
}
