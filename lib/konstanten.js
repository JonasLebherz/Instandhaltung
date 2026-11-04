/**
 * lib/konstanten.js – Feste Wertelisten der Anwendung
 *
 * Diese Werte müssen mit den Datentypen (CREATE TYPE … AS ENUM) in
 * supabase/schema.sql übereinstimmen.
 */

// Markiert Texte für die Übersetzung (wie T aus lib/sprache, hier ohne Import: das Prüfskript lädt diese Datei direkt)
const T = (text) => text;

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

// Checkliste je Maschinentyp (Auftragsseite). Gespeichert werden nur die Nummern der
// abgehakten Punkte (wartungsauftrag.checkliste) – die Texte stehen hier und werden übersetzt.
// Die ersten drei Punkte gelten für jede Maschine (Sicherheit vor und nach der Arbeit).
const ALLGEMEIN = [
  T('Maschine gesichert (Not-Halt, Hauptschalter aus, Schild „Nicht einschalten“)'),
  T('Persönliche Schutzausrüstung angelegt'),
  T('Arbeitsbereich nach der Reparatur gereinigt'),
];
export const CHECKLISTEN = {
  'Fräsen': [T('Spindel und Lager auf Geräusche geprüft'), T('Werkzeugaufnahme gereinigt'), T('Kühlschmierstoff kontrolliert')],
  'Drehen': [T('Spannfutter geprüft'), T('Riemen und Antrieb kontrolliert'), T('Probelauf ohne Werkstück')],
  'Spritzguss': [T('Heizzonen und Temperaturen geprüft'), T('Hydraulik auf Leckagen geprüft'), T('Probeschuss in Ordnung')],
  'Laserschneiden': [T('Optik und Düse gereinigt'), T('Absaugung geprüft'), T('Schutzglas unbeschädigt')],
  'Schweißen': [T('Schutzgas und Schläuche geprüft'), T('Brenner und Kontaktrohr kontrolliert'), T('Schutzzaun und Tür-Schalter geprüft')],
  'Pressen': [T('Lichtgitter und Zweihandbedienung getestet'), T('Hydraulikdruck geprüft'), T('Werkzeug fest verschraubt')],
  'Fördertechnik': [T('Bandlauf und Spannung geprüft'), T('Rollen und Lager kontrolliert'), T('Sensoren und Not-Halt-Reißleine getestet')],
  'Lackieren': [T('Filter und Absaugung geprüft'), T('Düsen gereinigt'), T('Brandschutz und Erdung geprüft')],
  'Montage': [T('Greifer und Sensoren geprüft'), T('Roboter referenziert'), T('Schutztür-Schalter getestet')],
  'Druckluft': [T('Druck und Kondensatablass geprüft'), T('Ölstand kontrolliert'), T('Leitungen auf Leckagen geprüft')],
  'Lagertechnik': [T('Fahr- und Hubwerk geprüft'), T('Lichtschranken getestet'), T('Regal auf Schäden kontrolliert')],
};
export const checklisteFuer = (typ) => [...ALLGEMEIN.slice(0, 2), ...(CHECKLISTEN[typ] ?? []), ALLGEMEIN[2]];
