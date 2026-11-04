/**
 * app/lager/page.js – Ersatzteillager
 *
 *  - Kennzahlen: Ersatzteile, unter Mindestbestand, offene Bestellungen, Verbrauch in 12 Monaten.
 *  - 3D-Regal (components/karten/raum/Lager3D.js): ein Fach je Teil, Kartons nach Bestand, Schild in Zustandsfarbe.
 *  - Rechts das gewählte Teil (LagerAnsicht.js): Bestand, Verbrauch, offene Bestellung mit
 *    „Lieferung buchen“ bzw. „Nachbestellen“. Darunter die Liste aller Teile.
 * ?teil=<id> wählt ein Teil vor (z. B. nach dem Nachbestellen). 2 Abfragen.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import { aktuellePerson, darfBearbeiten } from '@/lib/person';
import Kennzahl from '@/components/Kennzahl';
import LagerAnsicht from './LagerAnsicht';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Lager');

export default async function LagerSeite({ searchParams }) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const { teil } = await searchParams;

  const [teile, person] = await Promise.all([
    // Je Teil: Bestand, offene Bestellung, Verbrauch der letzten 12 Monate (gebuchte Menge in Aufträgen)
    sql`
      SELECT e.id, e.bezeichnung, e.bestand, e.mindestbestand,
             b.id AS bestellung_id, b.menge AS bestellt_menge, to_char(b.bestelldatum, 'YYYY-MM-DD') AS bestellt_am,
             COALESCE(v.menge, 0)::int AS verbrauch, COALESCE(v.auftraege, 0)::int AS auftraege
      FROM ersatzteil e
      LEFT JOIN bestellung b ON b.ersatzteil_id = e.id AND b.status = 'bestellt'
      LEFT JOIN LATERAL (
        SELECT SUM(ae.menge) AS menge, COUNT(DISTINCT ae.auftrag_id) AS auftraege
        FROM auftrag_ersatzteil ae
        JOIN wartungsauftrag w ON w.id = ae.auftrag_id
        JOIN stoermeldung s    ON s.id = w.stoermeldung_id
        WHERE ae.ersatzteil_id = e.id AND s.zeitpunkt >= now() - interval '12 months'
      ) v ON TRUE
      ORDER BY e.bezeichnung`,
    aktuellePerson(),
  ]);

  const unterMindest = teile.filter((x) => x.bestand < x.mindestbestand).length;
  const offen = teile.filter((x) => x.bestellung_id).length;
  const verbrauch = teile.reduce((s, x) => s + x.verbrauch, 0);

  return (
    <>
      <div className="seitenkopf">
        <h1>{t('Lager')}</h1>
        <p>{t('Ersatzteile im Regal: Je mehr Kartons, desto mehr auf Lager. Fach anklicken für Details und Bestellungen.')}</p>
      </div>

      <div className="row g-4 mb-2">
        <div className="col-6 col-lg-3"><Kennzahl titel={t('Ersatzteile')} wert={teile.length} zusatz={t('verschiedene Teile')} symbol="bi-box-seam" i={0} /></div>
        <div className="col-6 col-lg-3"><Kennzahl titel={t('Unter Mindestbestand')} wert={unterMindest} zusatz={t('nachbestellen')} symbol="bi-exclamation-triangle" art={unterMindest ? 'warnung' : 'gruen'} i={1} /></div>
        <div className="col-6 col-lg-3"><Kennzahl titel={t('Offene Bestellungen')} wert={offen} zusatz={t('unterwegs')} symbol="bi-truck" i={2} /></div>
        <div className="col-6 col-lg-3"><Kennzahl titel={t('Verbrauch')} wert={verbrauch} zusatz={t('Teile in 12 Monaten')} symbol="bi-arrow-down-circle" i={3} /></div>
      </div>

      <LagerAnsicht teile={teile} start={/^\d+$/.test(teil ?? '') ? Number(teil) : null} darf={darfBearbeiten(person)} />
    </>
  );
}
