/**
 * tests/e2e.cjs – Ende-zu-Ende-Test der App gegen eine lokale PostgreSQL-Datenbank
 *
 * Voraussetzungen (siehe CLAUDE.md, "Lokales Testen"):
 *  - PostgreSQL lokal mit Datenbank "instandhaltung" (Benutzer/Passwort postgres),
 *    frisch befüllt mit supabase/schema.sql + supabase/testdaten.sql
 *  - .env.local mit DATABASE_URL (lokal) und LOGIN_DEAKTIVIERT=true
 *  - npm run build && npx next start -p 3000 -H 127.0.0.1
 *  - Playwright mit Chromium (nicht in package.json – global installieren)
 * Aufruf: node tests/e2e.cjs   (Screenshots landen in tests/screenshots/, nicht im Repository)
 * Die Tests ändern Daten – vor jedem Lauf die Testdaten neu einspielen.
 */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = process.env.BASE ?? 'http://127.0.0.1:3000';
const SHOTS = __dirname + '/screenshots/';
fs.mkdirSync(SHOTS, { recursive: true });
let fehler = [];
const sql = (q) => execSync(`PGPASSWORD=postgres psql -h localhost -U postgres -d instandhaltung -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
/** Auswahlfeld (components/Auswahl.js) öffnen und den Eintrag mit diesem Wert anklicken */
const waehle = async (seite, id, wert) => {
  await seite.click(`#${id}`);
  await seite.click(`#${id}-liste [role=option][data-wert="${wert}"]`);
};
const pruefe = (name, ok, info = '') => { console.log((ok ? 'OK   ' : 'FEHL ') + name + (!ok && info ? `  [${info}]` : '')); if (!ok) fehler.push(name); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Berlin' });
  // Die bisherigen Kartentests prüfen den 2D-Lageplan; die 3D-Ansicht hat einen eigenen Abschnitt (19b)
  await p.goto(BASE + '/login');
  await p.evaluate(() => localStorage.setItem('kartenansicht', '2d'));
  const konsole = [];
  p.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text()); });
  p.on('pageerror', (e) => konsole.push('PAGEERROR ' + e.message));

  // 1. Alle Seiten laden
  for (const url of ['/', '/melden', '/melden?maschine=3', '/auftraege', '/auftraege?status=offen', '/auftraege?status=wartet%20auf%20Teil&maschine=6&prioritaet=hoch',
    '/auftraege?status=quatsch&maschine=abc', '/auftraege?suche=Lager', '/auftraege/1', '/auftraege/150', '/statistik', '/statistik?von=2026-05-01&bis=2026-08-31',
    '/statistik?von=2026-09-01&bis=2026-01-01', '/statistik?von=2030-01-01&bis=2030-02-01', '/statistik?standort=8', '/statistik?standort=abc',
    '/karte', '/karte?werk=ham', '/karte?werk=ham&halle=h2', '/karte?maschine=1', '/karte?werk=xyz&halle=q', '/karte?maschine=abc',
    '/karte/ham', '/karte/HAM', '/karte/ber', '/karte/ham/h2', '/karte/alb/h1?maschine=1', '/auftraege?standort=8', '/melden?standort=8',
    '/statistik?werk=ham', '/statistik?werk=ham&halle=h2', '/statistik?maschine=5', '/statistik?werk=xyz', '/datenbasis', '/login', '/karte?land=us', '/karte?land=xx', '/statistik?land=cn', '/statistik?land=xx']) {
    const r = await p.goto(BASE + url, { waitUntil: 'networkidle' });
    pruefe(`GET ${url}`, r.status() === 200, r.status());
  }
  const r404 = await p.goto(BASE + '/auftraege/99999');
  pruefe('Unbekannter Auftrag → Nicht-gefunden-Seite', (await p.content()).includes('Nicht gefunden') && (await p.content()).includes('noindex'), r404.status());
  konsole.length = 0; // der 404 eben war Absicht
  await p.goto(BASE + '/karte/xyz');
  pruefe('Unbekanntes Werk → Deutschlandkarte', p.url().endsWith('/karte?werk=xyz') && (await p.$('.ebene-neu .dkarte')) !== null, p.url());
  await p.goto(BASE + '/karte/ham/h9');
  pruefe('Unbekanntes Gebäude → Lageplan des Werks', p.url().endsWith('/karte?werk=ham&halle=h9') && (await p.$('.ebene-neu .lageplan')) !== null, p.url());

  // 2. Störmeldung über die Karte: Werk → Gebäude → Maschine
  const naechsteNr = Number(sql('SELECT max(id) FROM stoermeldung')) + 1;
  await p.goto(BASE + '/melden');
  await p.evaluate(() => { window.__ohneNeuladen = true; });
  pruefe('Melden: beginnt mit der Weltkarte (Schritt 1 Land)', (await p.$('.ebene-neu .wkarte')) !== null && (await p.textContent('.melde-schritte [aria-current=step]')).includes('Land'));
  await p.click('.ebene-neu [data-ort="land-DE"]');
  await p.waitForSelector('.ebene-neu .dkarte:not(.wkarte)'); await p.waitForTimeout(700);
  await p.click('.ebene-neu .dkarte button[aria-label^="Werk Dortmund"]');
  await p.waitForSelector('.ebene-neu .lageplan');
  pruefe('Melden: Zoom auf Werk Dortmund', (await p.textContent('.buehne-titel')) === 'Werk Dortmund');
  pruefe('Melden: Kamerafahrt läuft (alte Ebene sichtbar, Animation aktiv)',
    await p.evaluate(() => (document.querySelector('.ebene-alt')?.getAnimations().length ?? 0) > 0));
  await p.waitForTimeout(1200);
  pruefe('Melden: alte Ebene nach dem Zoom entfernt', (await p.$('.ebene-alt')) === null);
  await p.click('.ebene-neu .lageplan button[aria-label^="Halle 1"]');
  await p.waitForSelector('.ebene-neu .grundriss'); await p.waitForTimeout(700);
  const maschinenImGrundriss = await p.$$eval('.ebene-neu .grundriss .plan-maschine', (z) => z.length);
  pruefe('Melden: Grundriss mit allen Maschinen', maschinenImGrundriss === Number(sql("SELECT count(*) FROM maschine m JOIN gebaeude g ON g.id=m.gebaeude_id JOIN standort s ON s.id=g.standort_id WHERE s.kuerzel='DOR' AND g.kuerzel='H1'")), maschinenImGrundriss);
  pruefe('Melden: kein Neuladen der Seite beim Zoomen', await p.evaluate(() => window.__ohneNeuladen === true));
  const gewaehlteMaschine = Number(sql("SELECT m.id FROM maschine m WHERE anlagennummer='DOR-H1-01'"));
  await p.click('.ebene-neu .grundriss button[title*="DOR-H1-01"]');
  await p.waitForSelector('#beschreibung');
  pruefe('Melden: Schritt 5 aktiv', (await p.textContent('.melde-schritte [aria-current=step]')).includes('Beschreibung'));
  pruefe('Melden: Maschine übernommen', (await p.inputValue('input[name=maschine_id]')) === String(gewaehlteMaschine) && (await p.textContent('.auswahl-chip')).includes('DOR-H1-01'));
  await p.click('.auswahl-chip button:has-text("Ändern")');
  await p.waitForSelector('.ebene-neu .grundriss');
  pruefe('Ändern: Karte startet im Gebäude der Maschine', (await p.textContent('.buehne-titel')).includes('Halle 1'));
  pruefe('Melden: keine Störungszahlen auf der Karte', (await p.$$('.explorer-melden .zaehl-marke, .explorer-melden .ort-zahl, .explorer-melden .karten-legende')).length === 0);
  pruefe('Melden: Schritt-Leiste zeigt Schritt 3 und die Wahl', (await p.textContent('.melde-schritte [aria-current=step]')).includes('Maschine') && (await p.textContent('.melde-schritte')).includes('Werk Dortmund'));
  await p.click('.melde-schritte button:has-text("Werk")'); await p.waitForTimeout(700);
  pruefe('Schritt-Leiste: zoomt zurück nach Deutschland', (await p.$('.ebene-neu .dkarte:not(.wkarte)')) !== null && (await p.$('.ebene-alt')) === null);
  // Dieselbe Auswahl über die Listen neben der Karte
  await p.click('.explorer-info button:has-text("Werk Dortmund")'); await p.waitForTimeout(700);
  await p.click('.explorer-info button:has-text("Halle 1")'); await p.waitForTimeout(700);
  await p.click('.explorer-info button:has-text("DOR-H1-01")');
  await p.waitForSelector('#beschreibung');
  pruefe('Auswahl über die Listen neben der Karte', (await p.inputValue('input[name=maschine_id]')) === String(gewaehlteMaschine));

  // Fehlerfall
  await p.fill('#gemeldet_von', '');
  await p.fill('#beschreibung', 'kurz');
  await p.click('button[type=submit]');
  await p.waitForSelector('.invalid-feedback');
  const html = await p.content();
  for (const t of ['Bitte Ihren Namen angeben', 'zu kurz', 'Bitte eine Ursache auswählen']) pruefe(`Validierung: ${t}`, html.includes(t));
  pruefe('Maschine bleibt nach Fehler gewählt', (await p.inputValue('input[name=maschine_id]')) === String(gewaehlteMaschine));
  pruefe('Eingabe bleibt nach Fehler erhalten', (await p.inputValue('#beschreibung')) === 'kurz');

  // 3. Störmeldung: Erfolgsfall
  await p.fill('#gemeldet_von', 'Test Ü. Müller');
  await p.fill('#beschreibung', 'Testmeldung: Presse schlägt nach <script>alert(1)</script>');
  await waehle(p, 'ursache_kategorie', 'Verschleiß');
  await p.click('label[for=prio-hoch]');
  await p.click('button[type=submit]');
  await p.waitForURL(BASE + '/');
  await p.waitForSelector('.hinweis-erfolg');
  const neu = Number(sql('SELECT max(id) FROM stoermeldung'));
  pruefe(`Meldung gespeichert (Nr. ${naechsteNr}) + Hinweis`, neu === naechsteNr && (await p.textContent('.hinweis-erfolg')).includes(`Nr. ${naechsteNr}`));
  pruefe('Meldung an der gewählten Maschine', Number(sql(`SELECT maschine_id FROM stoermeldung WHERE id=${neu}`)) === gewaehlteMaschine);
  await p.goto(BASE + '/melden?maschine=' + gewaehlteMaschine);
  pruefe('/melden?maschine= springt zu Schritt 4', (await p.$('#beschreibung')) !== null);
  await p.evaluate(() => { document.querySelector('input[name=maschine_id]').value = '99999'; });
  await p.fill('#gemeldet_von', 'X'); await p.fill('#beschreibung', 'Gültige Beschreibung'); await waehle(p, 'ursache_kategorie', 'Sonstiges');
  await p.click('button[type=submit]'); await p.waitForSelector('.invalid-feedback');
  pruefe('Manipulierte Maschinen-ID abgelehnt', (await p.content()).includes('Die gewählte Maschine existiert nicht'));
  pruefe('Auftrag mit Status gemeldet', sql(`SELECT status FROM wartungsauftrag WHERE stoermeldung_id=${neu}`) === 'gemeldet');
  pruefe('Umlaute korrekt', sql(`SELECT gemeldet_von FROM stoermeldung WHERE id=${neu}`) === 'Test Ü. Müller');
  const auftrag = Number(sql(`SELECT id FROM wartungsauftrag WHERE stoermeldung_id=${neu}`));
  await p.goto(`${BASE}/auftraege/${auftrag}`);
  pruefe('Kein XSS (Text wird nur angezeigt)', (await p.textContent('main')).includes('<script>alert(1)</script>') && !(await p.content()).includes('<script>alert(1)</script>'));

  const speichern = async (felder) => {
    if ('techniker' in felder) await waehle(p, 'techniker_id', felder.techniker);
    if ('status' in felder) await waehle(p, 'status', felder.status);
    if ('start' in felder) await p.fill('#start_zeit', felder.start);
    if ('ende' in felder) await p.fill('#ende_zeit', felder.ende);
    if ('massnahme' in felder) await p.fill('#massnahme', felder.massnahme);
    await Promise.all([p.waitForResponse((r) => r.request().method() === 'POST'), p.click('form:has(#status) button[type=submit]')]);
    await p.waitForTimeout(600);
  };

  // 4. Status ohne Techniker
  await speichern({ techniker: '', status: 'in Arbeit' });
  pruefe('Status ohne Techniker abgelehnt', (await p.content()).includes('muss ein Techniker zugewiesen sein'));
  // 5. Techniker → automatisch zugewiesen
  await p.goto(`${BASE}/auftraege/${auftrag}`);
  await speichern({ techniker: '1', status: 'gemeldet' });
  pruefe('Techniker → Status zugewiesen', sql(`SELECT status FROM wartungsauftrag WHERE id=${auftrag}`) === 'zugewiesen');
  const fertig = await p.waitForFunction(() => !document.querySelector('form:has(#status) button[type=submit]')?.disabled, null, { timeout: 8000 }).then(() => true, () => false);
  pruefe('Nach dem Speichern ist die Seite wieder bedienbar (kein Hängen)', fertig);
  // 6. in Arbeit setzt Startzeit
  await speichern({ status: 'in Arbeit' });
  pruefe('in Arbeit setzt start_zeit', sql(`SELECT start_zeit IS NOT NULL FROM wartungsauftrag WHERE id=${auftrag}`) === 't');

  const buchen = async (teil, menge) => {
    await waehle(p, 'ersatzteil_id', String(teil));
    await p.fill('#menge', String(menge));
    await Promise.all([p.waitForResponse((r) => r.request().method() === 'POST'), p.click('form:has(#ersatzteil_id) button[type=submit]')]);
    await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
  };
  // 7. Teil auf Lager (Keilriemen id 2)
  const vorher = Number(sql('SELECT bestand FROM ersatzteil WHERE id=2'));
  await buchen(2, 2);
  pruefe('Bestand reduziert', Number(sql('SELECT bestand FROM ersatzteil WHERE id=2')) === vorher - 2);
  await buchen(2, 1);
  pruefe('Zweite Buchung addiert Menge', sql(`SELECT menge FROM auftrag_ersatzteil WHERE auftrag_id=${auftrag} AND ersatzteil_id=2`) === '3');
  // 8. Ungültige Menge
  await buchen(2, 0);
  pruefe('Menge 0 abgelehnt', (await p.content()).includes('Menge zwischen 1 und 999'));
  // 9. Nicht auf Lager (Hydraulikschlauch id 3, Bestand 1)
  await p.goto(`${BASE}/auftraege/${auftrag}`);
  const bestVorher = Number(sql("SELECT count(*) FROM bestellung WHERE ersatzteil_id=3 AND status='bestellt'"));
  await buchen(3, 2);
  pruefe('Status → wartet auf Teil', sql(`SELECT status FROM wartungsauftrag WHERE id=${auftrag}`) === 'wartet auf Teil');
  pruefe('Bestellung angelegt (Menge 1+3=4)', Number(sql("SELECT count(*) FROM bestellung WHERE ersatzteil_id=3 AND status='bestellt'")) === bestVorher + 1
    && sql("SELECT menge FROM bestellung WHERE ersatzteil_id=3 AND status='bestellt'") === '4');
  pruefe('Hinweis zur Bestellung angezeigt', (await p.textContent('main')).includes('Bestellung über 4 Stück'));
  await buchen(3, 5);
  pruefe('Keine doppelte Bestellung', Number(sql("SELECT count(*) FROM bestellung WHERE ersatzteil_id=3 AND status='bestellt'")) === bestVorher + 1
    && (await p.textContent('main')).includes('bereits eine Bestellung'));
  // 10. Lieferung buchen
  await p.goto(BASE + '/');
  await p.screenshot({ path: SHOTS + 'n-index-hell.png', fullPage: true });
  const bid = sql("SELECT id FROM bestellung WHERE ersatzteil_id=3 AND status='bestellt'");
  await Promise.all([p.waitForResponse((r) => r.request().method() === 'POST'), p.click(`form:has(input[name=bestellung_id][value="${bid}"]) button`)]);
  await p.waitForTimeout(800);
  pruefe('Lieferung: Bestand 1+4=5', sql('SELECT bestand FROM ersatzteil WHERE id=3') === '5');
  pruefe('Lieferung: geliefert + Datum', sql(`SELECT status::text || '|' || (lieferdatum IS NOT NULL)::text FROM bestellung WHERE id=${bid}`) === 'geliefert|true');
  // 11. Abschluss: Fehler
  await p.goto(`${BASE}/auftraege/${auftrag}`);
  await buchen(3, 2);
  pruefe('Nach Lieferung buchbar (Bestand 3)', sql('SELECT bestand FROM ersatzteil WHERE id=3') === '3');
  const start = await p.inputValue('#start_zeit');
  await speichern({ status: 'erledigt', ende: '2020-01-01T10:00', massnahme: '' });
  const h2 = await p.content();
  pruefe('Abschluss ohne Maßnahme abgelehnt', h2.includes('durchgeführte Maßnahme beschreiben'));
  pruefe('Ende vor Start abgelehnt', h2.includes('nach dem Arbeitsbeginn'));
  await speichern({ status: 'erledigt', start: '2020-01-01T10:00', ende: '', massnahme: 'xxxxx' });
  pruefe('Start vor Meldung abgelehnt', (await p.content()).includes('nicht vor der Störmeldung'));
  // 12. Abschluss korrekt (Endzeit-Vorbelegung beim Statuswechsel nutzen)
  await p.goto(`${BASE}/auftraege/${auftrag}`);
  await waehle(p, 'status', 'erledigt');
  pruefe('Endzeit wird bei "erledigt" vorbelegt', (await p.inputValue('#ende_zeit')) !== '');
  await speichern({ start, massnahme: 'Lager getauscht, Probelauf ok' });
  const status = sql(`SELECT status || '|' || massnahme FROM wartungsauftrag WHERE id=${auftrag}`);
  pruefe('Auftrag erledigt', status === 'erledigt|Lager getauscht, Probelauf ok', status + ' ' + ((await p.textContent('main')).match(/Bitte[^.]*\./g) || []).join(' '));
  pruefe('Erledigt: Buchen ausgeblendet', (await p.$('#ersatzteil_id')) === null);
  pruefe('Erledigt: Ausfallzeit angezeigt', (await p.textContent('main')).includes('Ausfallzeit'));
  await p.screenshot({ path: SHOTS + 'n-auftrag-hell.png', fullPage: true });
  // 13. Wieder öffnen
  await speichern({ status: 'in Arbeit' });
  pruefe('Wieder geöffnet: ende_zeit NULL', sql(`SELECT ende_zeit IS NULL FROM wartungsauftrag WHERE id=${auftrag}`) === 't');
  // 14. Filter & Suche
  await p.goto(BASE + '/auftraege?suche=Lager');
  const n = await p.$$eval('tbody tr', (z) => z.length);
  pruefe('Suche findet Treffer', n > 0 && n === Number(sql("SELECT count(*) FROM stoermeldung WHERE beschreibung ILIKE '%Lager%'")), n);
  await p.goto(BASE + '/auftraege?suche=100%25');
  pruefe('Suche mit % ohne Fehler', (await p.content()).includes('Keine Meldungen gefunden'));
  // 14b. Störungskarte: Werte stimmen, Klickpfad funktioniert
  await p.goto(BASE + '/karte');
  const offenKarte = await p.$$eval('.dkarte .punkt-blase', (z) => z.reduce((s, e) => s + (Number(e.textContent) || 0), 0));
  pruefe('Karte: Summe der Punkte = offene Aufträge', offenKarte === Number(sql("SELECT count(*) FROM wartungsauftrag WHERE status <> 'erledigt'")), offenKarte);
  pruefe('Karte: Weltebene ohne Scrollbalken', (await p.$eval('.ebene-neu', (e) => getComputedStyle(e).overflowY)) === 'hidden');
  pruefe('Karte: Welt- und Europakarte mit 8 Ländern', (await p.$$eval('.wkarte .karten-punkt', (z) => z.length)) === Number(sql('SELECT count(DISTINCT land_kuerzel) FROM standort')) && (await p.$$eval('.wkarte .karten-punkt', (z) => z.length)) === 8);
  await p.evaluate(() => { window.__ohneNeuladen = true; });
  await p.click('.ebene-neu [data-ort="land-US"]'); await p.waitForTimeout(800);
  const offenUS = await p.$$eval('.ebene-neu .dkarte .punkt-blase', (z) => z.reduce((s, e) => s + (Number(e.textContent) || 0), 0));
  pruefe('Karte: Zoom auf USA (2 Werke, Adresse ?land=us, offene = Datenbank)', p.url().endsWith('/karte?land=us') && (await p.$$eval('.ebene-neu .karten-punkt', (z) => z.length)) === 2
    && offenUS === Number(sql("SELECT count(*) FROM wartungsauftrag w JOIN stoermeldung s ON s.id=w.stoermeldung_id JOIN maschine m ON m.id=s.maschine_id JOIN gebaeude g ON g.id=m.gebaeude_id JOIN standort st ON st.id=g.standort_id WHERE st.land_kuerzel='US' AND w.status <> 'erledigt'")), `${p.url()} ${offenUS}`);
  await p.click('.ebene-neu button[aria-label^="Werk Detroit"]'); await p.waitForTimeout(800);
  pruefe('Karte: Werk Detroit mit Gebäuden und Technikern', (await p.$('.ebene-neu .lageplan')) !== null && (await p.textContent('.explorer-info')).includes('Jason Miller'));
  await p.click('.explorer-pfad button:has-text("Weltweit")'); await p.waitForTimeout(800);
  pruefe('Karte: Pfad zoomt zur Welt', (await p.$('.ebene-neu .wkarte')) !== null && p.url().endsWith('/karte'), p.url());
  await p.click('.ebene-neu [data-ort="land-DE"]'); await p.waitForTimeout(800);
  await p.click('.ebene-neu .dkarte button[aria-label^="Werk Hamburg"]'); await p.waitForTimeout(700);
  pruefe('Karte: Zoom auf Hamburg, Adresse ?werk=ham', p.url().endsWith('/karte?werk=ham') && (await p.textContent('.buehne-titel')) === 'Werk Hamburg', p.url());
  const offeneHam = await p.$$eval('.explorer-info a[href^="/auftraege/"]', (z) => z.length);
  pruefe('Karte: offene Störungen im Werk = Datenbank', offeneHam === Number(sql("SELECT count(*) FROM wartungsauftrag w JOIN stoermeldung s ON s.id=w.stoermeldung_id JOIN maschine m ON m.id=s.maschine_id JOIN gebaeude g ON g.id=m.gebaeude_id JOIN standort st ON st.id=g.standort_id WHERE st.kuerzel='HAM' AND w.status <> 'erledigt'")), offeneHam);
  pruefe('Karte: Techniker vor Ort angezeigt', (await p.$$eval('.explorer-info .ort-zeile', (z) => z.length)) === 2);
  await p.click('.ebene-neu .lageplan button[aria-label^="Halle 2"]'); await p.waitForTimeout(700);
  pruefe('Karte: Zoom auf Halle 2, Adresse ?werk=ham&halle=h2', p.url().endsWith('/karte?werk=ham&halle=h2'), p.url());
  pruefe('Karte: kein Neuladen beim Zoomen', await p.evaluate(() => window.__ohneNeuladen === true));
  const erste = await p.$('.ebene-neu .grundriss .plan-maschine');
  await erste.click(); await p.waitForTimeout(300);
  pruefe('Grundriss: Klick zeigt Maschinen-Details', (await p.textContent('main')).includes('Störung an dieser Maschine melden'));
  pruefe('Grundriss: Maschine steht in der Adresse', /[?&]maschine=\d+$/.test(p.url()), p.url());
  await p.click('.buehne-kopf button[aria-label="Herauszoomen"]'); await p.waitForTimeout(700);
  pruefe('Zurück-Knopf zoomt zum Werk', p.url().endsWith('/karte?werk=ham') && (await p.$('.ebene-neu .lageplan')) !== null, p.url());
  await p.goto(BASE + '/karte/ham/h2?maschine=abc');
  pruefe('Alte Adresse /karte/ham/h2 leitet um', /werk=ham/.test(p.url()) && /halle=h2/.test(p.url()) && (await p.$('.ebene-neu .grundriss')) !== null, p.url());
  await p.goto(`${BASE}/auftraege/${auftrag}`);
  await p.click('a:has-text("Auf der Karte zeigen")'); await p.waitForTimeout(1000);
  pruefe('Auftrag → Karte markiert die Maschine', p.url().includes('/karte?werk=dor&halle=h1&maschine=' + gewaehlteMaschine) && (await p.$('.plan-maschine.gewaehlt')) !== null, p.url());
  // Übersicht: zuerst die Liste, darunter rechts die kleine Karte; Klick öffnet die Störungskarte im Werk
  await p.goto(BASE + '/'); await p.waitForTimeout(800);
  const yListe = (await (await p.$('main h2:has-text("Offene Störmeldungen")')).boundingBox()).y;
  const yKarte = (await (await p.$('main .wkarte')).boundingBox()).y;
  pruefe('Übersicht: Liste vor der kleinen Karte', yListe < yKarte, `${yListe} / ${yKarte}`);
  await p.click('main .wkarte [data-ort="land-CN"]'); await p.waitForURL('**/karte?land=cn');
  pruefe('Übersicht: Klick auf Land öffnet die Störungskarte dort', (await p.textContent('.buehne-titel')) === 'China');
  await p.goto(BASE + '/'); await p.waitForTimeout(800);
  // Seitenleiste
  const offenDb = Number(sql("SELECT count(*) FROM wartungsauftrag WHERE status <> 'erledigt'"));
  pruefe('Seitenleiste: Zahl offener Aufträge', (await p.textContent('.leiste-link[href="/auftraege"] .leiste-zahl')) === String(offenDb));
  pruefe('Seitenleiste: aufgeklappt auf breitem Bildschirm', (await p.getAttribute('html', 'data-leiste')) === 'auf');
  await p.click('.leiste-umschalter'); await p.waitForTimeout(900);   // Breite ändert sich animiert
  const breiteZu = (await (await p.$('.seitenleiste')).boundingBox()).width;
  pruefe('Seitenleiste: einklappen (nur Symbole)', (await p.getAttribute('html', 'data-leiste')) === 'zu' && breiteZu < 90, breiteZu);
  await p.reload(); await p.waitForTimeout(600);
  pruefe('Seitenleiste: Zustand bleibt nach Neuladen', (await p.getAttribute('html', 'data-leiste')) === 'zu');
  await p.hover('.leiste-link[href="/statistik"]'); await p.waitForTimeout(300);
  pruefe('Seitenleiste: Name erscheint beim Darüberfahren', await p.isVisible('.leiste-link[href="/statistik"] .leiste-text'));
  await p.click('.leiste-konto'); await p.waitForTimeout(200);
  pruefe('Konto-Menü mit Abmelden', await p.isVisible('.aufklapp-menue button:has-text("Abmelden")'));
  await p.keyboard.press('Escape');
  await p.click('.leiste-umschalter'); await p.waitForTimeout(400);
  pruefe('Seitenleiste: wieder aufklappen', (await p.getAttribute('html', 'data-leiste')) === 'auf');

  // 15. Statistik = View
  await p.goto(BASE + '/statistik?von=2000-01-01&bis=2100-12-31');
  await p.waitForTimeout(1500);
  const mttr = Number(sql("SELECT round(avg(reparaturdauer_minuten)/60, 1) FROM v_stoerung_details WHERE status='erledigt'"));
  const text = await p.textContent('.kennzahl');
  pruefe('MTTR Statistikseite = View', text.includes(mttr.toLocaleString('de-DE', { minimumFractionDigits: 1 })), `${text} vs ${mttr}`);
  // 15b. Statistik zoomen: alle Standorte → Werk → Gebäude → Maschine, ohne Neuladen
  await p.goto(BASE + '/statistik?von=2000-01-01&bis=2100-12-31'); await p.waitForTimeout(1200);
  await p.evaluate(() => { window.__ohneNeuladen = true; });
  pruefe('Statistik: 8 Länder im Vergleich', (await p.$$eval('.stat-kachel', (z) => z.length)) === 8);
  await p.click('.stat-kachel:has-text("Deutschland")'); await p.waitForTimeout(900);
  const deAnzahl = Number(sql("SELECT count(*) FROM stoermeldung s JOIN maschine m ON m.id=s.maschine_id JOIN gebaeude g ON g.id=m.gebaeude_id JOIN standort st ON st.id=g.standort_id WHERE st.land_kuerzel='DE'"));
  pruefe('Statistik: Zoom auf Deutschland (10 Werke, Anzahl, Adresse)', (await p.textContent('h1')) === 'Deutschland' && /land=de/.test(p.url())
    && (await p.$$eval('.stat-kachel', (z) => z.length)) === 10 && (await p.textContent('.kennzahl >> nth=2')).includes(String(deAnzahl)), deAnzahl);
  await p.click('.stat-kachel:has-text("Werk Hamburg")'); await p.waitForTimeout(900);
  const hamAnzahl = Number(sql("SELECT count(*) FROM stoermeldung s JOIN maschine m ON m.id=s.maschine_id JOIN gebaeude g ON g.id=m.gebaeude_id JOIN standort st ON st.id=g.standort_id WHERE st.kuerzel='HAM'"));
  const hamText = await p.textContent('.kennzahl >> nth=2');
  pruefe('Statistik: Zoom auf Werk Hamburg (Titel, Adresse, Anzahl)', (await p.textContent('h1')) === 'Werk Hamburg' && /werk=ham/.test(p.url()) && hamText.includes(String(hamAnzahl)), `${hamText} vs ${hamAnzahl}`);
  const hamMttr = Number(sql("SELECT round(avg(extract(epoch from (w.ende_zeit - w.start_zeit))/3600)::numeric, 1) FROM wartungsauftrag w JOIN stoermeldung s ON s.id=w.stoermeldung_id JOIN maschine m ON m.id=s.maschine_id JOIN gebaeude g ON g.id=m.gebaeude_id JOIN standort st ON st.id=g.standort_id WHERE st.kuerzel='HAM' AND w.status='erledigt'"));
  pruefe('Statistik: MTTR Werk Hamburg = Datenbank', (await p.textContent('.kennzahl')).includes(hamMttr.toLocaleString('de-DE', { minimumFractionDigits: 1 })), hamMttr);
  await p.click('.stat-kachel >> nth=0'); await p.waitForTimeout(900);
  pruefe('Statistik: Zoom auf Gebäude (Maschinen im Vergleich)', (await p.textContent('main')).includes('Maschinen im Vergleich') && /halle=/.test(p.url()));
  await p.click('.stat-kachel >> nth=0'); await p.waitForTimeout(900);
  pruefe('Statistik: Zoom auf Maschine (eigene Störungen)', (await p.textContent('main')).includes('Störungen dieser Maschine') && /maschine=\d+/.test(p.url()));
  pruefe('Statistik: kein Neuladen beim Zoomen', await p.evaluate(() => window.__ohneNeuladen === true));
  await p.click('.stat-pfad button:has-text("Weltweit")'); await p.waitForTimeout(900);
  pruefe('Statistik: Pfad zoomt heraus', (await p.textContent('h1')) === 'Statistik' && (await p.$$eval('.stat-kachel', (z) => z.length)) === 8);
  const neueAuswertungen = ['Verfügbarkeit pro Monat', 'Reaktionszeit nach Priorität', 'Größte Zeitfresser (Pareto)', 'Offene Aufträge nach Alter', 'Störungen nach Maschinenalter'];
  const titelDa = await p.$$eval('.abschnitt-titel', (z) => z.map((h) => h.textContent));
  pruefe('Statistik: weitere Auswertungen (Verfügbarkeit, Reaktionszeit, Pareto, Alter)', neueAuswertungen.every((x) => titelDa.includes(x)), titelDa.join(' | '));
  pruefe('Statistik: Diagramme gezeichnet', (await p.$$eval('.stat-ebene canvas', (z) => z.length)) === 4 && (await p.$$eval('.heat-zelle', (z) => z.length)) >= 56);
  await p.goto(BASE + '/statistik'); await p.waitForTimeout(1500);
  await p.screenshot({ path: SHOTS + 'n-statistik-hell.png', fullPage: true });

  // 15c. Datenbasis: Tabellen, Beziehungen, Vorschau, Verbindungen
  await p.goto(BASE + '/datenbasis'); await p.waitForTimeout(2000);
  pruefe('Datenbasis: 12 Tabellen im Diagramm', (await p.$$eval('.er-tabelle', (z) => z.length)) === 12);
  pruefe('Datenbasis: Beziehungslinien gezeichnet', (await p.$$eval('.er-linie', (z) => z.length)) === 15, await p.$$eval('.er-linie', (z) => z.length));
  pruefe('Datenbasis: 5 Views', (await p.$$eval('.er-view', (z) => z.length)) === 5);
  pruefe('Datenbasis: Verbindung zur Datenbank geprüft', (await p.textContent('.verbund-knoten[style*="db"]')).includes('verbunden'));
  await p.click('.er-tabelle:has-text("maschine") >> nth=0'); await p.waitForTimeout(1200);
  const maschinen = Number(sql('SELECT count(*) FROM maschine'));
  pruefe('Datenbasis: Vorschau der Tabelle maschine', (await p.$$eval('.er-vorschau tbody tr', (z) => z.length)) === 25 && (await p.textContent('.er-detail')).includes(`(${maschinen})`));
  await p.click('.er-detail button[aria-label="Nächste Seite"]'); await p.waitForTimeout(800);
  pruefe('Datenbasis: Blättern in der Vorschau', (await p.textContent('.er-detail')).includes('Seite 2 von'));
  const fremd = await p.evaluate(() => fetch('/api/datenbasis/pg_user').then((r) => r.status));
  pruefe('Datenbasis: fremde Tabelle wird abgelehnt', fremd === 404, fremd);
  const boese = await p.evaluate(() => fetch('/api/datenbasis/' + encodeURIComponent('maschine; DROP TABLE x')).then((r) => r.status));
  pruefe('Datenbasis: manipulierter Name wird abgelehnt', boese === 404, boese);
  konsole.length = 0;   // die beiden 404 eben waren Absicht

  // 16. Dunkelmodus umschalten
  await p.click('button[aria-label^="Darstellung"]');
  await p.click('button[role=menuitemradio]:has-text("Dunkel")');
  await p.waitForTimeout(1200);
  pruefe('Dunkelmodus aktiv', (await p.getAttribute('html', 'data-theme')) === 'dark');
  await p.screenshot({ path: SHOTS + 'n-statistik-dunkel.png', fullPage: true });
  await p.goto(BASE + '/'); await p.waitForTimeout(1200);
  pruefe('Dunkelmodus bleibt nach Neuladen', (await p.getAttribute('html', 'data-theme')) === 'dark');
  await p.screenshot({ path: SHOTS + 'n-index-dunkel.png', fullPage: true });
  await p.goto(BASE + '/melden'); await p.waitForTimeout(800);
  await p.screenshot({ path: SHOTS + 'n-melden-dunkel.png', fullPage: true });

  // 17. Tablet / Smartphone
  const t = await b.newPage({ viewport: { width: 820, height: 1000 }, colorScheme: 'light' });
  await t.goto(BASE + '/auftraege'); await t.waitForTimeout(800);
  pruefe('Tablet: kein seitliches Scrollen', (await t.evaluate(() => document.documentElement.scrollWidth)) <= 820);
  await t.screenshot({ path: SHOTS + 'n-auftraege-tablet.png' });
  const h = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await h.goto(BASE + '/'); await h.waitForTimeout(800);
  pruefe('Handy: kein seitliches Scrollen', (await h.evaluate(() => document.documentElement.scrollWidth)) <= 390, await h.evaluate(() => document.documentElement.scrollWidth));
  pruefe('Handy: Seitenleiste zunächst verborgen', !(await h.isVisible('.leiste-link[href="/auftraege"]')));
  await h.click('.mobil-kopf .rund-knopf'); await h.waitForTimeout(400);
  pruefe('Handy: Menü öffnet die Seitenleiste', await h.isVisible('.leiste-link[href="/auftraege"]'));
  await h.screenshot({ path: SHOTS + 'n-handy-menue.png' });
  await h.click('.leiste-link[href="/auftraege"]'); await h.waitForURL(BASE + '/auftraege');
  // Die Auftragsliste ist lang – bis sie aufgebaut ist, darf das Schließen etwas dauern
  const zu = await h.waitForSelector('.leiste-link[href="/statistik"]', { state: 'hidden', timeout: 3000 }).then(() => true, () => false);
  pruefe('Handy: Menü schließt nach Seitenwechsel', zu);
  await h.goto(BASE + '/karte?werk=stg&halle=h1'); await h.waitForTimeout(1000);
  pruefe('Handy: Grundriss ohne seitliches Scrollen der Seite', (await h.evaluate(() => document.documentElement.scrollWidth)) <= 390);

  // 18. Sprache: Englisch einschalten, prüfen, wieder Deutsch
  await p.goto(BASE + '/'); await p.waitForTimeout(800);
  await p.click('button[aria-label^="Sprache"]');
  await p.click('.aufklapp-menue button[lang="en"]'); await p.waitForTimeout(1500);
  pruefe('Sprache: Englisch (Überschrift, html lang)', (await p.textContent('h1')) === 'Overview' && (await p.getAttribute('html', 'lang')) === 'en');
  pruefe('Sprache: Seitenleiste auf Englisch', (await p.textContent('.seitenleiste')).includes('Work orders'));
  await p.goto(BASE + '/melden?maschine=3'); await p.waitForTimeout(800);
  await p.fill('#gemeldet_von', ''); await p.fill('#beschreibung', 'kurz');
  await p.click('button[type=submit]'); await p.waitForSelector('.invalid-feedback');
  pruefe('Sprache: Fehlermeldungen vom Server auf Englisch', (await p.content()).includes('Please enter your name.'));
  await p.goto(BASE + '/statistik'); await p.waitForTimeout(1200);
  pruefe('Sprache: Statistik auf Englisch', (await p.textContent('main')).includes('Countries compared'));
  await p.click('button[aria-label^="Language"]');
  await p.click('.aufklapp-menue button[lang="de"]'); await p.waitForTimeout(1500);
  pruefe('Sprache: zurück auf Deutsch', (await p.textContent('h1')) === 'Statistik' && (await p.getAttribute('html', 'lang')) === 'de');

  // 19b. 3D-Ansicht: Werk mit Hallen, Klick in die Halle, Maschinen mit Störungen, zurück, 2D
  // Eigener Browser mit WebGL ohne Grafikkarte (Software-Rendering, langsam – deshalb nur hier)
  const b3 = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const p3 = await b3.newPage({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Berlin' });
  p3.on('pageerror', (e) => konsole.push('PAGEERROR 3D ' + e.message));
  { const p = p3;
  await p.goto(BASE + '/karte?werk=alb'); await p.waitForTimeout(800);
  pruefe('3D: Umschalter 2D/3D im Werk', await p.isVisible('.raum-schalter'));
  await p.click('.raum-schalter button:has-text("3D")');
  const hallenAlb = Number(sql("SELECT count(*) FROM gebaeude g JOIN standort s ON s.id=g.standort_id WHERE s.kuerzel='ALB'"));
  await p.waitForFunction((n) => document.querySelectorAll('.raum-halle').length >= n, hallenAlb, { timeout: 60000 }).catch(() => {});
  pruefe('3D: Werk mit Beschriftung je Halle', (await p.$('.raum canvas')) !== null && (await p.$$eval('.raum-halle', (z) => z.length)) === hallenAlb);
  await p.screenshot({ path: SHOTS + 'r-werk-3d.png' });
  await p.click('.raum-halle:has-text("H1")');
  const offenH1 = Number(sql("SELECT count(DISTINCT m.id) FROM maschine m JOIN gebaeude g ON g.id=m.gebaeude_id JOIN standort s ON s.id=g.standort_id JOIN stoermeldung sm ON sm.maschine_id=m.id JOIN wartungsauftrag w ON w.stoermeldung_id=sm.id WHERE s.kuerzel='ALB' AND g.kuerzel='H1' AND w.status <> 'erledigt'"));
  await p.waitForFunction((n) => document.querySelectorAll('.raum-marke').length >= n, offenH1, { timeout: 60000 }).catch(() => {});
  pruefe('3D: Halle – Adresse und Störungen an den Maschinen', /halle=h1/.test(p.url()) && (await p.$$eval('.raum-marke', (z) => z.length)) === offenH1, `${p.url()} ${offenH1}`);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: SHOTS + 'r-halle-3d.png' });
  if (offenH1 > 0) {
    await p.click('.raum-marke >> nth=0'); await p.waitForTimeout(800);
    pruefe('3D: Klick auf Maschine zeigt Details', (await p.textContent('main')).includes('Störung an dieser Maschine melden') && /maschine=\d+/.test(p.url()));
    await p.waitForSelector('.maschine-detail-3d canvas', { timeout: 60000 }).catch(() => {});
    const ampel = await p.getAttribute('.ampel-zeile', 'class');
    pruefe('3D: Detail mit drehendem Modell und Ampel (orange/rot bei Störung)', (await p.$('.maschine-detail-3d canvas')) !== null && /ampel-(orange|rot)/.test(ampel ?? ''), ampel);
  }
  await p.click('.buehne-kopf button[aria-label="Herauszoomen"]'); await p.waitForTimeout(1500);
  pruefe('3D: zurück zum Werk ohne Neuladen der Szene', p.url().endsWith('/karte?werk=alb') && (await p.$$eval('.raum canvas', (z) => z.length)) === 1, p.url());
  // Easter Egg: Verwaltungsgebäude suchen (Schild beim Darüberfahren), anklicken → Versteckspiel
  await p.waitForTimeout(1500);
  const flaeche = await (await p.$('.raum canvas')).boundingBox();
  let verwaltung = null;
  suche: for (let y = 0.3; y < 0.75; y += 0.03) {
    for (let x = 0.4; x < 0.85; x += 0.03) {
      await p.mouse.move(flaeche.x + flaeche.width * x, flaeche.y + flaeche.height * y); await p.waitForTimeout(40);
      if (await p.$('.raum-name:has(.bi-cup-hot)')) { verwaltung = [x, y]; break suche; }
    }
  }
  pruefe('3D: Verwaltung zeigt beim Darüberfahren ihr Schild', verwaltung !== null);
  if (verwaltung) {
    await p.mouse.click(flaeche.x + flaeche.width * verwaltung[0], flaeche.y + flaeche.height * verwaltung[1]);
    await p.waitForSelector('.versteck-intro', { timeout: 15000 }).catch(() => {});
    pruefe('Versteckspiel: Verwaltung öffnet sich mit Aufgabe (5 Dinge)', (await p.$$eval('.versteck-intro .versteck-dinge span', (z) => z.length)) === 5
      && (await p.$$('.raum-halle')).length === 0);
    await p.click('.versteck-intro .btn-primary'); await p.waitForTimeout(600);
    await p.click('.versteck .bi-lightbulb');
    pruefe('Versteckspiel: Zeit läuft, Tipp gesperrt solange er leuchtet', (await p.isVisible('.versteck-zeit')) && (await p.isDisabled('.versteck button:has(.bi-lightbulb)')));
    await p.screenshot({ path: SHOTS + 'r-versteckspiel.png' });
    await p.keyboard.press('Escape'); await p.waitForTimeout(1500);
    pruefe('Versteckspiel: Esc schließt, Werk wieder mit Beschriftungen', !(await p.$('.versteck')) && (await p.$$('.raum-halle')).length === hallenAlb);
  }
  await p.click('.raum-schalter button:has-text("2D")'); await p.waitForTimeout(800);
  // Melden in 3D: neutral (keine Störungszahlen), Maschine über die Liste wählen
  await p.click('.raum-schalter button:has-text("3D")'); await p.waitForTimeout(300);
  await p.goto(BASE + '/melden?standort=' + sql("SELECT id FROM standort WHERE kuerzel='ALB'"));
  await p.waitForFunction((n) => document.querySelectorAll('.raum-halle').length >= n, hallenAlb, { timeout: 60000 }).catch(() => {});
  pruefe('Melden 3D: Werk in 3D ohne Störungszahlen', (await p.$('.explorer-melden .raum canvas')) !== null && (await p.$$('.explorer-melden .raum-halle .zaehl-marke')).length === 0);
  await p.click('.raum-halle:has-text("H1")'); await p.waitForTimeout(1500);
  await p.click('.explorer-info button:has-text("ALB-H1-01")');
  await p.waitForSelector('#beschreibung', { timeout: 15000 }).catch(() => {});
  pruefe('Melden 3D: Maschine gewählt, Formular offen', (await p.$('#beschreibung')) !== null && (await p.textContent('.auswahl-chip')).includes('ALB-H1-01'));
  await p.goto(BASE + '/karte?werk=alb'); await p.waitForTimeout(1500);
  await p.click('.raum-schalter button:has-text("2D")'); await p.waitForTimeout(800);
  pruefe('2D: Lageplan wieder da, Wahl gemerkt', (await p.$('.ebene-neu .lageplan')) !== null && (await p.evaluate(() => localStorage.getItem('kartenansicht'))) === '2d');
  }
  await b3.close();

  // 19. Personen & Rollen
  await p.goto(BASE + '/'); await p.waitForTimeout(800);
  pruefe('Person: ohne Wahl Hinweis auf der Übersicht', await p.isVisible('.person-hinweis'));
  await p.click('.leiste-konto');
  pruefe('Person: Konto zeigt Anmeldung und "Keine Person gewählt"', (await p.textContent('.konto-menue')).includes('Angemeldet als') && (await p.textContent('.konto-menue')).includes('Keine Person gewählt'));
  await p.click('.konto-menue button:has-text("Person wählen")');
  await p.waitForSelector('.person-knopf');
  pruefe('Person: Auswahl zeigt 76 Personen', (await p.$$eval('.person-knopf', (z) => z.length)) === 76, await p.$$eval('.person-knopf', (z) => z.length));
  await p.click('.rollen-filter button:has-text("Instandhaltung")');
  pruefe('Person: Filter Rolle Instandhaltung → 38', (await p.$$eval('.person-knopf', (z) => z.length)) === 38);
  await p.fill('.person-filter input', 'China');
  pruefe('Person: Suche nach Land', (await p.$$eval('.person-knopf', (z) => z.length)) === 4);
  await p.fill('.person-filter input', '');
  await p.screenshot({ path: SHOTS + 'p-personwahl.png' });
  // Techniker mit offenen Aufträgen wählen
  const [techId, techName, techOffen] = sql("SELECT t.id || '|' || t.name || '|' || count(*) FROM wartungsauftrag w JOIN techniker t ON t.id = w.techniker_id WHERE w.status <> 'erledigt' GROUP BY t.id ORDER BY count(*) DESC, t.id LIMIT 1").split('|');
  const techPerson = sql(`SELECT id FROM person WHERE techniker_id = ${techId}`);
  await p.fill('.person-filter input', techName);
  await p.click(`.person-knopf:has-text("${techName}")`);
  await p.waitForSelector('.aufgaben-liste, .aufgaben-karte .leer'); await p.waitForTimeout(500);
  pruefe('Person: Seitenleiste zeigt die gewählte Person', (await p.textContent('.leiste-konto')).includes(techName));
  pruefe('Person: "Dir zugewiesene Aufgaben" mit den offenen Aufträgen', (await p.textContent('.aufgaben-karte h2')) === 'Dir zugewiesene Aufgaben'
    && (await p.$$eval('.aufgaben-liste li', (z) => z.length)) === Math.min(6, Number(techOffen)), `${await p.$$eval('.aufgaben-liste li', (z) => z.length)} / ${techOffen}`);
  pruefe('Person: zugewiesen von … wird angezeigt', (await p.textContent('.aufgaben-liste')).includes('zugewiesen von'));
  await p.screenshot({ path: SHOTS + 'p-uebersicht-techniker.png', fullPage: false });
  // Nicht zugewiesenen Auftrag übernehmen: "Mir zuweisen"
  const freiId = sql("SELECT w.id FROM wartungsauftrag w WHERE w.techniker_id IS NULL AND w.status = 'gemeldet' ORDER BY w.id LIMIT 1");
  await p.goto(BASE + '/auftraege/' + freiId); await p.waitForTimeout(500);
  await p.click('button:has-text("Mir zuweisen")');
  pruefe('Person: "Mir zuweisen" wählt Techniker und Status', (await p.inputValue('input[name=techniker_id]')) === techId && (await p.inputValue('input[name=status]')) === 'zugewiesen');
  await Promise.all([p.waitForResponse((r) => r.request().method() === 'POST'), p.click('form:has(#status) button[type=submit]')]);
  await p.waitForTimeout(800);
  pruefe('Person: Zuweisung mit zugewiesen_von gespeichert', sql(`SELECT techniker_id || '|' || zugewiesen_von FROM wartungsauftrag WHERE id = ${freiId}`) === `${techId}|${techPerson}`);
  pruefe('Person: Verlauf in der Datenbank', sql(`SELECT string_agg(aktion || ':' || person_id, ',' ORDER BY id) FROM auftrag_verlauf WHERE auftrag_id = ${freiId}`) === `zugewiesen:${techPerson},status:${techPerson}`);
  await p.goto(BASE + '/auftraege/' + freiId); await p.waitForTimeout(500);
  pruefe('Person: Verlauf auf der Seite', (await p.textContent('.verlauf')).includes(`${techName} hat ${techName} zugewiesen`) && (await p.textContent('main')).includes(`zugewiesen von ${techName}`));
  await p.screenshot({ path: SHOTS + 'p-auftrag-verlauf.png', fullPage: true });
  // Schichtleitung Hamburg
  await p.click('.leiste-konto'); await p.click('.konto-menue button:has-text("Person wechseln")');
  await p.fill('.person-filter input', 'Oliver Franke'); await p.click('.person-knopf:has-text("Oliver Franke")');
  await p.waitForTimeout(800); await p.goto(BASE + '/'); await p.waitForTimeout(500);
  pruefe('Person: Schichtleitung sieht "Aufgaben in deinem Werk"', (await p.textContent('.aufgaben-karte h2')) === 'Aufgaben in deinem Werk' && (await p.textContent('.aufgaben-liste')).includes('Hamburg'));
  // Produktion Hamburg: darf melden, aber nicht bearbeiten
  await p.click('.leiste-konto'); await p.click('.konto-menue button:has-text("Person wechseln")');
  await p.fill('.person-filter input', 'Julia Krause'); await p.click('.person-knopf:has-text("Julia Krause")');
  await p.waitForTimeout(800);
  const julia = sql("SELECT id FROM person WHERE name = 'Julia Krause'");
  await p.goto(BASE + '/auftraege/' + freiId); await p.waitForTimeout(500);
  pruefe('Person: Produktion – Formular gesperrt mit Hinweis', (await p.isDisabled('#status')) && (await p.textContent('main')).includes('keine Aufträge bearbeiten') && !(await p.$('form:has(#status) button[type=submit]')) && !(await p.$('#ersatzteil_id')));
  await p.evaluate(() => { const f = document.querySelector('form:has(#status)'); f.querySelector('fieldset').disabled = false; f.querySelector('input[name=status]').value = 'erledigt'; f.requestSubmit(); });
  await p.waitForSelector('.hinweis-fehler');
  pruefe('Person: Produktion – Server lehnt Speichern ab', (await p.textContent('.hinweis-fehler')).includes('keine Aufträge bearbeiten') && sql(`SELECT status FROM wartungsauftrag WHERE id = ${freiId}`) === 'zugewiesen');
  await p.goto(BASE + '/melden'); await p.waitForTimeout(800);
  pruefe('Person: Melden startet im eigenen Werk', (await p.$('.ebene-neu .lageplan')) !== null && (await p.textContent('.explorer-melden')).includes('Hamburg'));
  await p.goto(BASE + '/melden?maschine=3'); await p.waitForTimeout(500);
  pruefe('Person: "Gemeldet von" vorbelegt', (await p.inputValue('#gemeldet_von')) === 'Julia Krause');
  await p.fill('#beschreibung', 'Test der Personenwahl beim Melden'); await waehle(p, 'ursache_kategorie', 'Sonstiges');
  await Promise.all([p.waitForURL(BASE + '/'), p.click('button[type=submit]')]);
  pruefe('Person: Meldung mit Person im Verlauf', sql('SELECT person_id FROM auftrag_verlauf WHERE auftrag_id = (SELECT max(id) FROM wartungsauftrag) AND aktion = \'gemeldet\'') === julia);
  await p.waitForTimeout(500);
  await p.screenshot({ path: SHOTS + 'p-auftrag-produktion.png', fullPage: true });
  // Ohne Person
  await p.click('.leiste-konto'); await p.click('.konto-menue button:has-text("Person wechseln")');
  await p.click('.dialog-fuss button'); await p.waitForTimeout(800);
  await p.goto(BASE + '/'); await p.waitForTimeout(500);
  pruefe('Person: "Ohne Person arbeiten" setzt zurück', await p.isVisible('.person-hinweis'));

  // 20. Ansicht (Konto): nur Werk Hamburg, danach wieder alles
  await p.goto(BASE + '/'); await p.waitForTimeout(800);
  await p.click('.leiste-konto'); await p.click('.konto-menue button:has-text("Person wählen")');
  await p.waitForSelector('.person-auftraege');
  const techOffen1 = sql("SELECT t.name || '|' || count(*) FROM wartungsauftrag w JOIN techniker t ON t.id=w.techniker_id WHERE w.status <> 'erledigt' GROUP BY t.name ORDER BY count(*) DESC, t.name LIMIT 1").split('|');
  pruefe('Person: Zahl offener Aufträge in der Auswahl', (await p.textContent(`.person-knopf:has-text("${techOffen1[0]}")`)).includes(`${techOffen1[1]} offene Aufträge`), techOffen1.join(' '));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.leiste-konto'); await p.waitForTimeout(800);
  await waehle(p, 'ansicht-werk', sql("SELECT id FROM standort WHERE kuerzel='HAM'")); await p.waitForTimeout(1500);
  const hamOffen = sql("SELECT count(*) FROM wartungsauftrag w JOIN stoermeldung s ON s.id=w.stoermeldung_id JOIN maschine m ON m.id=s.maschine_id JOIN gebaeude g ON g.id=m.gebaeude_id JOIN standort st ON st.id=g.standort_id WHERE st.kuerzel='HAM' AND w.status <> 'erledigt'");
  await p.goto(BASE + '/'); await p.waitForTimeout(1200);
  pruefe('Ansicht: Übersicht zeigt Hinweis und Zahlen nur für Hamburg', (await p.textContent('.ansicht-chip')).includes('Werk Hamburg') && (await p.textContent('.kennzahl >> nth=0')).includes(hamOffen)
    && (await p.textContent('.leiste-link[href="/auftraege"]')).includes(hamOffen), hamOffen);
  await p.goto(BASE + '/auftraege'); 
  pruefe('Ansicht: Aufträge nur aus Hamburg', (await p.textContent('h1 + p')).includes(sql("SELECT count(*) FROM stoermeldung s JOIN maschine m ON m.id=s.maschine_id JOIN gebaeude g ON g.id=m.gebaeude_id JOIN standort st ON st.id=g.standort_id WHERE st.kuerzel='HAM'")));
  await p.goto(BASE + '/karte'); await p.waitForTimeout(1000);
  pruefe('Ansicht: Karte startet im Werk Hamburg', (await p.textContent('.buehne-titel')) === 'Werk Hamburg');
  await p.click('.explorer-pfad button:has-text("Weltweit")'); await p.waitForTimeout(800);
  pruefe('Ansicht: Karte zeigt nur das gewählte Land/Werk', (await p.$$eval('.ebene-neu .karten-punkt', (z) => z.length)) === 1 && (await p.$$eval('.explorer-info .ort-liste li', (z) => z.length)) === 1);
  await p.click('.ebene-neu [data-ort="land-DE"]'); await p.waitForTimeout(800);
  pruefe('Ansicht: im Land nur das gewählte Werk', (await p.$$eval('.ebene-neu .karten-punkt', (z) => z.length)) === 1);
  await p.click('.leiste-konto'); await p.waitForTimeout(500); await waehle(p, 'ansicht-land', ''); await p.waitForTimeout(1500);
  await p.goto(BASE + '/'); await p.waitForTimeout(800);
  pruefe('Ansicht: zurück auf alles', (await p.$('.ansicht-chip')) === null);

  pruefe('Keine JavaScript-Fehler in der Konsole', konsole.length === 0, konsole.slice(0, 3).join(' | '));
  console.log('\nERGEBNIS:', fehler.length === 0 ? 'alles OK' : `${fehler.length} Fehler: ${fehler.join(', ')}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
