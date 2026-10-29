'use client';
/**
 * components/karten/KartenExplorer.js – Störungskarte mit Zoom
 *
 * Vier Ebenen in einer "Bühne": Welt → Land → Werk (Lageplan) → Gebäude (Grundriss).
 * Ein Klick auf ein Land, Werk oder Gebäude zoomt animiert genau an diese Stelle hinein,
 * der Pfad oben zoomt wieder heraus. Alle Daten werden einmal vom Server geladen
 * (lib/karten/daten.js → alleKartenDaten), danach läuft alles ohne Wartezeit
 * im Browser.
 *
 * modus="anzeige": rechts eine Spalte mit Infos zur jeweiligen Ebene
 *                  (offene Störungen, Techniker, Maschinen-Details)
 * modus="auswahl": zum Störung melden – ein Klick auf eine Maschine ruft
 *                  onMaschine(maschine) auf. Eigenes Aussehen: Schritt-Leiste
 *                  statt Pfad, warmer Hintergrund, keine Störungszahlen.
 *
 * So funktioniert die Animation:
 *  Beim Ebenenwechsel bleibt die alte Ebene kurz sichtbar ("uebergang") und wird
 *  vergrößert ausgeblendet, während die neue aus demselben Punkt herauswächst.
 *  Der Punkt (transform-origin) ist die Mitte des angeklickten Landes/Werks/Gebäudes.
 *
 * Ebene im Zustand: { land: 'DE' | null, standortId, gebaeudeId }.
 */
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import WeltKarte from './WeltKarte';
import LandKarte from './LandKarte';
import Lageplan from './Lageplan';
import Grundriss from './Grundriss';
import { Legende, stufe, offenText } from './stufe';
import { StatusPill, PrioritaetPill } from '@/components/Pills';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import MeldeSchritte from './MeldeSchritte';
import { useT } from '@/components/SpracheKontext';
import { T } from '@/lib/sprache';
import { laenderAus, landKarte, weltVerhaeltnis } from '@/lib/karten/laender';

const DAUER = 560;   // ms – so lange bleibt die alte Ebene während des Zooms sichtbar

/** Seitenverhältnis (Breite / Höhe) des Inhalts einer Ebene – damit er in die Bühne passt */
function seitenverhaeltnis(ebene, standort, gebaeude, karte, laender) {
  if (ebene.gebaeudeId && gebaeude) return gebaeude.breite_m / gebaeude.tiefe_m;
  if (ebene.standortId && standort) return standort.gelaende_breite_m / standort.gelaende_tiefe_m;
  if (karte) return karte.breite / karte.hoehe;
  return weltVerhaeltnis(laender);   // Weltkarte und Europakarte untereinander
}

export default function KartenExplorer({
  daten, modus = 'anzeige', start = {}, onMaschine, groesse = 'gross', adresseMitfuehren = false,
}) {
  const { standorte, gebaeude, maschinen, offene, techniker } = daten;
  const melden = modus === 'auswahl';   // Störung melden: eigenes Aussehen, keine Störungszahlen
  const t = useT();
  const buehneRef = useRef(null);
  const neuRef = useRef(null);
  const altRef = useRef(null);

  const laender = laenderAus(standorte);
  // Start: ein Werk legt das Land mit fest
  const startLand = standorte.find((st) => st.id === start.standortId)?.land ?? start.land ?? null;
  const [ebene, setEbene] = useState({ land: startLand, standortId: start.standortId ?? null, gebaeudeId: start.gebaeudeId ?? null });
  const [maschineId, setMaschineId] = useState(start.maschineId ?? null);
  const [uebergang, setUebergang] = useState(null);   // { von, richtung: 'rein'|'raus', ursprung: {x,y}|null }

  const standortVon = (e) => standorte.find((st) => st.id === e.standortId) ?? null;
  const gebaeudeVon = (e) => gebaeude.find((g) => g.id === e.gebaeudeId) ?? null;
  const landVon = (e) => laender.find((l) => l.kuerzel === e.land) ?? null;
  const standort = standortVon(ebene);
  const aktuellesGebaeude = gebaeudeVon(ebene);
  const land = landVon(ebene);
  const stufeName = ebene.gebaeudeId ? 'gebaeude' : ebene.standortId ? 'werk' : ebene.land ? 'land' : 'welt';

  /* ---------- Wechsel zwischen den Ebenen ---------- */

  /** Mitte eines Elements relativ zur Bühne (Ausgangspunkt der Zoom-Animation) */
  function mitteVon(element) {
    if (!element || !buehneRef.current) return null;
    const r = element.getBoundingClientRect();
    const b = buehneRef.current.getBoundingClientRect();
    return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
  }

  function wechsle(neueEbene, richtung, ursprungsElement = null) {
    setUebergang({ von: ebene, richtung, ursprung: mitteVon(ursprungsElement) });
    setEbene(neueEbene);
    setMaschineId(null);
  }

  const zuLand = (l) => wechsle({ land: l.kuerzel, standortId: null, gebaeudeId: null }, 'rein',
    buehneRef.current?.querySelector(`[data-ort="land-${l.kuerzel}"]`));
  const zuWerk = (st) => wechsle({ land: st.land, standortId: st.id, gebaeudeId: null }, 'rein',
    buehneRef.current?.querySelector(`[data-ort="st-${st.id}"]`));
  const zuGebaeude = (g) => wechsle({ land: ebene.land, standortId: g.standort_id, gebaeudeId: g.id }, 'rein',
    buehneRef.current?.querySelector(`[data-ort="g-${g.id}"]`));
  const zuWelt = () => wechsle({ land: null, standortId: null, gebaeudeId: null }, 'raus');
  const zuLandRaus = () => wechsle({ land: ebene.land, standortId: null, gebaeudeId: null }, 'raus');
  const zuStandort = () => wechsle({ land: ebene.land, standortId: ebene.standortId, gebaeudeId: null }, 'raus');
  // Eine Ebene höher (Zurück-Knopf)
  const zurueck = { gebaeude: zuStandort, werk: zuLandRaus, land: zuWelt }[stufeName];

  function maschineGeklickt(m) {
    if (modus === 'auswahl') onMaschine?.(m);
    else setMaschineId(maschineId === m.id ? null : m.id);
  }

  // Beim Herauszoomen liegt der Ausgangspunkt in der NEUEN (übergeordneten) Ebene:
  // dort, wo das Werk bzw. Gebäude sitzt, aus dem wir kommen. Vor dem Zeichnen messen.
  // Die Klasse "messen" hält die Animation kurz an, sonst würde die bereits
  // vergrößerte Ebene gemessen (sie startet danach ganz normal von vorn).
  useLayoutEffect(() => {
    if (!uebergang || uebergang.richtung !== 'raus' || !neuRef.current) return;
    const { von } = uebergang;
    const kennung = von.gebaeudeId ? `g-${von.gebaeudeId}` : von.standortId ? `st-${von.standortId}` : `land-${von.land}`;
    neuRef.current.classList.add('messen');
    const punkt = mitteVon(neuRef.current.querySelector(`[data-ort="${kennung}"]`));
    neuRef.current.classList.remove('messen');
    if (punkt) {
      const ursprung = `${punkt.x}px ${punkt.y}px`;
      neuRef.current.style.transformOrigin = ursprung;
      if (altRef.current) altRef.current.style.transformOrigin = ursprung;
    }
  }, [uebergang]);

  // Nach der Animation die alte Ebene entfernen
  useEffect(() => {
    if (!uebergang) return undefined;
    const timer = setTimeout(() => setUebergang(null), DAUER);
    return () => clearTimeout(timer);
  }, [uebergang]);

  // Adresse mitführen (z. B. /karte?werk=ham&halle=h2&maschine=12), ohne die Seite neu zu laden.
  // Beim ersten Anzeigen bleibt die Adresse, wie sie ist – geändert wird erst nach einem Klick.
  const ersteAnzeige = useRef(true);
  useEffect(() => {
    if (ersteAnzeige.current) { ersteAnzeige.current = false; return; }
    if (!adresseMitfuehren) return;
    const p = new URLSearchParams();
    if (land && !standort) p.set('land', land.kuerzel.toLowerCase());
    if (standort) p.set('werk', standort.kuerzel.toLowerCase());
    if (aktuellesGebaeude) p.set('halle', aktuellesGebaeude.kuerzel.toLowerCase());
    if (maschineId) p.set('maschine', String(maschineId));
    const ziel = `${window.location.pathname}${p.toString() ? `?${p}` : ''}`;
    window.history.replaceState(window.history.state, '', ziel);
  }, [adresseMitfuehren, land, standort, aktuellesGebaeude, maschineId]);

  /* ---------- Darstellung einer Ebene ---------- */

  function ebeneZeichnen(e, aktiv) {
    const st = standortVon(e);
    const g = gebaeudeVon(e);
    const karte = e.land ? landKarte(e.land, standorte) : null;
    const verhaeltnis = seitenverhaeltnis(e, st, g, karte, laender);
    let inhalt;
    let art = 'welt';
    if (g) {
      art = 'gebaeude';
      inhalt = (
        <Grundriss gebaeude={g} maschinen={maschinen.filter((m) => m.gebaeude_id === g.id)} neutral={melden}
                   auswahlId={aktiv ? maschineId : null} onWaehle={aktiv ? maschineGeklickt : undefined} />
      );
    } else if (st) {
      art = 'werk';
      inhalt = (
        <Lageplan standort={st} gebaeude={gebaeude.filter((x) => x.standort_id === st.id)} neutral={melden}
                  onWaehle={aktiv ? zuGebaeude : undefined} />
      );
    } else if (karte) {
      art = 'land';
      inhalt = <LandKarte karte={karte} standorte={standorte.filter((x) => x.land === e.land)} neutral={melden}
                          onWaehle={aktiv ? zuWerk : undefined} />;
    } else {
      inhalt = <WeltKarte laender={laender} neutral={melden} onWaehle={aktiv ? zuLand : undefined} />;
    }
    // Hochkant-Karten (z. B. Deutschland) dürfen bis unter den Titel reichen
    const hochkant = art === 'land' && verhaeltnis < 1 ? ' ebene-hochkant' : '';
    return <div className={`ebene-inhalt ebene-${art}${hochkant}`} style={{ '--verhaeltnis': verhaeltnis }}>{inhalt}</div>;
  }

  const schluessel = `${ebene.land ?? 'welt'}-${ebene.standortId ?? 'x'}-${ebene.gebaeudeId ?? 'x'}`;
  const schrittNr = { welt: 1, land: 2, werk: 3, gebaeude: 4 }[stufeName];
  const ursprungStil = uebergang?.ursprung ? { transformOrigin: `${uebergang.ursprung.x}px ${uebergang.ursprung.y}px` } : undefined;
  const titel = aktuellesGebaeude?.bezeichnung ?? standort?.name ?? (land ? t(land.name) : t('Weltweit'));
  const hinweis = t(modus === 'auswahl'
    ? { welt: T('In welchem Land?'), land: T('In welchem Werk?'), werk: T('In welchem Gebäude?'), gebaeude: T('An welcher Maschine?') }[stufeName]
    : {
      welt: T('Land anklicken zum Hineinzoomen'), land: T('Werk anklicken zum Hineinzoomen'),
      werk: T('Gebäude anklicken für den Grundriss'), gebaeude: T('Maschine anklicken für Details'),
    }[stufeName]);

  const buehne = (
    <div className="explorer-buehne-rahmen">
      {/* Beim Melden: Schritt-Leiste. Sonst: Pfad Welt › Land › Werk › Gebäude (zoomt beim Anklicken heraus) */}
      {melden ? (
        <MeldeSchritte schritt={schrittNr} werte={[land && t(land.name), standort?.name, aktuellesGebaeude?.bezeichnung]}
                       onSchritt={(nr) => [zuWelt, zuLandRaus, zuStandort][nr - 1]?.()} />
      ) : (
      <nav className="brotkrumen explorer-pfad" aria-label={t('Pfad')}>
        <button type="button" onClick={zuWelt} disabled={stufeName === 'welt'}>
          <i className="bi bi-globe2" aria-hidden="true" /> {t('Weltweit')}
        </button>
        {land && (
          <>
            <i className="bi bi-chevron-right" aria-hidden="true" />
            <button type="button" onClick={zuLandRaus} disabled={stufeName === 'land'}>{t(land.name)}</button>
          </>
        )}
        {standort && (
          <>
            <i className="bi bi-chevron-right" aria-hidden="true" />
            <button type="button" onClick={zuStandort} disabled={stufeName === 'werk'}>{standort.name}</button>
          </>
        )}
        {aktuellesGebaeude && (
          <>
            <i className="bi bi-chevron-right" aria-hidden="true" />
            <span aria-current="page">{aktuellesGebaeude.bezeichnung}</span>
          </>
        )}
      </nav>
      )}

      <div className={`explorer-buehne buehne-${groesse}`} ref={buehneRef}>
        {/* Kopf über der Karte: Zurück und Titel */}
        <div className="buehne-kopf">
          {zurueck && (
            <button type="button" className="rund-knopf glas-knopf" onClick={zurueck} aria-label={t('Herauszoomen')}>
              <i className="bi bi-arrow-left" />
            </button>
          )}
          {melden && <span className="buehne-schritt" aria-hidden="true">{schrittNr}</span>}
          <div>
            <div className="buehne-titel">{titel}</div>
            <div className="buehne-hinweis">{hinweis}</div>
          </div>
        </div>

        {uebergang && (
          <div ref={altRef} className={`explorer-ebene ebene-alt zoom-${uebergang.richtung}`} style={ursprungStil} aria-hidden="true">
            {ebeneZeichnen(uebergang.von, false)}
          </div>
        )}
        <div ref={neuRef} key={schluessel}
             className={`explorer-ebene ebene-neu${uebergang ? ` zoom-${uebergang.richtung}` : ''}`} style={ursprungStil}>
          {ebeneZeichnen(ebene, true)}
        </div>
      </div>
      {!melden && <Legende />}
    </div>
  );

  return (
    <div className={`row g-4${melden ? ' explorer-melden' : ''}`}>
      <div className="col-xl-8">
        <section className="karte explorer-karte" style={{ '--i': 0 }}>{buehne}</section>
      </div>
      <div className="col-xl-4 explorer-info-spalte">
        <div className="explorer-info">
          <InfoSpalte key={`${schluessel}-${maschineId ?? ''}`} stufe={stufeName} modus={modus} daten={daten}
                      laender={laender} land={land}
                      standort={standort} gebaeudeAktuell={aktuellesGebaeude} maschineId={maschineId}
                      onLand={zuLand} onWerk={zuWerk} onGebaeude={zuGebaeude} onMaschine={maschineGeklickt}
                      onAuswahlAufheben={() => setMaschineId(null)} />
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
 * Info-Spalte rechts neben der Karte – Inhalt passend zur Ebene
 * ================================================================== */
function InfoSpalte({
  stufe: ebeneName, modus, daten, laender, land, standort, gebaeudeAktuell, maschineId,
  onLand, onWerk, onGebaeude, onMaschine, onAuswahlAufheben,
}) {
  const { standorte, gebaeude, maschinen, offene, techniker } = daten;
  const t = useT();

  /* ---------- Ebene Welt: alle Länder ---------- */
  if (ebeneName === 'welt') {
    const sortiert = modus === 'auswahl'
      ? laender
      : [...laender].sort((a, b) => b.offen - a.offen || b.hoch - a.hoch || Number(b.hauptsitz) - Number(a.hauptsitz));
    return (
      <section className="karte explorer-seite" style={{ '--i': 1 }}>
        <h2 className="abschnitt-titel">{modus === 'auswahl' ? t('Land aus der Liste wählen') : t('Länder')}</h2>
        <ul className="ort-liste">
          {sortiert.map((l) => (
            <li key={l.kuerzel}>
              <button type="button" onClick={() => onLand(l)} className={modus === 'auswahl' ? '' : `stufe-${stufe(l.offen, l.hoechste_prioritaet)}`}>
                <span>
                  <span className="ort-titel">
                    {t(l.name)}
                    {l.hauptsitz && <span className="hauptsitz-abzeichen"><i className="bi bi-star-fill" aria-hidden="true" /> {t('Hauptsitz')}</span>}
                  </span>
                  <span className="ort-unter">
                    {l.werke === 1 ? t('1 Werk') : t('{n} Werke', { n: l.werke })} · {t('{n} Maschinen', { n: l.maschinen })}
                  </span>
                </span>
                {modus === 'auswahl'
                  ? <i className="bi bi-chevron-right ms-auto text-leise" aria-hidden="true" />
                  : <span className="ort-zahl" aria-label={offenText(l.offen, t)}>{l.offen}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  /* ---------- Ebene Land: Werke des Landes ---------- */
  if (ebeneName === 'land' && land) {
    const werkeHier = standorte.filter((st) => st.land === land.kuerzel);
    const sortiert = modus === 'auswahl'
      ? [...werkeHier].sort((a, b) => a.stadt.localeCompare(b.stadt))
      : [...werkeHier].sort((a, b) => b.offen - a.offen || b.hoch - a.hoch || a.stadt.localeCompare(b.stadt));
    return (
      <section className="karte explorer-seite" style={{ '--i': 1 }}>
        <h2 className="abschnitt-titel">{modus === 'auswahl' ? t('Werk aus der Liste wählen') : t('Standorte')}</h2>
        <ul className="ort-liste">
          {sortiert.map((st) => (
            <li key={st.id}>
              <button type="button" onClick={() => onWerk(st)} className={modus === 'auswahl' ? '' : `stufe-${stufe(st.offen, st.hoechste_prioritaet)}`}>
                <span>
                  <span className="ort-titel">{st.name}</span>
                  <span className="ort-unter">{t(st.schwerpunkt)} · {t('{n} Gebäude', { n: st.gebaeude })} · {t('{n} Maschinen', { n: st.maschinen })}</span>
                </span>
                {modus === 'auswahl'
                  ? <i className="bi bi-chevron-right ms-auto text-leise" aria-hidden="true" />
                  : <span className="ort-zahl" aria-label={offenText(st.offen, t)}>{st.offen}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  /* ---------- Ebene Werk: Gebäude, offene Störungen, Techniker ---------- */
  if (ebeneName === 'werk' && standort) {
    const hallen = gebaeude.filter((g) => g.standort_id === standort.id);
    const offeneHier = offene.filter((a) => a.standort_id === standort.id);
    const technikerHier = techniker.filter((x) => x.standort_id === standort.id);
    return (
      <>
        <section className="karte explorer-seite" style={{ '--i': 1 }}>
          {modus === 'anzeige' && <p className="klein mb-3"><i className="bi bi-geo-alt" aria-hidden="true" /> {standort.adresse}</p>}
          <h2 className="abschnitt-titel">{modus === 'auswahl' ? t('Gebäude aus der Liste wählen') : t('Gebäude')}</h2>
          <ul className="ort-liste">
            {hallen.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => onGebaeude(g)} className={modus === 'auswahl' ? '' : `stufe-${stufe(g.offen, g.hoechste_prioritaet)}`}>
                  <span>
                    <span className="ort-titel">{g.bezeichnung}</span>
                    <span className="ort-unter">{t('{n} Maschinen', { n: g.maschinen })} · {g.breite_m} × {g.tiefe_m} m</span>
                  </span>
                  {modus === 'auswahl'
                    ? <i className="bi bi-chevron-right ms-auto text-leise" aria-hidden="true" />
                    : <span className="ort-zahl" aria-label={offenText(g.offen, t)}>{g.offen}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
        {modus === 'anzeige' && (
          <>
            <section className="karte explorer-seite" style={{ '--i': 2 }}>
              <h2 className="abschnitt-titel">{t('Offene Störungen')}</h2>
              {offeneHier.length === 0
                ? <p className="text-leise mb-0"><i className="bi bi-check-circle me-1" style={{ color: 'var(--gruen)' }} />{t('Alle Anlagen laufen.')}</p>
                : <OffeneListe auftraege={offeneHier} mitGebaeude />}
            </section>
            <section className="karte explorer-seite" style={{ '--i': 3 }}>
              <h2 className="abschnitt-titel">{t('Techniker vor Ort')}</h2>
              <ul className="ort-liste">
                {technikerHier.map((tech) => (
                  <li key={tech.id}>
                    <div className="ort-zeile">
                      <i className="bi bi-person-gear fs-5 text-leise" aria-hidden="true" />
                      <span><span className="ort-titel">{tech.name}</span><span className="ort-unter">{t(tech.qualifikation)} · {t(tech.schicht)}</span></span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </>
    );
  }

  /* ---------- Ebene Gebäude ---------- */
  if (!gebaeudeAktuell) return null;
  const maschinenHier = maschinen.filter((m) => m.gebaeude_id === gebaeudeAktuell.id);
  const auswahl = maschinenHier.find((m) => m.id === maschineId) ?? null;

  if (modus === 'auswahl') {
    return (
      <section className="karte explorer-seite" style={{ '--i': 1 }}>
        <h2 className="abschnitt-titel">{t('Maschine aus der Liste wählen')}</h2>
        <ul className="ort-liste">
          {maschinenHier.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onMaschine(m)}>
                <i className={`bi ${MASCHINEN_SYMBOLE[m.typ] ?? 'bi-gear'} text-leise`} aria-hidden="true" />
                <span><span className="ort-titel">{m.bezeichnung}</span><span className="ort-unter">{m.anlagennummer}</span></span>
                <i className="bi bi-chevron-right ms-auto text-leise" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (auswahl) {
    const offeneDerMaschine = offene.filter((a) => a.maschine_id === auswahl.id);
    return (
      <section className={`karte explorer-seite stufe-${stufe(auswahl.offen, auswahl.hoechste_prioritaet)}`} style={{ '--i': 1 }}>
        <div className="detail-kopf">
          <span className="detail-symbol" aria-hidden="true"><i className={`bi ${MASCHINEN_SYMBOLE[auswahl.typ] ?? 'bi-gear'}`} /></span>
          <div className="flex-grow-1">
            <h2 className="abschnitt-titel mb-0">{auswahl.bezeichnung}</h2>
            <div className="klein">{auswahl.anlagennummer} · {t(auswahl.typ)} · {t('Baujahr {n}', { n: auswahl.baujahr })}</div>
          </div>
          <button type="button" className="rund-knopf" onClick={onAuswahlAufheben} aria-label={t('Auswahl schließen')}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="mini-kennzahlen">
          <div><strong>{auswahl.offen}</strong><span>{t('offen')}</span></div>
          <div><strong>{auswahl.stoerungen_12m}</strong><span>{t('Störungen 12 Mon.')}</span></div>
          <div><strong>{new Date().getFullYear() - auswahl.baujahr}</strong><span>{t('Jahre alt')}</span></div>
        </div>
        <h3 className="h6 fw-semibold mb-2">{offenText(auswahl.offen, t)}</h3>
        {offeneDerMaschine.length === 0
          ? <p className="text-leise"><i className="bi bi-check-circle me-1" style={{ color: 'var(--gruen)' }} />{t('Die Maschine läuft störungsfrei.')}</p>
          : <OffeneListe auftraege={offeneDerMaschine} />}
        <Link href={`/melden?maschine=${auswahl.id}`} className="btn btn-primary w-100 mt-3">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" /> {t('Störung an dieser Maschine melden')}
        </Link>
      </section>
    );
  }

  const gestoert = maschinenHier.filter((m) => m.offen > 0).sort((a, b) => b.offen - a.offen);
  return (
    <section className="karte explorer-seite" style={{ '--i': 1 }}>
      <h2 className="abschnitt-titel">{t('Maschinen mit Störungen')}</h2>
      {gestoert.length === 0 ? (
        <p className="leer"><i className="bi bi-check-circle" />{t('Alle Maschinen in diesem Gebäude laufen.')}</p>
      ) : (
        <ul className="ort-liste">
          {gestoert.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onMaschine(m)} className={`stufe-${stufe(m.offen, m.hoechste_prioritaet)}`}>
                <i className={`bi ${MASCHINEN_SYMBOLE[m.typ] ?? 'bi-gear'} text-leise`} aria-hidden="true" />
                <span><span className="ort-titel">{m.bezeichnung}</span><span className="ort-unter">{m.anlagennummer}</span></span>
                <span className="ort-zahl">{m.offen}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Kompakte Liste offener Aufträge mit Link zum Auftrag */
function OffeneListe({ auftraege, mitGebaeude = false }) {
  return (
    <ul className="ort-liste">
      {auftraege.map((a) => (
        <li key={a.auftrag_id}>
          <Link href={`/auftraege/${a.auftrag_id}`} prefetch={false}>
            <span className="flex-grow-1">
              <span className="ort-titel">{mitGebaeude ? `${a.maschine} · ${a.gebaeude_kuerzel}` : a.beschreibung}</span>
              {mitGebaeude && <span className="ort-unter">{a.beschreibung}</span>}
              <span className="d-flex gap-2 mt-1 flex-wrap"><PrioritaetPill prioritaet={a.prioritaet} /><StatusPill status={a.status} /></span>
            </span>
            <i className="bi bi-chevron-right text-leise" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
