/**
 * app/karte/[standort]/[gebaeude]/page.js – alte Adresse eines Gebäudes (z. B. /karte/ham/h2)
 *
 * Leitet auf die Zoom-Karte um: /karte?werk=ham&halle=h2 (und ggf. &maschine=12).
 */
import { redirect } from 'next/navigation';
import { benutzerPflicht } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AlteGebaeudeAdresse({ params, searchParams }) {
  await benutzerPflicht();
  const { standort, gebaeude } = await params;
  const { maschine } = await searchParams;
  const ziel = new URLSearchParams({ werk: String(standort).toLowerCase(), halle: String(gebaeude).toLowerCase() });
  if (/^\d+$/.test(String(maschine ?? ''))) ziel.set('maschine', String(maschine));
  redirect(`/karte?${ziel}`);
}
