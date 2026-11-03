/**
 * app/maschinen/[id]/page.js – alles zu einer Maschine: Stammdaten, Kennzahlen und Maschinenhistorie
 *
 * Kennzahlen über die letzten 12 Monate, mit denselben Definitionen wie die Views und die Statistik:
 *   MTTR          = Ø (ende_zeit − start_zeit) erledigter Aufträge
 *   Ausfallzeit   = Σ (ende_zeit − Meldezeitpunkt) erledigter Aufträge
 *   MTBF          = Zeitraum / Anzahl Störungen
 *   Verfügbarkeit = 1 − Ausfallzeit / Zeitraum
 *   Reaktionszeit = Ø (start_zeit − Meldezeitpunkt)
 * 4 Abfragen gleichzeitig (Maschine, Historie, Ersatzteile, Techniker des Werks).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { uebersetzer } from '@/lib/sprache/server';
import { gross } from '@/lib/sprache';
import { zahl, dauer } from '@/lib/format';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import { ampelZustand, AMPEL_TEXT } from '@/lib/karten/ampel';
import Kennzahl from '@/components/Kennzahl';
import MaschinenHistorie from './MaschinenHistorie';
import MaschinenModell from './MaschinenModell';

export const dynamic = 'force-dynamic';

const TAGE = 365;   // Zeitraum der Kennzahlen

export async function generateMetadata({ params }) {
  const { id } = await params;
  const t = await uebersetzer();
  if (!/^\d+$/.test(id)) return { title: t('Maschine') };
  const [m] = await sql`SELECT bezeichnung FROM maschine WHERE id = ${Number(id)}`;
  return { title: m?.bezeichnung ?? t('Maschine') };
}

export default async function MaschinenSeite({ params }) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const maschineId = Number(id);

  const [[maschine], historie, teile, techniker] = await Promise.all([
    sql`
      SELECT m.id, m.anlagennummer, m.bezeichnung, m.typ::text AS typ, m.baujahr, m.breite_m, m.tiefe_m,
             g.id AS gebaeude_id, g.kuerzel AS gebaeude_kuerzel, g.bezeichnung AS gebaeude,
             st.id AS standort_id, st.kuerzel AS standort_kuerzel, st.name AS standort, st.stadt, l.name AS land,
             (SELECT COUNT(*)::int FROM stoermeldung s JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
              WHERE s.maschine_id = m.id AND w.status <> 'erledigt') AS offen,
             (SELECT MAX(s.prioritaet)::text FROM stoermeldung s JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
              WHERE s.maschine_id = m.id AND w.status <> 'erledigt') AS hoechste_prioritaet
      FROM maschine m
      JOIN gebaeude g  ON g.id = m.gebaeude_id
      JOIN standort st ON st.id = g.standort_id
      JOIN land l      ON l.kuerzel = st.land_kuerzel
      WHERE m.id = ${maschineId}`,
    sql`
      SELECT w.id AS auftrag_id, s.id AS meldung_id, s.zeitpunkt, s.beschreibung, s.gemeldet_von,
             s.ursache_kategorie::text AS ursache, s.prioritaet::text AS prioritaet, w.status::text AS status,
             w.start_zeit, w.ende_zeit, w.massnahme, tech.name AS techniker,
             to_char(s.zeitpunkt AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS monat,
             CASE WHEN w.status = 'erledigt' THEN EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 60 END::float AS reparatur_min,
             CASE WHEN w.status = 'erledigt' THEN EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 60 END::float AS ausfall_min,
             EXTRACT(EPOCH FROM (w.start_zeit - s.zeitpunkt))::float / 60 AS reaktion_min,
             (s.zeitpunkt >= now() - make_interval(days => ${TAGE})) AS im_zeitraum
      FROM stoermeldung s
      JOIN wartungsauftrag w   ON w.stoermeldung_id = s.id
      LEFT JOIN techniker tech ON tech.id = w.techniker_id
      WHERE s.maschine_id = ${maschineId}
      ORDER BY s.zeitpunkt DESC`,
    sql`
      SELECT e.id, e.bezeichnung, SUM(ae.menge)::int AS menge, COUNT(DISTINCT ae.auftrag_id)::int AS auftraege
      FROM auftrag_ersatzteil ae
      JOIN ersatzteil e        ON e.id = ae.ersatzteil_id
      JOIN wartungsauftrag w   ON w.id = ae.auftrag_id
      JOIN stoermeldung s      ON s.id = w.stoermeldung_id
      WHERE s.maschine_id = ${maschineId}
      GROUP BY e.id, e.bezeichnung
      ORDER BY menge DESC, e.bezeichnung`,
    sql`
      SELECT t.id, t.name, t.qualifikation, t.schicht::text AS schicht
      FROM techniker t
      WHERE t.standort_id = (SELECT g.standort_id FROM maschine m JOIN gebaeude g ON g.id = m.gebaeude_id WHERE m.id = ${maschineId})
      ORDER BY t.name`,
  ]);
  if (!maschine) notFound();

  // Kennzahlen der letzten 12 Monate (im Browser bzw. hier aus derselben Liste wie die Historie)
  const zeitraum = historie.filter((h) => h.im_zeitraum);
  const erledigt = zeitraum.filter((h) => h.status === 'erledigt' && h.reparatur_min !== null);
  const mittel = (liste, wert) => (liste.length ? liste.reduce((s, x) => s + wert(x), 0) / liste.length : null);
  const mttrMin = mittel(erledigt, (h) => h.reparatur_min);
  const ausfallMin = erledigt.reduce((s, h) => s + (h.ausfall_min ?? 0), 0);
  const mtbfTage = zeitraum.length ? TAGE / zeitraum.length : null;
  const verfuegbarkeit = Math.max(0, 1 - ausfallMin / (TAGE * 24 * 60)) * 100;
  const mitReaktion = zeitraum.filter((h) => h.reaktion_min !== null && h.reaktion_min >= 0);
  const reaktionMin = mittel(mitReaktion, (h) => h.reaktion_min);
  const zustand = ampelZustand(maschine);
  const alter = new Date().getFullYear() - maschine.baujahr;
  const s = t.sprache;

  return (
    <>
      <div className="seitenkopf maschinen-kopf">
        <span className="detail-symbol" aria-hidden="true"><i className={`bi ${MASCHINEN_SYMBOLE[maschine.typ] ?? 'bi-gear'}`} /></span>
        <div className="flex-grow-1">
          <h1>{maschine.bezeichnung}</h1>
          <p>
            {maschine.anlagennummer} · {t(maschine.typ)} · {t('Baujahr {n}', { n: maschine.baujahr })} ({t('{n} Jahre alt', { n: alter })})
            <br />
            <Link href={`/karte?werk=${maschine.standort_kuerzel.toLowerCase()}&halle=${maschine.gebaeude_kuerzel.toLowerCase()}&maschine=${maschine.id}`}>
              <i className="bi bi-geo-alt" aria-hidden="true" /> {maschine.standort} · {maschine.gebaeude} · {t(maschine.land)}
            </Link>
          </p>
        </div>
        <Link href={`/melden?maschine=${maschine.id}`} className="btn btn-primary">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" /> {t('Störung an dieser Maschine melden')}
        </Link>
      </div>

      <div className="row g-4 mb-2">
        <div className="col-lg-4">
          <section className="karte h-100" style={{ '--i': 0 }}>
            <div className={`ampel-zeile ampel-${zustand}`}>
              <span className="ampel-symbol" aria-hidden="true"><i /><i /><i /></span>
              {t(AMPEL_TEXT[zustand])}
              {maschine.offen > 0 && <span className="ms-auto klein">{t('{n} offen', { n: maschine.offen })}</span>}
            </div>
            <MaschinenModell maschine={maschine} />
          </section>
        </div>
        <div className="col-lg-8">
          <div className="row g-3">
            <div className="col-6 col-md-4"><Kennzahl titel={t('Störungen 12 Mon.')} wert={zeitraum.length} zusatz={t('{n} insgesamt', { n: historie.length })} symbol="bi-exclamation-circle" i={1} /></div>
            <div className="col-6 col-md-4"><Kennzahl titel={t('Verfügbarkeit')} wert={verfuegbarkeit} nachkomma={2} einheit="%" zusatz={t('letzte 12 Monate')} symbol="bi-speedometer2" i={2} /></div>
            <div className="col-6 col-md-4"><Kennzahl titel="MTTR" wert={mttrMin === null ? null : mttrMin / 60} nachkomma={1} einheit="h" zusatz={t('Ø Reparaturdauer')} symbol="bi-wrench" i={3} /></div>
            <div className="col-6 col-md-4"><Kennzahl titel="MTBF" wert={mtbfTage} nachkomma={1} einheit={t('Tage')} zusatz={t('Ø Tage zwischen Störungen')} symbol="bi-arrow-left-right" i={4} /></div>
            <div className="col-6 col-md-4"><Kennzahl titel={t('Ausfallzeit')} wert={ausfallMin / 60} nachkomma={1} einheit="h" zusatz={t('letzte 12 Monate')} symbol="bi-hourglass-split" i={5} /></div>
            <div className="col-6 col-md-4"><Kennzahl titel={t('Ø Reaktionszeit')} wert={reaktionMin === null ? null : reaktionMin / 60} nachkomma={1} einheit="h" zusatz={t('bis Arbeitsbeginn')} symbol="bi-stopwatch" i={6} /></div>
          </div>
        </div>
      </div>

      {/* Historie (Tabelle mit Filter) und kleine Auswertungen – Client-Komponente */}
      <MaschinenHistorie historie={historie.map((h) => ({ ...h, zeitpunkt: h.zeitpunkt.toISOString(), start_zeit: h.start_zeit?.toISOString() ?? null, ende_zeit: h.ende_zeit?.toISOString() ?? null }))} />

      <div className="row g-4">
        <div className="col-lg-6">
          <section className="karte h-100" style={{ '--i': 9 }}>
            <h2 className="abschnitt-titel">{t('Verbaute Ersatzteile')}</h2>
            {teile.length === 0 ? (
              <p className="leer"><i className="bi bi-box-seam" />{t('Noch keine Ersatzteile an dieser Maschine verbaut.')}</p>
            ) : (
              <ul className="ort-liste">
                {teile.map((e) => (
                  <li key={e.id}>
                    <div className="ort-zeile">
                      <i className="bi bi-box-seam fs-5 text-leise" aria-hidden="true" />
                      <span className="flex-grow-1"><span className="ort-titel">{e.bezeichnung}</span>
                        <span className="ort-unter">{e.auftraege === 1 ? t('in 1 Auftrag') : t('in {n} Aufträgen', { n: e.auftraege })}</span></span>
                      <strong>{zahl(e.menge, 0, s)} ×</strong>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="col-lg-6">
          <section className="karte h-100" style={{ '--i': 10 }}>
            <h2 className="abschnitt-titel">{t('Zuständige Techniker')}</h2>
            <p className="klein">{maschine.standort}</p>
            <ul className="ort-liste">
              {techniker.map((x) => (
                <li key={x.id}>
                  <div className="ort-zeile">
                    <i className="bi bi-person-gear fs-5 text-leise" aria-hidden="true" />
                    <span><span className="ort-titel">{x.name}</span><span className="ort-unter">{t(x.qualifikation)} · {gross(t(x.schicht))}</span></span>
                  </div>
                </li>
              ))}
            </ul>
            {mttrMin !== null && <p className="klein mt-3 mb-0">{t('Ø Reparaturdauer hier: {d}', { d: dauer(mttrMin) })}</p>}
          </section>
        </div>
      </div>
    </>
  );
}
