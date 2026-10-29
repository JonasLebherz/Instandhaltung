'use client';
/**
 * components/karten/DeutschlandKarte.js – Deutschlandkarte mit allen Standorten
 *
 * Jeder Standort ist ein Punkt mit der Zahl der offenen Störungen.
 * Ein Klick ruft onWaehle(standort) auf – die Zoom-Karte (KartenExplorer.js)
 * zoomt daraufhin in das Werk hinein.
 *
 * neutral: beim Melden – keine Zahlen und Farben offener Störungen, nur Ortsmarken.
 *
 * Die Punkte werden per Mercator-Projektion aus Breiten-/Längengrad berechnet
 * und prozentual über die SVG-Karte gelegt – so passt alles zu jeder Größe.
 */
import { DEUTSCHLAND_PFAD, NACHBAR_PFADE, KARTE_BREITE, KARTE_HOEHE, projizieren } from '@/lib/karten/deutschland';
import { stufe, offenText } from './stufe';
import { useT } from '@/components/SpracheKontext';

/**
 * Liegt direkt unter einem Punkt ein anderer Standort (z. B. Köln unter Dortmund),
 * kommt der Name über den Punkt – sonst würden sich Name und Nachbarpunkt überdecken.
 */
function beschriftungOben(punkt, allePunkte) {
  return allePunkte.some((p) => p !== punkt && Math.abs(p.x - punkt.x) < 55 && p.y > punkt.y && p.y - punkt.y < 75);
}

export default function DeutschlandKarte({ standorte, auswahlId = null, onWaehle, neutral = false }) {
  const t = useT();
  const punkte = standorte.map((st) => ({ st, ...projizieren(st.breitengrad, st.laengengrad) }));

  return (
    <div className="dkarte" style={{ aspectRatio: `${KARTE_BREITE} / ${KARTE_HOEHE}` }}>
      <svg className="dkarte-svg" viewBox={`0 0 ${KARTE_BREITE} ${KARTE_HOEHE}`} aria-hidden="true">
        <defs>
          <pattern id="dkarte-raster" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" className="dkarte-rasterpunkt" />
          </pattern>
          {/* Die Nachbarländer laufen zum Rand hin weich aus – so wirkt die Karte
              nicht wie ein eingeklebtes, rechteckiges Bild */}
          <radialGradient id="dkarte-blende" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="#fff" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="dkarte-maske">
            <rect width={KARTE_BREITE} height={KARTE_HOEHE} fill="url(#dkarte-blende)" />
          </mask>
        </defs>
        <g mask="url(#dkarte-maske)">
          {NACHBAR_PFADE.map((d, i) => <path key={i} d={d} className="dkarte-nachbar" />)}
        </g>
        <path d={DEUTSCHLAND_PFAD} className="dkarte-land" />
        <path d={DEUTSCHLAND_PFAD} fill="url(#dkarte-raster)" />
      </svg>

      {punkte.map((punkt, i) => {
        const { st, x, y } = punkt;
        const oben = beschriftungOben(punkt, punkte);
        const farbe = neutral ? 'neutral' : stufe(st.offen, st.hoechste_prioritaet);
        return (
          <button key={st.id} type="button" onClick={(e) => onWaehle?.(st, e)}
                  // Tooltips am linken/rechten Kartenrand nach innen ausrichten, damit nichts übersteht
                  className={`karten-punkt stufe-${farbe}${oben ? ' name-oben' : ''}${x > KARTE_BREITE * 0.68 ? ' info-links' : ''}`
                    + `${x < KARTE_BREITE * 0.32 ? ' info-rechts' : ''}${auswahlId === st.id ? ' gewaehlt' : ''}`}
                  style={{ left: `${(x / KARTE_BREITE) * 100}%`, top: `${(y / KARTE_HOEHE) * 100}%`, '--i': i }}
                  aria-label={neutral ? st.name : `${st.name}: ${offenText(st.offen, t)}`}
                  // data-ort: Daran findet die Zoom-Karte den Punkt, von dem aus sie zoomt
                  data-ort={`st-${st.id}`}>
            <span className="punkt-blase">
              {neutral ? <i className="bi bi-geo-alt-fill" /> : st.offen > 0 ? st.offen : <i className="bi bi-check-lg" />}
            </span>
            <span className="punkt-name">{st.stadt}</span>
            <span className="punkt-info" role="tooltip">
              <strong>{st.name}</strong>
              {neutral ? st.schwerpunkt : `${offenText(st.offen, t)}${st.hoch > 0 ? t(', davon {n} hoch', { n: st.hoch }) : ''}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
