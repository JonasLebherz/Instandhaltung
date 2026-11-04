/**
 * app/api/fotos/[id]/route.js – liefert ein Foto einer Störmeldung aus der Datenbank
 *
 * Nur für angemeldete Benutzer. Die Bilder ändern sich nie (neue Fotos bekommen eine neue ID),
 * deshalb darf der Browser sie lange zwischenspeichern (privat, nicht in fremden Caches).
 */
import { sql } from '@/lib/db';
import { aktuellerBenutzer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(anfrage, { params }) {
  if (!(await aktuellerBenutzer())) return new Response('Nicht angemeldet', { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response('Nicht gefunden', { status: 404 });
  const [foto] = await sql`SELECT datei, mime FROM stoermeldung_foto WHERE id = ${Number(id)}`;
  if (!foto) return new Response('Nicht gefunden', { status: 404 });
  return new Response(foto.datei, {
    headers: { 'Content-Type': foto.mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Disposition': 'inline' },
  });
}
