/**
 * app/page.js – Startseite / Übersicht (Dashboard)
 *
 * Zeigt auf einen Blick:
 *  - die Aufgaben der gewählten Person (je nach Rolle, siehe aufgabenDerPerson)
 *  - wichtige Kennzahlen (offene Meldungen, dringende Meldungen, Teile unter Mindestbestand)
 *  - die aktuell offenen Störmeldungen und die Verteilung der Aufträge nach Status
 *  - eine kleine Deutschlandkarte; Klick auf ein Werk öffnet die Störungskarte
 *  - Ersatzteile unter Mindestbestand inkl. offener Bestellungen (mit Wareneingang)
 */
import Link from 'next/link';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { STATUS_WERTE } from '@/lib/konstanten';
import { datumZeit, datum, datumLang, begruessung } from '@/lib/format';
import { StatusPill, PrioritaetPill } from '@/components/Pills';
import Kennzahl from '@/components/Kennzahl';
import SpeichernKnopf from '@/components/SpeichernKnopf';
import { lieferungBuchen } from '@/app/aktionen';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import { T } from '@/lib/sprache';
import { standorteMitZahlen } from '@/lib/karten/daten';
import KleineKarte from '@/components/karten/KleineKarte';
import { aktuellePerson } from '@/lib/person';
import { ansichtAusCookie, ansichtBedingung, ansichtAktiv } from '@/lib/ansicht';
import { PersonWaehlenKnopf, RollenAbzeichen } from '@/components/PersonWahl';

// Immer aktuelle Daten aus der Datenbank (kein Zwischenspeichern der Seite)
export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Übersicht');

/**
 * Offene Aufträge, um die sich die gewählte Person kümmern sollte:
 *  - Instandhaltung: die ihr (ihrem Techniker) zugewiesenen Aufträge
 *  - Schichtleitung: offene Aufträge im eigenen Werk, noch nicht zugewiesene zuerst
 *  - Produktion:     offene Störungen im eigenen Werk (zum Nachverfolgen)
 */
function aufgabenDerPerson(person) {
  const bedingung = person.rolle === 'Instandhaltung'
    ? sql`w.techniker_id = ${person.techniker_id ?? -1}`
    : sql`st.id = ${person.standort_id ?? -1}`;
  return sql`
    SELECT w.id AS auftrag_id, w.status, s.zeitpunkt, s.beschreibung, s.prioritaet,
           m.bezeichnung AS maschine, st.stadt, g.kuerzel AS gebaeude,
           t.name AS techniker, zv.name AS zugewiesen_von
    FROM wartungsauftrag w
    JOIN stoermeldung s   ON s.id = w.stoermeldung_id
    JOIN maschine m       ON m.id = s.maschine_id
    JOIN gebaeude g       ON g.id = m.gebaeude_id
    JOIN standort st      ON st.id = g.standort_id
    LEFT JOIN techniker t ON t.id = w.techniker_id
    LEFT JOIN person zv   ON zv.id = w.zugewiesen_von
    WHERE w.status <> 'erledigt' AND ${bedingung}
    ORDER BY (w.techniker_id IS NULL) DESC, s.prioritaet DESC, s.zeitpunkt DESC
    LIMIT 6`;
}

/** Überschrift und Leertext des Abschnitts je Rolle */
const AUFGABEN_TEXTE = {
  Instandhaltung: { titel: T('Dir zugewiesene Aufgaben'), leer: T('Dir ist gerade kein offener Auftrag zugewiesen.') },
  Schichtleitung: { titel: T('Aufgaben in deinem Werk'), leer: T('In deinem Werk ist gerade alles erledigt.') },
  Produktion: { titel: T('Offene Störungen in deinem Werk'), leer: T('In deinem Werk gibt es gerade keine offenen Störungen.') },
};

export default async function Uebersicht() {
  const benutzer = await benutzerPflicht();
  const t = await uebersetzer();
  // Ansicht (Konto → Ansicht): Kennzahlen und Listen nur für dieses Land/Werk
  const ansicht = await ansichtAusCookie();
  const imBlick = ansichtBedingung(ansicht);
  const ortJoin = sql`
      JOIN maschine m  ON m.id = s.maschine_id
      JOIN gebaeude g  ON g.id = m.gebaeude_id
      JOIN standort st ON st.id = g.standort_id`;

  // Alle Abfragen gleichzeitig starten – das ist schneller als nacheinander
  const [[kennzahlen], proStatus, offeneMeldungen, kritischeTeile, standorte] = await Promise.all([
    // Anzahl offener Aufträge, davon "hoch", und in den letzten 30 Tagen erledigte
    sql`
      SELECT COUNT(*) FILTER (WHERE w.status <> 'erledigt')::int                          AS offen,
             COUNT(*) FILTER (WHERE w.status <> 'erledigt' AND s.prioritaet = 'hoch')::int AS dringend,
             COUNT(*) FILTER (WHERE w.status = 'erledigt'
                                AND w.ende_zeit >= now() - interval '30 days')::int        AS erledigt30
      FROM wartungsauftrag w
      JOIN stoermeldung s ON s.id = w.stoermeldung_id
      ${ortJoin}
      WHERE ${imBlick}`,

    // Aufträge nach Status
    sql`
      SELECT w.status, COUNT(*)::int AS anzahl
      FROM wartungsauftrag w JOIN stoermeldung s ON s.id = w.stoermeldung_id ${ortJoin}
      WHERE ${imBlick}
      GROUP BY w.status`,

    // Offene Störmeldungen: zuerst nach Priorität (hoch → niedrig), dann neueste zuerst
    sql`
      SELECT w.id AS auftrag_id, w.status, s.zeitpunkt, s.beschreibung, s.prioritaet,
             m.bezeichnung AS maschine, st.stadt, g.kuerzel AS gebaeude, t.name AS techniker
      FROM wartungsauftrag w
      JOIN stoermeldung s   ON s.id = w.stoermeldung_id
      JOIN maschine m       ON m.id = s.maschine_id
      JOIN gebaeude g       ON g.id = m.gebaeude_id
      JOIN standort st      ON st.id = g.standort_id
      LEFT JOIN techniker t ON t.id = w.techniker_id
      WHERE w.status <> 'erledigt' AND ${imBlick}
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

    // Standorte mit offenen Störungen für die kleine Deutschlandkarte
    standorteMitZahlen(),
  ]);

  // Danach (nicht gleichzeitig – höchstens 5 Abfragen auf einmal): Person und ihre Aufgaben
  const person = await aktuellePerson();
  const aufgaben = person ? await aufgabenDerPerson(person) : [];
  const aufgabenTexte = person ? AUFGABEN_TEXTE[person.rolle] : null;

  // Alle Status in fester Reihenfolge, auch wenn es 0 Aufträge gibt
  const anzahlNachStatus = Object.fromEntries(proStatus.map((z) => [z.status, z.anzahl]));
  const statusVerteilung = STATUS_WERTE.map((s) => ({ status: s, anzahl: anzahlNachStatus[s] ?? 0 }));
  // Die Balken beziehen sich nur auf die offenen Status, damit "erledigt" sie nicht winzig macht
  const maxOffen = Math.max(1, ...statusVerteilung.filter((z) => z.status !== 'erledigt').map((z) => z.anzahl));

  const anzahlKritisch = new Set(kritischeTeile.filter((teil) => teil.bestand < teil.mindestbestand).map((teil) => teil.id)).size;

  return (
    <>
      <div className="seitenkopf d-flex justify-content-between align-items-end flex-wrap gap-3">
        <div>
          <div className="eyebrow">{t(begruessung())}, {person?.name ?? benutzer.anzeigename}</div>
          <h1>{t('Übersicht')}</h1>
          <p>
            {datumLang(new Date(), t.sprache)}
            {/* Hinweis, wenn die Ansicht eingeschränkt ist (ändern: Konto unten in der Seitenleiste) */}
            {ansichtAktiv(ansicht) && (
              <span className="ansicht-chip">
                <i className="bi bi-funnel-fill" aria-hidden="true" />{' '}
                {standorte.find((st) => st.id === ansicht.standortId)?.name
                  ?? t(standorte.find((st) => st.land === ansicht.land)?.land_name ?? ansicht.land)}
              </span>
            )}
          </p>
        </div>
        <Link className="btn btn-primary" href="/melden">
          <i className="bi bi-plus-lg" aria-hidden="true" /> {t('Neue Störung melden')}
        </Link>
      </div>

      {/* Kennzahlen */}
      <div className="row g-4 mb-2">
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Offene Meldungen')} wert={kennzahlen.offen} zusatz={t('noch nicht erledigt')}
                    symbol="bi-exclamation-circle" link="/auftraege?status=offen" i={0} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Priorität hoch')} wert={kennzahlen.dringend} zusatz={t('sofort bearbeiten')}
                    symbol="bi-lightning-charge" link="/auftraege?status=offen&prioritaet=hoch"
                    art={kennzahlen.dringend > 0 ? 'rot' : ''} i={1} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Teile unter Mindestbestand')} wert={anzahlKritisch}
                    zusatz={anzahlKritisch > 0 ? t('Nachschub prüfen') : t('Lager in Ordnung')}
                    symbol="bi-box-seam" art={anzahlKritisch > 0 ? 'warnung' : 'gruen'} i={2} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Erledigt (30 Tage)')} wert={kennzahlen.erledigt30} zusatz={t('abgeschlossene Aufträge')}
                    symbol="bi-check2-circle" art="gruen" i={3} />
        </div>
      </div>

      {/* Aufgaben der gewählten Person (oder Hinweis, eine Person zu wählen) */}
      <section className="karte aufgaben-karte" style={{ '--i': 4 }}>
        {person ? (
          <>
            <div className="karte-kopf">
              <div>
                <h2 className="abschnitt-titel mb-1">{t(aufgabenTexte.titel)}</h2>
                <div className="d-flex align-items-center gap-2 flex-wrap klein">
                  {person.name} <RollenAbzeichen rolle={person.rolle} /> {person.standort}
                </div>
              </div>
              <PersonWaehlenKnopf className="btn btn-sekundaer btn-klein">{t('Person wechseln …')}</PersonWaehlenKnopf>
            </div>
            {aufgaben.length === 0 ? (
              <p className="leer"><i className="bi bi-check-circle" />{t(aufgabenTexte.leer)}</p>
            ) : (
              <ul className="aufgaben-liste">
                {aufgaben.map((a) => (
                  <li key={a.auftrag_id}>
                    <Link href={`/auftraege/${a.auftrag_id}`} prefetch={false} className="aufgabe">
                      <span className="aufgabe-kopf">
                        <strong>{a.maschine}</strong>
                        <PrioritaetPill prioritaet={a.prioritaet} />
                        <StatusPill status={a.status} />
                      </span>
                      <span className="klein text-truncate d-block">{a.stadt} · {a.gebaeude} – {a.beschreibung}</span>
                      <span className="klein d-block">
                        {/* Bei den eigenen Aufgaben steht nur, wer zugewiesen hat */}
                        {a.techniker && person.rolle === 'Instandhaltung'
                          ? (a.zugewiesen_von ? t('zugewiesen von {name}', { name: a.zugewiesen_von }) : t('zugewiesen'))
                          : a.techniker
                          ? (a.zugewiesen_von
                            ? t('{techniker} · zugewiesen von {name}', { techniker: a.techniker, name: a.zugewiesen_von })
                            : a.techniker)
                          : <span className="text-orange">{t('Noch nicht zugewiesen')}</span>}
                        {' · '}{datumZeit(a.zeitpunkt, t.sprache)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="person-hinweis">
            <span className="person-hinweis-symbol" aria-hidden="true"><i className="bi bi-person-badge" /></span>
            <div className="flex-grow-1">
              <h2 className="abschnitt-titel mb-1">{t('Dir zugewiesene Aufgaben')}</h2>
              <p className="klein mb-0">{t('Wähle eine Person aus dem Unternehmen – dann siehst du hier ihre Aufgaben und arbeitest in ihrer Rolle.')}</p>
            </div>
            <PersonWaehlenKnopf>{t('Person wählen …')}</PersonWaehlenKnopf>
          </div>
        )}
      </section>

      <div className="row g-4">
        {/* Offene Störmeldungen */}
        <div className="col-lg-8">
          <section className="karte" style={{ '--i': 5 }}>
            <div className="karte-kopf">
              <h2 className="abschnitt-titel">{t('Offene Störmeldungen')}</h2>
              <Link href="/auftraege?status=offen">{t('Alle anzeigen')}</Link>
            </div>

            {offeneMeldungen.length === 0 ? (
              <p className="leer"><i className="bi bi-check-circle" />{t('Keine offenen Störmeldungen – alle Maschinen laufen.')}</p>
            ) : (
              <div className="tabelle-rahmen">
                <table className="tabelle">
                  <thead>
                    <tr>
                      <th>{t('Maschine')}</th>
                      <th>{t('Priorität')}</th>
                      <th>{t('Status')}</th>
                      <th className="d-none d-md-table-cell">{t('Gemeldet')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offeneMeldungen.map((m) => (
                      <tr key={m.auftrag_id} className="klickbar">
                        <td>
                          <Link className="zeilen-link" prefetch={false} href={`/auftraege/${m.auftrag_id}`}>{m.maschine}</Link>
                          <div className="klein text-truncate beschreibung-kurz">{m.stadt} · {m.gebaeude} – {m.beschreibung}</div>
                        </td>
                        <td><PrioritaetPill prioritaet={m.prioritaet} /></td>
                        <td>
                          <StatusPill status={m.status} />
                          {m.techniker && <div className="klein mt-1">{m.techniker}</div>}
                        </td>
                        <td className="d-none d-md-table-cell klein">{datumZeit(m.zeitpunkt, t.sprache)}</td>
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
          <section className="karte" style={{ '--i': 6 }}>
            <h2 className="abschnitt-titel">{t('Aufträge nach Status')}</h2>
            <ul className="status-liste">
              {statusVerteilung.map(({ status, anzahl }) => (
                <li key={status}>
                  <StatusPill status={status} />
                  {status !== 'erledigt' ? (
                    <div className="status-balken" aria-hidden="true">
                      <span style={{ width: `${Math.round((anzahl / maxOffen) * 100)}%` }} />
                    </div>
                  ) : (
                    <div className="flex-grow-1 klein">{t('gesamt')}</div>
                  )}
                  <Link className="status-anzahl" href={`/auftraege?status=${encodeURIComponent(status)}`}>{anzahl}</Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Kleine Deutschlandkarte: Klick auf ein Werk öffnet die Störungskarte dort */}
          <section className="karte" style={{ '--i': 7 }}>
            <div className="karte-kopf">
              <h2 className="abschnitt-titel">{t('Standorte')}</h2>
              <Link href="/karte">{t('Zur Karte')}</Link>
            </div>
            <KleineKarte standorte={standorte} />
          </section>
        </div>
      </div>

      {/* Ersatzteile unter Mindestbestand & offene Bestellungen */}
      <section className="karte" style={{ '--i': 8 }}>
        <div className="karte-kopf">
          <h2 className="abschnitt-titel">{t('Ersatzteile unter Mindestbestand')}</h2>
          <span className="klein">{t('inkl. offener Bestellungen')}</span>
        </div>

        {kritischeTeile.length === 0 ? (
          <p className="leer"><i className="bi bi-box-seam" />{t('Alle Ersatzteile sind ausreichend auf Lager, keine offenen Bestellungen.')}</p>
        ) : (
          <div className="tabelle-rahmen">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>{t('Ersatzteil')}</th>
                  <th className="zahl">{t('Bestand')}</th>
                  <th className="zahl">{t('Mindestbestand')}</th>
                  <th>{t('Nachbestellung')}</th>
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
                          <span className="pill pill-orange">{t('bestellt')}</span>
                          <span className="klein ms-2">{t('{n} Stk. am {datum}', { n: teil.bestellmenge, datum: datum(teil.bestelldatum, t.sprache) })}</span>
                        </>
                      ) : (
                        <span className="pill pill-rot">{t('nicht bestellt')}</span>
                      )}
                    </td>
                    <td className="text-end">
                      {teil.bestellung_id && (
                        // Wareneingang buchen: erhöht den Bestand um die Bestellmenge
                        <form action={lieferungBuchen} className="d-inline">
                          <input type="hidden" name="bestellung_id" value={teil.bestellung_id} />
                          <SpeichernKnopf className="btn btn-sekundaer btn-klein" ladeText={t('Buche …')}>
                            <i className="bi bi-truck" aria-hidden="true" /> {t('Lieferung eingegangen')}
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
