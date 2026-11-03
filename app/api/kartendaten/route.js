/**
 * app/api/kartendaten/route.js – alle Daten der Störungskarte als JSON
 *
 * Für das kleine Kartenfenster auf der Übersicht (components/FavoritKachel.js): Es lädt die Daten erst im
 * Browser, wenn ein Favorit gewählt ist – so bleibt die Übersicht bei höchstens 5 Abfragen gleichzeitig.
 * Beachtet die Ansicht aus dem Konto (nur ein Land bzw. Werk). Nur für angemeldete Benutzer.
 */
import { aktuellerBenutzer } from '@/lib/auth';
import { ansichtAusCookie } from '@/lib/ansicht';
import { alleKartenDaten, nachAnsicht } from '@/lib/karten/daten';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await aktuellerBenutzer())) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
  const [daten, ansicht] = await Promise.all([alleKartenDaten(), ansichtAusCookie()]);
  return Response.json(nachAnsicht(daten, ansicht));
}
