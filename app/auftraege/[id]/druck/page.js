/**
 * app/auftraege/[id]/druck/page.js – Arbeitsauftrag zum Drucken bzw. als PDF
 *
 * Aufruf: /auftraege/<ID>/druck (Knopf „Arbeitsauftrag drucken“ auf der Auftragsseite).
 * Ein DIN-A4-Blatt wie ein Arbeitsauftrag in der Werkstatt:
 *   Kopf mit Logo, Auftragsnummer, Druckdatum und QR-Code (öffnet den Auftrag am Tablet/Handy),
 *   Störung (wann, wer, Priorität, Ursache, Beschreibung), Bearbeitung (Status, Techniker),
 *   Maschine mit Stammdaten und Zeichnung der Stellfläche (Bemaßung), Lageplan des Werks und
 *   Grundriss der Halle (Maschine schraffiert), Checkliste zum Abhaken, Ersatzteile mit leeren Zeilen,
 *   Maßnahme, Arbeitszeit und Unterschriften.
 * „Drucken / PDF“ öffnet den Druckdialog (dort „Als PDF speichern“). Beim Drucken sind
 * Seitenleiste und Knöpfe ausgeblendet (@media print, .nicht-drucken).
 * 4 Abfragen: Auftrag, danach gleichzeitig Hallen des Werks, Maschinen der Halle, gebuchte Teile.
 */
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { idAus } from '@/lib/eingabe';
import { benutzerPflicht } from '@/lib/auth';
import { checklisteFuer } from '@/lib/konstanten';
import { datum, datumZeit, euro } from '@/lib/format';
import { uebersetzer } from '@/lib/sprache/server';
import { gross } from '@/lib/sprache';
import Logo, { PRODUKTNAME } from '@/components/Logo';
import QrCode from '@/components/QrCode';
import DruckKnopf from '@/app/qr/DruckKnopf';
import { LageWerk, LageHalle, Stellflaeche } from './Zeichnungen';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const t = await uebersetzer();
  return { title: t('Arbeitsauftrag {n}', { n: id }) };
}

export default async function ArbeitsauftragDruck({ params }) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const auftragId = idAus((await params).id);
  if (!auftragId) notFound();

  const [a] = await sql`
    SELECT w.id, w.status::text AS status, w.start_zeit, w.ende_zeit, w.massnahme, w.checkliste,
           s.id AS meldung_id, s.zeitpunkt, s.gemeldet_von, s.beschreibung, s.ursache_kategorie::text AS ursache, s.prioritaet::text AS prioritaet,
           tech.name AS techniker, tech.qualifikation, zv.name AS zugewiesen_von,
           m.id AS maschine_id, m.bezeichnung AS maschine, m.anlagennummer, m.typ::text AS typ, m.baujahr,
           m.pos_x_m, m.pos_y_m, m.breite_m, m.tiefe_m, m.kosten_pro_stunde::float AS kosten,
           g.id AS gebaeude_id, g.kuerzel AS gebaeude_kuerzel, g.bezeichnung AS gebaeude, g.breite_m AS g_breite, g.tiefe_m AS g_tiefe, g.bereiche,
           st.id AS standort_id, st.name AS standort, st.stadt, st.gelaende_breite_m AS st_breite, st.gelaende_tiefe_m AS st_tiefe, l.name AS land
    FROM wartungsauftrag w
    JOIN stoermeldung s ON s.id = w.stoermeldung_id
    JOIN maschine m     ON m.id = s.maschine_id
    JOIN gebaeude g     ON g.id = m.gebaeude_id
    JOIN standort st    ON st.id = g.standort_id
    JOIN land l         ON l.kuerzel = st.land_kuerzel
    LEFT JOIN techniker tech ON tech.id = w.techniker_id
    LEFT JOIN person zv      ON zv.id = w.zugewiesen_von
    WHERE w.id = ${auftragId}`;
  if (!a) notFound();

  const [hallen, maschinen, teile] = await Promise.all([
    sql`SELECT id, kuerzel, lage_x_m AS x, lage_y_m AS y, breite_m AS b, tiefe_m AS t FROM gebaeude WHERE standort_id = ${a.standort_id} ORDER BY kuerzel`,
    sql`SELECT id, anlagennummer, pos_x_m AS x, pos_y_m AS y, breite_m AS b, tiefe_m AS t FROM maschine WHERE gebaeude_id = ${a.gebaeude_id}`,
    sql`SELECT e.bezeichnung, ae.menge FROM auftrag_ersatzteil ae JOIN ersatzteil e ON e.id = ae.ersatzteil_id
        WHERE ae.auftrag_id = ${auftragId} ORDER BY e.bezeichnung`,
  ]);

  // Adresse des Auftrags für den QR-Code (Domain der App)
  const h = await headers();
  const adresse = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}/auftraege/${a.id}`;
  // Bereich der Halle, in dem die Maschine steht (Mitte der Stellfläche)
  const mx = a.pos_x_m + a.breite_m / 2, my = a.pos_y_m + a.tiefe_m / 2;
  const bereich = (a.bereiche ?? []).find((b) => mx >= b.x && mx <= b.x + b.b && my >= b.y && my <= b.y + b.t)?.name;
  const punkte = checklisteFuer(a.typ);
  const erledigt = new Set(a.checkliste ?? []);
  const leer = '—';
  const meter = (w) => `${w.toLocaleString(t.sprache === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: 1 })} m`;

  return (
    <>
      <div className="druck-leiste nicht-drucken">
        <Link href={`/auftraege/${a.id}`}><i className="bi bi-chevron-left" aria-hidden="true" /> {t('Auftrag {n}', { n: a.id })}</Link>
        <DruckKnopf />
      </div>

      <article className="auftragsblatt" aria-label={t('Arbeitsauftrag {n}', { n: a.id })}>
        {/* Kopf: Firma/App links, Auftrag in der Mitte, QR-Code rechts */}
        <header className="ab-kopf">
          <div className="ab-marke"><Logo groesse={34} /><span>{PRODUKTNAME}</span></div>
          <div className="ab-titel">
            <div className="ab-art">{t('Arbeitsauftrag')}</div>
            <div className="ab-nr">{t('Nr. {n}', { n: a.id })}</div>
            <div className="ab-klein">{t('Störmeldung Nr. {n}', { n: a.meldung_id })} · {t('Gedruckt am {datum}', { datum: datumZeit(new Date(), t.sprache) })}</div>
          </div>
          <div className="ab-qr">
            <QrCode text={adresse} titel={t('Auftrag öffnen')} />
            <span>{t('Scannen: Auftrag am Tablet öffnen')}</span>
          </div>
        </header>

        {/* Störung und Bearbeitung */}
        <section className="ab-abschnitt">
          <h2>{t('Störung')}</h2>
          <div className="ab-zwei">
            <dl className="ab-felder">
              <dt>{t('Gemeldet am')}</dt><dd>{datumZeit(a.zeitpunkt, t.sprache)}</dd>
              <dt>{t('Gemeldet von')}</dt><dd>{a.gemeldet_von}</dd>
              <dt>{t('Priorität')}</dt><dd><span className={`ab-prio ab-prio-${a.prioritaet}`}>{gross(t(a.prioritaet))}</span></dd>
              <dt>{t('Ursache')}</dt><dd>{a.ursache ? t(a.ursache) : leer}</dd>
            </dl>
            <dl className="ab-felder">
              <dt>{t('Status')}</dt><dd>{gross(t(a.status))}</dd>
              <dt>{t('Techniker')}</dt><dd>{a.techniker ? `${a.techniker}${a.qualifikation ? ` (${a.qualifikation})` : ''}` : leer}</dd>
              <dt>{t('Zugewiesen von')}</dt><dd>{a.zugewiesen_von ?? leer}</dd>
              <dt>{t('Ausfallkosten')}</dt><dd>{t('{betrag} je Stunde', { betrag: euro(a.kosten, t.sprache) })}</dd>
            </dl>
          </div>
          <div className="ab-beschreibung">{a.beschreibung}</div>
        </section>

        {/* Maschine: Stammdaten und Zeichnung der Stellfläche */}
        <section className="ab-abschnitt">
          <h2>{t('Maschine')}</h2>
          <div className="ab-zwei">
            <dl className="ab-felder">
              <dt>{t('Bezeichnung')}</dt><dd><strong>{a.maschine}</strong></dd>
              <dt>{t('Anlagennummer')}</dt><dd className="ab-mono">{a.anlagennummer}</dd>
              <dt>{t('Typ')}</dt><dd>{t(a.typ)}</dd>
              <dt>{t('Baujahr')}</dt><dd>{a.baujahr}</dd>
              <dt>{t('Werk')}</dt><dd>{a.standort} · {a.stadt}, {t(a.land)}</dd>
              <dt>{t('Halle')}</dt><dd>{a.gebaeude}{bereich && !a.gebaeude.includes(bereich) ? ` · ${t('Bereich')} ${bereich}` : ''}</dd>
              <dt>{t('Stellfläche')}</dt><dd>{meter(a.breite_m)} × {meter(a.tiefe_m)}</dd>
            </dl>
            <figure className="ab-figur">
              <Stellflaeche breite={a.breite_m} tiefe={a.tiefe_m} beschriftung={a.anlagennummer} />
              <figcaption>{t('Draufsicht, Maße der Stellfläche')}</figcaption>
            </figure>
          </div>
        </section>

        {/* Lage: Werk und Halle */}
        <section className="ab-abschnitt">
          <h2>{t('Lage')}</h2>
          <div className="ab-zwei ab-lage">
            <figure className="ab-figur">
              <LageWerk breite={a.st_breite} tiefe={a.st_tiefe} hallen={hallen} zielId={a.gebaeude_id} />
              <figcaption>{t('Lageplan {werk}', { werk: a.standort })} · {a.gebaeude_kuerzel} {t('schraffiert')}</figcaption>
            </figure>
            <figure className="ab-figur">
              <LageHalle breite={a.g_breite} tiefe={a.g_tiefe} bereiche={a.bereiche ?? []} maschinen={maschinen} zielId={a.maschine_id} />
              <figcaption>{t('Grundriss {halle}', { halle: a.gebaeude })} · {a.anlagennummer} {t('schraffiert')}</figcaption>
            </figure>
          </div>
        </section>

        {/* Checkliste und Ersatzteile */}
        <section className="ab-abschnitt ab-zwei">
          <div>
            <h2>{t('Checkliste')}</h2>
            <ul className="ab-checkliste">
              {punkte.map((text, nr) => (
                <li key={text}><span className={`ab-kasten${erledigt.has(nr) ? ' an' : ''}`} aria-hidden="true">{erledigt.has(nr) ? '✓' : ''}</span>{t(text)}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2>{t('Ersatzteile')}</h2>
            <table className="ab-tabelle">
              <thead><tr><th>{t('Bezeichnung')}</th><th className="ab-menge">{t('Menge')}</th></tr></thead>
              <tbody>
                {teile.map((x) => <tr key={x.bezeichnung}><td>{x.bezeichnung}</td><td className="ab-menge">{x.menge}</td></tr>)}
                {Array.from({ length: Math.max(2, 4 - teile.length) }, (_, i) => <tr key={`leer-${i}`} className="ab-leer"><td /><td /></tr>)}
              </tbody>
            </table>
          </div>
        </section>

        {/* Maßnahme, Arbeitszeit, Unterschriften */}
        <section className="ab-abschnitt">
          <h2>{t('Durchgeführte Maßnahme')}</h2>
          {a.massnahme ? <div className="ab-beschreibung">{a.massnahme}</div> : <div className="ab-linien" aria-hidden="true"><i /><i /><i /></div>}
          <div className="ab-zeiten">
            <div><span>{t('Arbeitsbeginn')}</span><b>{a.start_zeit ? datumZeit(a.start_zeit, t.sprache) : ''}</b></div>
            <div><span>{t('Arbeitsende')}</span><b>{a.ende_zeit ? datumZeit(a.ende_zeit, t.sprache) : ''}</b></div>
            <div><span>{t('Maschine freigegeben')}</span><b className="ab-janein">☐ {t('Ja')}   ☐ {t('Nein')}</b></div>
          </div>
          <div className="ab-unterschriften">
            <div><i /><span>{t('Datum, Unterschrift Techniker')}</span></div>
            <div><i /><span>{t('Datum, Unterschrift Schichtleitung')}</span></div>
          </div>
        </section>

        <footer className="ab-fuss">
          <span>{PRODUKTNAME} · {t('Arbeitsauftrag')} {a.id} · {a.anlagennummer}</span>
          <span>{datum(new Date(), t.sprache)}</span>
        </footer>
      </article>
    </>
  );
}
