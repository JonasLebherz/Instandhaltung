/**
 * lib/lager.js – Zustand eines Ersatzteils im Lager (für Regal, Liste und Farben)
 *   'rot' = unter Mindestbestand, 'orange' = knapp (bis 1,5 × Mindestbestand), 'gruen' = ausreichend
 * Eigene Datei, damit die Lager-Seite nicht den 3D-Code (three.js) mitladen muss.
 */
export function lagerZustand(teil) {
  if (teil.bestand < teil.mindestbestand) return 'rot';
  if (teil.bestand <= teil.mindestbestand * 1.5) return 'orange';
  return 'gruen';
}
