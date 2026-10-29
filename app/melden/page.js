/**
 * app/melden/page.js – Neue Störmeldung erfassen
 *
 * Erst wird die Maschine auf der Zoom-Karte gesucht (Werk → Gebäude → Maschine),
 * dann die Störung beschrieben (MeldeAssistent.js).
 * Vorauswahl über die Adresse:
 *   /melden?maschine=12  springt direkt zur Beschreibung (z. B. per QR-Code an der Maschine)
 *   /melden?standort=3   startet beim Lageplan dieses Werks
 * Ist eine Person gewählt (Konto in der Seitenleiste), steht ihr Name unter
 * "Gemeldet von" und die Karte startet in ihrem Werk.
 */
import { benutzerPflicht } from '@/lib/auth';
import { fuerDatetimeInput } from '@/lib/format';
import { standorteMitZahlen, gebaeudeMitZahlen, maschinenMitZahlen, nachAnsicht } from '@/lib/karten/daten';
import MeldeAssistent from './MeldeAssistent';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import { aktuellePerson } from '@/lib/person';
import { ansichtAusCookie } from '@/lib/ansicht';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Störung melden');

export default async function MeldenSeite({ searchParams }) {
  const benutzer = await benutzerPflicht();
  const t = await uebersetzer();
  const parameter = await searchParams;
  const ansicht = await ansichtAusCookie();   // Konto → Ansicht: Start im Land/Werk
  const [alleStandorte, alleGebaeude, alleMaschinen, person] = await Promise.all([
    standorteMitZahlen(), gebaeudeMitZahlen(), maschinenMitZahlen(), aktuellePerson(),
  ]);
  // Ansicht aus dem Konto: nur das gewählte Land bzw. Werk
  const { standorte, gebaeude, maschinen } = nachAnsicht({ standorte: alleStandorte, gebaeude: alleGebaeude, maschinen: alleMaschinen }, ansicht);
  // Offene Aufträge und Techniker braucht die Karte beim Melden nicht
  const daten = { standorte, gebaeude, maschinen, offene: [], techniker: [] };

  const vorauswahlMaschine = maschinen.find((m) => String(m.id) === String(parameter?.maschine ?? ''))?.id ?? null;
  const vorauswahlStandort = standorte.find((st) => String(st.id) === String(parameter?.standort ?? ''))?.id
    ?? (vorauswahlMaschine ? null : person?.standort_id ?? ansicht.standortId ?? null);

  // Startwerte des Formulars
  const startwerte = {
    maschine_id: vorauswahlMaschine ? String(vorauswahlMaschine) : '',
    gemeldet_von: person?.name ?? (benutzer.anzeigename === 'Lokaler Test' ? '' : benutzer.anzeigename),
    zeitpunkt: fuerDatetimeInput(new Date()),
    beschreibung: '',
    ursache_kategorie: '',
    prioritaet: 'mittel',
  };

  return (
    <>
      <div className="seitenkopf seitenkopf-melden">
        <span className="melde-symbol" aria-hidden="true"><i className="bi bi-exclamation-triangle-fill" /></span>
        <div>
          <h1>{t('Störung melden')}</h1>
          <p>{t('In vier Schritten: Werk, Gebäude und Maschine antippen – dann kurz beschreiben, was passiert ist.')}</p>
        </div>
      </div>
      <MeldeAssistent daten={daten} startwerte={startwerte}
                      vorauswahlMaschine={vorauswahlMaschine} vorauswahlStandort={vorauswahlStandort}
                      vorauswahlLand={vorauswahlMaschine || vorauswahlStandort ? null : ansicht.land} />
    </>
  );
}
