/**
 * lib/karten/werkGestaltung.js – Abwechslung zwischen den Werken (2D-Lageplan und 3D)
 *
 * Viele Werke haben denselben Grundaufbau (die Auslandswerke übernehmen ihn von
 * einem deutschen Vorbild). Damit sie trotzdem unterschiedlich aussehen, wird aus
 * dem Werks-Kürzel ein fester Pseudozufall berechnet – ohne Änderung an der Datenbank:
 *  - Gelände gespiegelt (Hallen, Straßen, Parkplatz auf der anderen Seite)
 *  - Dachform (flach, Satteldach, Sheddach) und Dachfarbe, Hallenhöhe
 *  - Deko: Bürogebäude, Tanks/Silos, Bäume (nur Darstellung, nicht anklickbar)
 * Gleiches Kürzel ergibt immer dasselbe Bild. Maße in Metern, Ursprung oben links
 * (x nach rechts, y nach unten) wie im Lageplan.
 */

/** Pseudozufall (mulberry32) mit Startwert aus einem Text – liefert Zahlen zwischen 0 und 1 */
export function zufall(text) {
  let h = 2166136261;
  for (const zeichen of text) h = Math.imul(h ^ zeichen.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let z = Math.imul(h ^ (h >>> 15), 1 | h);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

const DACHFORMEN = ['flach', 'sattel', 'shed'];

/** Überschneiden sich zwei Rechtecke { x, y, b, t }? */
const ueberlappt = (a, c) => a.x < c.x + c.b && c.x < a.x + a.b && a.y < c.y + c.t && c.y < a.y + a.t;
const vergroessert = (r, rand) => ({ x: r.x - rand, y: r.y - rand, b: r.b + 2 * rand, t: r.t + 2 * rand });

export function werkGestaltung(standort, gebaeude) {
  const z = zufall(standort.kuerzel);
  const B = standort.gelaende_breite_m;
  const T = standort.gelaende_tiefe_m;
  const spiegeln = z() < 0.5;
  const dach = DACHFORMEN[Math.floor(z() * DACHFORMEN.length)];
  const dachFarbe = Math.floor(z() * 4);                 // --raum-dach-0 … --raum-dach-3
  const hoeheBasis = 8 + Math.floor(z() * 4);            // 8–11 m
  const sx = (x, breite = 0) => (spiegeln ? B - x - breite : x);

  // Hallen: Lage (gespiegelt) und Höhe
  const hallen = Object.fromEntries(gebaeude.map((g) => [g.id, {
    x: sx(g.lage_x_m, g.breite_m), y: g.lage_y_m, b: g.breite_m, t: g.tiefe_m,
    hoehe: hoeheBasis + Math.floor(zufall(standort.kuerzel + g.kuerzel)() * 4),
  }]));

  // Straßen wie bisher im Lageplan: unter jeder Hallenreihe, eine Längsstraße zur Zufahrt unten
  const zufahrtY = T - 24;
  const reihenUnten = [...new Set(gebaeude.map((g) => g.lage_y_m + g.tiefe_m))].sort((a, c) => a - c);
  const strassenY = reihenUnten.map((unten) => unten + 4).filter((y) => y < zufahrtY - 8);
  const ersteY = strassenY[0] ?? zufahrtY;
  const strassen = [
    ...strassenY.map((y) => ({ x: 10, y, b: B - 20, t: 6 })),
    { x: sx(10, 6), y: ersteY, b: 6, t: Math.max(0, zufahrtY - ersteY + 4) },
    { x: 3, y: zufahrtY, b: B - 6, t: 10 },
  ];
  const parkBreite = Math.min(70, B * 0.3);
  const parkplatz = { x: sx(B - parkBreite - 10, parkBreite), y: zufahrtY + 12, b: parkBreite, t: 8 };
  const tor = { x: B / 2 - 8, y: T - 5.5, b: 16, t: 4 };

  // Belegte Flächen: Hallen (mit Abstand), Straßen, Parkplatz – dort keine Deko
  const belegt = [
    ...Object.values(hallen).map((h) => vergroessert(h, 4)),
    ...strassen.map((s) => vergroessert(s, 2)),
    vergroessert(parkplatz, 2),
  ];
  const frei = (r) => r.x >= 6 && r.y >= 6 && r.x + r.b <= B - 6 && r.y + r.t <= zufahrtY - 2 && !belegt.some((b) => ueberlappt(r, b));

  // Freie Stelle für ein Rechteck suchen (Raster 3 m, Reihenfolge aus dem Pseudozufall)
  function platzFuer(b, t) {
    const kandidaten = [];
    for (let y = 6; y + t <= zufahrtY - 2; y += 3) for (let x = 6; x + b <= B - 6; x += 3) kandidaten.push({ x, y, b, t });
    for (let i = kandidaten.length - 1; i > 0; i -= 1) { const j = Math.floor(z() * (i + 1)); [kandidaten[i], kandidaten[j]] = [kandidaten[j], kandidaten[i]]; }
    return kandidaten.find(frei) ?? null;
  }

  const deko = [];
  // Bürogebäude (2–4 Etagen)
  const buero = platzFuer(18 + Math.floor(z() * 10), 10 + Math.floor(z() * 5));
  if (buero) { deko.push({ art: 'buero', ...buero, etagen: 2 + Math.floor(z() * 3) }); belegt.push(vergroessert(buero, 3)); }
  // Tanks bzw. Silos in einer Reihe
  const anzahl = 2 + Math.floor(z() * 3);
  const silos = z() < 0.5;
  const durchmesser = silos ? 5 : 4;
  const tankfeld = platzFuer(anzahl * (durchmesser + 1.5), durchmesser + 2);
  if (tankfeld) {
    for (let i = 0; i < anzahl; i += 1) {
      deko.push({ art: silos ? 'silo' : 'tank', x: tankfeld.x + 1 + i * (durchmesser + 1.5) + durchmesser / 2, y: tankfeld.y + 1 + durchmesser / 2,
        r: durchmesser / 2, hoehe: silos ? 10 + Math.floor(z() * 4) : 5 + Math.floor(z() * 2) });
    }
    belegt.push(vergroessert(tankfeld, 2));
  }

  // Fahnen neben dem Tor, auf der Seite ohne Parkplatz
  const fahnenSeite = parkplatz.x + parkplatz.b / 2 > B / 2 ? -1 : 1;
  // Platz für das typische Objekt des Landes (Biergarten, Taco-Truck, Wasserturm …, siehe raum/Landesdeko.js):
  // möglichst groß (1,6-fach), sonst normal, sonst am Zaun vorn neben den Fahnen – es soll immer zu sehen sein
  let landPlatz = platzFuer(29, 19);
  let landGroesse = 1.6;
  if (!landPlatz) { landPlatz = platzFuer(18, 12); landGroesse = 1; }
  if (!landPlatz) {
    landPlatz = { x: Math.min(B - 26, Math.max(6, B / 2 + fahnenSeite * B * 0.3 - 10)), y: T - 14, b: 20, t: 10 };
    landGroesse = 0.8;
  }
  belegt.push(vergroessert(landPlatz, 2));
  const fahnen = [0, 1, 2].map((i) => ({ x: B / 2 + fahnenSeite * (13 + i * 3.5), y: T - 8.5 }));

  // Bäume: oben am Zaun und an der Seite ohne Längsstraße, mit Lücken und verschiedener Größe
  const baeume = [];
  const baum = (x, y) => { if (z() < 0.78 && frei({ x: x - 3, y: y - 3, b: 6, t: 6 })) baeume.push({ x, y, groesse: 0.8 + z() * 0.6 }); };
  for (let x = 12; x < B - 10; x += 11 + Math.floor(z() * 5)) baum(x, 9);
  for (let y = 22; y < zufahrtY - 8; y += 11 + Math.floor(z() * 5)) baum(sx(B - 9), y);

  return { B, T, spiegeln, dach, dachFarbe, hallen, strassen, zufahrtY, parkplatz, tor, deko, baeume, landPlatz, landGroesse, fahnen };
}
