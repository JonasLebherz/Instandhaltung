/**
 * app/auftraege/[id]/page.js – Wartungsauftrag bearbeiten
 *
 * Aufruf: /auftraege/<ID des Wartungsauftrags>
 *
 * Links: Störmeldung (nur lesend) mit Fortschrittsanzeige und darunter das
 * Bearbeitungsformular. Rechts: verwendete Ersatzteile und Teilebuchung.
 * Die Formulare liegen in Formulare.js, die Logik in app/aktionen.js.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { STATUS_WERTE } from '@/lib/konstanten';
import { datumZeit, dauer, fuerDatetimeInput } from '@/lib/format';
import { StatusPill, PrioritaetPill } from '@/components/Pills';
import { BearbeitungsFormular, TeilBuchenFormular } from './Formulare';
import { uebersetzer } from '@/lib/sprache/server';
import { gross } from '@/lib/sprache';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const t = await uebersetzer();
  return { title: t('Auftrag {n}', { n: id }) };
}

export default async function AuftragSeite({ params }) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const auftragId = Number(id);

  const [auftrag] = await sql`
    SELECT w.id, w.stoermeldung_id, w.techniker_id, w.status, w.start_zeit, w.ende_zeit, w.massnahme,
           s.zeitpunkt, s.gemeldet_von, s.beschreibung, s.ursache_kategorie, s.prioritaet,
           m.id AS maschine_id, m.bezeichnung AS maschine, m.anlagennummer,
           g.kuerzel AS gebaeude_kuerzel, g.bezeichnung AS gebaeude,
           st.id AS standort_id, st.kuerzel AS standort_kuerzel, st.name AS standort
    FROM wartungsauftrag w
    JOIN stoermeldung s ON s.id = w.stoermeldung_id
    JOIN maschine m     ON m.id = s.maschine_id
    JOIN gebaeude g     ON g.id = m.gebaeude_id
    JOIN standort st    ON st.id = g.standort_id
    WHERE w.id = ${auftragId}`;
  if (!auftrag) notFound();

  const [techniker, ersatzteile, gebuchteTeile] = await Promise.all([
    // Techniker des eigenen Standorts zuerst
    sql`
      SELECT t.id, t.name, t.qualifikation, t.schicht, (t.standort_id = ${auftrag.standort_id}) AS vor_ort,
             COALESCE(st.name, ${t('ohne Standort')}) AS standort
      FROM techniker t LEFT JOIN standort st ON st.id = t.standort_id
      ORDER BY (t.standort_id = ${auftrag.standort_id}) DESC, st.name, t.name`,
    sql`SELECT id, bezeichnung, bestand, mindestbestand FROM ersatzteil ORDER BY bezeichnung`,
    sql`
      SELECT e.bezeichnung, ae.menge
      FROM auftrag_ersatzteil ae JOIN ersatzteil e ON e.id = ae.ersatzteil_id
      WHERE ae.auftrag_id = ${auftragId}
      ORDER BY e.bezeichnung`,
  ]);

  // Position des aktuellen Status im Ablauf (für die Fortschrittsanzeige)
  const aktuellerIndex = STATUS_WERTE.indexOf(auftrag.status);

  // Ausfall- und Reparaturdauer in Minuten (nur bei abgeschlossenen Aufträgen)
  const ausfallMinuten = auftrag.ende_zeit ? (auftrag.ende_zeit - auftrag.zeitpunkt) / 60000 : null;
  const reparaturMinuten = auftrag.ende_zeit && auftrag.start_zeit ? (auftrag.ende_zeit - auftrag.start_zeit) / 60000 : null;

  // Startwerte für das Bearbeitungsformular
  const startwerte = {
    techniker_id: auftrag.techniker_id ? String(auftrag.techniker_id) : '',
    status: auftrag.status,
    start_zeit: fuerDatetimeInput(auftrag.start_zeit),
    ende_zeit: fuerDatetimeInput(auftrag.ende_zeit),
    massnahme: auftrag.massnahme ?? '',
  };

  return (
    <>
      <div className="mb-3">
        <Link href="/auftraege"><i className="bi bi-chevron-left" aria-hidden="true" /> {t('Alle Aufträge')}</Link>
      </div>

      <div className="seitenkopf">
        <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
          <StatusPill status={auftrag.status} />
          <PrioritaetPill prioritaet={auftrag.prioritaet} />
        </div>
        <h1>{auftrag.maschine}</h1>
        <p>
          {t('Störmeldung Nr. {n}', { n: auftrag.stoermeldung_id })} · {auftrag.standort} · {auftrag.gebaeude} · {auftrag.anlagennummer}{' '}
          <Link href={`/karte?werk=${auftrag.standort_kuerzel.toLowerCase()}&halle=${auftrag.gebaeude_kuerzel.toLowerCase()}&maschine=${auftrag.maschine_id}`}
                className="ms-1 text-nowrap">
            <i className="bi bi-geo-alt" aria-hidden="true" /> {t('Auf der Karte zeigen')}
          </Link>
        </p>
      </div>

      <div className="row g-4">
        <div className="col-lg-7">
          {/* Störmeldung (nur lesend) */}
          <section className="karte" style={{ '--i': 0 }}>
            <h2 className="abschnitt-titel">{t('Störmeldung')}</h2>
            <p className="mb-4" style={{ whiteSpace: 'pre-line' }}>{auftrag.beschreibung}</p>
            <dl className="details mb-4">
              <dt>{t('Gemeldet am')}</dt><dd>{datumZeit(auftrag.zeitpunkt, t.sprache)}</dd>
              <dt>{t('Gemeldet von')}</dt><dd>{auftrag.gemeldet_von}</dd>
              <dt>{t('Ursache')}</dt><dd>{t(auftrag.ursache_kategorie)}</dd>
              {ausfallMinuten !== null && (
                <>
                  <dt>{t('Ausfallzeit')}</dt><dd>{dauer(ausfallMinuten)}</dd>
                  <dt>{t('Reparaturdauer')}</dt><dd>{dauer(reparaturMinuten)}</dd>
                </>
              )}
            </dl>

            {/* Fortschritt: gemeldet → zugewiesen → in Arbeit → wartet auf Teil → erledigt */}
            <ol className="ablauf" aria-label={t('Bearbeitungsstand')}>
              {STATUS_WERTE.map((schritt, i) => (
                <li key={schritt} style={{ '--i': i }}
                    className={`${i <= aktuellerIndex ? 'erreicht' : ''}${i === aktuellerIndex ? ' aktuell' : ''}`}
                    aria-current={i === aktuellerIndex ? 'step' : undefined}>
                  {gross(t(schritt))}
                </li>
              ))}
            </ol>
          </section>

          <BearbeitungsFormular auftragId={auftragId} techniker={techniker} startwerte={startwerte} />
        </div>

        {/* Ersatzteile */}
        <div className="col-lg-5">
          <section className="karte" style={{ '--i': 2 }}>
            <h2 className="abschnitt-titel">{t('Verwendete Ersatzteile')}</h2>

            {gebuchteTeile.length === 0 ? (
              <p className="text-leise">{t('Noch keine Ersatzteile gebucht.')}</p>
            ) : (
              <table className="tabelle mb-4">
                <thead><tr><th>{t('Ersatzteil')}</th><th className="zahl">{t('Menge')}</th></tr></thead>
                <tbody>
                  {gebuchteTeile.map((teil) => (
                    <tr key={teil.bezeichnung}><td>{teil.bezeichnung}</td><td className="zahl">{teil.menge}</td></tr>
                  ))}
                </tbody>
              </table>
            )}

            {auftrag.status !== 'erledigt' && <TeilBuchenFormular auftragId={auftragId} ersatzteile={ersatzteile} />}
          </section>
        </div>
      </div>
    </>
  );
}
