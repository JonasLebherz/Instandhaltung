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
 *  Beim Ebenenwechsel bleibt die alte Ebene kurz sichtbar ("uebergang"). Beide Ebenen
 *  werden wie von einer Kamera bewegt (kamerafahrt): Die neue Karte wächst genau aus
 *  der angeklickten Fläche (Land, Werkspunkt, Halle), die alte vergrößert sich mit und blendet aus.
 *
 * Ebene im Zustand: { land: 'DE' | null, standortId, gebaeudeId }.
 */
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { ampelZustand, AMPEL_TEXT } from '@/lib/karten/ampel';

// 3D-Ansicht für Werk und Halle: three.js wird nur im Browser und nur bei Bedarf geladen
const Werk3D = dynamic(() => import('./raum/Werk3D'), { ssr: false, loading: () => <div className="raum-laden" /> });
// Drehendes 3D-Modell der gewählten Maschine im Infofenster
const MaschineDetail3D = dynamic(() => import('./raum/MaschineDetail3D'), { ssr: false, loading: () => <div className="maschine-detail-3d" /> });

/** Kann der Browser WebGL (3D)? */
function webglVorhanden() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Dauer der Kamerafahrt in ms: in Land und Werk etwas länger (großer Maßstabssprung) */
const dauerFuer = (kindEbene) => (kindEbene.gebaeudeId ? 700 : 1000);
const weich = (x) => (x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2);
const stufe01 = (x, von, bis) => Math.min(1, Math.max(0, (x - von) / (bis - von)));

/**
 * Bilder einer Kamerafahrt zwischen übergeordneter Ebene (Eltern) und Unterebene (Kind).
 * A = angeklickte Fläche in der Elternebene, B = Inhalt der Kindebene (Mitte x/y, Breite w, Höhe h).
 * Der Maßstab ändert sich gleichmäßig (logarithmisch) – so wirkt es wie ein Flug auf die Erde zu.
 */
function kamerafahrt(A, B, rein, schritte = 24) {
  const s = Math.min(A.w / B.w, A.h / B.h);      // so klein beginnt die Kindebene (passt genau in A)
  const kind = [];
  const eltern = [];
  for (let i = 0; i <= schritte; i += 1) {
    const zeit = i / schritte;
    const p = rein ? weich(zeit) : 1 - weich(zeit);
    const k = s ** (1 - p);
    const cx = A.x + (B.x - A.x) * p;
    const cy = A.y + (B.y - A.y) * p;
    kind.push({ offset: zeit, transform: `translate(${cx - k * B.x}px, ${cy - k * B.y}px) scale(${k})` });
    eltern.push({ offset: zeit, transform: `translate(${cx - (k / s) * A.x}px, ${cy - (k / s) * A.y}px) scale(${k / s})` });
  }
  return { kind, eltern };
}

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
  const [uebergang, setUebergang] = useState(null);   // { von, richtung: 'rein'|'raus', dauer }
  // 2D oder 3D für Werk und Halle (gemerkt im Browser; ohne Wahl ab Tablet-Breite 3D) – auch beim Melden
  const [webgl, setWebgl] = useState(false);
  const [dreiD, setDreiD] = useState(false);
  useEffect(() => {
    const kann = webglVorhanden();
    setWebgl(kann);
    let wahl = null;
    try { wahl = localStorage.getItem('kartenansicht'); } catch { /* z. B. privater Modus */ }
    setDreiD(kann && (wahl ? wahl === '3d' : window.innerWidth >= 768));
  }, []);
  function ansichtWaehlen(drei) {
    setDreiD(drei);
    setUebergang(null);
    try { localStorage.setItem('kartenansicht', drei ? '3d' : '2d'); } catch { /* ignorieren */ }
  }

  const standortVon = (e) => standorte.find((st) => st.id === e.standortId) ?? null;
  const gebaeudeVon = (e) => gebaeude.find((g) => g.id === e.gebaeudeId) ?? null;
  const landVon = (e) => laender.find((l) => l.kuerzel === e.land) ?? null;
  const standort = standortVon(ebene);
  const aktuellesGebaeude = gebaeudeVon(ebene);
  const land = landVon(ebene);
  const stufeName = ebene.gebaeudeId ? 'gebaeude' : ebene.standortId ? 'werk' : ebene.land ? 'land' : 'welt';
  const raumMoeglich = webgl;
  // Gebäude und Maschinen des aktuellen Werks (für die 3D-Ansicht)
  const werkGebaeude = useMemo(() => gebaeude.filter((g) => g.standort_id === ebene.standortId), [gebaeude, ebene.standortId]);
  const werkMaschinen = useMemo(() => {
    const ids = new Set(werkGebaeude.map((g) => g.id));
    return maschinen.filter((m) => ids.has(m.gebaeude_id));
  }, [maschinen, werkGebaeude]);

  /* ---------- Wechsel zwischen den Ebenen ---------- */

  function wechsle(neueEbene, richtung) {
    // 3D: Zwischen Werk und Halle fliegt die Kamera – die Ebene selbst bleibt, keine Zoom-Animation
    if (raumMoeglich && dreiD && ebene.standortId && neueEbene.standortId === ebene.standortId) {
      setEbene(neueEbene);
      setMaschineId(null);
      return;
    }
    setUebergang({ von: ebene, richtung, dauer: dauerFuer(richtung === 'rein' ? neueEbene : ebene) });
    setEbene(neueEbene);
    setMaschineId(null);
  }

  const zuLand = (l) => wechsle({ land: l.kuerzel, standortId: null, gebaeudeId: null }, 'rein');
  const zuWerk = (st) => wechsle({ land: st.land, standortId: st.id, gebaeudeId: null }, 'rein');
  const zuGebaeude = (g) => wechsle({ land: ebene.land, standortId: g.standort_id, gebaeudeId: g.id }, 'rein');
  const zuWelt = () => wechsle({ land: null, standortId: null, gebaeudeId: null }, 'raus');
  const zuLandRaus = () => wechsle({ land: ebene.land, standortId: null, gebaeudeId: null }, 'raus');
  const zuStandort = () => wechsle({ land: ebene.land, standortId: ebene.standortId, gebaeudeId: null }, 'raus');
  // Eine Ebene höher (Zurück-Knopf)
  const zurueck = { gebaeude: zuStandort, werk: zuLandRaus, land: zuWelt }[stufeName];

  function maschineGeklickt(m) {
    if (modus === 'auswahl') onMaschine?.(m);
    else setMaschineId(maschineId === m.id ? null : m.id);
  }

  // Kamerafahrt: Vor dem ersten Zeichnen messen, wo die angeklickte Fläche in der Elternebene liegt (A)
  // und wie groß der Inhalt der Kindebene ist (B). Dann beide Ebenen gemeinsam bewegen:
  // Hinein wächst die Kindebene aus A heraus, die Elternebene vergrößert sich mit; heraus umgekehrt.
  // Die neue Ebene blendet ein, die alte aus. Web-Animationen statt CSS-Klassen, damit ein
  // Neuzeichnen durch React die Fahrt nicht unterbricht.
  useLayoutEffect(() => {
    const neu = neuRef.current;
    const alt = altRef.current;
    const buehne = buehneRef.current;
    if (!uebergang || !neu || !alt || !buehne) return undefined;
    const rein = uebergang.richtung === 'rein';
    const [eltern, kind] = rein ? [alt, neu] : [neu, alt];
    const kindEbene = rein ? ebene : uebergang.von;
    const kennung = kindEbene.gebaeudeId ? `g-${kindEbene.gebaeudeId}` : kindEbene.standortId ? `st-${kindEbene.standortId}` : `land-${kindEbene.land}`;
    const b = buehne.getBoundingClientRect();
    const rechteck = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2, w: r.width, h: r.height };
    };
    // Fokus: Umriss des Landes, Punkt des Werks bzw. Fläche der Halle
    const fokus = eltern.querySelector(`[data-flaeche="${kennung}"]`)
      ?? eltern.querySelector(`[data-ort="${kennung}"] .punkt-blase`) ?? eltern.querySelector(`[data-ort="${kennung}"]`);
    const ziel = kind.querySelector('.dkarte-land, .lageplan, .grundriss, .raum, .raum-laden') ?? kind.firstElementChild;
    const animationen = [];
    const dauer = uebergang.dauer;
    const blende = (el, ein) => el.animate(
      Array.from({ length: 11 }, (_, i) => ({ offset: i / 10, opacity: ein ? stufe01(i / 10, 0.12, 0.5) : 1 - stufe01(i / 10, 0.3, 0.65) })),
      { duration: dauer, fill: 'both' },
    );
    const A = fokus ? rechteck(fokus) : null;
    const B = ziel ? rechteck(ziel) : null;
    if (A && B && A.w > 0 && B.w > 0 && A.h > 0 && B.h > 0) {
      const fahrt = kamerafahrt(A, B, rein);
      animationen.push(kind.animate(fahrt.kind, { duration: dauer, fill: 'both' }));
      animationen.push(eltern.animate(fahrt.eltern, { duration: dauer, fill: 'both' }));
    }
    animationen.push(blende(neu, true), blende(alt, false));
    neu.style.transformOrigin = '0 0';
    alt.style.transformOrigin = '0 0';
    return () => animationen.forEach((a) => a.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uebergang]);

  // Nach der Animation die alte Ebene entfernen
  useEffect(() => {
    if (!uebergang) return undefined;
    const timer = setTimeout(() => setUebergang(null), uebergang.dauer);
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

  const raum = raumMoeglich && dreiD && (stufeName === 'werk' || stufeName === 'gebaeude');
  const schluessel = raum ? `raum-${ebene.standortId}` : `${ebene.land ?? 'welt'}-${ebene.standortId ?? 'x'}-${ebene.gebaeudeId ?? 'x'}`;
  const schrittNr = { welt: 1, land: 2, werk: 3, gebaeude: 4 }[stufeName];
  const titel = aktuellesGebaeude?.bezeichnung ?? standort?.name ?? (land ? t(land.name) : t('Weltweit'));
  const hinweis = t(modus === 'auswahl'
    ? { welt: T('In welchem Land?'), land: T('In welchem Werk?'), werk: T('In welchem Gebäude?'), gebaeude: T('An welcher Maschine?') }[stufeName]
    : {
      welt: T('Land anklicken zum Hineinzoomen'), land: T('Werk anklicken zum Hineinzoomen'),
      werk: raum ? T('Halle anklicken · ziehen zum Drehen') : T('Gebäude anklicken für den Grundriss'),
      gebaeude: raum ? T('Maschine anklicken · ziehen zum Drehen') : T('Maschine anklicken für Details'),
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

      {/* Weltebene: Bühne so hoch wie die (breite) Weltkarte, damit oben und unten nichts leer bleibt */}
      <div className={`explorer-buehne buehne-${groesse}${stufeName === 'welt' ? ' buehne-welt' : ''}`} ref={buehneRef}
           style={{ '--welt-verhaeltnis': weltVerhaeltnis() }}>
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
          <div ref={altRef} className="explorer-ebene ebene-alt" aria-hidden="true">
            {ebeneZeichnen(uebergang.von, false)}
          </div>
        )}
        <div ref={neuRef} key={schluessel}
             // Beim Herauszoomen sind die Beschriftungen der neuen (zunächst stark vergrößerten) Ebene kurz verborgen
             className={`explorer-ebene ebene-neu${raum ? ' ebene-raum' : ''}${uebergang?.richtung === 'raus' ? ' ohne-marken' : ''}`}>
          {raum ? (
            <Werk3D standort={standort} gebaeude={werkGebaeude} maschinen={werkMaschinen} gebaeudeId={ebene.gebaeudeId}
                    maschineId={maschineId} onGebaeude={zuGebaeude} onMaschine={maschineGeklickt} neutral={melden} />
          ) : ebeneZeichnen(ebene, true)}
        </div>

        {/* Umschalter 2D / 3D (nur für Werk und Halle) */}
        {raumMoeglich && (stufeName === 'werk' || stufeName === 'gebaeude') && (
          <div className="sprach-schalter raum-schalter" role="group" aria-label={t('Darstellung der Karte')}>
            <button type="button" aria-pressed={!dreiD} onClick={() => ansichtWaehlen(false)}>2D</button>
            <button type="button" aria-pressed={dreiD} onClick={() => ansichtWaehlen(true)}>3D</button>
          </div>
        )}
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
                      laender={laender} land={land} webgl={webgl}
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
  stufe: ebeneName, modus, daten, laender, land, standort, gebaeudeAktuell, maschineId, webgl,
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
        {/* Signalampel der Maschine und – wenn der Browser 3D kann – das animierte Modell */}
        <div className={`ampel-zeile ampel-${ampelZustand(auswahl)}`}>
          <span className="ampel-symbol" aria-hidden="true"><i /><i /><i /></span>
          {t(AMPEL_TEXT[ampelZustand(auswahl)])}
        </div>
        {webgl && <MaschineDetail3D key={auswahl.id} maschine={auswahl} />}
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
