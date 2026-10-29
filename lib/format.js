/**
 * lib/format.js – Formatierung von Datum, Dauer und Zahlen
 *
 * Alle Zeiten werden in deutscher Zeit (Europe/Berlin) angezeigt – auch wenn
 * der Server (z. B. bei Vercel) in einer anderen Zeitzone läuft.
 *
 * Der letzte Parameter "sprache" ('de' oder 'en') bestimmt die Schreibweise:
 * "29.10.2026" bzw. "29/10/2026", "3,8" bzw. "3.8". Ohne Angabe: Deutsch.
 */

const ZEITZONE = 'Europe/Berlin';
const LOCALE = { de: 'de-DE', en: 'en-GB' };

const OPTIONEN = {
  datumZeit: { timeZone: ZEITZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  datum: { timeZone: ZEITZONE, day: '2-digit', month: '2-digit', year: 'numeric' },
  lang: { timeZone: ZEITZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  monat: { timeZone: 'UTC', month: 'short' },
};
// Intl-Formatierer sind teuer anzulegen – deshalb je Art und Sprache nur einmal
const formatierer = {};
function formatFuer(art, sprache) {
  const schluessel = `${art}-${sprache}`;
  formatierer[schluessel] ??= new Intl.DateTimeFormat(LOCALE[sprache] ?? LOCALE.de, OPTIONEN[art]);
  return formatierer[schluessel];
}

/** "29.10.2026, 14:05" – oder "–", wenn kein Wert vorhanden ist */
export function datumZeit(wert, sprache = 'de') {
  return wert ? formatFuer('datumZeit', sprache).format(new Date(wert)) : '–';
}

/** "29.10.2026" */
export function datum(wert, sprache = 'de') {
  return wert ? formatFuer('datum', sprache).format(new Date(wert)) : '–';
}

/** "Donnerstag, 29. Oktober 2026" bzw. "Thursday 29 October 2026" */
export function datumLang(wert = new Date(), sprache = 'de') {
  return formatFuer('lang', sprache).format(new Date(wert));
}

/** Kurzer Monatsname: monatKurz(10) → "Okt" bzw. "Oct" (monat 1–12) */
export function monatKurz(monat, sprache = 'de') {
  return formatFuer('monat', sprache).format(new Date(Date.UTC(2026, monat - 1, 15))).replace('.', '');
}

/**
 * Begrüßung passend zur Uhrzeit in Deutschland – liefert den deutschen Text,
 * die Seite übersetzt ihn mit t()
 */
export function begruessung(jetzt = new Date()) {
  const stunde = Number(new Intl.DateTimeFormat('de-DE', { timeZone: ZEITZONE, hour: 'numeric', hourCycle: 'h23' }).format(jetzt));
  if (stunde < 11) return 'Guten Morgen';
  if (stunde < 18) return 'Guten Tag';
  return 'Guten Abend';
}

/** Dauer in Minuten lesbar: "45 min", "2 h 15 min", "3 d 4 h" */
export function dauer(minuten) {
  if (minuten === null || minuten === undefined) return '–';
  const m = Math.round(Number(minuten));
  if (m < 60) return `${m} min`;
  const stunden = Math.floor(m / 60);
  if (stunden < 24) {
    const rest = m % 60;
    return `${stunden} h${rest > 0 ? ` ${rest} min` : ''}`;
  }
  const tage = Math.floor(stunden / 24);
  const rest = stunden % 24;
  return `${tage} d${rest > 0 ? ` ${rest} h` : ''}`;
}

/** Zahl mit deutschem Komma: zahl(3.75, 1) → "3,8" (Englisch: "3.8") */
export function zahl(wert, nachkomma = 1, sprache = 'de') {
  if (wert === null || wert === undefined || Number.isNaN(Number(wert))) return '–';
  return Number(wert).toLocaleString(LOCALE[sprache] ?? LOCALE.de, {
    minimumFractionDigits: nachkomma,
    maximumFractionDigits: nachkomma,
  });
}

/* ---------------------------------------------------------------------
 * Umrechnung zwischen <input type="datetime-local"> und echten Zeitpunkten
 *
 * Das Eingabefeld liefert z. B. "2026-10-29T14:05" ohne Zeitzone. Gemeint ist
 * deutsche Zeit. Damit Sommer- und Winterzeit stimmen, wird der Versatz zu
 * UTC für genau diesen Tag berechnet.
 * ------------------------------------------------------------------- */

/** Versatz der deutschen Zeit zu UTC in Minuten (60 im Winter, 120 im Sommer) */
function berlinVersatzMinuten(zeitpunkt) {
  const teile = new Intl.DateTimeFormat('en-US', {
    timeZone: ZEITZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(zeitpunkt);
  const w = Object.fromEntries(teile.map((t) => [t.type, t.value]));
  const alsUtc = Date.UTC(Number(w.year), Number(w.month) - 1, Number(w.day), Number(w.hour), Number(w.minute));
  const minuteGenau = Math.floor(zeitpunkt.getTime() / 60000) * 60000;
  return Math.round((alsUtc - minuteGenau) / 60000);
}

/**
 * "2026-10-29T14:05" (deutsche Zeit) → Date-Objekt.
 * Gibt null zurück, wenn die Eingabe kein gültiges Datum ist (z. B. 31.02.).
 */
export function berlinZuDate(eingabe) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(eingabe ?? ''));
  if (!m) return null;
  const [jahr, monat, tag, stunde, minute] = m.slice(1).map(Number);
  const alsUtc = Date.UTC(jahr, monat - 1, tag, stunde, minute);
  const probe = new Date(alsUtc);
  if (probe.getUTCMonth() !== monat - 1 || probe.getUTCDate() !== tag || stunde > 23 || minute > 59) {
    return null;
  }
  // Zweimal rechnen, damit auch die Tage der Zeitumstellung stimmen
  let ergebnis = new Date(alsUtc - berlinVersatzMinuten(probe) * 60000);
  ergebnis = new Date(alsUtc - berlinVersatzMinuten(ergebnis) * 60000);
  return ergebnis;
}

/** Date-Objekt → "2026-10-29T14:05" in deutscher Zeit (für Eingabefelder) */
export function fuerDatetimeInput(wert) {
  if (!wert) return '';
  const teile = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZEITZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(wert));
  const w = Object.fromEntries(teile.map((t) => [t.type, t.value]));
  return `${w.year}-${w.month}-${w.day}T${w.hour}:${w.minute}`;
}

/** Heutiges Datum in Deutschland als "2026-10-29" */
export function heuteBerlin() {
  return fuerDatetimeInput(new Date()).slice(0, 10);
}
