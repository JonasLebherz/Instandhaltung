/**
 * app/karte/page.js – Störungskarte
 *
 * Eine einzige Seite für alle Ebenen: Welt → Land → Werk → Gebäude.
 * Die Daten aller Standorte, Gebäude und Maschinen werden einmal geladen,
 * danach zoomt die Karte im Browser ohne Neuladen (components/karten/KartenExplorer.js).
 *
 * Die Adresse merkt sich die aktuelle Ebene, damit man Links teilen kann:
 *   /karte                        Weltkarte mit allen Ländern
 *   /karte?land=de                Deutschland mit seinen Werken
 *   /karte?werk=ham               Lageplan des Werks Hamburg
 *   /karte?werk=ham&halle=h2      Grundriss von Halle 2
 *   /karte?maschine=12            Grundriss mit ausgewählter Maschine
 */
import { benutzerPflicht } from '@/lib/auth';
import { alleKartenDaten } from '@/lib/karten/daten';
import KartenExplorer from '@/components/karten/KartenExplorer';
import Kennzahl from '@/components/Kennzahl';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Störungskarte');

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
  if (!standort) {
    // Nur ein Land angegeben (Kürzel klein in der Adresse, groß in der Datenbank)
    const land = String(parameter?.land ?? '').toUpperCase();
    return daten.standorte.some((st) => st.land === land) ? { land } : {};
  }
  const gebaeude = daten.gebaeude.find((g) => g.standort_id === standort.id && g.kuerzel === halle);
  return { standortId: standort.id, gebaeudeId: gebaeude?.id ?? null };
}

export default async function KartenSeite({ searchParams }) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const parameter = await searchParams;
  const daten = await alleKartenDaten();
  const { standorte } = daten;

  const offenGesamt = standorte.reduce((summe, st) => summe + st.offen, 0);
  const hochGesamt = standorte.reduce((summe, st) => summe + st.hoch, 0);
  const betroffen = standorte.filter((st) => st.offen > 0).length;
  const anzahlLaender = new Set(standorte.map((st) => st.land)).size;

  return (
    <>
      <div className="seitenkopf">
        <h1>{t('Störungskarte')}</h1>
        <p>{t('{n} Werke in {m} Ländern – Land anklicken, um hineinzuzoomen.', { n: standorte.length, m: anzahlLaender })}</p>
      </div>

      <KartenExplorer daten={daten} start={startAusAdresse(parameter, daten)} adresseMitfuehren />

      <div className="row g-4 mt-0">
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Offene Störungen')} wert={offenGesamt} zusatz={t('an allen Standorten')} symbol="bi-exclamation-circle"
                    link="/auftraege?status=offen" i={2} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Priorität hoch')} wert={hochGesamt} zusatz={t('sofort bearbeiten')} symbol="bi-lightning-charge"
                    art={hochGesamt > 0 ? 'rot' : ''} link="/auftraege?status=offen&prioritaet=hoch" i={3} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Betroffene Werke')} wert={betroffen} zusatz={t('von {n} Standorten', { n: standorte.length })} symbol="bi-buildings" i={4} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Ohne Störung')} wert={standorte.length - betroffen} zusatz={t('alles läuft')} symbol="bi-check2-circle" art="gruen" i={5} />
        </div>
      </div>
    </>
  );
}
