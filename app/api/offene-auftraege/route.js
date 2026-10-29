/**
 * app/api/offene-auftraege/route.js – Anzahl offener Aufträge (für die Seitenleiste)
 *
 * Die Seitenleiste holt die Zahl selbst, nachdem die Seite angezeigt wird.
 * So wartet keine Seite auf diese Abfrage; ist die Datenbank langsam, fehlt nur kurz die Zahl.
 */
import { sql } from '@/lib/db';
import { aktuellerBenutzer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await aktuellerBenutzer())) {
    return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
  }
  const [{ anzahl }] = await sql`SELECT COUNT(*)::int AS anzahl FROM wartungsauftrag WHERE status <> 'erledigt'`;
  return Response.json({ anzahl });
}
