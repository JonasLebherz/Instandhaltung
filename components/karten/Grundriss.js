'use client';
/**
 * components/karten/Grundriss.js – Grundriss eines Gebäudes mit allen Maschinen
 *
 * Wände, Bereiche (z. B. "Zerspanung", "Material") und Tore werden als SVG
 * gezeichnet. Die Maschinen liegen als Schaltflächen darüber – Position und
 * Stellfläche stammen aus der Datenbank (Meter, gemessen von der linken oberen Ecke).
 * Maschinen mit offenen Störungen zeigen eine Zahl und sind farbig markiert.
 *
 * Klick auf eine Maschine ruft onWaehle(maschine) auf.
 */
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import { stufe, offenText } from './stufe';

/**
 * Einrichtung der Nebenbereiche (nur gezeichnet): Regale im Material- bzw.
 * Kommissionierbereich, kleine Räume im Büro- und Sozialbereich.
 */
function Einrichtung({ bereich }) {
  const { x, y, b, t, name } = bereich;
  if (name === 'Büro & Sozial') {
    const raeume = 3;
    const breite = b / raeume;
    return (
      <g className="plan-einrichtung">
        {Array.from({ length: raeume - 1 }, (_, i) => (
          <line key={i} x1={x + breite * (i + 1)} y1={y + t * .35} x2={x + breite * (i + 1)} y2={y + t} className="plan-innenwand" />
        ))}
        <line x1={x} y1={y + t * .35} x2={x + b} y2={y + t * .35} className="plan-innenwand" strokeDasharray={`${breite - 1.6} 1.6`} />
        {Array.from({ length: raeume }, (_, i) => (
          <rect key={i} x={x + breite * i + breite / 2 - 1.6} y={y + t * .62} width="3.2" height="1.6" rx=".3" className="plan-moebel" />
        ))}
      </g>
    );
  }
  // Material / Kommissionierung: Regalreihen
  const reihen = Math.max(2, Math.floor((b - 4) / 4));
  return (
    <g className="plan-einrichtung">
      {Array.from({ length: reihen }, (_, i) => (
        <rect key={i} x={x + 2.5 + i * 4} y={y + 5} width="1.4" height={Math.max(4, t - 9)} rx=".2" className="plan-regal" />
      ))}
    </g>
  );
}

export default function Grundriss({ gebaeude, maschinen, auswahlId = null, onWaehle }) {
  const B = gebaeude.breite_m;
  const T = gebaeude.tiefe_m;
  const bereiche = gebaeude.bereiche ?? [];
  const haupt = bereiche[0] ?? { x: 0, y: 0, b: B, t: T };
  const prozent = (wert, gesamt) => `${(wert / gesamt) * 100}%`;
  const torX = haupt.x + haupt.b / 2;        // Rolltor unten in der Mitte des Hauptbereichs

  return (
    <div className="grundriss-rahmen">
      <div className="grundriss" style={{ aspectRatio: `${B} / ${T}` }}>
        <svg className="grundriss-svg" viewBox={`0 0 ${B} ${T}`} overflow="visible" aria-hidden="true">
          <defs>
            <pattern id="grundriss-raster" width="2" height="2" patternUnits="userSpaceOnUse">
              <circle cx=".5" cy=".5" r=".12" className="plan-rasterpunkt" />
            </pattern>
          </defs>
          <rect x="0" y="0" width={B} height={T} className="plan-boden" />
          <rect x="0" y="0" width={B} height={T} fill="url(#grundriss-raster)" />

          {/* Bereiche: gestrichelte Trennlinien und Beschriftung */}
          {bereiche.map((b) => (
            <g key={b.name}>
              <rect x={b.x} y={b.y} width={b.b} height={b.t} className="plan-bereich" />
              {b !== haupt && <Einrichtung bereich={b} />}
              <text x={b.x + 1.4} y={b.y + 2.6} className="plan-bereich-name">{b.name.toUpperCase()}</text>
            </g>
          ))}

          {/* Außenwände */}
          <rect x="0" y="0" width={B} height={T} rx=".6" className="plan-wand" />
          {/* Rolltor unten und Tür links: Wand dort "öffnen" */}
          <line x1={torX - 2.5} y1={T} x2={torX + 2.5} y2={T} className="plan-oeffnung" />
          <line x1={torX - 2.5} y1={T + .01} x2={torX + 2.5} y2={T + .01} className="plan-tor-linie" />
          <line x1="0" y1={T / 2 - .6} x2="0" y2={T / 2 + .6} className="plan-oeffnung" />
          <path d={`M 0 ${T / 2 - .6} A 1.2 1.2 0 0 1 1.2 ${T / 2 + .6}`} className="plan-tuer" />
        </svg>

        {maschinen.map((m, i) => {
          const farbe = stufe(m.offen, m.hoechste_prioritaet);
          const modell = m.bezeichnung.split(' ').pop();
          return (
            <button key={m.id} type="button"
                    className={`plan-maschine stufe-${farbe}${auswahlId === m.id ? ' gewaehlt' : ''}${m.breite_m < m.tiefe_m ? ' hochkant' : ''}`}
                    style={{
                      left: prozent(m.pos_x_m, B), top: prozent(m.pos_y_m, T),
                      width: prozent(m.breite_m, B), height: prozent(m.tiefe_m, T), '--i': i,
                    }}
                    onClick={() => onWaehle?.(m)}
                    aria-pressed={auswahlId === m.id}
                    aria-label={`${m.bezeichnung} (${m.anlagennummer}): ${offenText(m.offen)}`}
                    title={`${m.bezeichnung} · ${m.anlagennummer}`}>
              <i className={`bi ${MASCHINEN_SYMBOLE[m.typ] ?? 'bi-gear'}`} aria-hidden="true" />
              <span className="maschine-modell">{modell}</span>
              {m.offen > 0 && <span className={`zaehl-marke stufe-${farbe}`}>{m.offen}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
