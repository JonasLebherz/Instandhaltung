/**
 * lib/karten/werkGestaltung.js – Abwechslung zwischen den Werken (2D-Lageplan und 3D)
 *
 * Viele Werke haben denselben Grundaufbau (die Auslandswerke übernehmen ihn von
 * einem deutschen Vorbild). Damit sie trotzdem unterschiedlich aussehen, wird aus
 * dem Werks-Kürzel ein fester Pseudozufall berechnet – ohne Änderung an der Datenbank:
 *  - Gelände gespiegelt (Hallen, Straßen, Parkplatz auf der anderen Seite)
 *  - Straßenführung (LAYOUTS), Hallen evtl. gestaffelt
 *  - Dachform (flach, Satteldach, Sheddach) und Dachfarbe, Hallenhöhe (Lager/Logistik hoch)
 *  - Anbauten je Halle: Flachbau, Kopfbau mit Büros, höherer Hallenteil
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

/**
 * Straßenführung je Werk:
 *  - klassisch: Straße vor jeder Hallenreihe, am Rand eine Verbindung zur Zufahrt
 *  - getrennt:  zusätzlich eine Straße hinter den Hallen und Querstraßen zwischen den Hallen (Raster)
 *  - versetzt:  Hallen stehen gestaffelt (vor/zurück), nur bei einer Hallenreihe
 *  - kurve:     geschwungene Straße quer über das Gelände zur Zufahrt, nur bei einer Hallenreihe
 */
const LAYOUTS = ['klassisch', 'getrennt', 'versetzt', 'kurve'];

/** Punkte einer geschwungenen Straße (S-Kurve als kubische Bézierkurve) */
function sKurve(a, e, schritte = 10) {
  const mitteY = (a[1] + e[1]) / 2;
  const p = [a, [a[0], mitteY], [e[0], mitteY], e];
  return Array.from({ length: schritte + 1 }, (_, i) => {
    const u = i / schritte;
    const w = [(1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3];
    return [0, 1].map((k) => w.reduce((summe, wi, j) => summe + wi * p[j][k], 0));
  });
}

export function werkGestaltung(standort, gebaeude) {
  const z = zufall(standort.kuerzel);
  const zl = zufall(`${standort.kuerzel}-lage`);       // eigener Pseudozufall für die Straßenführung
  const B = standort.gelaende_breite_m;
  const T = standort.gelaende_tiefe_m;
  const spiegeln = z() < 0.5;
  const dach = DACHFORMEN[Math.floor(z() * DACHFORMEN.length)];
  const dachFarbe = Math.floor(z() * 4);                 // --raum-dach-0 … --raum-dach-3
  const hoeheBasis = 7 + Math.floor(z() * 4);            // 7–10 m (je Halle + 0–4 m)
  const sx = (x, breite = 0) => (spiegeln ? B - x - breite : x);
  const zufahrtY = T - 24;

  // Hallenreihen (gleiche y-Lage in der Datenbank) und Straßenführung
  const reihenYs = [...new Set(gebaeude.map((g) => g.lage_y_m))].sort((a, c) => a - c);
  let layout = LAYOUTS[Math.floor(zl() * LAYOUTS.length)];
  if (reihenYs.length > 1 && (layout === 'versetzt' || layout === 'kurve')) layout = 'getrennt';

  // Hallen: Lage (gespiegelt, evtl. gestaffelt), Höhe (Lager/Logistik als hohes Hochregallager), Dachform
  const hallen = {};
  gebaeude.forEach((g, i) => {
    const rz = zufall(standort.kuerzel + g.kuerzel);
    const hochregal = /lager|logistik|versand/i.test(g.bezeichnung ?? '');
    let y = g.lage_y_m;
    if (layout === 'versetzt') {
      const nachVorn = zufahrtY - 16 - (g.lage_y_m + g.tiefe_m);
      y += i % 2 ? Math.min(nachVorn, 6 + Math.floor(rz() * 6)) : -Math.min(g.lage_y_m - 12, 4 + Math.floor(rz() * 6));
    }
    hallen[g.id] = {
      x: sx(g.lage_x_m, g.breite_m), y, b: g.breite_m, t: g.tiefe_m,
      hoehe: hochregal ? 14 + Math.floor(rz() * 5) : hoeheBasis + Math.floor(rz() * 5),
      dach: hochregal ? 'flach' : dach,
      anbauten: [],
    };
  });
  const reihen = reihenYs.map((ry) => gebaeude.filter((g) => g.lage_y_m === ry).map((g) => hallen[g.id]).sort((a, c) => a.x - c.x));

  // Straßen: vor jeder Hallenreihe eine Längsstraße, eine Verbindung zur Zufahrt, unten die Zufahrt
  const reihenStrassen = reihen.map((r) => Math.max(...r.map((h) => h.y + h.t)) + 4).filter((y) => y < zufahrtY - 8);
  const ersteY = reihenStrassen[0] ?? zufahrtY;
  const strassen = reihenStrassen.map((y) => ({ x: 10, y, b: B - 20, t: 6 }));
  if (layout === 'kurve') {
    // geschwungen von der Reihenstraße (Mitte des Geländes) hinunter zur Zufahrt am Rand
    strassen.push({ pfad: sKurve([sx(B * 0.42), ersteY + 3], [sx(16), zufahrtY + 2]), breite: 6 });
  } else {
    strassen.push({ x: sx(10, 6), y: ersteY, b: 6, t: Math.max(0, zufahrtY - ersteY + 4) });
  }
  if (layout === 'getrennt' && reihen[0]) {
    // Straße hinter der ersten Reihe und Querstraßen zwischen den Hallen – die Hallen stehen wie auf Inseln
    const oben = Math.min(...reihen[0].map((h) => h.y)) - 11;
    strassen.push({ x: 10, y: oben, b: B - 20, t: 6 });
    [10, B - 16].forEach((x) => strassen.push({ x, y: oben, b: 6, t: reihenStrassen[0] - oben }));
    reihen[0].slice(1).forEach((h, i) => {
      const links = reihen[0][i];
      const luecke = h.x - (links.x + links.b);
      if (luecke >= 12) strassen.push({ x: links.x + links.b + luecke / 2 - 3, y: oben, b: 6, t: reihenStrassen[0] - oben });
    });
  }
  strassen.push({ x: 3, y: zufahrtY, b: B - 6, t: 10 });
  const parkBreite = Math.min(70, B * 0.3);
  const parkplatz = { x: sx(B - parkBreite - 10, parkBreite), y: zufahrtY + 12, b: parkBreite, t: 8 };
  const tor = { x: B / 2 - 8, y: T - 5.5, b: 16, t: 4 };

  // Straßenflächen als Rechtecke (geschwungene Straßen: kleine Rechtecke entlang des Verlaufs)
  const strassenFlaechen = strassen.flatMap((s) => (s.pfad
    ? s.pfad.map(([x, y]) => ({ x: x - s.breite / 2, y: y - s.breite / 2, b: s.breite, t: s.breite }))
    : [s]));

  // Anbauten (nicht anklickbar, gehören zur Halle): Flachbau hinten, Kopfbau mit Büros an der Stirnseite,
  // höherer Hallenteil. So ist nicht jede Halle ein einfacher Quader.
  const hallenListe = Object.values(hallen);
  const passt = (r, eigene) => r.x >= 6 && r.y >= 7 && r.x + r.b <= B - 6
    && !hallenListe.some((h) => h !== eigene && ueberlappt(r, vergroessert(h, 5)))
    && !strassenFlaechen.some((s) => ueberlappt(r, vergroessert(s, 1)))
    && !hallenListe.some((h) => h.anbauten.some((a) => ueberlappt(r, vergroessert(a, 3))));
  gebaeude.forEach((g) => {
    const h = hallen[g.id];
    const r = zufall(`${standort.kuerzel}${g.kuerzel}-anbau`);
    if (r() < 0.6) {
      const b = Math.round(h.b * (0.35 + r() * 0.4));
      const t = 6 + Math.floor(r() * 4);
      const a = { art: 'flachbau', x: r() < 0.5 ? h.x : h.x + h.b - b, y: h.y - t, b, t, hoehe: 4 + Math.floor(r() * 2) };
      if (passt(a, h)) h.anbauten.push(a);
    }
    if (r() < 0.55) {
      const b = 8 + Math.floor(r() * 3);
      const t = Math.round(h.t * (0.45 + r() * 0.4));
      const links = r() < 0.5;
      const a = { art: 'kopfbau', x: links ? h.x - b : h.x + h.b, y: h.y + h.t - t, b, t, hoehe: 3 * 3.6 + 0.6, etagen: 3, seite: links ? -1 : 1 };
      if (passt(a, h)) h.anbauten.push(a);
    }
    if (h.dach !== 'flach' || r() < 0.4) {
      if (r() < 0.45) {
        const b = Math.round(h.b * (0.2 + r() * 0.15));
        h.anbauten.push({ art: 'hochteil', x: r() < 0.5 ? h.x : h.x + h.b - b, y: h.y, b, t: h.t, hoehe: h.hoehe + 5 + Math.floor(r() * 4) });
      }
    }
  });

  // Belegte Flächen: Hallen (mit Abstand), Straßen, Parkplatz – dort keine Deko
  const belegt = [
    ...hallenListe.map((h) => vergroessert(h, 4)),
    ...hallenListe.flatMap((h) => h.anbauten.map((a) => vergroessert(a, 3))),
    ...strassenFlaechen.map((s) => vergroessert(s, 2)),
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

  // Fahnen neben dem Tor, auf der Seite ohne Parkplatz (das typische Objekt des Landes steht gegenüber vor dem Werk,
  // siehe raum/Landesdeko.js → Umgebung)
  const fahnenSeite = parkplatz.x + parkplatz.b / 2 > B / 2 ? -1 : 1;
  const fahnen = [0, 1, 2].map((i) => ({ x: B / 2 + fahnenSeite * (13 + i * 3.5), y: T - 8.5 }));

  // Bäume: oben am Zaun und an der Seite ohne Längsstraße, mit Lücken und verschiedener Größe
  const baeume = [];
  const baum = (x, y) => { if (z() < 0.78 && frei({ x: x - 3, y: y - 3, b: 6, t: 6 })) baeume.push({ x, y, groesse: 0.8 + z() * 0.6 }); };
  for (let x = 12; x < B - 10; x += 11 + Math.floor(z() * 5)) baum(x, 9);
  for (let y = 22; y < zufahrtY - 8; y += 11 + Math.floor(z() * 5)) baum(sx(B - 9), y);

  return { B, T, spiegeln, layout, dach, dachFarbe, hallen, strassen, zufahrtY, parkplatz, tor, deko, baeume, fahnen, fahnenSeite };
}
