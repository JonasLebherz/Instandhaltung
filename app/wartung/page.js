/**
 * app/wartung/page.js – Wartungsplan: vorbeugende Wartung im Kalender
 *
 *  - Kennzahlen: überfällig, in den nächsten 7 Tagen fällig, erledigt in 30 Tagen, Pläne gesamt.
 *  - Kalender (WartungKalender.js): Monat mit fälligen (orange), überfälligen (rot) und erledigten
 *    (grün) Wartungen; Klick auf einen Tag zeigt die Liste daneben, dort „Erledigt“.
 *  - „Wartung planen“: neuer Plan für eine Maschine (Aufgabe, Intervall, Dauer).
 * Beachtet die Ansicht aus dem Konto (nur ein Land bzw. Werk). 3 Abfragen.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import { ansichtAusCookie, ansichtBedingung } from '@/lib/ansicht';
import { aktuellePerson, darfBearbeiten } from '@/lib/person';
import { wartungsplaene } from '@/lib/wartung';
import Kennzahl from '@/components/Kennzahl';
import WartungKalender from './WartungKalender';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Wartungsplan');

export default async function WartungSeite() {
  await benutzerPflicht();
  const t = await uebersetzer();
  const ansicht = await ansichtAusCookie();
  const bedingung = ansichtBedingung(ansicht);

  const [plaene, erledigt, maschinen, person] = await Promise.all([
    wartungsplaene(bedingung),
    // Erledigte Wartungen der letzten gut 13 Monate (für den Kalender)
    sql`
      SELECT d.id, d.plan_id, to_char(d.datum, 'YYYY-MM-DD') AS datum, pe.name AS person
      FROM wartung_durchfuehrung d
      JOIN wartungsplan p ON p.id = d.plan_id
      JOIN maschine m     ON m.id = p.maschine_id
      JOIN gebaeude g     ON g.id = m.gebaeude_id
      JOIN standort st    ON st.id = g.standort_id
      LEFT JOIN person pe ON pe.id = d.person_id
      WHERE d.datum >= current_date - 400 AND ${bedingung}`,
    // Maschinen für „Wartung planen“
    sql`
      SELECT m.id, m.anlagennummer, m.bezeichnung, st.name AS standort
      FROM maschine m JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id
      WHERE ${bedingung}
      ORDER BY st.name, m.anlagennummer`,
    aktuellePerson(),
  ]);

  const ueberfaellig = plaene.filter((p) => p.tage_bis < 0).length;
  const woche = plaene.filter((p) => p.tage_bis >= 0 && p.tage_bis <= 7).length;
  const heute = new Date();
  const vor30 = new Date(heute.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  return (
    <>
      <div className="seitenkopf">
        <h1>{t('Wartungsplan')}</h1>
        <p>{t('Vorbeugende Wartung: Jede Maschine hat feste Intervalle – so wird gewartet, bevor etwas kaputtgeht.')}</p>
      </div>

      <div className="row g-4 mb-2">
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Überfällig')} wert={ueberfaellig} zusatz={t('sofort einplanen')} symbol="bi-exclamation-octagon" art={ueberfaellig ? 'rot' : ''} i={0} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Diese Woche')} wert={woche} zusatz={t('fällig in 7 Tagen')} symbol="bi-calendar-week" i={1} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Erledigt')} wert={erledigt.filter((d) => d.datum >= vor30).length} zusatz={t('in den letzten 30 Tagen')} symbol="bi-check2-circle" i={2} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Wartungspläne')} wert={plaene.length} zusatz={t('für {n} Maschinen', { n: new Set(plaene.map((p) => p.maschine_id)).size })} symbol="bi-arrow-repeat" i={3} />
        </div>
      </div>

      <WartungKalender plaene={plaene} erledigt={erledigt} maschinen={maschinen} darf={darfBearbeiten(person)} />
    </>
  );
}
