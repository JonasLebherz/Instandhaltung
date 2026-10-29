'use client';
/**
 * components/karten/LandKarte.js – Karte eines Landes mit seinen Werken
 *
 * Jedes Werk ist ein Punkt mit der Zahl der offenen Störungen.
 * Ein Klick ruft onWaehle(standort) auf – die Zoom-Karte (KartenExplorer.js)
 * zoomt daraufhin in das Werk hinein.
 *
 * karte: aus landKarte() (lib/karten/laender.js) – Größe, Umriss des Landes,
 *        Nachbarländer und die Umrechnung GPS-Position → Punkt (Mercator).
 * neutral: beim Melden – keine Zahlen und Farben offener Störungen, nur Ortsmarken.
 *
 * Die Punkte werden prozentual über die SVG-Karte gelegt – so passt alles zu jeder Größe.
 */
import { stufe, offenText } from './stufe';
import { useT } from '@/components/SpracheKontext';

/**
 * Liegt direkt unter einem Punkt ein anderes Werk (z. B. Köln unter Dortmund),
 * kommt der Name über den Punkt – sonst würden sich Name und Nachbarpunkt überdecken.
 */
function beschriftungOben(punkt, allePunkte, karte) {
  return allePunkte.some((p) => p !== punkt && Math.abs(p.x - punkt.x) < karte.breite * 0.092
    && p.y > punkt.y && p.y - punkt.y < karte.hoehe * 0.094);
}

export default function LandKarte({ karte, standorte, auswahlId = null, onWaehle, neutral = false }) {
  const t = useT();
  const { breite, hoehe } = karte;
  const punkte = standorte.map((st) => ({ st, ...karte.punkt(st.breitengrad, st.laengengrad) }));
  const maske = `dkarte-maske-${karte.kuerzel}`;

  return (
    <div className="dkarte" style={{ aspectRatio: `${breite} / ${hoehe}` }}>
      <svg className="dkarte-svg" viewBox={`0 0 ${breite} ${hoehe}`} aria-hidden="true">
        <defs>
          <pattern id="dkarte-raster" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" className="dkarte-rasterpunkt" />
          </pattern>
          {/* Die Nachbarländer laufen zum Rand hin weich aus – so wirkt die Karte
              nicht wie ein eingeklebtes, rechteckiges Bild */}
          <radialGradient id={`${maske}-blende`} cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="#fff" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id={maske}>
            <rect width={breite} height={hoehe} fill={`url(#${maske}-blende)`} />
          </mask>
        </defs>
        <g mask={`url(#${maske})`}>
          {karte.nachbarn.map((d, i) => <path key={i} d={d} className="dkarte-nachbar" />)}
        </g>
        {karte.land && (
          <>
            <path d={karte.land} className="dkarte-land" />
            <path d={karte.land} fill="url(#dkarte-raster)" />
          </>
        )}
      </svg>

      {punkte.map((punkt, i) => {
        const { st, x, y } = punkt;
        const oben = beschriftungOben(punkt, punkte, karte);
        const farbe = neutral ? 'neutral' : stufe(st.offen, st.hoechste_prioritaet);
        return (
          <button key={st.id} type="button" onClick={(e) => onWaehle?.(st, e)}
                  // Tooltips am linken/rechten Kartenrand nach innen ausrichten, damit nichts übersteht
                  className={`karten-punkt stufe-${farbe}${oben ? ' name-oben' : ''}${x > breite * 0.68 ? ' info-links' : ''}`
                    + `${x < breite * 0.32 ? ' info-rechts' : ''}${auswahlId === st.id ? ' gewaehlt' : ''}`}
                  style={{ left: `${(x / breite) * 100}%`, top: `${(y / hoehe) * 100}%`, '--i': i }}
                  aria-label={neutral ? st.name : `${st.name}: ${offenText(st.offen, t)}`}
                  // data-ort: Daran findet die Zoom-Karte den Punkt, von dem aus sie zoomt
                  data-ort={`st-${st.id}`}>
            <span className="punkt-blase">
              {neutral ? <i className="bi bi-geo-alt-fill" /> : st.offen > 0 ? st.offen : <i className="bi bi-check-lg" />}
            </span>
            <span className="punkt-name">{st.stadt}</span>
            <span className="punkt-info" role="tooltip">
              <strong>{st.name}</strong>
              {neutral ? t(st.schwerpunkt) : `${offenText(st.offen, t)}${st.hoch > 0 ? t(', davon {n} hoch', { n: st.hoch }) : ''}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
