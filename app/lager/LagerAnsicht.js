'use client';
/**
 * app/lager/LagerAnsicht.js – 3D-Regal, Details des gewählten Teils und Teileliste
 *
 * Das 3D-Regal wird nur im Browser und bei Bedarf geladen (next/dynamic, ssr: false).
 * Ohne WebGL bleibt nur die Liste. Teil wählen: Fach im Regal oder Zeile in der Liste.
 * Bestellungen: „Lieferung buchen“ (lieferungBuchen) bzw. „Nachbestellen“ (teilNachbestellen),
 * beide leiten zurück auf /lager.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useT } from '@/components/SpracheKontext';
import SpeichernKnopf from '@/components/SpeichernKnopf';
import { datum } from '@/lib/format';
import { lieferungBuchen, teilNachbestellen } from '@/app/aktionen';
import { lagerZustand } from '@/lib/lager';

const Lager3D = dynamic(() => import('@/components/karten/raum/Lager3D'), { ssr: false, loading: () => <div className="lager-3d" /> });

const ZUSTAND_TEXT = { rot: 'Unter Mindestbestand', orange: 'Knapp', gruen: 'Ausreichend' };

export default function LagerAnsicht({ teile, start, darf }) {
  const t = useT();
  const [gewaehlt, setGewaehlt] = useState(start ?? teile.find((x) => lagerZustand(x) === 'rot')?.id ?? teile[0]?.id ?? null);
  const [suche, setSuche] = useState('');
  const [webgl, setWebgl] = useState(true);
  useEffect(() => {
    try { setWebgl(Boolean(document.createElement('canvas').getContext('webgl2'))); } catch { setWebgl(false); }
  }, []);

  const teil = teile.find((x) => x.id === gewaehlt);
  const liste = teile.filter((x) => !suche || x.bezeichnung.toLowerCase().includes(suche.toLowerCase()));
  // Vorschlag für die Nachbestellung: auf das Doppelte des Mindestbestands auffüllen
  const vorschlag = teil ? Math.max(1, teil.mindestbestand * 2 - teil.bestand) : 1;

  return (
    <>
      <div className="row g-4">
        <div className="col-xl-8">
          <section className="karte lager-buehne" style={{ '--i': 4 }}>
            <div className="karte-kopf">
              <h2 className="abschnitt-titel mb-0">{t('Regal')}</h2>
              <span className="lager-legende klein">
                <span><i className="kal-punkt ueberfaellig" />{t('unter Mindestbestand')}</span>
                <span><i className="kal-punkt faellig" />{t('knapp')}</span>
                <span><i className="kal-punkt erledigt" />{t('ausreichend')}</span>
              </span>
            </div>
            {webgl ? <Lager3D teile={teile} gewaehlt={gewaehlt} onWaehle={setGewaehlt} />
              : <p className="leer">{t('Die 3D-Ansicht braucht WebGL – unten steht die Liste aller Teile.')}</p>}
            <p className="klein mt-2 mb-0">{t('Mausrad bzw. zwei Finger: zoomen. Fach anklicken: Details.')}</p>
          </section>
        </div>

        <div className="col-xl-4">
          {teil && (
            <section className="karte lager-detail" style={{ '--i': 5 }}>
              <span className={`lager-zustand zustand-${lagerZustand(teil)}`}>{t(ZUSTAND_TEXT[lagerZustand(teil)])}</span>
              <h2 className="abschnitt-titel mt-2">{teil.bezeichnung}</h2>
              <div className="lager-bestand">
                <strong>{teil.bestand}</strong>
                <span>{t('auf Lager · Mindestbestand {n}', { n: teil.mindestbestand })}</span>
              </div>
              <div className="lager-balken" aria-hidden="true">
                <span className={`zustand-${lagerZustand(teil)}`} style={{ width: `${Math.min(100, (teil.bestand / Math.max(1, teil.mindestbestand * 2)) * 100)}%` }} />
                <i style={{ left: '50%' }} title={t('Mindestbestand')} />
              </div>
              <dl className="details mt-3">
                <dt>{t('Verbrauch 12 Monate')}</dt><dd>{t('{n} Stück in {m} Aufträgen', { n: teil.verbrauch, m: teil.auftraege })}</dd>
                <dt>{t('Reicht noch')}</dt>
                <dd>{teil.verbrauch > 0 ? t('ca. {n} Wochen', { n: Math.round(teil.bestand / (teil.verbrauch / 52)) }) : t('kein Verbrauch')}</dd>
              </dl>

              {teil.bestellung_id ? (
                <div className="lager-bestellung">
                  <div><i className="bi bi-truck" aria-hidden="true" /> {t('{menge} Stück bestellt am {datum}', { menge: teil.bestellt_menge, datum: datum(teil.bestellt_am, t.sprache) })}</div>
                  {darf && (
                    <form action={lieferungBuchen} className="mt-2">
                      <input type="hidden" name="bestellung_id" value={teil.bestellung_id} />
                      <input type="hidden" name="zurueck" value="/lager" />
                      <SpeichernKnopf className="btn btn-primary btn-klein"><i className="bi bi-box-arrow-in-down" aria-hidden="true" /> {t('Lieferung buchen')}</SpeichernKnopf>
                    </form>
                  )}
                </div>
              ) : darf && (
                <form action={teilNachbestellen} className="lager-nachbestellen" key={teil.id}>
                  <input type="hidden" name="ersatzteil_id" value={teil.id} />
                  <label className="form-label" htmlFor="lager-menge">{t('Nachbestellen')}</label>
                  <div className="d-flex gap-2">
                    <input id="lager-menge" name="menge" type="number" min={1} max={999} defaultValue={vorschlag} className="form-control" inputMode="numeric" />
                    <SpeichernKnopf className="btn btn-primary text-nowrap"><i className="bi bi-cart-plus" aria-hidden="true" /> {t('Bestellen')}</SpeichernKnopf>
                  </div>
                </form>
              )}
            </section>
          )}
        </div>
      </div>

      <section className="karte" style={{ '--i': 6 }}>
        <div className="karte-kopf">
          <h2 className="abschnitt-titel mb-0">{t('Alle Ersatzteile')}</h2>
          <input type="search" className="form-control lager-suche" value={suche} onChange={(e) => setSuche(e.target.value)}
                 placeholder={t('Teil suchen …')} aria-label={t('Teil suchen')} />
        </div>
        <div className="tabelle-rahmen">
          <table className="tabelle lager-tabelle">
            <thead>
              <tr>
                <th>{t('Ersatzteil')}</th><th className="zahl">{t('Bestand')}</th><th className="zahl d-none d-sm-table-cell">{t('Mindestbestand')}</th>
                <th className="zahl d-none d-md-table-cell">{t('Verbrauch 12 Monate')}</th><th>{t('Zustand')}</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((x) => {
                const z = lagerZustand(x);
                return (
                  <tr key={x.id} className={x.id === gewaehlt ? 'gewaehlt' : ''} onClick={() => setGewaehlt(x.id)}>
                    <td><button type="button" className="link-knopf text-start" onClick={() => setGewaehlt(x.id)}>{x.bezeichnung}</button></td>
                    <td className="zahl">{x.bestand}</td>
                    <td className="zahl d-none d-sm-table-cell">{x.mindestbestand}</td>
                    <td className="zahl d-none d-md-table-cell">{x.verbrauch}</td>
                    <td>
                      <span className={`lager-zustand zustand-${z}`}>{t(ZUSTAND_TEXT[z])}</span>
                      {x.bestellung_id && <i className="bi bi-truck ms-2 text-leise" title={t('bestellt')} aria-label={t('bestellt')} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
