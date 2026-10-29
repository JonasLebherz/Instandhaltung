/**
 * scripts/weltkarte-erzeugen.cjs – erzeugt lib/karten/welt.js
 *
 * Weltkarte (Equal Earth) und Länderansichten (Mercator) als vorab berechnete,
 * ganzzahlige SVG-Pfade aus den gemeinfreien Natural-Earth-Daten (npm "world-atlas").
 * Nur nötig, wenn ein neues Land eine eigene Karte bekommen soll (ISO + ANSICHTEN unten).
 *
 * Ausführen (die beiden Pakete werden nur dafür gebraucht, nicht von der App):
 *   npm install --no-save world-atlas@2.0.2 topojson-client@3.1.0
 *   node scripts/weltkarte-erzeugen.cjs lib/karten/welt.js
 */
const fs = require('fs');
const topo = require('topojson-client');
const lade = (n) => { const t = JSON.parse(fs.readFileSync(`node_modules/world-atlas/countries-${n}.json`)); return topo.feature(t, t.objects.countries).features; };
const w110 = lade('110m'), w50 = lade('50m');

const ISO = { DE: '276', US: '840', MX: '484', CN: '156', IN: '356', FR: '250', RU: '643', PL: '616' };
const ANSICHTEN = {   // [lonMin, lonMax, latMin, latMax]
  US: [-127, -65, 23, 50], MX: [-119, -85, 13.5, 33.5], CN: [72, 136, 16, 54.5], IN: [67, 98, 6, 36.5],
  FR: [-5.8, 10.2, 41, 51.6], RU: [26, 180, 40, 78], PL: [13.6, 24.6, 48.7, 55.2],
};

// Ringe, die über die Datumsgrenze springen (z. B. Ostspitze Russlands), auf eine Seite legen –
// sonst entstehen lange waagrechte Linien quer über die Karte
const ringe = (geo) => (geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : []).flat()
  .map((r) => {
    const springt = r.some((p, i) => i > 0 && Math.abs(p[0] - r[i - 1][0]) > 180);
    return springt ? r.map(([lo, la]) => [lo < 0 ? lo + 360 : lo, la]) : r;
  });

function pfad(ringListe) {
  let s = '';
  for (const r of ringListe) {
    const pts = [];
    for (const [x, y] of r) { const p = [Math.round(x), Math.round(y)]; const l = pts[pts.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) pts.push(p); }
    if (pts.length < 3) continue;
    let [px, py] = pts[0]; s += `M${px} ${py}`;
    let teil = '';
    for (const [x, y] of pts.slice(1)) { const dx = x - px, dy = y - py; teil += `${dx < 0 ? '' : ' '}${dx}${dy < 0 ? '' : ' '}${dy}`; px = x; py = y; }
    s += 'l' + teil.replace(/^ /, '') + 'z';
  }
  return s;
}

// Sutherland-Hodgman: Ring auf Rechteck zuschneiden
function zuschneiden(ring, x0, y0, x1, y1) {
  const kanten = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]];
  let aus = ring;
  for (const [innen, schnitt] of kanten) {
    const ein = aus; aus = [];
    for (let i = 0; i < ein.length; i++) {
      const a = ein[(i + ein.length - 1) % ein.length], b = ein[i];
      if (innen(b)) { if (!innen(a)) aus.push(schnitt(a, b)); aus.push(b); } else if (innen(a)) aus.push(schnitt(a, b));
    }
    if (!aus.length) break;
  }
  return aus;
}

/* ---------- Weltkarte: Equal Earth ---------- */
const [A1, A2, A3, A4, M] = [1.340264, -0.081106, 0.000893, 0.003796, Math.sqrt(3) / 2];
function equalEarth(lat, lon) {
  const l = lon * Math.PI / 180, th = Math.asin(M * Math.sin(lat * Math.PI / 180)), t2 = th * th, t6 = t2 * t2 * t2;
  return [l * Math.cos(th) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))), th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))];
}
const ohneAntarktis = w110.filter((f) => f.id !== '010');
// Ausschnitt: von Nordamerika bis Japan, vom Polarkreis bis Südafrika – dort liegen alle Werke
const minX = equalEarth(0, -128)[0], maxX = equalEarth(0, 160)[0], maxY = equalEarth(80, 0)[1], minY = equalEarth(-36, 0)[1];
const WB = 1000, WS = WB / (maxX - minX), WH = Math.round((maxY - minY) * WS);
const welt = { breite: WB, hoehe: WH, skala: WS, versatzX: -minX * WS, versatzY: maxY * WS };
const weltPunkt = ([lo, la]) => { const [x, y] = equalEarth(la, lo); return [welt.versatzX + welt.skala * x, welt.versatzY - welt.skala * y]; };
const weltPfade = { rest: '' };
const weltMitten = {};
// Schwerpunkt der größten Fläche eines Landes (dort sitzt die Markierung auf der Weltkarte)
function schwerpunkt(rs) {
  let best = null;
  for (const r of rs) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; const k = x0 * y1 - x1 * y0; a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k; }
    if (!best || Math.abs(a) > Math.abs(best.a)) best = { a, x: cx / (3 * a), y: cy / (3 * a) };
  }
  return { x: Math.round(best.x), y: Math.round(best.y) };
}
for (const f of ohneAntarktis) {
  const code = Object.keys(ISO).find((k) => ISO[k] === f.id);
  // kleine Inseln weglassen (weniger Daten)
  const rs = ringe(f.geometry).map((r) => zuschneiden(r.map(weltPunkt), -5, -5, WB + 5, WH + 5)).filter((r) => r.length > 2).filter((r) => { const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]); return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) > 4; });
  if (code) { weltPfade[code] = pfad(rs); weltMitten[code] = schwerpunkt(rs); } else weltPfade.rest += pfad(rs);
}

/* ---------- Länder: Mercator, auf den Ausschnitt eingepasst ---------- */
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
const laender = {};
for (const [code, [lo0, lo1, la0, la1]] of Object.entries(ANSICHTEN)) {
  const breite = 800;
  const x0 = lo0 * Math.PI / 180, x1 = lo1 * Math.PI / 180, y0 = merc(la0), y1 = merc(la1);
  const skala = breite / (x1 - x0), hoehe = Math.round((y1 - y0) * skala);
  const v = { breite, hoehe, skala, versatzX: -x0 * skala, versatzY: y1 * skala };
  const punkt = ([lo, la]) => [v.versatzX + v.skala * lo * Math.PI / 180, v.versatzY - v.skala * merc(Math.max(-85, Math.min(85, la)))];
  const R = 30;
  let land = '', nachbarn = '';
  const gross = (r) => { const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]); return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) > 6; };
  // Das Land selbst fein (1:50 Mio.), die Nachbarn gröber (1:110 Mio.) – spart Daten
  for (const f of [...w50.filter((x) => x.id === ISO[code]), ...w110.filter((x) => x.id !== ISO[code])]) {
    if (f.id === '010') continue;
    const rs = ringe(f.geometry).map((r) => zuschneiden(r.map(punkt), -R, -R, breite + R, hoehe + R)).filter((r) => r.length > 2 && gross(r));
    if (!rs.length) continue;
    if (f.id === ISO[code]) land += pfad(rs); else nachbarn += pfad(rs);
  }
  laender[code] = { ...v, land, nachbarn };
}

const r = (n) => Math.round(n * 1000) / 1000;
let js = `/**
 * lib/karten/welt.js – Weltkarte und Länderkarten für die Störungskarte
 *
 * ERZEUGT aus den gemeinfreien Kartendaten von Natural Earth (npm-Paket
 * "world-atlas", Länder 1:110 Mio. für die Welt, 1:50 Mio. für die Länder).
 * Nicht von Hand bearbeiten – die Pfade sind fertig berechnete SVG-Daten,
 * zur Laufzeit wird keine Kartenbibliothek geladen.
 *
 *  - Welt: Projektion "Equal Earth" (flächentreu, wirkt natürlich), Ausschnitt von
 *    Nordamerika bis Japan (80° N bis 36° S)
 *  - Länder: Mercator, eingepasst auf einen festen Ausschnitt je Land
 *  - Deutschland hat eine eigene, feinere Karte (lib/karten/deutschland.js)
 *
 * weltPunkt(breite, laenge) bzw. landPunkt(ansicht, breite, laenge) rechnen
 * eine GPS-Position mit derselben Formel in einen Punkt auf der Karte um.
 */

const [A1, A2, A3, A4, M] = [1.340264, -0.081106, 0.000893, 0.003796, Math.sqrt(3) / 2];

export const WELT = { breite: ${welt.breite}, hoehe: ${welt.hoehe}, skala: ${r(welt.skala)}, versatzX: ${r(welt.versatzX)}, versatzY: ${r(welt.versatzY)} };

/** GPS-Position → Punkt auf der Weltkarte (Equal Earth) */
export function weltPunkt(breitengrad, laengengrad) {
  const lambda = (laengengrad * Math.PI) / 180;
  const theta = Math.asin(M * Math.sin((breitengrad * Math.PI) / 180));
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  const x = (lambda * Math.cos(theta)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return { x: WELT.versatzX + WELT.skala * x, y: WELT.versatzY - WELT.skala * y };
}

/** GPS-Position → Punkt auf einer Länderkarte (Mercator) */
export function landPunkt(ansicht, breitengrad, laengengrad) {
  const phi = (Math.max(-85, Math.min(85, breitengrad)) * Math.PI) / 180;
  return {
    x: ansicht.versatzX + ansicht.skala * ((laengengrad * Math.PI) / 180),
    y: ansicht.versatzY - ansicht.skala * Math.log(Math.tan(Math.PI / 4 + phi / 2)),
  };
}

/** Umrisse der Weltkarte: Länder des Unternehmens einzeln (nach ISO-Kürzel), alle übrigen in "rest" */
export const WELT_PFADE = ${JSON.stringify(weltPfade, null, 1).replace(/\n\s*/g, '\n  ').replace(/\n  }$/, '\n}')};

/** Mitte (Schwerpunkt der größten Fläche) der Länder des Unternehmens auf der Weltkarte */
export const WELT_MITTEN = ${JSON.stringify(weltMitten)};

/** Länderkarten: Ausschnitt, Projektion, Umriss des Landes und der Nachbarn */
export const LAENDER_KARTEN = {
`;
for (const [code, v] of Object.entries(laender)) js += `  ${code}: { breite: ${v.breite}, hoehe: ${v.hoehe}, skala: ${r(v.skala)}, versatzX: ${r(v.versatzX)}, versatzY: ${r(v.versatzY)},\n    land: ${JSON.stringify(v.land)},\n    nachbarn: ${JSON.stringify(v.nachbarn)} },\n`;
js += '};\n';
fs.writeFileSync(process.argv[2], js);
console.log('Welt', welt.breite, welt.hoehe, 'Größe', (js.length / 1024).toFixed(0), 'KB');
for (const [c, v] of Object.entries(laender)) console.log(c, v.breite, v.hoehe, ((v.land.length + v.nachbarn.length) / 1024).toFixed(1), 'KB');
console.log('welt', Object.fromEntries(Object.entries(weltPfade).map(([k, v]) => [k, (v.length / 1024).toFixed(1)])));
