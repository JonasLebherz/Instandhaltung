/**
 * app/melden/page.js – Neue Störmeldung erfassen
 *
 * Lädt Standorte, Gebäude und Maschinen für die Auswahl über die Karte
 * (MeldeAssistent.js): Werk → Gebäude → Maschine → Beschreibung.
 * Vorauswahl über die Adresse:
 *   /melden?maschine=12  springt direkt zur Beschreibung (z. B. per QR-Code an der Maschine)
 *   /melden?standort=3   startet beim Lageplan dieses Werks
 */
import { benutzerPflicht } from '@/lib/auth';
import { fuerDatetimeInput } from '@/lib/format';
import { standorteMitZahlen, gebaeudeMitZahlen, maschinenMitZahlen } from '@/lib/karten/daten';
import MeldeAssistent from './MeldeAssistent';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Störung melden' };

export default async function MeldenSeite({ searchParams }) {
  const benutzer = await benutzerPflicht();
  const parameter = await searchParams;
  const [standorte, gebaeude, maschinen] = await Promise.all([
    standorteMitZahlen(), gebaeudeMitZahlen(), maschinenMitZahlen(),
  ]);

  const vorauswahlMaschine = maschinen.find((m) => String(m.id) === String(parameter?.maschine ?? ''))?.id ?? null;
  const vorauswahlStandort = standorte.find((st) => String(st.id) === String(parameter?.standort ?? ''))?.id ?? null;

  // Startwerte des Formulars
  const startwerte = {
    maschine_id: vorauswahlMaschine ? String(vorauswahlMaschine) : '',
    gemeldet_von: benutzer.anzeigename === 'Lokaler Test' ? '' : benutzer.anzeigename,
    zeitpunkt: fuerDatetimeInput(new Date()),
    beschreibung: '',
    ursache_kategorie: '',
    prioritaet: 'mittel',
  };

  return (
    <>
      <div className="seitenkopf">
        <h1>Störung melden</h1>
        <p>Werk, Gebäude und Maschine auf der Karte antippen – dann kurz beschreiben, was passiert ist.</p>
      </div>
      <MeldeAssistent standorte={standorte} gebaeude={gebaeude} maschinen={maschinen} startwerte={startwerte}
                      vorauswahlMaschine={vorauswahlMaschine} vorauswahlStandort={vorauswahlStandort} />
    </>
  );
}
