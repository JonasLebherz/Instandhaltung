'use client';
/**
 * components/karten/WeltKarte.js – Weltebene der Störungskarte
 *
 * Eine Weltkarte (Ausschnitt mit allen Werken). Deutschland, Frankreich und Polen
 * liegen darauf zu dicht beieinander – deshalb zeigt eine „Lupe“ über dem Atlantik
 * Europa vergrößert. Ein gestrichelter Kreis markiert den Ausschnitt, zwei Linien
 * verbinden ihn mit der Lupe. Die Länder in der Lupe sind anklickbar wie alle anderen.
 *
 * Länder mit Werken sind hervorgehoben (Farbe nach der dringendsten offenen
 * Störung) und tragen eine Markierung mit der Zahl offener Störungen.
 * Ein Klick auf Land oder Markierung ruft onWaehle(land, event) auf – die
 * Zoom-Karte (KartenExplorer.js) zoomt dann in das Land hinein.
 *
 * klein:   kompakte Fassung für die Übersicht (kleinere Markierungen, Namen nur im Tooltip)
 * neutral: beim Melden – keine Störungszahlen, nur Ortsmarken
 */
import { useEffect, useRef, useState } from 'react';
import { LUPE, WELT, WELT_MITTEN, WELT_PFADE, weltPunkt } from '@/lib/karten/welt';
import { inLupe, markenPositionen } from '@/lib/karten/laender';
import { stufe, offenText } from './stufe';
import { useT } from '@/components/SpracheKontext';

const KARTE = { breite: WELT.breite, hoehe: WELT.hoehe, mitten: WELT_MITTEN };

/** Äußere Tangenten zwischen zwei Kreisen (Linien von der Lupe zum Kreis um Europa) */
function tangenten(a, b) {
  const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
  const winkel = Math.atan2(b.cy - a.cy, b.cx - a.cx);
  const alpha = Math.acos(Math.min(1, (a.r - b.r) / d));
  return [winkel + alpha, winkel - alpha].map((w) => ({
    x1: a.cx + a.r * Math.cos(w), y1: a.cy + a.r * Math.sin(w),
    x2: b.cx + b.r * Math.cos(w), y2: b.cy + b.r * Math.sin(w),
  }));
}

/** Seite der Beschriftung in der Lupe: weg von der Mitte der Gruppe, damit sich nichts überdeckt */
function seiteInLupe(p, mitte) {
  const dx = p.x - mitte.x;
  const dy = p.y - mitte.y;
  // Nur deutlich seitlich liegende Länder bekommen den Namen daneben (nach links ragt er sonst aus der Lupe)
  if (Math.abs(dx) > Math.abs(dy) * 2.2) return dx < 0 ? ' name-links' : ' name-rechts';
  return dy < 0 ? ' name-oben' : '';
}

export default function WeltKarte({ laender, onWaehle, neutral = false, klein: kleinGewuenscht = false }) {
  const t = useT();
  // Ist die Karte schmal (Handy), automatisch kompakt: kleinere Markierungen, Namen nur im Tooltip
  const rahmenRef = useRef(null);
  const [schmal, setSchmal] = useState(false);
  useEffect(() => {
    const beobachter = new ResizeObserver(([e]) => setSchmal(e.contentRect.width < 520));
    if (rahmenRef.current) beobachter.observe(rahmenRef.current);
    return () => beobachter.disconnect();
  }, []);
  const klein = kleinGewuenscht || schmal;
  const { breite, hoehe } = KARTE;
  const inDerLupe = laender.filter(inLupe);
  const aussen = laender.filter((l) => !inLupe(l));
  const mitLupe = inDerLupe.length > 0;
  const positionen = markenPositionen(aussen, klein ? { x: 110, y: 105 } : { x: 165, y: 115 }, KARTE, weltPunkt);
  const lupenMitte = mitLupe ? {
    x: inDerLupe.reduce((s, l) => s + LUPE.mitten[l.kuerzel].x, 0) / inDerLupe.length,
    y: inDerLupe.reduce((s, l) => s + LUPE.mitten[l.kuerzel].y, 0) / inDerLupe.length,
  } : null;
  const farbe = (land) => (neutral ? 'neutral' : stufe(land.offen, land.hoechste_prioritaet));
  const firma = new Set(laender.map((l) => l.kuerzel));

  /** Markierung eines Landes (auf der Weltkarte oder in der Lupe) */
  const markierung = (land, p, i, zusatz = '') => {
    const werke = land.werke === 1 ? t('1 Werk') : t('{n} Werke', { n: land.werke });
    return (
      <button key={land.kuerzel} type="button" onClick={(e) => onWaehle?.(land, e)}
              className={`karten-punkt stufe-${farbe(land)}${zusatz}${p.x > breite * 0.7 ? ' info-links' : ''}${p.x < breite * 0.3 ? ' info-rechts' : ''}`}
              style={{ left: `${(p.x / breite) * 100}%`, top: `${(p.y / hoehe) * 100}%`, '--i': i }}
              aria-label={neutral ? `${t(land.name)}: ${werke}` : `${t(land.name)}: ${werke}, ${offenText(land.offen, t)}`}
              data-ort={`land-${land.kuerzel}`}>
        <span className="punkt-blase">
          {neutral ? <i className="bi bi-geo-alt-fill" /> : land.offen > 0 ? land.offen : <i className="bi bi-check-lg" />}
        </span>
        {!klein && (
          <span className="punkt-name">
            {land.hauptsitz && <i className="bi bi-star-fill hauptsitz-stern" aria-hidden="true" />} {t(land.name)}
          </span>
        )}
        <span className="punkt-info" role="tooltip">
          <strong>{t(land.name)}{land.hauptsitz ? ` · ${t('Hauptsitz')}` : ''}</strong>
          {werke}{neutral ? '' : ` · ${offenText(land.offen, t)}`}
        </span>
      </button>
    );
  };

  /** Umrisse: übrige Länder grau, Länder des Unternehmens getönt und anklickbar */
  const umrisse = (pfade) => (
    <>
      <path d={pfade.rest} className="welt-land" />
      {Object.entries(pfade).filter(([k]) => k !== 'rest' && !firma.has(k))
        .map(([k, d]) => <path key={k} d={d} className="welt-land" />)}
      {laender.map((land) => pfade[land.kuerzel] && (
        <path key={land.kuerzel} d={pfade[land.kuerzel]} className={`welt-firma stufe-${farbe(land)}`}
              onClick={(e) => onWaehle?.(land, e)} />
      ))}
    </>
  );

  return (
    <div ref={rahmenRef} className={`dkarte wkarte${klein ? ' wkarte-klein' : ''}`} style={{ aspectRatio: `${breite} / ${hoehe}` }}>
      <svg className="dkarte-svg" viewBox={`0 0 ${breite} ${hoehe}`} aria-hidden="true">
        <defs>
          <clipPath id="lupe-ausschnitt"><circle cx={LUPE.cx} cy={LUPE.cy} r={LUPE.r} /></clipPath>
        </defs>
        {umrisse(WELT_PFADE)}

        {/* Feine Linie von der Markierung zur Mitte des Landes, falls verschoben */}
        {aussen.map((land) => {
          const p = positionen[land.kuerzel];
          return Math.hypot(p.x - p.echt.x, p.y - p.echt.y) > 6 && (
            <g key={land.kuerzel} className="welt-fuehrung">
              <line x1={p.echt.x} y1={p.echt.y} x2={p.x} y2={p.y} />
              <circle cx={p.echt.x} cy={p.echt.y} r={3} />
            </g>
          );
        })}

        {/* Lupe: Kreis um Europa, Verbindungslinien, vergrößerter Ausschnitt */}
        {mitLupe && (
          <g className="lupe">
            <circle cx={LUPE.quelle.cx} cy={LUPE.quelle.cy} r={LUPE.quelle.r} className="lupe-quelle" />
            {tangenten(LUPE, LUPE.quelle).map((l, i) => <line key={i} {...l} className="lupe-linie" />)}
            <circle cx={LUPE.cx} cy={LUPE.cy} r={LUPE.r} className="lupe-flaeche" />
            <g clipPath="url(#lupe-ausschnitt)">{umrisse({ ...LUPE.laender, rest: LUPE.rest })}</g>
            <circle cx={LUPE.cx} cy={LUPE.cy} r={LUPE.r} className="lupe-rand" />
          </g>
        )}
      </svg>
      {mitLupe && !klein && (
        <span className="lupe-titel" style={{ left: `${(LUPE.cx / breite) * 100}%`, top: `${((LUPE.cy + LUPE.r) / hoehe) * 100}%` }}>
          <i className="bi bi-zoom-in" aria-hidden="true" /> {t('Europa')}
        </span>
      )}

      {aussen.map((land, i) => markierung(land, positionen[land.kuerzel], i))}
      {inDerLupe.map((land, i) => {
        const p = LUPE.mitten[land.kuerzel];
        return markierung(land, p, aussen.length + i, ` in-lupe${klein ? '' : seiteInLupe(p, lupenMitte)}`);
      })}
    </div>
  );
}
