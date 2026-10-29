/**
 * lib/karten/laender.js – Länder für die Störungskarte (Welt → Land → Werk → Gebäude)
 *
 *  - laenderAus(standorte): fasst die Werke nach Land zusammen (Anzahl Werke,
 *    offene Störungen, höchste offene Priorität). Hauptsitz zuerst.
 *  - landKarte(kuerzel, standorte): alles, was LandKarte.js zum Zeichnen braucht –
 *    Größe, Umriss des Landes, Nachbarn und die Umrechnung GPS → Punkt.
 *    Deutschland hat eine eigene, feinere Karte (deutschland.js), die übrigen
 *    Länder kommen aus welt.js. Fehlt ein Land dort, wird ein Ausschnitt um die
 *    Werke herum ohne Umriss gezeigt.
 *  - weltPositionen(laender, abstand): Position je Land auf der Weltkarte (Mitte des
 *    Landes, ohne fertige Karte die Mitte seiner Werke). Liegen
 *    Länder dicht beieinander (Deutschland, Frankreich, Polen), werden die
 *    Markierungen auseinandergeschoben; eine feine Linie zeigt die echte Lage.
 */
import { DEUTSCHLAND_PFAD, NACHBAR_PFADE, KARTE_BREITE, KARTE_HOEHE, projizieren } from './deutschland';
import { LAENDER_KARTEN, WELT, WELT_MITTEN, landPunkt, weltPunkt } from './welt';

const PRIO_RANG = { niedrig: 1, mittel: 2, hoch: 3 };

/** Werke nach Land zusammenfassen */
export function laenderAus(standorte) {
  const laender = {};
  for (const st of standorte) {
    const land = (laender[st.land] ??= {
      kuerzel: st.land, name: st.land_name, hauptsitz: st.hauptsitz,
      werke: 0, maschinen: 0, offen: 0, hoch: 0, hoechste_prioritaet: null, standorte: [],
    });
    land.werke += 1;
    land.maschinen += st.maschinen;
    land.offen += st.offen;
    land.hoch += st.hoch;
    land.standorte.push(st);
    if ((PRIO_RANG[st.hoechste_prioritaet] ?? 0) > (PRIO_RANG[land.hoechste_prioritaet] ?? 0)) {
      land.hoechste_prioritaet = st.hoechste_prioritaet;
    }
  }
  return Object.values(laender).sort((a, b) => Number(b.hauptsitz) - Number(a.hauptsitz) || a.name.localeCompare(b.name));
}

/** Mercator-Ausschnitt um die Werke eines Landes (nur falls es keine fertige Karte gibt) */
function ausschnittUmWerke(standorte) {
  const breiten = standorte.map((st) => st.breitengrad);
  const laengen = standorte.map((st) => st.laengengrad);
  const rand = 3;
  const merc = (b) => Math.log(Math.tan(Math.PI / 4 + (b * Math.PI) / 360));
  const x0 = ((Math.min(...laengen) - rand) * Math.PI) / 180;
  const x1 = ((Math.max(...laengen) + rand) * Math.PI) / 180;
  const y0 = merc(Math.min(...breiten) - rand);
  const y1 = merc(Math.max(...breiten) + rand);
  const breite = 800;
  const skala = breite / (x1 - x0);
  return { breite, hoehe: Math.round((y1 - y0) * skala), skala, versatzX: -x0 * skala, versatzY: y1 * skala, land: '', nachbarn: '' };
}

/** Karte eines Landes: { kuerzel, breite, hoehe, land, nachbarn: [Pfade], punkt(breite, laenge) } */
export function landKarte(kuerzel, standorte = []) {
  if (kuerzel === 'DE') {
    return { kuerzel, breite: KARTE_BREITE, hoehe: KARTE_HOEHE, land: DEUTSCHLAND_PFAD, nachbarn: NACHBAR_PFADE, punkt: projizieren };
  }
  const ansicht = LAENDER_KARTEN[kuerzel] ?? ausschnittUmWerke(standorte.filter((st) => st.land === kuerzel));
  return {
    kuerzel, breite: ansicht.breite, hoehe: ansicht.hoehe, land: ansicht.land, nachbarn: [ansicht.nachbarn],
    punkt: (breitengrad, laengengrad) => landPunkt(ansicht, breitengrad, laengengrad),
  };
}

/**
 * Position jedes Landes auf der Weltkarte: Mitte des Landes (WELT_MITTEN), sonst Mitte seiner Werke.
 * abstand = { x, y }: Mindestabstand der Markierungen (Einheiten der Weltkarte, 1000 breit).
 * Ergebnis je Land: { echt: {x, y}, x, y } – echt = wahre Lage, x/y = Lage der Markierung.
 */
export function weltPositionen(laender, abstand) {
  const punkte = laender.map((land) => {
    const p = land.standorte.map((st) => weltPunkt(st.breitengrad, st.laengengrad));
    const echt = WELT_MITTEN[land.kuerzel]
      ?? { x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length };
    return { kuerzel: land.kuerzel, echt, x: echt.x, y: echt.y };
  });
  // Einfaches Auseinanderschieben: Paare, die sich (elliptisch gemessen) zu nahe sind, stoßen sich ab
  for (let runde = 0; runde < 60; runde += 1) {
    for (let i = 0; i < punkte.length; i += 1) {
      for (let j = i + 1; j < punkte.length; j += 1) {
        const a = punkte[i];
        const b = punkte[j];
        let dx = (b.x - a.x) / abstand.x;
        let dy = (b.y - a.y) / abstand.y;
        const d = Math.hypot(dx, dy);
        if (d >= 1) continue;
        if (d < 1e-6) { dx = 1; dy = 0; }
        const schub = (1 - d) / 2 / (d || 1);
        a.x -= dx * schub * abstand.x; a.y -= dy * schub * abstand.y;
        b.x += dx * schub * abstand.x; b.y += dy * schub * abstand.y;
      }
    }
    // Nicht über den Kartenrand hinaus (in jeder Runde, damit die übrigen ausweichen)
    for (const p of punkte) {
      p.x = Math.min(WELT.breite - 40, Math.max(40, p.x));
      p.y = Math.min(WELT.hoehe - 50, Math.max(28, p.y));
    }
  }
  return Object.fromEntries(punkte.map((p) => [p.kuerzel, p]));
}
