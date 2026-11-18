/**
 * lib/stammdaten.js – Hilfen zum Anlegen von Werken, Hallen, Maschinen und Mitarbeitern (Seite /anlegen)
 *
 * Neue Hallen und Maschinen brauchen eine Lage in Metern (Lageplan, Grundriss, 3D). Damit man sie
 * nicht von Hand eintragen muss, sucht freiePosition() den ersten freien Platz – zeilenweise von
 * oben links, mit Abstand zu allem, was schon da ist.
 */

// Übliche Stellfläche (Meter) und Kosten einer Stillstandsstunde je Maschinentyp – Mittelwerte der Testdaten
export const MASCHINEN_VORGABEN = {
  'Fräsen': { b: 4.5, t: 3.5, kosten: 380 },
  'Drehen': { b: 4, t: 2.4, kosten: 320 },
  'Spritzguss': { b: 7, t: 2.6, kosten: 450 },
  'Laserschneiden': { b: 8, t: 4, kosten: 520 },
  'Schweißen': { b: 5, t: 5, kosten: 410 },
  'Pressen': { b: 4, t: 4, kosten: 600 },
  'Fördertechnik': { b: 14, t: 1.6, kosten: 250 },
  'Lackieren': { b: 10, t: 5, kosten: 480 },
  'Montage': { b: 3, t: 3, kosten: 350 },
  'Druckluft': { b: 2.5, t: 2, kosten: 900 },
  'Lagertechnik': { b: 20, t: 2.5, kosten: 200 },
};

// Qualifikationen der Techniker (wie in den Testdaten)
export const QUALIFIKATIONEN = ['Industriemechaniker/in', 'Mechatroniker/in', 'Elektroniker/in für Betriebstechnik', 'Automatisierungstechniker/in (SPS)'];
export const SCHICHTEN = ['Frühschicht', 'Spätschicht', 'Nachtschicht'];

/**
 * Erste freie Stelle für ein Rechteck b × t in einer Fläche B × T.
 * vorhanden: [{ x, y, b, t }]; abstand: Mindestabstand zu anderen; rand: Abstand zum Rand.
 * Raster 1 m. Ergebnis { x, y } oder null, wenn nichts frei ist.
 */
export function freiePosition(B, T, vorhanden, b, t, abstand, rand) {
  for (let y = rand; y + t <= T - rand; y += 1) {
    for (let x = rand; x + b <= B - rand; x += 1) {
      const frei = vorhanden.every((r) => x + b + abstand <= r.x || r.x + r.b + abstand <= x || y + t + abstand <= r.y || r.y + r.t + abstand <= y);
      if (frei) return { x, y };
    }
  }
  return null;
}
