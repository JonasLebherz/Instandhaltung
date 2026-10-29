/**
 * lib/sprache/index.js – Übersetzung der Oberfläche (Deutsch / Englisch)
 *
 * Prinzip: Der deutsche Text ist selbst der Schlüssel.
 *
 *     t('Offene Meldungen')                 → "Open reports" (auf Englisch)
 *     t('{n} offene Störungen', { n: 5 })   → "5 open faults"
 *
 * Gleiches Wort, andere Bedeutung? Dann hilft ein Zusatz nach "|", der auf
 * Deutsch nicht angezeigt wird: t('Gebäude|Schritt') → "Gebäude" bzw. "Building",
 * t('Gebäude') → "Gebäude" bzw. "Buildings".
 *
 * Fehlt eine Übersetzung in lib/sprache/en.js, erscheint einfach der deutsche
 * Text – die Seite funktioniert also immer. Fehlende Übersetzungen findet
 * `npm run texte` (scripts/texte-pruefen.mjs).
 *
 * Inhalte aus der Datenbank (Namen von Werken, Maschinen, Beschreibungen)
 * werden nicht übersetzt – das sind Daten, keine Oberfläche.
 * Feste Wertelisten (Status, Priorität, Ursache …) stehen dagegen in en.js.
 *
 * Diese Datei läuft auf dem Server und im Browser.
 * Server: lib/sprache/server.js · Browser: components/SpracheKontext.js
 */
import EN from './en';

export const SPRACHEN = {
  de: { name: 'Deutsch', locale: 'de-DE', kurz: 'DE' },
  en: { name: 'English', locale: 'en-GB', kurz: 'EN' },
};

/**
 * Markiert einen Text zur späteren Übersetzung, z. B. in festen Listen:
 *   const SEITEN = [{ text: T('Übersicht') }]  →  später t(seite.text)
 * T() selbst ändert nichts – es hilft nur `npm run texte`, den Text zu finden.
 */
export const T = (text) => text;

/** Erster Buchstabe groß: gross('in Arbeit') → "In Arbeit" */
export const gross = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** Gültige Sprache aus einem beliebigen Wert (z. B. Cookie) – Standard ist Deutsch */
export function spracheAus(wert) {
  return wert === 'en' ? 'en' : 'de';
}

/** Liefert die Übersetzungsfunktion t für eine Sprache. t.sprache verrät die Sprache. */
export function uebersetzerFuer(sprache) {
  const woerterbuch = sprache === 'en' ? EN : null;
  function t(text, werte) {
    let ergebnis = woerterbuch?.[text] ?? text.split('|')[0];
    if (werte) ergebnis = ergebnis.replace(/\{(\w+)\}/g, (_, name) => (werte[name] ?? ''));
    return ergebnis;
  }
  t.sprache = sprache;
  t.locale = SPRACHEN[sprache].locale;
  return t;
}
