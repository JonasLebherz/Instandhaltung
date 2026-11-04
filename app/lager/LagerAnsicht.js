'use client';
/**
 * app/lager/LagerAnsicht.js – Lager je Werk: Werk wählen, Regal als Fächer, Details zum Teil
 *
 *  - Kopf: Auswahl Land/Werk (gruppiert nach Land, oben „Alle Werke“) – wechselt die Adresse ?werk=.
 *  - Alle Werke: Kachel je Werk (unter Mindestbestand, knapp, bestellt), gruppiert nach Land.
 *  - Ein Werk: Kennzahlen und das Regal, wahlweise
 *      3D: echtes Regal von vorn, jedes Teil als 3D-Modell, fehlende Stücke rot durchsichtig
 *          (components/karten/raum/LagerRegal3D.js, nur im Browser und bei Bedarf geladen) oder
 *      Liste: Fächer als Kacheln (Regal A–D, Fach 01–05) mit Symbol der Teile-Art, Name, Lagerplatz,
 *          Bestand/Mindestbestand und Füllbalken in Zustandsfarbe (lib/lager.js).
 *    Wahl in localStorage "lageransicht"; ohne Wahl 3D ab 768 px Breite, wenn der Browser WebGL kann.
 *    Klick auf ein Fach: rechts Details mit Verbrauch, „Reicht noch“, Bestellung bzw. Nachbestellen und
 *    „In anderen Werken“ (wo das Teil sonst noch liegt – z. B. zum Umlagern).
 */
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/SpracheKontext';
import Auswahl from '@/components/Auswahl';
import Kennzahl from '@/components/Kennzahl';
import SpeichernKnopf from '@/components/SpeichernKnopf';
import { datum } from '@/lib/format';
import { T } from '@/lib/sprache';
import { lieferungBuchen, teilNachbestellen } from '@/app/aktionen';
import { lagerZustand, teilArt } from '@/lib/lager';

// 3D-Regal nur im Browser laden (three.js ist groß); Platzhalter in Regalfarbe, bis es da ist
const LagerRegal3D = dynamic(() => import('@/components/karten/raum/LagerRegal3D'), { ssr: false, loading: () => <div className="regal3d" style={{ aspectRatio: '1.8 / 1' }} /> });

/** Kann der Browser WebGL (3D)? */
function webglVorhanden() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const ZUSTAND_TEXT = { rot: T('Unter Mindestbestand'), orange: T('Knapp'), gruen: T('Ausreichend') };

export default function LagerAnsicht({ werke, werk, teile, verteilung, start, darf }) {
  const t = useT();
  const router = useRouter();
  const [gewaehlt, setGewaehlt] = useState(start ?? teile.find((x) => lagerZustand(x) === 'rot')?.id ?? teile[0]?.id ?? null);
  const [suche, setSuche] = useState('');
  // Ansicht des Regals: null = noch nicht entschieden (erst im Browser bekannt), '3d' oder 'liste'
  const [ansicht, setAnsicht] = useState(null);
  const [webgl, setWebgl] = useState(false);
  useEffect(() => {
    const kann = webglVorhanden();
    setWebgl(kann);
    let gemerkt = null;
    try { gemerkt = localStorage.getItem('lageransicht'); } catch { /* privat */ }
    setAnsicht(kann && (gemerkt === '3d' || (!gemerkt && window.innerWidth >= 768)) ? '3d' : 'liste');
  }, []);
  function ansichtWaehlen(neu) {
    setAnsicht(neu);
    try { localStorage.setItem('lageransicht', neu); } catch { /* privat */ }
  }

  // Auswahl: „Alle Werke“ und je Land die Werke
  const optionen = useMemo(() => {
    const laender = [...new Map(werke.map((w) => [w.land, w.land_name])).entries()];
    return [{ wert: 'alle', text: t('Alle Werke') }, ...laender.map(([land, name]) => ({
      gruppe: t(name), optionen: werke.filter((w) => w.land === land).map((w) => ({ wert: String(w.id), text: w.name })),
    }))];
  }, [werke, t]);

  const kopf = (
    <div className="seitenkopf lager-kopf">
      <div>
        <h1>{t('Lager')}</h1>
        <p>{werk ? t('Ersatzteillager im {werk} ({stadt}). Fach anklicken für Details und Bestellungen.', { werk: werk.name, stadt: werk.stadt })
          : t('Jedes Werk hat sein eigenes Ersatzteillager. Werk wählen für das Regal.')}</p>
      </div>
      <div className="lager-werkwahl">
        <label className="form-label" htmlFor="lager-werk">{t('Werk')}</label>
        <Auswahl id="lager-werk" optionen={optionen} wert={werk ? String(werk.id) : 'alle'} onAendern={(w) => router.push(`/lager?werk=${w}`)} />
      </div>
    </div>
  );

  /* ---------- Alle Werke: eine Karte, Kachel je Werk (Hauptsitz-Land zuerst) ---------- */
  if (!werk) {
    const gesamtUnter = werke.reduce((sum, w) => sum + w.unter, 0);
    return (
      <>
        {kopf}
        <section className="karte" style={{ '--i': 1 }}>
          <div className="karte-kopf">
            <h2 className="abschnitt-titel mb-0">{t('Lager aller Werke')}</h2>
            <span className="klein">{t('{n} Fächer unter Mindestbestand · Werk anklicken für das Regal', { n: gesamtUnter })}</span>
          </div>
          <div className="lager-werke">
            {werke.map((w) => (
              <Link key={w.id} href={`/lager?werk=${w.id}`} className={`lager-werk${w.unter > 0 ? ' mit-mangel' : ''}`}>
                <span className="lager-werk-name">{w.name}<small>{t(w.land_name)}</small></span>
                <span className="lager-werk-zahlen">
                  <span className={w.unter ? 'zustand-rot' : 'zustand-gruen'}><strong>{w.unter}</strong>{t('unter Mindestbestand')}</span>
                  <span className={w.knapp ? 'zustand-orange' : ''}><strong>{w.knapp}</strong>{t('knapp')}</span>
                  <span><strong>{w.bestellt}</strong>{t('bestellt')}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </>
    );
  }

  /* ---------- Ein Werk ---------- */
  const teil = teile.find((x) => x.id === gewaehlt) ?? null;
  const sichtbar = teile.filter((x) => !suche || x.bezeichnung.toLowerCase().includes(suche.toLowerCase()) || (x.lagerplatz ?? '').toLowerCase().includes(suche.toLowerCase()));
  // Regale nach dem Buchstaben des Lagerplatzes (A-03 → Regal A); Teile ohne Platz in „Ohne Lagerplatz“
  const regale = [...new Set(sichtbar.map((x) => x.lagerplatz?.split('-')[0] ?? '–'))];
  const treffer = suche ? new Set(sichtbar.map((x) => x.id)) : null;
  const unter = teile.filter((x) => lagerZustand(x) === 'rot').length;
  const anderswo = teil ? verteilung.filter((v) => v.teil === teil.id && v.werk !== werk.id).slice(0, 5) : [];
  const vorschlag = teil ? Math.max(1, teil.mindestbestand * 2 - teil.bestand) : 1;

  return (
    <>
      {kopf}
      <div className="row g-4 mb-2">
        <div className="col-6 col-lg-3"><Kennzahl titel={t('Ersatzteile')} wert={teile.filter((x) => x.bestand > 0).length} zusatz={t('von {n} vorrätig', { n: teile.length })} symbol="bi-box-seam" i={0} /></div>
        <div className="col-6 col-lg-3"><Kennzahl titel={t('Unter Mindestbestand')} wert={unter} zusatz={t('nachbestellen')} symbol="bi-exclamation-triangle" art={unter ? 'warnung' : 'gruen'} i={1} /></div>
        <div className="col-6 col-lg-3"><Kennzahl titel={t('Offene Bestellungen')} wert={teile.filter((x) => x.bestellung_id).length} zusatz={t('unterwegs')} symbol="bi-truck" i={2} /></div>
        <div className="col-6 col-lg-3"><Kennzahl titel={t('Verbrauch')} wert={teile.reduce((s, x) => s + x.verbrauch, 0)} zusatz={t('Teile in 12 Monaten')} symbol="bi-arrow-down-circle" i={3} /></div>
      </div>

      <div className="row g-4">
        <div className="col-xl-8">
          <section className="karte" style={{ '--i': 4 }}>
            <div className="karte-kopf flex-wrap">
              <h2 className="abschnitt-titel mb-0">{t('Regal')}</h2>
              <div className="lager-werkzeuge">
                {webgl && (
                  <div className="sprach-schalter lager-schalter" role="group" aria-label={t('Ansicht')}>
                    <button type="button" aria-pressed={ansicht === '3d'} onClick={() => ansichtWaehlen('3d')}><i className="bi bi-box" aria-hidden="true" /> 3D</button>
                    <button type="button" aria-pressed={ansicht === 'liste'} onClick={() => ansichtWaehlen('liste')}><i className="bi bi-grid-3x3-gap" aria-hidden="true" /> {t('Liste')}</button>
                  </div>
                )}
                <input type="search" className="form-control lager-suche" value={suche} onChange={(e) => setSuche(e.target.value)}
                       placeholder={t('Teil oder Lagerplatz suchen …')} aria-label={t('Teil suchen')} />
              </div>
            </div>
            <div className="lager-legende klein mb-3">
              <span><i className="kal-punkt ueberfaellig" />{t('unter Mindestbestand')}</span>
              <span><i className="kal-punkt faellig" />{t('knapp')}</span>
              <span><i className="kal-punkt erledigt" />{t('ausreichend')}</span>
              {ansicht === '3d' && <span><i className="geist-muster" />{t('fehlt bis zum Mindestbestand')}</span>}
              <span><i className="bi bi-truck" aria-hidden="true" /> {t('bestellt')}</span>
            </div>
            {ansicht === null && <div className="regal3d" style={{ aspectRatio: '1.8 / 1' }} />}
            {ansicht === '3d' && <LagerRegal3D teile={teile} gewaehlt={gewaehlt} onWaehle={setGewaehlt} treffer={treffer} />}
            {ansicht === 'liste' && regale.map((regal) => (
              <div key={regal} className="lager-regal">
                <div className="lager-regal-titel">{regal === '–' ? t('Ohne Lagerplatz') : t('Regal {r}', { r: regal })}</div>
                <div className="lager-faecher">
                  {sichtbar.filter((x) => (x.lagerplatz?.split('-')[0] ?? '–') === regal).map((x) => {
                    const z = lagerZustand(x);
                    const art = teilArt(x.bezeichnung);
                    const fuellung = Math.min(100, (x.bestand / Math.max(1, x.mindestbestand * 2)) * 100);
                    return (
                      <button key={x.id} type="button" className={`lager-fach zustand-${z}${x.id === gewaehlt ? ' gewaehlt' : ''}`}
                              onClick={() => setGewaehlt(x.id)} aria-pressed={x.id === gewaehlt} data-teil={x.id}>
                        <span className="lager-fach-kopf">
                          <span className="lager-fach-symbol" aria-hidden="true"><i className={`bi ${art.symbol}`} /></span>
                          <span className="lager-platz">{x.lagerplatz ?? '–'}</span>
                          {x.bestellung_id && <i className="bi bi-truck lager-bestellt" title={t('bestellt')} aria-label={t('bestellt')} />}
                        </span>
                        <span className="lager-fach-name">{x.bezeichnung}</span>
                        <span className="lager-fach-art">{t(art.art)}</span>
                        <span className="lager-fach-bestand"><strong>{x.bestand}</strong> / {x.mindestbestand}</span>
                        <span className="lager-fach-balken" aria-hidden="true"><span style={{ width: `${fuellung}%` }} /><i /></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {ansicht !== '3d' && sichtbar.length === 0 && <p className="leer">{t('Kein Teil gefunden.')}</p>}
          </section>
        </div>

        <div className="col-xl-4">
          {teil && (
            <section className="karte lager-detail" style={{ '--i': 5 }}>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <span className={`lager-zustand zustand-${lagerZustand(teil)}`}>{t(ZUSTAND_TEXT[lagerZustand(teil)])}</span>
                <span className="lager-platz">{teil.lagerplatz ?? '–'}</span>
              </div>
              <h2 className="abschnitt-titel mt-2 mb-1">{teil.bezeichnung}</h2>
              <p className="klein mb-2"><i className={`bi ${teilArt(teil.bezeichnung).symbol}`} aria-hidden="true" /> {t(teilArt(teil.bezeichnung).art)} · {werk.name}</p>
              <div className="lager-bestand">
                <strong>{teil.bestand}</strong>
                <span>{t('auf Lager · Mindestbestand {n}', { n: teil.mindestbestand })}</span>
              </div>
              <dl className="details mt-3">
                <dt>{t('Verbrauch 12 Monate')}</dt><dd>{t('{n} Stück in {m} Aufträgen', { n: teil.verbrauch, m: teil.auftraege })}</dd>
                <dt>{t('Reicht noch')}</dt>
                <dd>{teil.bestand === 0 ? t('leer') : teil.verbrauch > 0 ? t('ca. {n} Wochen', { n: Math.max(1, Math.round(teil.bestand / (teil.verbrauch / 52))) }) : t('kein Verbrauch')}</dd>
              </dl>

              {teil.bestellung_id ? (
                <div className="lager-bestellung">
                  <div><i className="bi bi-truck" aria-hidden="true" /> {t('{menge} Stück bestellt am {datum}', { menge: teil.bestellt_menge, datum: datum(teil.bestellt_am, t.sprache) })}</div>
                  {darf && (
                    <form action={lieferungBuchen} className="mt-2">
                      <input type="hidden" name="bestellung_id" value={teil.bestellung_id} />
                      <input type="hidden" name="zurueck" value={`/lager?werk=${werk.id}&teil=${teil.id}`} />
                      <SpeichernKnopf className="btn btn-primary btn-klein"><i className="bi bi-box-arrow-in-down" aria-hidden="true" /> {t('Lieferung buchen')}</SpeichernKnopf>
                    </form>
                  )}
                </div>
              ) : darf && (
                <form action={teilNachbestellen} className="lager-nachbestellen" key={teil.id}>
                  <input type="hidden" name="ersatzteil_id" value={teil.id} />
                  <input type="hidden" name="standort_id" value={werk.id} />
                  <label className="form-label" htmlFor="lager-menge">{t('Nachbestellen')}</label>
                  <div className="d-flex gap-2">
                    <input id="lager-menge" name="menge" type="number" min={1} max={999} defaultValue={vorschlag} className="form-control" inputMode="numeric" />
                    <SpeichernKnopf className="btn btn-primary text-nowrap"><i className="bi bi-cart-plus" aria-hidden="true" /> {t('Bestellen')}</SpeichernKnopf>
                  </div>
                </form>
              )}

              <h3 className="lager-zwischentitel">{t('In anderen Werken')}</h3>
              {anderswo.length === 0 ? <p className="klein mb-0">{t('In keinem anderen Werk vorrätig.')}</p> : (
                <ul className="lager-anderswo">
                  {anderswo.map((a) => (
                    <li key={a.werk}>
                      <Link href={`/lager?werk=${a.werk}&teil=${teil.id}`}>{a.werkname}</Link>
                      <span className="klein">{a.land}</span>
                      <strong>{a.bestand}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
