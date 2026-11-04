/**
 * lib/staplerSpiel.js – Hallenplan und Regeln des Gabelstapler-Spiels (/spiel)
 *
 * Spielidee: In der Halle fällt immer eine Maschine aus (Ampel rot). Man fährt mit dem Gabelstapler
 * ins Lager (links), holt das passende Ersatzteil aus dem Regal und bringt es zum Übergabeplatz vor
 * der Maschine. Je schneller, desto mehr Punkte. Eine Runde dauert 2 Minuten.
 *
 * Alle Maße in Metern. Koordinaten: x nach rechts, z nach vorn (zur Kamera beim Start), y nach oben.
 * Wird von app/spiel/GabelstaplerSpiel.js (Ablauf, Punkte, Anzeige) und
 * components/karten/raum/StaplerHalle3D.js (3D-Halle, Fahren, Zusammenstöße) genutzt.
 */

export const RUNDE_SEKUNDEN = 120;

// Hallenwände (innen)
export const HALLE = { x0: -20, x1: 20, z0: -13, z1: 13 };

// Regal im Lager an der linken Wand: ein Fach je Ersatzteil, davor der Abholplatz
export const REGAL = { x0: -18.8, x1: -17.2, z0: -10.6, z1: 10.6 };
export const ABHOL_X = -15.0;

// Ersatzteile im Regal (Namen wie im Katalog, damit das 3D-Modell aus dem Lager passt)
export const TEILE = [
  'Kugellager 6205-2RS',
  'Keilriemen SPZ 1250',
  'Servomotor-Encoder',
  'Hydraulikschlauch DN10, 1 m',
  'Schutzgasdüse MIG/MAG',
  'Heizband 230 V, 400 W',
].map((name, i) => ({ id: i, name, fach: i + 1, z: -8.75 + i * 3.5 }));

// Maschinen in zwei Reihen links und rechts vom Gang; welche Teile zu welcher Maschine passen (lehrreich)
const REIHE_Z = 8;
export const MASCHINEN = [
  { id: 0, typ: 'Fräsen', bezeichnung: 'CNC-Fräszentrum FZ-500', anlagennummer: 'SPIEL-01', x: -5, L: 4.2, W: 2.8, teile: [0, 2] },
  { id: 1, typ: 'Drehen', bezeichnung: 'CNC-Drehmaschine DM-300', anlagennummer: 'SPIEL-02', x: 4, L: 3.8, W: 2.0, teile: [0, 1] },
  { id: 2, typ: 'Spritzguss', bezeichnung: 'Spritzgießmaschine SG-250', anlagennummer: 'SPIEL-03', x: 13, L: 5.4, W: 2.0, teile: [5, 3] },
  { id: 3, typ: 'Schweißen', bezeichnung: 'Schweißroboterzelle SR-2', anlagennummer: 'SPIEL-04', x: -5, L: 4.0, W: 3.4, teile: [4, 2] },
  { id: 4, typ: 'Montage', bezeichnung: 'Montageroboter MR-10', anlagennummer: 'SPIEL-05', x: 4, L: 3.5, W: 3.0, teile: [2, 0] },
  { id: 5, typ: 'Pressen', bezeichnung: 'Exzenterpresse EP-400', anlagennummer: 'SPIEL-06', x: 13, L: 3.0, W: 3.0, teile: [3, 1] },
].map((m, i) => {
  // Reihe hinten (z < 0) schaut mit der Bedienseite zum Gang (+z), Reihe vorn ist um 180° gedreht
  const hinten = i < 3;
  const z = hinten ? -REIHE_Z : REIHE_Z;
  const vorn = z + (hinten ? 1 : -1) * (m.W / 2 + 1.9);   // Übergabeplatz im Gang vor der Bedienseite
  return { ...m, z, drehung: hinten ? 0 : Math.PI, uebergabe: { x: m.x, z: vorn } };
});

/** Wohin muss der Stapler? Ohne das richtige Teil zum Fach im Lager, mit ihm zum Übergabeplatz der Maschine */
export function zielFuer(aufgabe, geladen) {
  if (!aufgabe) return null;
  return geladen === aufgabe.teil ? MASCHINEN[aufgabe.maschine].uebergabe : { x: ABHOL_X, z: TEILE[aufgabe.teil].z };
}

// Hindernisse für Zusammenstöße (achsenparallele Rechtecke): Maschinen, Regal, Palettenstapel
export const PALETTEN = [[0, -11.6], [9, -11.6], [0, 11.6], [9, 11.6], [17.6, -3], [17.6, 3]];
export const HINDERNISSE = [
  ...MASCHINEN.map((m) => ({ x0: m.x - m.L / 2 - 0.15, x1: m.x + m.L / 2 + 0.15, z0: m.z - m.W / 2 - 0.15, z1: m.z + m.W / 2 + 0.15 })),
  REGAL,
  ...PALETTEN.map(([x, z]) => ({ x0: x - 0.7, x1: x + 0.7, z0: z - 0.6, z1: z + 0.6 })),
];

// Start: im Gang, Blick zum Lager
export const START = { x: -6, z: 0, richtung: Math.PI };

// Punkte
export const PUNKTE_LIEFERUNG = 100;
export const PUNKTE_TEMPO_MAX = 60;   // + (60 − benötigte Sekunden), mindestens 0
export const PUNKTE_REMPLER = -10;

/** Nächste Aufgabe: eine andere Maschine als vorher fällt aus und braucht eines ihrer passenden Teile */
export function neueAufgabe(vorher = null, zufall = Math.random) {
  const moeglich = MASCHINEN.filter((m) => m.id !== vorher?.maschine);
  const maschine = moeglich[Math.floor(zufall() * moeglich.length)];
  const teil = maschine.teile[Math.floor(zufall() * maschine.teile.length)];
  return { maschine: maschine.id, teil };
}

// Bestenliste im Browser (je Gerät, keine Datenbank nötig)
const BESTENLISTE = 'staplerBestenliste';
export function bestenlisteLesen() {
  try {
    const liste = JSON.parse(localStorage.getItem(BESTENLISTE) ?? '[]');
    return Array.isArray(liste) ? liste.filter((e) => e && Number.isFinite(e.punkte)).slice(0, 5) : [];
  } catch { return []; }
}
export function bestenlisteEintragen(name, punkte, geliefert) {
  const liste = [...bestenlisteLesen(), { name: String(name || '–').slice(0, 30), punkte, geliefert, datum: new Date().toISOString() }]
    .sort((a, b) => b.punkte - a.punkte).slice(0, 5);
  try { localStorage.setItem(BESTENLISTE, JSON.stringify(liste)); } catch { /* privat */ }
  return liste;
}
