/**
 * app/status/route.js – Verbindungstest (Adresse: /status)
 *
 * Misst, wie lange Login-Prüfung und Datenbank brauchen, und zeigt die
 * Regionen von Server und Datenbank. Hilft, langsame Ladezeiten einzugrenzen.
 * Zeigt keine Zugangsdaten – nur Region, Port und Zeiten.
 * Nur für angemeldete Benutzer (die Middleware schickt alle anderen zum Login).
 */
import { sql } from '@/lib/db';
import { aktuellerBenutzer } from '@/lib/auth';
import { alleKartenDaten } from '@/lib/karten/daten';

export const dynamic = 'force-dynamic';

/** Führt eine Aufgabe aus und liefert die Dauer in Millisekunden (oder den Fehler) */
async function messen(aufgabe) {
  const start = Date.now();
  try {
    await aufgabe();
    return `${Date.now() - start} ms`;
  } catch (fehler) {
    return `FEHLER nach ${Date.now() - start} ms: ${fehler.message}`;
  }
}

export async function GET() {
  const zeilen = [];
  zeilen.push(`Server-Region (Vercel): ${process.env.VERCEL_REGION ?? 'unbekannt (lokal)'}`);

  // Aus der Datenbank-Adresse nur Region und Port lesen – nie Benutzer oder Passwort
  try {
    const adresse = new URL(process.env.DATABASE_URL ?? '');
    const region = adresse.hostname.match(/aws-\d+-([a-z]+-[a-z]+-\d+)/)?.[1] ?? adresse.hostname.split('.').slice(-3).join('.');
    const art = adresse.port === '6543' ? 'Transaction pooler (richtig)' : adresse.port === '5432' ? 'Session pooler / direkt (zu wenige Verbindungen!)' : 'unbekannt';
    zeilen.push(`Datenbank-Region: ${region}`);
    zeilen.push(`Datenbank-Port: ${adresse.port} – ${art}`);
  } catch {
    zeilen.push('Datenbank-Adresse: nicht lesbar');
  }

  zeilen.push(`Login-Prüfung (Supabase): ${await messen(() => aktuellerBenutzer())}`);
  zeilen.push(`Datenbank, 1. Abfrage:    ${await messen(() => sql`SELECT 1`)}`);
  zeilen.push(`Datenbank, 2. Abfrage:    ${await messen(() => sql`SELECT 1`)}`);
  zeilen.push(`Datenbank, offene Aufträge zählen: ${await messen(() => sql`SELECT COUNT(*)::int FROM wartungsauftrag WHERE status <> 'erledigt'`)}`);
  zeilen.push(`Datenbank, 5 Abfragen gleichzeitig: ${await messen(() => Promise.all([1, 2, 3, 4, 5].map(() => sql`SELECT 1`)))}`);
  // Dieselben Abfragen wie Übersicht und Karte – zeigt bei einem Fehler die genaue Meldung
  zeilen.push(`Kartendaten (Übersicht/Karte): ${await messen(() => alleKartenDaten())}`);
  zeilen.push(`Statistik-View v_stoerung_details: ${await messen(() => sql`SELECT COUNT(*)::int FROM v_stoerung_details`)}`);
  zeilen.push(`Ersatzteile/Bestellungen: ${await messen(() => sql`SELECT COUNT(*)::int FROM ersatzteil e LEFT JOIN bestellung b ON b.ersatzteil_id = e.id`)}`);

  return new Response(`Verbindungstest Instandhaltung\n\n${zeilen.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
