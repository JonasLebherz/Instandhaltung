'use client';
/**
 * components/karten/WeltKarte.js – Weltkarte mit allen Ländern des Unternehmens
 *
 * Länder mit Werken sind hervorgehoben (Farbe nach der dringendsten offenen
 * Störung) und tragen eine Markierung mit der Zahl offener Störungen.
 * Ein Klick auf Land oder Markierung ruft onWaehle(land, event) auf – die
 * Zoom-Karte (KartenExplorer.js) zoomt dann in das Land hinein.
 *
 * Liegen Länder dicht beieinander (z. B. Deutschland, Frankreich, Polen),
 * werden die Markierungen etwas auseinandergeschoben. Eine feine Linie
 * führt zur echten Lage (Mitte der Werke des Landes).
 *
 * klein:   kompakte Fassung für die Übersicht (kleinere Markierungen, Namen nur im Tooltip)
 * neutral: beim Melden – keine Störungszahlen, nur Ortsmarken
 */
import { WELT, WELT_PFADE } from '@/lib/karten/welt';
import { weltPositionen } from '@/lib/karten/laender';
import { stufe, offenText } from './stufe';
import { useT } from '@/components/SpracheKontext';

export default function WeltKarte({ laender, onWaehle, neutral = false, klein = false }) {
  const t = useT();
  const { breite, hoehe } = WELT;
  const positionen = weltPositionen(laender, klein ? { x: 95, y: 92 } : { x: 150, y: 120 });

  return (
    <div className={`dkarte wkarte${klein ? ' wkarte-klein' : ''}`} style={{ aspectRatio: `${breite} / ${hoehe}` }}>
      <svg className="dkarte-svg" viewBox={`0 0 ${breite} ${hoehe}`} aria-hidden="true">
        <path d={WELT_PFADE.rest} className="welt-land" />
        {/* Länder ohne Werk, für die es trotzdem einen eigenen Umriss gibt */}
        {Object.entries(WELT_PFADE)
          .filter(([kuerzel]) => kuerzel !== 'rest' && !laender.some((l) => l.kuerzel === kuerzel))
          .map(([kuerzel, d]) => <path key={kuerzel} d={d} className="welt-land" />)}
        {/* Länder des Unternehmens: hervorgehoben und anklickbar */}
        {laender.map((land) => WELT_PFADE[land.kuerzel] && (
          <path key={land.kuerzel} d={WELT_PFADE[land.kuerzel]}
                className={`welt-firma stufe-${neutral ? 'neutral' : stufe(land.offen, land.hoechste_prioritaet)}`}
                onClick={(e) => onWaehle?.(land, e)} />
        ))}
        {/* Feine Linie von der Markierung zur echten Lage, falls verschoben */}
        {laender.map((land) => {
          const p = positionen[land.kuerzel];
          const verschoben = Math.hypot(p.x - p.echt.x, p.y - p.echt.y) > 6;
          return verschoben && (
            <g key={land.kuerzel} className="welt-fuehrung">
              <line x1={p.echt.x} y1={p.echt.y} x2={p.x} y2={p.y} />
              <circle cx={p.echt.x} cy={p.echt.y} r={klein ? 3 : 2.5} />
            </g>
          );
        })}
      </svg>

      {laender.map((land, i) => {
        const p = positionen[land.kuerzel];
        const farbe = neutral ? 'neutral' : stufe(land.offen, land.hoechste_prioritaet);
        const werke = land.werke === 1 ? t('1 Werk') : t('{n} Werke', { n: land.werke });
        return (
          <button key={land.kuerzel} type="button" onClick={(e) => onWaehle?.(land, e)}
                  className={`karten-punkt stufe-${farbe}${p.x > breite * 0.7 ? ' info-links' : ''}${p.x < breite * 0.3 ? ' info-rechts' : ''}`}
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
