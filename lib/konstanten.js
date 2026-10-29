/**
 * lib/konstanten.js – Feste Wertelisten der Anwendung
 *
 * Diese Werte müssen mit den Datentypen (CREATE TYPE … AS ENUM) in
 * supabase/schema.sql übereinstimmen.
 */

// Status eines Wartungsauftrags in der Reihenfolge des Ablaufs.
// Schlüssel = Wert in der Datenbank, Wert = Farbe der Status-Pill.
export const STATUS_LISTE = {
  'gemeldet': 'grau',
  'zugewiesen': 'blau',
  'in Arbeit': 'lila',
  'wartet auf Teil': 'orange',
  'erledigt': 'gruen',
};
export const STATUS_WERTE = Object.keys(STATUS_LISTE);

// Alle Status außer "erledigt" gelten als offen
export const OFFENE_STATUS = ['gemeldet', 'zugewiesen', 'in Arbeit', 'wartet auf Teil'];

// Prioritäten einer Störmeldung (von hoch nach niedrig)
export const PRIORITAET_LISTE = {
  'hoch': 'rot',
  'mittel': 'orange',
  'niedrig': 'grau',
};
export const PRIORITAET_WERTE = Object.keys(PRIORITAET_LISTE);

// Kategorien für die Störursache
export const URSACHEN_LISTE = [
  'Mechanischer Defekt',
  'Elektrischer Fehler',
  'Hydraulik/Pneumatik',
  'Steuerung/Software',
  'Verschleiß',
  'Bedienfehler',
  'Materialfehler',
  'Sonstiges',
];

// Maschinenarten (gleiche Werte wie der Typ "maschinentyp" in supabase/schema.sql)
// mit dem Symbol, das im Grundriss angezeigt wird (Bootstrap Icons)
export const MASCHINEN_SYMBOLE = {
  'Fräsen': 'bi-gear-wide-connected',
  'Drehen': 'bi-arrow-repeat',
  'Spritzguss': 'bi-droplet-half',
  'Laserschneiden': 'bi-bullseye',
  'Schweißen': 'bi-fire',
  'Pressen': 'bi-arrows-collapse',
  'Fördertechnik': 'bi-arrow-left-right',
  'Lackieren': 'bi-palette',
  'Montage': 'bi-robot',
  'Druckluft': 'bi-wind',
  'Lagertechnik': 'bi-boxes',
};
