/**
 * app/karte/page.js – Störungskarte
 *
 * Eine einzige Seite für alle drei Ebenen: Deutschland → Werk → Gebäude.
 * Die Daten aller Standorte, Gebäude und Maschinen werden einmal geladen,
 * danach zoomt die Karte im Browser ohne Neuladen (components/karten/KartenExplorer.js).
 *
 * Die Adresse merkt sich die aktuelle Ebene, damit man Links teilen kann:
 *   /karte?werk=ham               Lageplan des Werks Hamburg
 *   /karte?werk=ham&halle=h2      Grundriss von Halle 2
 *   /karte?maschine=12            Grundriss mit ausgewählter Maschine
 */
import { benutzerPflicht } from '@/lib/auth';
import { alleKartenDaten } from '@/lib/karten/daten';
import KartenExplorer from '@/components/karten/KartenExplorer';
import Kennzahl from '@/components/Kennzahl';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Störungskarte' };

/**
 * Startebene aus der Adresse ermitteln. Unbekannte Werte werden ignoriert.
 * Eine Maschine legt Werk und Gebäude automatisch mit fest.
 */
function startAusAdresse(parameter, daten) {
  const werk = String(parameter?.werk ?? '').toUpperCase();
  const halle = String(parameter?.halle ?? '').toUpperCase();
  const maschine = daten.maschinen.find((m) => String(m.id) === String(parameter?.maschine ?? ''));
  if (maschine) {
    const g = daten.gebaeude.find((x) => x.id === maschine.gebaeude_id);
    return { standortId: g.standort_id, gebaeudeId: g.id, maschineId: maschine.id };
  }
  const standort = daten.standorte.find((st) => st.kuerzel === werk);
  if (!standort) return {};
  const gebaeude = daten.gebaeude.find((g) => g.standort_id === standort.id && g.kuerzel === halle);
  return { standortId: standort.id, gebaeudeId: gebaeude?.id ?? null };
}

export default async function KartenSeite({ searchParams }) {
  await benutzerPflicht();
  const parameter = await searchParams;
  const daten = await alleKartenDaten();
  const { standorte } = daten;

  const offenGesamt = standorte.reduce((summe, st) => summe + st.offen, 0);
  const hochGesamt = standorte.reduce((summe, st) => summe + st.hoch, 0);
  const betroffen = standorte.filter((st) => st.offen > 0).length;

  return (
    <>
      <div className="seitenkopf">
        <h1>Störungskarte</h1>
        <p>{standorte.length} Standorte in Deutschland – Werk anklicken, um hineinzuzoomen.</p>
      </div>

      <KartenExplorer daten={daten} start={startAusAdresse(parameter, daten)} adresseMitfuehren />

      <div className="row g-4 mt-0">
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Offene Störungen" wert={offenGesamt} zusatz="an allen Standorten" symbol="bi-exclamation-circle"
                    link="/auftraege?status=offen" i={2} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Priorität hoch" wert={hochGesamt} zusatz="sofort bearbeiten" symbol="bi-lightning-charge"
                    art={hochGesamt > 0 ? 'rot' : ''} link="/auftraege?status=offen&prioritaet=hoch" i={3} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Betroffene Werke" wert={betroffen} zusatz={`von ${standorte.length} Standorten`} symbol="bi-buildings" i={4} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Ohne Störung" wert={standorte.length - betroffen} zusatz="alles läuft" symbol="bi-check2-circle" art="gruen" i={5} />
        </div>
      </div>
    </>
  );
}
