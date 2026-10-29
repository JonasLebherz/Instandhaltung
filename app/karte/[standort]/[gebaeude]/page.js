/**
 * app/karte/[standort]/[gebaeude]/page.js – Störungskarte, Ebene 3: ein Gebäude
 *
 * Aufruf z. B. /karte/ham/h2 (optional ?maschine=<id>, um eine Maschine
 * direkt zu markieren). Zeigt den Grundriss mit allen Maschinen; die
 * Auswahl einer Maschine und die Seitenleiste steuert GebaeudeAnsicht.js.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { benutzerPflicht } from '@/lib/auth';
import { standortNachKuerzel, gebaeudeNachKuerzel, maschinenMitZahlen, offeneAuftraege } from '@/lib/karten/daten';
import GebaeudeAnsicht from './GebaeudeAnsicht';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { standort, gebaeude } = await params;
  return { title: `${String(standort).toUpperCase()} · ${String(gebaeude).toUpperCase()}` };
}

export default async function GebaeudeSeite({ params, searchParams }) {
  await benutzerPflicht();
  const { standort: standortKuerzel, gebaeude: gebaeudeKuerzel } = await params;
  const parameter = await searchParams;

  const standort = await standortNachKuerzel(standortKuerzel);
  if (!standort) notFound();
  const gebaeude = await gebaeudeNachKuerzel(standort.id, gebaeudeKuerzel);
  if (!gebaeude) notFound();

  const [maschinen, offene] = await Promise.all([
    maschinenMitZahlen(gebaeude.id),
    offeneAuftraege({ gebaeudeId: gebaeude.id }),
  ]);
  const vorauswahl = maschinen.find((m) => String(m.id) === String(parameter?.maschine ?? ''))?.id ?? null;
  const offenGesamt = offene.length;

  return (
    <>
      <nav className="brotkrumen" aria-label="Pfad">
        <Link href="/karte"><i className="bi bi-map" aria-hidden="true" /> Deutschland</Link>
        <i className="bi bi-chevron-right" aria-hidden="true" />
        <Link href={`/karte/${standort.kuerzel.toLowerCase()}`}>{standort.name}</Link>
        <i className="bi bi-chevron-right" aria-hidden="true" />
        <span aria-current="page">{gebaeude.bezeichnung}</span>
      </nav>
      <div className="seitenkopf">
        <h1>{gebaeude.bezeichnung}</h1>
        <p>
          {standort.name} · {maschinen.length} Maschinen · {gebaeude.breite_m} × {gebaeude.tiefe_m} m ·{' '}
          {offenGesamt === 0 ? 'keine offenen Störungen' : `${offenGesamt} offene ${offenGesamt === 1 ? 'Störung' : 'Störungen'}`}
        </p>
      </div>

      <GebaeudeAnsicht gebaeude={gebaeude} maschinen={maschinen} offene={offene} vorauswahl={vorauswahl} />
    </>
  );
}
