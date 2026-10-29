/**
 * app/melden/page.js – Neue Störmeldung erfassen
 *
 * Lädt die Maschinen für die Auswahlliste; das Formular selbst ist in
 * MeldeFormular.js (läuft im Browser, zeigt Fehler direkt am Feld).
 * Eine Maschine kann per Link vorausgewählt werden: /melden?maschine=3
 * (praktisch für einen QR-Code an der Maschine).
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { fuerDatetimeInput } from '@/lib/format';
import MeldeFormular from './MeldeFormular';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Störung melden' };

export default async function MeldenSeite({ searchParams }) {
  const benutzer = await benutzerPflicht();
  const parameter = await searchParams;
  const maschinen = await sql`SELECT id, bezeichnung, standort FROM maschine ORDER BY bezeichnung`;

  const vorauswahl = /^\d+$/.test(parameter?.maschine ?? '') ? parameter.maschine : '';

  // Startwerte des Formulars
  const startwerte = {
    maschine_id: vorauswahl,
    gemeldet_von: benutzer.anzeigename === 'Lokaler Test' ? '' : benutzer.anzeigename,
    zeitpunkt: fuerDatetimeInput(new Date()),
    beschreibung: '',
    ursache_kategorie: '',
    prioritaet: 'mittel',
  };

  return (
    <div className="row justify-content-center">
      <div className="col-lg-8 col-xl-7">
        <div className="seitenkopf">
          <h1>Störung melden</h1>
          <p>Beschreiben Sie kurz, was an der Maschine passiert ist.</p>
        </div>
        <MeldeFormular maschinen={maschinen} startwerte={startwerte} jetzt={startwerte.zeitpunkt} />
      </div>
    </div>
  );
}
