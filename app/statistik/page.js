/**
 * app/statistik/page.js – Kennzahlen und Auswertungen mit Zoom
 *
 * Wie bei der Störungskarte zoomt man durch die Ebenen:
 *   weltweit → Land → Werk → Gebäude → Maschine
 * Dafür lädt die Seite alle Störmeldungen des Zeitraums einmal vom Server.
 * Gerechnet und gezeichnet wird dann im Browser (StatistikExplorer.js) –
 * der Wechsel zwischen den Ebenen braucht deshalb keine Ladezeit.
 *
 * Begriffe (gleiche Definition wie in den Views für Power BI):
 *  - Reparaturdauer = ende_zeit − start_zeit des Wartungsauftrags
 *  - MTTR (Mean Time To Repair) = durchschnittliche Reparaturdauer erledigter Aufträge
 *  - Ausfallzeit = ende_zeit − Zeitpunkt der Störmeldung
 *
 * Adresse: ?von=JJJJ-MM-TT&bis=JJJJ-MM-TT&land=de bzw. &werk=ham&halle=h2&maschine=12
 * (älter, weiterhin gültig: ?standort=<id>)
 * Ausgewertet werden alle Störmeldungen, deren Meldezeitpunkt im Zeitraum liegt.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { berlinZuDate, heuteBerlin, monatKurz } from '@/lib/format';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import { T } from '@/lib/sprache';
import StatistikExplorer from './StatistikExplorer';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Statistik');

/** Erster Tag des Monats, der "monateZurueck" Monate vor dem aktuellen liegt, als "JJJJ-MM-01" */
function monatsanfang(monateZurueck) {
  const [jahr, monat] = heuteBerlin().split('-').map(Number);
  const d = new Date(Date.UTC(jahr, monat - 1 - monateZurueck, 1));
  return d.toISOString().slice(0, 10);
}

/** Prüft ein Datum "JJJJ-MM-TT"; gibt es zurück oder null */
function gueltigesDatum(wert) {
  return /^\d{4}-\d{2}-\d{2}$/.test(wert ?? '') && berlinZuDate(`${wert}T00:00`) ? wert : null;
}

/** Datum "JJJJ-MM-TT" plus einen Tag */
function naechsterTag(wert) {
  const d = new Date(`${wert}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Startebene aus der Adresse (Land, Werk-/Hallen-Kürzel, Maschinen-ID oder alte Standort-ID) */
function startAusAdresse(parameter, orte) {
  const maschine = orte.find((o) => String(o.id) === String(parameter?.maschine ?? ''));
  if (maschine) return { land: maschine.land, standortId: maschine.standort_id, gebaeudeId: maschine.gebaeude_id, maschineId: maschine.id };
  const werk = String(parameter?.werk ?? '').toUpperCase();
  const standort = orte.find((o) => o.standort_kuerzel === werk || String(o.standort_id) === String(parameter?.standort ?? ''));
  if (!standort) {
    const land = String(parameter?.land ?? '').toUpperCase();
    return orte.some((o) => o.land === land) ? { land } : {};
  }
  const halle = String(parameter?.halle ?? '').toUpperCase();
  const gebaeude = orte.find((o) => o.standort_id === standort.standort_id && o.gebaeude_kuerzel === halle);
  return { land: standort.land, standortId: standort.standort_id, gebaeudeId: gebaeude?.gebaeude_id ?? null };
}

export default async function StatistikSeite({ searchParams }) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const parameter = await searchParams;

  /* ---------- Zeitraum bestimmen (Standard: die letzten 12 Monate) ---------- */
  const standardVon = monatsanfang(11);
  const standardBis = heuteBerlin();
  let von = gueltigesDatum(parameter?.von) ?? standardVon;
  let bis = gueltigesDatum(parameter?.bis) ?? standardBis;
  let filterHinweis = '';
  if (von > bis) {
    filterHinweis = t('Das Startdatum lag nach dem Enddatum – es wird der Standardzeitraum angezeigt.');
    [von, bis] = [standardVon, standardBis];
  }
  // Ganzer Tag in deutscher Zeit: von 00:00 Uhr bis vor 00:00 Uhr des Folgetages
  const ab = berlinZuDate(`${von}T00:00`);
  const bisVor = berlinZuDate(`${naechsterTag(bis)}T00:00`);

  /* ---------- Abfragen (4 gleichzeitig – siehe "Ladezeiten" in CLAUDE.md) ---------- */
  const [orte, ereignisse, teile, techniker] = await Promise.all([
    // Alle Maschinen mit Gebäude und Standort – daraus entstehen die Ebenen
    sql`
      SELECT m.id, m.anlagennummer, m.bezeichnung, m.typ::text AS typ, m.baujahr,
             g.id AS gebaeude_id, g.kuerzel AS gebaeude_kuerzel, g.bezeichnung AS gebaeude,
             st.id AS standort_id, st.kuerzel AS standort_kuerzel, st.name AS standort, st.stadt,
             l.kuerzel AS land, l.name AS land_name, l.hauptsitz
      FROM maschine m
      JOIN gebaeude g  ON g.id = m.gebaeude_id
      JOIN standort st ON st.id = g.standort_id
      JOIN land l      ON l.kuerzel = st.land_kuerzel
      ORDER BY l.hauptsitz DESC, l.name, st.name, g.kuerzel, m.anlagennummer`,

    // Jede Störmeldung des Zeitraums mit ihrem Auftrag. Monat, Wochentag und Stunde
    // nach deutscher Zeit; Reparatur- und Ausfallzeit nur für erledigte Aufträge.
    sql`
      SELECT s.id AS meldung_id, w.id AS auftrag_id, s.maschine_id, s.zeitpunkt,
             s.prioritaet::text AS prioritaet, s.ursache_kategorie::text AS ursache,
             w.status::text AS status, w.techniker_id, left(s.beschreibung, 90) AS beschreibung,
             to_char(s.zeitpunkt AT TIME ZONE 'Europe/Berlin', 'YYYY-MM')        AS monat,
             EXTRACT(ISODOW FROM s.zeitpunkt AT TIME ZONE 'Europe/Berlin')::int AS wochentag,
             EXTRACT(HOUR FROM s.zeitpunkt AT TIME ZONE 'Europe/Berlin')::int   AS stunde,
             CASE WHEN w.status = 'erledigt'
                  THEN EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 60 END::float AS reparatur_min,
             CASE WHEN w.status = 'erledigt'
                  THEN EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 60 END::float   AS ausfall_min
      FROM stoermeldung s
      JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
      WHERE s.zeitpunkt >= ${ab} AND s.zeitpunkt < ${bisVor}
      ORDER BY s.zeitpunkt DESC`,

    // Verbaute Ersatzteile der Aufträge im Zeitraum
    sql`
      SELECT ae.auftrag_id, e.bezeichnung, ae.menge
      FROM auftrag_ersatzteil ae
      JOIN ersatzteil e      ON e.id = ae.ersatzteil_id
      JOIN wartungsauftrag w ON w.id = ae.auftrag_id
      JOIN stoermeldung s    ON s.id = w.stoermeldung_id
      WHERE s.zeitpunkt >= ${ab} AND s.zeitpunkt < ${bisVor}`,

    sql`SELECT id, name, standort_id, qualifikation FROM techniker ORDER BY name`,
  ]);

  // Lückenlose Monatsliste, damit Monate ohne Störung als 0 erscheinen
  const monate = [];
  let [jahr, monat] = von.split('-').map(Number);
  const [endJahr, endMonat] = bis.split('-').map(Number);
  while (jahr < endJahr || (jahr === endJahr && monat <= endMonat)) {
    monate.push({
      schluessel: `${jahr}-${String(monat).padStart(2, '0')}`,
      label: `${monatKurz(monat, t.sprache)} ${String(jahr).slice(2)}`,
    });
    monat += 1;
    if (monat > 12) { monat = 1; jahr += 1; }
  }

  // Schnellwahl für den Zeitraum
  const schnellwahl = [
    { text: T('3 Monate'), von: monatsanfang(2) },
    { text: T('6 Monate'), von: monatsanfang(5) },
    { text: T('12 Monate'), von: standardVon },
    { text: T('Dieses Jahr'), von: `${standardBis.slice(0, 4)}-01-01` },
  ];

  return (
    <StatistikExplorer
      daten={{ orte, ereignisse, teile, techniker, monate }}
      zeitraum={{ von, bis, ab: ab.toISOString(), bisVor: bisVor.toISOString(), standardBis, schnellwahl, hinweis: filterHinweis }}
      start={startAusAdresse(parameter, orte)} />
  );
}
