/**
 * scripts/texte-pruefen.mjs – findet fehlende englische Übersetzungen
 *
 * Aufruf:  npm run texte
 *
 * Sucht im Code alle Texte in t('…') und T('…') sowie die festen Wertelisten
 * aus lib/konstanten.js und prüft, ob es dafür einen Eintrag in
 * lib/sprache/en.js gibt. Fehlende Einträge werden aufgelistet (und der
 * Befehl endet mit einem Fehler). Nicht mehr benutzte Einträge werden als
 * Hinweis gezeigt – sie schaden nicht, können aber weg.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Alle .js-Dateien unterhalb eines Ordners */
function dateien(ordner) {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    return statSync(pfad).isDirectory() ? dateien(pfad) : pfad.endsWith('.js') ? [pfad] : [];
  });
}

const gefunden = new Set();
const muster = /\b[tT]\(\s*'((?:[^'\\]|\\.)*)'/g;
for (const datei of ['app', 'components', 'lib'].flatMap((o) => dateien(join(wurzel, o)))) {
  if (datei.endsWith(join('sprache', 'en.js'))) continue;
  for (const treffer of readFileSync(datei, 'utf8').matchAll(muster)) gefunden.add(treffer[1].replace(/\\'/g, "'"));
}

// Feste Wertelisten (kommen aus der Datenbank und werden mit t(wert) angezeigt)
const k = await import(pathToFileURL(join(wurzel, 'lib', 'konstanten.js')).href);
[...k.STATUS_WERTE, ...k.PRIORITAET_WERTE, ...k.URSACHEN_LISTE, ...Object.keys(k.MASCHINEN_SYMBOLE),
  'Frühschicht', 'Spätschicht', 'Nachtschicht'].forEach((w) => gefunden.add(w));

const en = (await import(pathToFileURL(join(wurzel, 'lib', 'sprache', 'en.js')).href)).default;
const fehlend = [...gefunden].filter((text) => !(text in en)).sort();
const unbenutzt = Object.keys(en).filter((text) => !gefunden.has(text)).sort();

console.log(`${gefunden.size} Texte im Code, ${Object.keys(en).length} Einträge in lib/sprache/en.js`);
if (unbenutzt.length) console.log(`\nHinweis – nicht (mehr) im Code gefunden (z. B. Daten wie Bereichsnamen):\n  ${unbenutzt.join('\n  ')}`);
if (fehlend.length) {
  console.log(`\nFEHLT in lib/sprache/en.js (${fehlend.length}):`);
  fehlend.forEach((text) => console.log(`  ${JSON.stringify(text)}: '',`));
  process.exit(1);
}
console.log('\nAlle Texte sind übersetzt.');
