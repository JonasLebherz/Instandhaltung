/**
 * app/auftraege/[id]/druck/Zeichnungen.js – technische Zeichnungen für den Arbeitsauftrag (Druck/PDF)
 *
 * Drei schwarz-weiße SVG-Zeichnungen in Metern (viewBox in m, Linien mit festem Strich über
 * vector-effect="non-scaling-stroke"), damit sie gedruckt gestochen scharf sind:
 *   LageWerk     – Werksgelände mit allen Hallen, die Halle des Auftrags schraffiert
 *   LageHalle    – Grundriss der Halle mit Bereichen und Maschinen, die Maschine schraffiert, Maßstab 10 m
 *   Stellflaeche – Draufsicht der Maschine mit Bemaßung (Breite × Tiefe) und Mittellinien
 * Bewusst feste Farben (Papier = schwarz auf weiß), wie die QR-Codes eine Ausnahme von den CSS-Variablen.
 */

/** Schraffur (45°-Linien) für die hervorgehobene Fläche – je Zeichnung eigene ID */
function Schraffur({ id, abstand }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={abstand} height={abstand} patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2={abstand} stroke="#111" strokeWidth={abstand * 0.18} />
    </pattern>
  );
}

/** Werksgelände: Umriss, Hallen mit Kürzel, gewählte Halle schraffiert */
export function LageWerk({ breite, tiefe, hallen, zielId }) {
  const rand = Math.max(breite, tiefe) * 0.04;
  const schrift = Math.max(breite, tiefe) * 0.05;
  return (
    <svg className="zeichnung" viewBox={`${-rand} ${-rand} ${breite + rand * 2} ${tiefe + rand * 2}`} role="img" aria-label="Lageplan">
      <defs><Schraffur id="schraffur-werk" abstand={schrift * 0.45} /></defs>
      <rect x={0} y={0} width={breite} height={tiefe} className="z-gelaende" vectorEffect="non-scaling-stroke" />
      {hallen.map((h) => (
        <g key={h.id}>
          <rect x={h.x} y={h.y} width={h.b} height={h.t} className={h.id === zielId ? 'z-ziel' : 'z-flaeche'}
                fill={h.id === zielId ? 'url(#schraffur-werk)' : undefined} vectorEffect="non-scaling-stroke" />
          <text x={h.x + h.b / 2} y={h.y + h.t / 2} className={`z-text${h.id === zielId ? ' z-text-ziel' : ''}`} style={{ fontSize: schrift }}
                textAnchor="middle" dominantBaseline="central">{h.kuerzel}</text>
        </g>
      ))}
    </svg>
  );
}

/** Grundriss der Halle: Bereiche gestrichelt mit Namen, Maschinen, gewählte Maschine schraffiert, Maßstab */
export function LageHalle({ breite, tiefe, bereiche, maschinen, zielId }) {
  const rand = Math.max(breite, tiefe) * 0.05;
  const schrift = Math.max(breite, tiefe) * 0.042;
  const unten = schrift * 3.2;   // Platz für den Maßstab
  return (
    <svg className="zeichnung" viewBox={`${-rand} ${-rand} ${breite + rand * 2} ${tiefe + rand * 2 + unten}`} role="img" aria-label="Grundriss">
      <defs><Schraffur id="schraffur-halle" abstand={schrift * 0.5} /></defs>
      <rect x={0} y={0} width={breite} height={tiefe} className="z-wand" vectorEffect="non-scaling-stroke" />
      {bereiche.map((b) => (
        <g key={`${b.name}-${b.x}-${b.y}`}>
          <rect x={b.x} y={b.y} width={b.b} height={b.t} className="z-bereich" vectorEffect="non-scaling-stroke" />
          <text x={b.x + schrift * 0.4} y={b.y + schrift * 1.1} className="z-text z-text-leise" style={{ fontSize: schrift * 0.85 }}>{b.name}</text>
        </g>
      ))}
      {maschinen.map((m) => (
        <g key={m.id}>
          <rect x={m.x} y={m.y} width={m.b} height={m.t} className={m.id === zielId ? 'z-ziel' : 'z-maschine'}
                fill={m.id === zielId ? 'url(#schraffur-halle)' : undefined} vectorEffect="non-scaling-stroke" />
          <text x={m.x + m.b / 2} y={m.y + m.t / 2} className={`z-text${m.id === zielId ? ' z-text-ziel' : ''}`}
                style={{ fontSize: schrift * (m.id === zielId ? 1 : 0.8) }} textAnchor="middle" dominantBaseline="central">
            {m.anlagennummer.split('-').pop()}
          </text>
        </g>
      ))}
      {/* Maßstab: 10 m in schwarz-weißen Abschnitten */}
      <g transform={`translate(0 ${tiefe + unten * 0.55})`}>
        {[0, 1].map((i) => <rect key={i} x={i * 5} y={0} width={5} height={schrift * 0.45} className={i ? 'z-massstab-hell' : 'z-massstab'} vectorEffect="non-scaling-stroke" />)}
        <text x={10 + schrift * 0.4} y={schrift * 0.42} className="z-text" style={{ fontSize: schrift * 0.85 }}>10 m</text>
      </g>
    </svg>
  );
}

/** Draufsicht der Maschine mit Bemaßung wie auf einer technischen Zeichnung */
export function Stellflaeche({ breite, tiefe, beschriftung }) {
  // Auf ein festes Feld skalieren: lange Seite = 100 Einheiten
  const f = 100 / Math.max(breite, tiefe);
  const b = breite * f, t = tiefe * f;
  const a = 14;   // Abstand der Maßlinien
  const zahl = (wert) => `${wert.toLocaleString('de-DE', { maximumFractionDigits: 1 })} m`;
  return (
    <svg className="zeichnung" viewBox={`-8 -8 ${b + a + 34} ${t + a + 24}`} role="img" aria-label={`${zahl(breite)} × ${zahl(tiefe)}`}>
      <defs>
        <marker id="pfeil" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#111" />
        </marker>
      </defs>
      <rect x={0} y={0} width={b} height={t} className="z-ziel-umriss" vectorEffect="non-scaling-stroke" />
      {/* Mittellinien (Strich-Punkt) */}
      <line x1={b / 2} y1={-5} x2={b / 2} y2={t + 5} className="z-mitte" vectorEffect="non-scaling-stroke" />
      <line x1={-5} y1={t / 2} x2={b + 5} y2={t / 2} className="z-mitte" vectorEffect="non-scaling-stroke" />
      <text x={b / 2 + 2} y={t / 2 - 3} className="z-text z-text-leise" style={{ fontSize: 6 }}>{beschriftung}</text>
      {/* Bemaßung Breite (unten) */}
      <line x1={0} y1={t + 2} x2={0} y2={t + a + 3} className="z-hilfslinie" vectorEffect="non-scaling-stroke" />
      <line x1={b} y1={t + 2} x2={b} y2={t + a + 3} className="z-hilfslinie" vectorEffect="non-scaling-stroke" />
      <line x1={0} y1={t + a} x2={b} y2={t + a} className="z-masslinie" markerStart="url(#pfeil)" markerEnd="url(#pfeil)" vectorEffect="non-scaling-stroke" />
      <text x={b / 2} y={t + a - 2.5} className="z-text" style={{ fontSize: 7 }} textAnchor="middle">{zahl(breite)}</text>
      {/* Bemaßung Tiefe (rechts) */}
      <line x1={b + 2} y1={0} x2={b + a + 3} y2={0} className="z-hilfslinie" vectorEffect="non-scaling-stroke" />
      <line x1={b + 2} y1={t} x2={b + a + 3} y2={t} className="z-hilfslinie" vectorEffect="non-scaling-stroke" />
      <line x1={b + a} y1={0} x2={b + a} y2={t} className="z-masslinie" markerStart="url(#pfeil)" markerEnd="url(#pfeil)" vectorEffect="non-scaling-stroke" />
      <text x={b + a + 2.5} y={t / 2} className="z-text" style={{ fontSize: 7 }} dominantBaseline="central">{zahl(tiefe)}</text>
    </svg>
  );
}
