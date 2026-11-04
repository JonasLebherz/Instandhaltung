/**
 * lib/lager.js – Hilfen für das Ersatzteillager (Lager je Werk, Tabelle lagerbestand)
 *
 *  - lagerZustand: 'rot' = unter Mindestbestand, 'orange' = knapp (bis 1,5 × Mindestbestand), 'gruen' = ausreichend
 *  - teilArt: Kategorie und Symbol eines Teils, erkannt am Namen (damit man im Regal sieht, was es ist).
 *    Neue Teile ohne passendes Stichwort erscheinen als „Sonstiges“.
 * Eigene Datei ohne Datenbank-Zugriff: wird im Browser und auf dem Server verwendet.
 */
import { T } from './sprache/index.js';

export function lagerZustand(teil) {
  if (teil.bestand < teil.mindestbestand) return 'rot';
  if (teil.bestand <= teil.mindestbestand * 1.5) return 'orange';
  return 'gruen';
}

// Reihenfolge wichtig: das erste passende Stichwort gewinnt
const ARTEN = [
  { muster: /lager|rolle/i, art: T('Lager & Rollen'), symbol: 'bi-record-circle' },
  { muster: /riemen|gurt/i, art: T('Riemen & Gurte'), symbol: 'bi-arrow-repeat' },
  { muster: /hydraulik|pneumatik|zylinder|schlauch|dichtung/i, art: T('Hydraulik & Pneumatik'), symbol: 'bi-droplet-half' },
  { muster: /schalter|schütz|sicherung|encoder|lichtschranke|sensor|heizband/i, art: T('Elektrik & Sensorik'), symbol: 'bi-lightning-charge' },
  { muster: /fräser|platte|greifer|backen/i, art: T('Werkzeuge'), symbol: 'bi-tools' },
  { muster: /düse|filter/i, art: T('Düsen & Filter'), symbol: 'bi-funnel' },
];
export function teilArt(bezeichnung) {
  return ARTEN.find((a) => a.muster.test(bezeichnung)) ?? { art: T('Sonstiges'), symbol: 'bi-box-seam' };
}
