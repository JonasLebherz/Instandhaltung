'use client';
/**
 * MaschinenHistorie.js – Maschinenhistorie: alle Störungen der Maschine mit Auftrag
 *
 * Filter alle/offen/erledigt, jede Zeile führt zum Auftrag (/auftraege/<auftrags-id>).
 * Dazu zwei kleine Auswertungen aus derselben Liste: Störungen pro Monat (letzte 12 Monate) und nach Ursache.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import { StatusPill, PrioritaetPill } from '@/components/Pills';
import { datumZeit, dauer, monatKurz } from '@/lib/format';
import Diagramm from '@/app/statistik/Diagramm';

const FILTER = [['alle', 'Alle'], ['offen', 'Offen'], ['erledigt', 'Erledigt']];

/** Letzte 12 Monate als 'YYYY-MM' (deutsche Zeit) */
function letzteMonate() {
  const jetzt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(jetzt.getFullYear(), jetzt.getMonth() - 11 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

export default function MaschinenHistorie({ historie }) {
  const t = useT();
  const [filter, setFilter] = useState('alle');
  const liste = historie.filter((h) => filter === 'alle' || (filter === 'offen' ? h.status !== 'erledigt' : h.status === 'erledigt'));

  const auswertung = useMemo(() => {
    const monate = letzteMonate();
    const proMonat = monate.map((mo) => ({ mo, anzahl: historie.filter((h) => h.monat === mo).length }));
    const ursachen = {};
    historie.filter((h) => h.im_zeitraum).forEach((h) => { ursachen[h.ursache ?? '–'] = (ursachen[h.ursache ?? '–'] ?? 0) + 1; });
    return { proMonat, ursachen: Object.entries(ursachen).sort((a, b) => b[1] - a[1]) };
  }, [historie]);

  return (
    <>
      <div className="row g-4 mb-2">
        <div className="col-lg-7">
          <section className="karte h-100" style={{ '--i': 7 }}>
            <h2 className="abschnitt-titel">{t('Störungen pro Monat')}</h2>
            <Diagramm art="saeulen" labels={auswertung.proMonat.map((m) => monatKurz(Number(m.mo.slice(5)), t.sprache))} werte={auswertung.proMonat.map((m) => m.anzahl)}
                      beschreibung={t('Störungen pro Monat')} spalte={t('Störungen')} hoehe={220} />
          </section>
        </div>
        <div className="col-lg-5">
          <section className="karte h-100" style={{ '--i': 8 }}>
            <h2 className="abschnitt-titel">{t('Nach Ursache')}</h2>
            {auswertung.ursachen.length === 0 ? (
              <p className="leer"><i className="bi bi-check-circle" />{t('Keine Störungen in den letzten 12 Monaten.')}</p>
            ) : (
              <Diagramm art="balken" labels={auswertung.ursachen.map(([u]) => t(u))} werte={auswertung.ursachen.map(([, n]) => n)}
                        beschreibung={t('Störungen nach Ursache')} spalte={t('Störungen')} hoehe={220} />
            )}
          </section>
        </div>
      </div>

      <section className="karte mb-4" style={{ '--i': 8 }}>
        <div className="karte-kopf">
          <h2 className="abschnitt-titel">{t('Maschinenhistorie')}</h2>
          <div className="sprach-schalter" role="group" aria-label={t('Filter')}>
            {FILTER.map(([wert, text]) => (
              <button key={wert} type="button" aria-pressed={filter === wert} onClick={() => setFilter(wert)}>{t(text)}</button>
            ))}
          </div>
        </div>
        {liste.length === 0 ? (
          <p className="leer"><i className="bi bi-clock-history" />{t('Keine Einträge.')}</p>
        ) : (
          <ol className="historie">
            {liste.map((h) => (
              <li key={h.auftrag_id} className={`historie-eintrag${h.status === 'erledigt' ? '' : ' offen'}`}>
                <Link href={`/auftraege/${h.auftrag_id}`}>
                  <span className="historie-datum">{datumZeit(h.zeitpunkt, t.sprache)}</span>
                  <span className="historie-text">
                    <strong>{h.beschreibung}</strong>
                    <span className="klein">
                      {h.ursache ? t(h.ursache) : t('Ursache offen')}
                      {h.techniker && ` · ${h.techniker}`}
                      {h.reparatur_min !== null && ` · ${t('Reparatur {d}', { d: dauer(h.reparatur_min) })}`}
                      {h.ausfall_min !== null && ` · ${t('Ausfall {d}', { d: dauer(h.ausfall_min) })}`}
                    </span>
                    {h.massnahme && <span className="klein historie-massnahme">{h.massnahme}</span>}
                  </span>
                  <span className="historie-pills"><PrioritaetPill prioritaet={h.prioritaet} /><StatusPill status={h.status} /></span>
                  <i className="bi bi-chevron-right text-leise" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
        )}
        <p className="klein mt-2 mb-0" data-anzahl={historie.length}>{t('{n} Störungen insgesamt', { n: historie.length })}</p>
      </section>
    </>
  );
}
