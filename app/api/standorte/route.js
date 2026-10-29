/**
 * app/api/standorte/route.js – Länder und Werke für die Einstellung "Ansicht"
 * (Seitenleiste → Konto). Nur für angemeldete Benutzer.
 */
import { sql } from '@/lib/db';
import { aktuellerBenutzer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await aktuellerBenutzer())) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
  const standorte = await sql`
    SELECT st.id, st.name, st.land_kuerzel AS land, l.name AS land_name
    FROM standort st JOIN land l ON l.kuerzel = st.land_kuerzel
    ORDER BY l.hauptsitz DESC, l.name, st.name`;
  return Response.json({ standorte });
}
