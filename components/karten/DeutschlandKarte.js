'use client';
/**
 * components/karten/DeutschlandKarte.js – Deutschlandkarte mit allen Standorten
 *
 * Jeder Standort ist ein Punkt mit der Zahl der offenen Störungen.
 * Ein Klick ruft onWaehle(standort) auf – die Zoom-Karte (KartenExplorer.js)
 * zoomt daraufhin in das Werk hinein.
 *
 * Die Punkte werden per Mercator-Projektion aus Breiten-/Längengrad berechnet
 * und prozentual über die SVG-Karte gelegt – so passt alles zu jeder Größe.
 */
import { DEUTSCHLAND_PFAD, NACHBAR_PFADE, KARTE_BREITE, KARTE_HOEHE, projizieren } from '@/lib/karten/deutschland';
import { stufe, offenText } from './stufe';

/**
 * Liegt direkt unter einem Punkt ein anderer Standort (z. B. Köln unter Dortmund),
 * kommt der Name über den Punkt – sonst würden sich Name und Nachbarpunkt überdecken.
 */
function beschriftungOben(punkt, allePunkte) {
  return allePunkte.some((p) => p !== punkt && Math.abs(p.x - punkt.x) < 55 && p.y > punkt.y && p.y - punkt.y < 75);
}

export default function DeutschlandKarte({ standorte, auswahlId = null, onWaehle }) {
  const punkte = standorte.map((st) => ({ st, ...projizieren(st.breitengrad, st.laengengrad) }));

  return (
    <div className="dkarte" style={{ aspectRatio: `${KARTE_BREITE} / ${KARTE_HOEHE}` }}>
      <svg className="dkarte-svg" viewBox={`0 0 ${KARTE_BREITE} ${KARTE_HOEHE}`} aria-hidden="true">
        <defs>
          <pattern id="dkarte-raster" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" className="dkarte-rasterpunkt" />
          </pattern>
        </defs>
        {NACHBAR_PFADE.map((d, i) => <path key={i} d={d} className="dkarte-nachbar" />)}
        <path d={DEUTSCHLAND_PFAD} className="dkarte-land" />
        <path d={DEUTSCHLAND_PFAD} fill="url(#dkarte-raster)" />
      </svg>

      {punkte.map((punkt, i) => {
        const { st, x, y } = punkt;
        const oben = beschriftungOben(punkt, punkte);
        const farbe = stufe(st.offen, st.hoechste_prioritaet);
        return (
          <button key={st.id} type="button" onClick={(e) => onWaehle?.(st, e)}
                  // Tooltips am linken/rechten Kartenrand nach innen ausrichten, damit nichts übersteht
                  className={`karten-punkt stufe-${farbe}${oben ? ' name-oben' : ''}${x > KARTE_BREITE * 0.68 ? ' info-links' : ''}`
                    + `${x < KARTE_BREITE * 0.32 ? ' info-rechts' : ''}${auswahlId === st.id ? ' gewaehlt' : ''}`}
                  style={{ left: `${(x / KARTE_BREITE) * 100}%`, top: `${(y / KARTE_HOEHE) * 100}%`, '--i': i }}
                  aria-label={`${st.name}: ${offenText(st.offen)}`}
                  // data-ort: Daran findet die Zoom-Karte den Punkt, von dem aus sie zoomt
                  data-ort={`st-${st.id}`}>
            <span className="punkt-blase">{st.offen > 0 ? st.offen : <i className="bi bi-check-lg" />}</span>
            <span className="punkt-name">{st.stadt}</span>
            <span className="punkt-info" role="tooltip">
              <strong>{st.name}</strong>
              {offenText(st.offen)}{st.hoch > 0 ? `, davon ${st.hoch} hoch` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
