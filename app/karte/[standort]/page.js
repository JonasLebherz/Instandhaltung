/**
 * app/karte/[standort]/page.js – alte Adresse eines Werks (z. B. /karte/ham)
 *
 * Die Störungskarte ist jetzt eine einzige Seite mit Zoom (app/karte/page.js).
 * Alte Links und Lesezeichen funktionieren weiter: Sie werden auf
 * /karte?werk=ham umgeleitet.
 */
import { redirect } from 'next/navigation';
import { benutzerPflicht } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AlteWerksAdresse({ params }) {
  await benutzerPflicht();
  const { standort } = await params;
  redirect(`/karte?werk=${encodeURIComponent(String(standort).toLowerCase())}`);
}
