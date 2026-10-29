/**
 * app/api/offene-auftraege/route.js – Anzahl offener Aufträge (für die Seitenleiste)
 *
 * Die Seitenleiste holt die Zahl selbst, nachdem die Seite angezeigt wird.
 * So wartet keine Seite auf diese Abfrage; ist die Datenbank langsam, fehlt nur kurz die Zahl.
 */
import { sql } from '@/lib/db';
import { aktuellerBenutzer } from '@/lib/auth';
import { ansichtAusCookie, ansichtBedingung } from '@/lib/ansicht';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await aktuellerBenutzer())) {
    return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
  }
  // Nur Aufträge der gewählten Ansicht (Konto → Ansicht), Standard: alle
  const ansicht = await ansichtAusCookie();
  const [{ anzahl }] = await sql`
    SELECT COUNT(*)::int AS anzahl
    FROM wartungsauftrag w
    JOIN stoermeldung s ON s.id = w.stoermeldung_id
    JOIN maschine m     ON m.id = s.maschine_id
    JOIN gebaeude g     ON g.id = m.gebaeude_id
    JOIN standort st    ON st.id = g.standort_id
    WHERE w.status <> 'erledigt' AND ${ansichtBedingung(ansicht)}`;
  return Response.json({ anzahl });
}
