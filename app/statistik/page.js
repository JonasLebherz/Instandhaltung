/**
 * app/statistik/page.js – Kennzahlen und Auswertungen
 *
 * Begriffe (gleiche Definition wie in den Views für Power BI):
 *  - Reparaturdauer = ende_zeit − start_zeit des Wartungsauftrags
 *  - MTTR (Mean Time To Repair) = durchschnittliche Reparaturdauer erledigter Aufträge
 *  - Ausfallzeit = ende_zeit − Zeitpunkt der Störmeldung
 *
 * Zeitraum-Filter über die Adresse: ?von=JJJJ-MM-TT&bis=JJJJ-MM-TT
 * Ausgewertet werden alle Störmeldungen, deren Meldezeitpunkt im Zeitraum liegt.
 */
import Link from 'next/link';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { berlinZuDate, datum, heuteBerlin, zahl } from '@/lib/format';
import Kennzahl from '@/components/Kennzahl';
import Diagramme from './Diagramme';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Statistik' };

const MONATSNAMEN = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

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

export default async function StatistikSeite({ searchParams }) {
  await benutzerPflicht();
  const parameter = await searchParams;

  /* ---------- Zeitraum bestimmen (Standard: die letzten 12 Monate) ---------- */
  const standardVon = monatsanfang(11);
  const standardBis = heuteBerlin();
  let von = gueltigesDatum(parameter?.von) ?? standardVon;
  let bis = gueltigesDatum(parameter?.bis) ?? standardBis;
  let filterHinweis = '';
  if (von > bis) {
    filterHinweis = 'Das Startdatum lag nach dem Enddatum – es wird der Standardzeitraum angezeigt.';
    [von, bis] = [standardVon, standardBis];
  }
  // Ganzer Tag in deutscher Zeit: von 00:00 Uhr bis vor 00:00 Uhr des Folgetages
  const ab = berlinZuDate(`${von}T00:00`);
  const bisVor = berlinZuDate(`${naechsterTag(bis)}T00:00`);

  const schnellwahl = [
    { text: '3 Monate', von: monatsanfang(2) },
    { text: '6 Monate', von: monatsanfang(5) },
    { text: '12 Monate', von: standardVon },
    { text: 'Dieses Jahr', von: `${standardBis.slice(0, 4)}-01-01` },
  ];

  /* ---------- Abfragen ---------- */
  const [[gesamt], proMaschine, monateDb, topUrsachen] = await Promise.all([
    // Gesamt-Kennzahlen
    sql`
      SELECT COUNT(*)::int                                                                  AS anzahl,
             COUNT(*) FILTER (WHERE w.status <> 'erledigt')::int                            AS offen,
             (AVG(EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 60)
                FILTER (WHERE w.status = 'erledigt'))::float                                AS mttr_min,
             COALESCE(SUM(EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 60)
                FILTER (WHERE w.status = 'erledigt'), 0)::float                             AS ausfall_min
      FROM stoermeldung s
      JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
      WHERE s.zeitpunkt >= ${ab} AND s.zeitpunkt < ${bisVor}`,

    // Kennzahlen pro Maschine – LEFT JOIN, damit auch Maschinen ohne Störung erscheinen.
    // Die Zeitraum-Bedingung steht deshalb im JOIN und nicht im WHERE.
    sql`
      SELECT m.id, m.bezeichnung, m.standort,
             COUNT(s.id)::int                                                               AS anzahl,
             (AVG(EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 60)
                FILTER (WHERE w.status = 'erledigt'))::float                                AS mttr_min,
             COALESCE(SUM(EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 60)
                FILTER (WHERE w.status = 'erledigt'), 0)::float                             AS ausfall_min
      FROM maschine m
      LEFT JOIN stoermeldung s    ON s.maschine_id = m.id AND s.zeitpunkt >= ${ab} AND s.zeitpunkt < ${bisVor}
      LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
      GROUP BY m.id, m.bezeichnung, m.standort
      ORDER BY ausfall_min DESC, m.bezeichnung`,

    // Störungen pro Monat (Monat nach deutscher Zeit)
    sql`
      SELECT to_char(zeitpunkt AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS monat, COUNT(*)::int AS anzahl
      FROM stoermeldung
      WHERE zeitpunkt >= ${ab} AND zeitpunkt < ${bisVor}
      GROUP BY 1 ORDER BY 1`,

    // Die fünf häufigsten Störursachen
    sql`
      SELECT ursache_kategorie::text AS ursache, COUNT(*)::int AS anzahl
      FROM stoermeldung
      WHERE zeitpunkt >= ${ab} AND zeitpunkt < ${bisVor}
      GROUP BY ursache_kategorie
      ORDER BY anzahl DESC, ursache
      LIMIT 5`,
  ]);

  // Lückenlose Monatsliste, damit Monate ohne Störung als 0 erscheinen
  const anzahlNachMonat = Object.fromEntries(monateDb.map((z) => [z.monat, z.anzahl]));
  const proMonat = [];
  let [jahr, monat] = von.split('-').map(Number);
  const [endJahr, endMonat] = bis.split('-').map(Number);
  while (jahr < endJahr || (jahr === endJahr && monat <= endMonat)) {
    const schluessel = `${jahr}-${String(monat).padStart(2, '0')}`;
    proMonat.push({ label: `${MONATSNAMEN[monat - 1]} ${String(jahr).slice(2)}`, anzahl: anzahlNachMonat[schluessel] ?? 0 });
    monat += 1;
    if (monat > 12) { monat = 1; jahr += 1; }
  }

  const maxAusfall = Math.max(1, ...proMaschine.map((z) => z.ausfall_min));

  return (
    <>
      <div className="seitenkopf">
        <h1>Statistik</h1>
        <p>Zeitraum: {datum(ab)} bis {datum(berlinZuDate(`${bis}T12:00`))}</p>
      </div>

      {filterHinweis && (
        <div className="hinweis hinweis-hinweis">
          <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
          <span className="hinweis-text">{filterHinweis}</span>
        </div>
      )}

      {/* Zeitraum-Filter */}
      <form method="get" className="karte" style={{ '--i': 0 }}>
        <div className="filterleiste">
          <div>
            <label htmlFor="von" className="form-label">Von</label>
            <input type="date" id="von" name="von" className="form-control" defaultValue={von} key={`von-${von}`} />
          </div>
          <div>
            <label htmlFor="bis" className="form-label">Bis</label>
            <input type="date" id="bis" name="bis" className="form-control" defaultValue={bis} key={`bis-${bis}`} />
          </div>
          <div className="aktionen">
            <button type="submit" className="btn btn-primary">Anzeigen</button>
          </div>
        </div>
        <div className="schnellwahl">
          {schnellwahl.map((s) => (
            <Link key={s.text} href={`/statistik?von=${s.von}&bis=${standardBis}`}
                  className={`btn btn-sekundaer btn-klein${s.von === von && bis === standardBis ? ' aktiv' : ''}`}>
              {s.text}
            </Link>
          ))}
        </div>
      </form>

      {/* Gesamt-Kennzahlen */}
      <div className="row g-4 mb-2">
        <div className="col-6 col-lg-3">
          <Kennzahl titel="MTTR gesamt" wert={gesamt.mttr_min !== null ? gesamt.mttr_min / 60 : null} nachkomma={1}
                    einheit="h" zusatz="Ø Reparaturdauer" symbol="bi-stopwatch" i={1} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Ausfallzeit gesamt" wert={Math.round(gesamt.ausfall_min / 60)} einheit="h"
                    zusatz="Meldung bis Behebung" symbol="bi-hourglass-split" art="warnung" i={2} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Störungen" wert={gesamt.anzahl} zusatz="im Zeitraum gemeldet" symbol="bi-activity" i={3} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Davon offen" wert={gesamt.offen} zusatz="noch nicht erledigt" symbol="bi-hourglass" i={4} />
        </div>
      </div>

      {/* Diagramme (laufen im Browser, siehe Diagramme.js) */}
      <Diagramme proMonat={proMonat} topUrsachen={topUrsachen} />

      {/* Kennzahlen pro Maschine */}
      <section className="karte" style={{ '--i': 7 }}>
        <div className="karte-kopf">
          <h2 className="abschnitt-titel">Kennzahlen pro Maschine</h2>
          <span className="klein">sortiert nach Ausfallzeit</span>
        </div>
        <div className="tabelle-rahmen">
          <table className="tabelle">
            <thead>
              <tr>
                <th>Maschine</th>
                <th className="zahl">Störungen</th>
                <th className="zahl">MTTR</th>
                <th className="zahl">Ausfallzeit</th>
                <th className="d-none d-md-table-cell" style={{ width: '30%' }}><span className="visually-hidden">Anteil</span></th>
              </tr>
            </thead>
            <tbody>
              {proMaschine.map((pm) => (
                <tr key={pm.id} className="klickbar">
                  <td>
                    <Link className="zeilen-link" href={`/auftraege?maschine=${pm.id}`}>{pm.bezeichnung}</Link>
                    <div className="klein">{pm.standort}</div>
                  </td>
                  <td className="zahl">{pm.anzahl}</td>
                  <td className="zahl">{pm.mttr_min !== null ? `${zahl(pm.mttr_min / 60)} h` : '–'}</td>
                  <td className="zahl">{zahl(pm.ausfall_min / 60)} h</td>
                  <td className="d-none d-md-table-cell">
                    <div className="mini-balken" aria-hidden="true">
                      <span style={{ width: `${Math.round((pm.ausfall_min / maxAusfall) * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
