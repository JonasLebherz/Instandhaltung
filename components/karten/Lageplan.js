'use client';
/**
 * components/karten/Lageplan.js – Lageplan eines Werksgeländes mit seinen Gebäuden
 *
 * Gelände, Zufahrt und Parkplatz werden als SVG gezeichnet, die Gebäude liegen
 * als anklickbare Flächen darüber (Position und Größe aus der Datenbank, in Metern).
 * Ein Klick ruft onWaehle(gebaeude) auf – die Zoom-Karte zoomt in das Gebäude.
 */
import { stufe, offenText } from './stufe';

/** Kleine, gleichmäßig verteilte Bäume entlang des Zauns (rein dekorativ) */
function baeume(B, T, zufahrtY) {
  const liste = [];
  for (let x = 16; x < B - 10; x += 13) liste.push([x, 9]);                 // oben
  for (let y = 24; y < zufahrtY - 8; y += 13) liste.push([B - 9, y]);      // rechts
  return liste;
}

export default function Lageplan({ standort, gebaeude, auswahlId = null, onWaehle }) {
  const B = standort.gelaende_breite_m;
  const T = standort.gelaende_tiefe_m;
  const prozent = (wert, gesamt) => `${(wert / gesamt) * 100}%`;
  const zufahrtY = T - 24;   // unten: Werksstraße mit Tor und Parkplatz (nur gezeichnet)

  // Unter jeder Gebäudereihe verläuft eine Werksstraße; links verbindet eine Straße alles mit der Zufahrt
  const reihenUnten = [...new Set(gebaeude.map((g) => g.lage_y_m + g.tiefe_m))].sort((a, b) => a - b);
  const strassenY = reihenUnten.map((unten) => unten + 4).filter((y) => y < zufahrtY - 8);
  const parkplatzBreite = Math.min(70, B * 0.3);
  const stellplaetze = Math.floor((parkplatzBreite - 4) / 3);

  return (
    <div className="lageplan-rahmen">
      <div className="lageplan" style={{ aspectRatio: `${B} / ${T}` }}>
        <svg className="lageplan-svg" viewBox={`0 0 ${B} ${T}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <pattern id="lageplan-raster" width="10" height="10" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r=".45" className="plan-rasterpunkt" />
            </pattern>
          </defs>
          {/* Gelände mit Zaun */}
          <rect x="3" y="3" width={B - 6} height={T - 6} rx="6" className="plan-gelaende" />
          <rect x="3" y="3" width={B - 6} height={T - 6} rx="6" fill="url(#lageplan-raster)" />

          {/* Werksstraßen */}
          {strassenY.map((y) => <rect key={y} x="10" y={y} width={B - 20} height="6" rx="3" className="plan-strasse" />)}
          <rect x="10" y={strassenY[0] ?? zufahrtY} width="6" height={Math.max(0, zufahrtY - (strassenY[0] ?? zufahrtY) + 4)} className="plan-strasse" />
          <rect x="3" y={zufahrtY} width={B - 6} height="10" className="plan-strasse" />
          <line x1="8" y1={zufahrtY + 5} x2={B - 8} y2={zufahrtY + 5} className="plan-mittellinie" />

          {/* Parkplatz und Tor */}
          <rect x={B - parkplatzBreite - 10} y={zufahrtY + 12} width={parkplatzBreite} height="8" rx="1.5" className="plan-parkplatz" />
          {Array.from({ length: stellplaetze }, (_, i) => (
            <line key={i} x1={B - parkplatzBreite - 8 + i * 3 + 2} y1={zufahrtY + 12} x2={B - parkplatzBreite - 8 + i * 3 + 2} y2={zufahrtY + 17}
                  className="plan-stellplatz" />
          ))}
          <rect x={B / 2 - 8} y={T - 5.5} width="16" height="4" rx="1.5" className="plan-tor" />

          {/* Bäume */}
          {baeume(B, T, zufahrtY).map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" className="plan-baum" />)}
        </svg>
        <span className="plan-beschriftung" style={{ left: '50%', top: prozent(zufahrtY - 3, T) }}>Zufahrt · Tor</span>
        <span className="plan-beschriftung" style={{ left: prozent(B - parkplatzBreite / 2 - 10, B), top: prozent(zufahrtY - 3, T) }}>Parkplatz</span>
        {gebaeude.map((g, i) => {
          const farbe = stufe(g.offen, g.hoechste_prioritaet);
          return (
            <button key={g.id} type="button" onClick={(e) => onWaehle?.(g, e)}
                    className={`plan-gebaeude stufe-${farbe}${auswahlId === g.id ? ' gewaehlt' : ''}`}
                    style={{
                      left: prozent(g.lage_x_m, B), top: prozent(g.lage_y_m, T),
                      width: prozent(g.breite_m, B), height: prozent(g.tiefe_m, T), '--i': i,
                    }}
                    aria-label={`${g.bezeichnung}: ${offenText(g.offen)}`}
                    data-ort={`g-${g.id}`}>
              <span className="gebaeude-kuerzel">{g.kuerzel}</span>
              <span className="gebaeude-name">{g.bezeichnung.split('–').pop().trim()}</span>
              <span className="gebaeude-info">{g.maschinen} Maschinen</span>
              <span className={`zaehl-marke stufe-${farbe}`}>{g.offen > 0 ? g.offen : <i className="bi bi-check-lg" />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
