/**
 * lib/karten/adresse.js – Kartenadresse (/karte?land=…&werk=…&halle=…&maschine=…&ansicht=…) → Startebene
 *
 * Genutzt von der Seite app/karte/page.js (beim Laden) und von KartenExplorer (wenn ein Favorit
 * geöffnet wird, während die Karte schon offen ist – dann ohne Neuladen).
 */
/**
 * Startebene aus der Adresse ermitteln. Unbekannte Werte werden ignoriert.
 * Eine Maschine legt Werk und Gebäude automatisch mit fest.
 * ansicht: '2d' | '3d' | null – geht der gemerkten 2D/3D-Wahl vor (z. B. bei Favoriten).
 * parameter: Objekt der Adressparameter (searchParams der Seite bzw. Object.fromEntries(URLSearchParams)).
 */
export function startAusAdresse(parameter, daten) {
  const ansicht = ['2d', '3d'].includes(String(parameter?.ansicht ?? '').toLowerCase()) ? String(parameter.ansicht).toLowerCase() : null;
  return { ...ebeneAusAdresse(parameter, daten), ansicht };
}

function ebeneAusAdresse(parameter, daten) {
  const werk = String(parameter?.werk ?? '').toUpperCase();
  const halle = String(parameter?.halle ?? '').toUpperCase();
  const maschine = daten.maschinen.find((m) => String(m.id) === String(parameter?.maschine ?? ''));
  if (maschine) {
    const g = daten.gebaeude.find((x) => x.id === maschine.gebaeude_id);
    return { standortId: g.standort_id, gebaeudeId: g.id, maschineId: maschine.id };
  }
  const standort = daten.standorte.find((st) => st.kuerzel === werk);
  if (!standort) {
    // Nur ein Land angegeben (Kürzel klein in der Adresse, groß in der Datenbank)
    const land = String(parameter?.land ?? '').toUpperCase();
    return daten.standorte.some((st) => st.land === land) ? { land } : {};
  }
  const gebaeude = daten.gebaeude.find((g) => g.standort_id === standort.id && g.kuerzel === halle);
  return { standortId: standort.id, gebaeudeId: gebaeude?.id ?? null };
}
