/**
 * app/api/nachrichten/route.js – Chat der gewählten Person (Seite „Mitarbeiter“ und Seitenleiste)
 *
 *  GET /api/nachrichten            → { ungelesen }                 (rote Zahl in der Seitenleiste)
 *  GET /api/nachrichten?liste=1    → { ungelesen, gespraeche }      (Gespräche mit letzter Nachricht)
 *  GET /api/nachrichten?mit=<id>   → { ungelesen, nachrichten }     (Verlauf mit einer Person, letzte 200)
 *
 * Ohne gewählte Person gibt es keine Nachrichten ({ ungelesen: 0, ohnePerson: true }).
 * Gelesen markiert wird über die Server-Aktion nachrichtenGelesen (app/aktionen.js).
 */
import { sql } from '@/lib/db';
import { aktuellerBenutzer } from '@/lib/auth';
import { aktuellePerson } from '@/lib/person';

export const dynamic = 'force-dynamic';

export async function GET(anfrage) {
  if (!(await aktuellerBenutzer())) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
  const ich = await aktuellePerson();
  if (!ich) return Response.json({ ungelesen: 0, ohnePerson: true });

  const parameter = new URL(anfrage.url).searchParams;
  const mit = Number(parameter.get('mit'));
  const [{ ungelesen }] = await sql`SELECT COUNT(*)::int AS ungelesen FROM nachricht WHERE an_id = ${ich.id} AND gelesen_am IS NULL`;
  const antwort = { ungelesen, ich: ich.id };

  if (parameter.get('liste')) {
    // Je Gesprächspartner die letzte Nachricht und die Zahl ungelesener
    antwort.gespraeche = await sql`
      SELECT DISTINCT ON (partner) partner AS id, p.name, p.rolle::text AS rolle, st.name AS standort,
             n.text, n.zeitpunkt, n.von_id = ${ich.id} AS von_mir,
             (SELECT COUNT(*)::int FROM nachricht u WHERE u.an_id = ${ich.id} AND u.von_id = partner AND u.gelesen_am IS NULL) AS ungelesen
      FROM (SELECT *, CASE WHEN von_id = ${ich.id} THEN an_id ELSE von_id END AS partner
            FROM nachricht WHERE von_id = ${ich.id} OR an_id = ${ich.id}) n
      JOIN person p ON p.id = partner
      LEFT JOIN standort st ON st.id = p.standort_id
      ORDER BY partner, n.zeitpunkt DESC`;
    antwort.gespraeche.sort((a, b) => new Date(b.zeitpunkt) - new Date(a.zeitpunkt));
  } else if (Number.isInteger(mit) && mit > 0) {
    antwort.nachrichten = (await sql`
      SELECT id, von_id, text, zeitpunkt, gelesen_am FROM nachricht
      WHERE (von_id = ${ich.id} AND an_id = ${mit}) OR (von_id = ${mit} AND an_id = ${ich.id})
      ORDER BY zeitpunkt DESC, id DESC LIMIT 200`).reverse();
  }
  return Response.json(antwort, { headers: { 'Cache-Control': 'no-store' } });
}
