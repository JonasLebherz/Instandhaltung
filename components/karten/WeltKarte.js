'use client';
/**
 * components/karten/WeltKarte.js – Weltebene der Störungskarte
 *
 * Oben die Weltkarte, darunter Europa als eigene Detailkarte: In Europa liegen
 * Deutschland, Frankreich und Polen zu dicht für Markierungen auf der Weltkarte.
 * Ein gestrichelter Rahmen auf der Weltkarte zeigt, welcher Ausschnitt unten vergrößert ist.
 *
 * Länder mit Werken sind hervorgehoben (Farbe nach der dringendsten offenen
 * Störung) und tragen eine Markierung mit der Zahl offener Störungen.
 * Ein Klick auf Land oder Markierung ruft onWaehle(land, event) auf – die
 * Zoom-Karte (KartenExplorer.js) zoomt dann in das Land hinein.
 *
 * klein:   kompakte Fassung für die Übersicht (kleinere Markierungen, Namen nur im Tooltip)
 * neutral: beim Melden – keine Störungszahlen, nur Ortsmarken
 */
import { EUROPA, WELT, WELT_MITTEN, WELT_PFADE, landPunkt, weltPunkt } from '@/lib/karten/welt';
import { inEuropa, markenPositionen } from '@/lib/karten/laender';
import { stufe, offenText } from './stufe';
import { useT } from '@/components/SpracheKontext';

const WELTKARTE = {
  breite: WELT.breite, hoehe: WELT.hoehe, mitten: WELT_MITTEN, punkt: weltPunkt,
  laender: WELT_PFADE, rest: WELT_PFADE.rest,
};
const EUROPAKARTE = {
  breite: EUROPA.breite, hoehe: EUROPA.hoehe, mitten: EUROPA.mitten,
  punkt: (breite, laenge) => landPunkt(EUROPA, breite, laenge),
  laender: EUROPA.laender, rest: EUROPA.rest,
};

/** Eine der beiden Karten: Umrisse, hervorgehobene Länder und Markierungen */
function Teilkarte({ karte, alleLaender, markiert, abstand, rahmen = null, titel = null, onWaehle, neutral, klein }) {
  const t = useT();
  const { breite, hoehe } = karte;
  const positionen = markenPositionen(markiert, abstand, karte, karte.punkt);
  const farbe = (land) => (neutral ? 'neutral' : stufe(land.offen, land.hoechste_prioritaet));

  return (
    <div className="dkarte wkarte" style={{ aspectRatio: `${breite} / ${hoehe}` }}>
      <svg className="dkarte-svg" viewBox={`0 0 ${breite} ${hoehe}`} aria-hidden="true">
        <path d={karte.rest} className="welt-land" />
        {/* Länder ohne Werk, für die es trotzdem einen eigenen Umriss gibt */}
        {Object.entries(karte.laender)
          .filter(([kuerzel]) => kuerzel !== 'rest' && !alleLaender.some((l) => l.kuerzel === kuerzel))
          .map(([kuerzel, d]) => <path key={kuerzel} d={d} className="welt-land" />)}
        {/* Länder des Unternehmens: hervorgehoben und anklickbar */}
        {alleLaender.map((land) => karte.laender[land.kuerzel] && (
          <path key={land.kuerzel} d={karte.laender[land.kuerzel]} className={`welt-firma stufe-${farbe(land)}`}
                onClick={(e) => onWaehle?.(land, e)} />
        ))}
        {rahmen && <path d={rahmen} className="welt-rahmen" />}
        {/* Feine Linie von der Markierung zur Mitte des Landes, falls verschoben */}
        {markiert.map((land) => {
          const p = positionen[land.kuerzel];
          return Math.hypot(p.x - p.echt.x, p.y - p.echt.y) > 6 && (
            <g key={land.kuerzel} className="welt-fuehrung">
              <line x1={p.echt.x} y1={p.echt.y} x2={p.x} y2={p.y} />
              <circle cx={p.echt.x} cy={p.echt.y} r={3} />
            </g>
          );
        })}
      </svg>
      {titel && <span className="wkarte-titel">{titel}</span>}

      {markiert.map((land, i) => {
        const p = positionen[land.kuerzel];
        const werke = land.werke === 1 ? t('1 Werk') : t('{n} Werke', { n: land.werke });
        return (
          <button key={land.kuerzel} type="button" onClick={(e) => onWaehle?.(land, e)}
                  className={`karten-punkt stufe-${farbe(land)}${p.x > breite * 0.7 ? ' info-links' : ''}${p.x < breite * 0.3 ? ' info-rechts' : ''}`}
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
      })}
    </div>
  );
}

export default function WeltKarte({ laender, onWaehle, neutral = false, klein = false }) {
  const t = useT();
  const europa = laender.filter(inEuropa);
  const rest = laender.filter((l) => !inEuropa(l));
  const gemeinsam = { alleLaender: laender, onWaehle, neutral, klein };
  return (
    <div className={`weltebene${klein ? ' wkarte-klein' : ''}`}>
      <Teilkarte karte={WELTKARTE} markiert={rest} abstand={klein ? { x: 110, y: 105 } : { x: 165, y: 120 }}
                 rahmen={europa.length > 0 ? EUROPA.rahmen : null} {...gemeinsam} />
      {europa.length > 0 && (
        <Teilkarte karte={EUROPAKARTE} markiert={europa} abstand={klein ? { x: 120, y: 120 } : { x: 185, y: 115 }}
                   titel={t('Europa')} {...gemeinsam} />
      )}
    </div>
  );
}
