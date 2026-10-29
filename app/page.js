/**
 * app/page.js – Startseite / Übersicht (Dashboard)
 *
 * Zeigt auf einen Blick:
 *  - wichtige Kennzahlen (offene Meldungen, dringende Meldungen, Teile unter Mindestbestand)
 *  - die Verteilung der Aufträge nach Status
 *  - die aktuell offenen Störmeldungen
 *  - Ersatzteile unter Mindestbestand inkl. offener Bestellungen (mit Wareneingang)
 */
import Link from 'next/link';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { STATUS_WERTE, OFFENE_STATUS } from '@/lib/konstanten';
import { datumZeit, datum, datumLang, begruessung } from '@/lib/format';
import { StatusPill, PrioritaetPill } from '@/components/Pills';
import Kennzahl from '@/components/Kennzahl';
import SpeichernKnopf from '@/components/SpeichernKnopf';
import { lieferungBuchen } from '@/app/aktionen';

// Immer aktuelle Daten aus der Datenbank (kein Zwischenspeichern der Seite)
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Übersicht' };

export default async function Uebersicht() {
  const benutzer = await benutzerPflicht();

  // Alle Abfragen gleichzeitig starten – das ist schneller als nacheinander
  const [[kennzahlen], proStatus, offeneMeldungen, kritischeTeile] = await Promise.all([
    // Anzahl offener Aufträge, davon "hoch", und in den letzten 30 Tagen erledigte
    sql`
      SELECT COUNT(*) FILTER (WHERE w.status <> 'erledigt')::int                          AS offen,
             COUNT(*) FILTER (WHERE w.status <> 'erledigt' AND s.prioritaet = 'hoch')::int AS dringend,
             COUNT(*) FILTER (WHERE w.status = 'erledigt'
                                AND w.ende_zeit >= now() - interval '30 days')::int        AS erledigt30
      FROM wartungsauftrag w
      JOIN stoermeldung s ON s.id = w.stoermeldung_id`,

    // Aufträge nach Status
    sql`SELECT status, COUNT(*)::int AS anzahl FROM wartungsauftrag GROUP BY status`,

    // Offene Störmeldungen: zuerst nach Priorität (hoch → niedrig), dann neueste zuerst
    sql`
      SELECT w.id AS auftrag_id, w.status, s.zeitpunkt, s.beschreibung, s.prioritaet,
             m.bezeichnung AS maschine, t.name AS techniker
      FROM wartungsauftrag w
      JOIN stoermeldung s   ON s.id = w.stoermeldung_id
      JOIN maschine m       ON m.id = s.maschine_id
      LEFT JOIN techniker t ON t.id = w.techniker_id
      WHERE w.status IN ${sql(OFFENE_STATUS)}
      ORDER BY s.prioritaet DESC, s.zeitpunkt DESC
      LIMIT 8`,

    // Teile unter Mindestbestand sowie alle Teile mit offener Bestellung
    sql`
      SELECT e.id, e.bezeichnung, e.bestand, e.mindestbestand,
             b.id AS bestellung_id, b.menge AS bestellmenge, b.bestelldatum
      FROM ersatzteil e
      LEFT JOIN bestellung b ON b.ersatzteil_id = e.id AND b.status = 'bestellt'
      WHERE e.bestand < e.mindestbestand OR b.id IS NOT NULL
      ORDER BY (e.bestand < e.mindestbestand) DESC, e.bestand::float / NULLIF(e.mindestbestand, 0), e.bezeichnung`,
  ]);

  // Alle Status in fester Reihenfolge, auch wenn es 0 Aufträge gibt
  const anzahlNachStatus = Object.fromEntries(proStatus.map((z) => [z.status, z.anzahl]));
  const statusVerteilung = STATUS_WERTE.map((s) => ({ status: s, anzahl: anzahlNachStatus[s] ?? 0 }));
  // Die Balken beziehen sich nur auf die offenen Status, damit "erledigt" sie nicht winzig macht
  const maxOffen = Math.max(1, ...statusVerteilung.filter((z) => z.status !== 'erledigt').map((z) => z.anzahl));

  const anzahlKritisch = new Set(kritischeTeile.filter((t) => t.bestand < t.mindestbestand).map((t) => t.id)).size;

  return (
    <>
      <div className="seitenkopf">
        <div className="eyebrow">{begruessung()}, {benutzer.anzeigename}</div>
        <h1>Übersicht</h1>
        <p>{datumLang()}</p>
      </div>

      {/* Kennzahlen */}
      <div className="row g-4 mb-2">
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Offene Meldungen" wert={kennzahlen.offen} zusatz="noch nicht erledigt"
                    symbol="bi-exclamation-circle" link="/auftraege?status=offen" i={0} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Priorität hoch" wert={kennzahlen.dringend} zusatz="sofort bearbeiten"
                    symbol="bi-lightning-charge" link="/auftraege?status=offen&prioritaet=hoch"
                    art={kennzahlen.dringend > 0 ? 'rot' : ''} i={1} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Teile unter Mindestbestand" wert={anzahlKritisch}
                    zusatz={anzahlKritisch > 0 ? 'Nachschub prüfen' : 'Lager in Ordnung'}
                    symbol="bi-box-seam" art={anzahlKritisch > 0 ? 'warnung' : 'gruen'} i={2} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Erledigt (30 Tage)" wert={kennzahlen.erledigt30} zusatz="abgeschlossene Aufträge"
                    symbol="bi-check2-circle" art="gruen" i={3} />
        </div>
      </div>

      <div className="row g-4">
        {/* Offene Störmeldungen */}
        <div className="col-lg-8">
          <section className="karte" style={{ '--i': 4 }}>
            <div className="karte-kopf">
              <h2 className="abschnitt-titel">Offene Störmeldungen</h2>
              <Link href="/auftraege?status=offen">Alle anzeigen</Link>
            </div>

            {offeneMeldungen.length === 0 ? (
              <p className="leer"><i className="bi bi-check-circle" />Keine offenen Störmeldungen – alle Maschinen laufen.</p>
            ) : (
              <div className="tabelle-rahmen">
                <table className="tabelle">
                  <thead>
                    <tr>
                      <th>Maschine</th>
                      <th>Priorität</th>
                      <th>Status</th>
                      <th className="d-none d-md-table-cell">Gemeldet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offeneMeldungen.map((m) => (
                      <tr key={m.auftrag_id} className="klickbar">
                        <td>
                          <Link className="zeilen-link" href={`/auftraege/${m.auftrag_id}`}>{m.maschine}</Link>
                          <div className="klein text-truncate beschreibung-kurz">{m.beschreibung}</div>
                        </td>
                        <td><PrioritaetPill prioritaet={m.prioritaet} /></td>
                        <td>
                          <StatusPill status={m.status} />
                          {m.techniker && <div className="klein mt-1">{m.techniker}</div>}
                        </td>
                        <td className="d-none d-md-table-cell klein">{datumZeit(m.zeitpunkt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Aufträge nach Status */}
        <div className="col-lg-4">
          <section className="karte" style={{ '--i': 5 }}>
            <h2 className="abschnitt-titel">Aufträge nach Status</h2>
            <ul className="status-liste">
              {statusVerteilung.map(({ status, anzahl }) => (
                <li key={status}>
                  <StatusPill status={status} />
                  {status !== 'erledigt' ? (
                    <div className="status-balken" aria-hidden="true">
                      <span style={{ width: `${Math.round((anzahl / maxOffen) * 100)}%` }} />
                    </div>
                  ) : (
                    <div className="flex-grow-1 klein">gesamt</div>
                  )}
                  <Link className="status-anzahl" href={`/auftraege?status=${encodeURIComponent(status)}`}>{anzahl}</Link>
                </li>
              ))}
            </ul>
          </section>

          <Link className="btn btn-primary w-100 btn-gross" href="/melden">
            <i className="bi bi-plus-lg" aria-hidden="true" /> Neue Störung melden
          </Link>
        </div>
      </div>

      {/* Ersatzteile unter Mindestbestand & offene Bestellungen */}
      <section className="karte mt-4" style={{ '--i': 6 }}>
        <div className="karte-kopf">
          <h2 className="abschnitt-titel">Ersatzteile unter Mindestbestand</h2>
          <span className="klein">inkl. offener Bestellungen</span>
        </div>

        {kritischeTeile.length === 0 ? (
          <p className="leer"><i className="bi bi-box-seam" />Alle Ersatzteile sind ausreichend auf Lager, keine offenen Bestellungen.</p>
        ) : (
          <div className="tabelle-rahmen">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Ersatzteil</th>
                  <th className="zahl">Bestand</th>
                  <th className="zahl">Mindestbestand</th>
                  <th>Nachbestellung</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {kritischeTeile.map((teil) => (
                  <tr key={`${teil.id}-${teil.bestellung_id ?? 'x'}`}>
                    <td>{teil.bezeichnung}</td>
                    <td className="zahl">
                      {teil.bestand < teil.mindestbestand
                        ? <strong className="text-orange">{teil.bestand}</strong>
                        : teil.bestand}
                    </td>
                    <td className="zahl">{teil.mindestbestand}</td>
                    <td>
                      {teil.bestellung_id ? (
                        <>
                          <span className="pill pill-orange">bestellt</span>
                          <span className="klein ms-2">{teil.bestellmenge} Stk. am {datum(teil.bestelldatum)}</span>
                        </>
                      ) : (
                        <span className="pill pill-rot">nicht bestellt</span>
                      )}
                    </td>
                    <td className="text-end">
                      {teil.bestellung_id && (
                        // Wareneingang buchen: erhöht den Bestand um die Bestellmenge
                        <form action={lieferungBuchen} className="d-inline">
                          <input type="hidden" name="bestellung_id" value={teil.bestellung_id} />
                          <SpeichernKnopf className="btn btn-sekundaer btn-klein" ladeText="Buche …">
                            <i className="bi bi-truck" aria-hidden="true" /> Lieferung eingegangen
                          </SpeichernKnopf>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
