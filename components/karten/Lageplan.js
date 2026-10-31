'use client';
/**
 * components/karten/Lageplan.js – Lageplan eines Werksgeländes mit seinen Gebäuden
 *
 * Gelände, Zufahrt und Parkplatz werden als SVG gezeichnet, die Gebäude liegen
 * als anklickbare Flächen darüber (Position und Größe aus der Datenbank, in Metern).
 * Ein Klick ruft onWaehle(gebaeude) auf – die Zoom-Karte zoomt in das Gebäude.
 * Aufbau und Deko kommen aus lib/karten/werkGestaltung.js – so sieht jedes Werk etwas
 * anders aus (Straßenführung, Anbauten, gespiegelt, Bürogebäude, Tanks, Dachfarbe), genau wie in der 3D-Ansicht.
 * neutral: beim Melden – ohne Zahlen und Farben offener Störungen.
 */
import { stufe, offenText } from './stufe';
import { useT } from '@/components/SpracheKontext';
import { werkGestaltung } from '@/lib/karten/werkGestaltung';

export default function Lageplan({ standort, gebaeude, auswahlId = null, onWaehle, neutral = false }) {
  const t = useT();
  // Aufbau mit Abwechslung je Werk (gespiegelt, Deko) – gleich wie in der 3D-Ansicht
  const g3 = werkGestaltung(standort, gebaeude);
  const { B, T, zufahrtY, parkplatz } = g3;
  const prozent = (wert, gesamt) => `${(wert / gesamt) * 100}%`;
  const stellplaetze = Math.floor((parkplatz.b - 4) / 3);

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

          {/* Werksstraßen und Zufahrt */}
          {g3.strassen.map((st, i) => (st.pfad
            ? <polyline key={i} points={st.pfad.map((p) => p.join(',')).join(' ')} strokeWidth={st.breite} className="plan-strasse-linie" />
            : <rect key={i} x={st.x} y={st.y} width={st.b} height={st.t} rx={i < g3.strassen.length - 1 ? 3 : 0} className="plan-strasse" />))}
          <line x1="8" y1={zufahrtY + 5} x2={B - 8} y2={zufahrtY + 5} className="plan-mittellinie" />

          {/* Parkplatz und Tor */}
          <rect x={parkplatz.x} y={parkplatz.y} width={parkplatz.b} height={parkplatz.t} rx="1.5" className="plan-parkplatz" />
          {Array.from({ length: stellplaetze }, (_, i) => (
            <line key={i} x1={parkplatz.x + 2 + i * 3 + 2} y1={parkplatz.y} x2={parkplatz.x + 2 + i * 3 + 2} y2={parkplatz.y + 5} className="plan-stellplatz" />
          ))}
          <rect x={g3.tor.x} y={g3.tor.y} width={g3.tor.b} height={g3.tor.t} rx="1.5" className="plan-tor" />

          {/* Deko: Bürogebäude, Tanks/Silos, Bäume (nur Darstellung) */}
          {g3.deko.map((d, i) => (d.art === 'buero'
            ? <rect key={i} x={d.x} y={d.y} width={d.b} height={d.t} rx="1" className="plan-buero" />
            : <circle key={i} cx={d.x} cy={d.y} r={d.r} className="plan-tank" />))}
          {g3.strassen.filter((st) => st.pfad).map((st, i) => (
            <g key={`kv${i}`}>
              <circle cx={st.pfad[0][0]} cy={st.pfad[0][1]} r="8" className="plan-strasse" />
              <circle cx={st.pfad[0][0]} cy={st.pfad[0][1]} r="3.6" className="plan-baum" />
            </g>
          ))}
          {/* Anbauten der Hallen (Flachbau, Kopfbau, höherer Hallenteil) */}
          {Object.values(g3.hallen).flatMap((h) => h.anbauten).filter((a) => a.art !== 'hochteil').map((a, i) => (
            <rect key={`a${i}`} x={a.x} y={a.y} width={a.b} height={a.t} rx=".6" className="plan-anbau" />
          ))}
          {g3.baeume.map((bm) => <circle key={`${bm.x}-${bm.y}`} cx={bm.x} cy={bm.y} r={3 * bm.groesse} className="plan-baum" />)}
        </svg>
        <span className="plan-beschriftung" style={{ left: '50%', top: prozent(zufahrtY - 3, T) }}>{t('Zufahrt · Tor')}</span>
        <span className="plan-beschriftung" style={{ left: prozent(parkplatz.x + parkplatz.b / 2, B), top: prozent(zufahrtY - 3, T) }}>{t('Parkplatz')}</span>
        {g3.deko.filter((d) => d.art === 'buero').map((d) => (
          <span key="buero" className="plan-beschriftung" style={{ left: prozent(d.x + d.b / 2, B), top: prozent(d.y + d.t / 2, T) }}>{t('Verwaltung')}</span>
        ))}
        {gebaeude.map((g, i) => {
          const farbe = neutral ? 'neutral' : stufe(g.offen, g.hoechste_prioritaet);
          return (
            <button key={g.id} type="button" onClick={(e) => onWaehle?.(g, e)}
                    className={`plan-gebaeude stufe-${farbe}${auswahlId === g.id ? ' gewaehlt' : ''}`}
                    style={{
                      // Dachfarbe des Werks als schmaler Streifen oben (siehe .plan-gebaeude)
                      '--dach': `var(--raum-dach-${g3.dachFarbe})`,
                      left: prozent(g3.hallen[g.id].x, B), top: prozent(g3.hallen[g.id].y, T),
                      width: prozent(g.breite_m, B), height: prozent(g.tiefe_m, T), '--i': i,
                    }}
                    aria-label={neutral ? g.bezeichnung : `${g.bezeichnung}: ${offenText(g.offen, t)}`}
                    data-ort={`g-${g.id}`}>
              <span className="gebaeude-kuerzel">{g.kuerzel}</span>
              <span className="gebaeude-name">{g.bezeichnung.split('–').pop().trim()}</span>
              <span className="gebaeude-info">{t('{n} Maschinen', { n: g.maschinen })}</span>
              {!neutral && <span className={`zaehl-marke stufe-${farbe}`}>{g.offen > 0 ? g.offen : <i className="bi bi-check-lg" />}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
