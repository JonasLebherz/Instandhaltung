# CLAUDE.md

## Projekt

Instandhaltungsmanagement als Webanwendung. Hochschulprojekt „Company database“ im Fach Digital Production (HS Albstadt-Sigmaringen, Abgabe 21.01.2027).
Zielgruppe: Produktionsmitarbeiter, Schichtleiter, Instandhaltungstechniker.

**Technik:** Next.js 15 (App Router, React 19, **JavaScript**, kein TypeScript), Datenbank **Supabase/PostgreSQL**, Hosting **Vercel**.
Die frühere Version mit PHP, MySQL und XAMPP liegt im Branch `php-xampp` und wird nicht mehr weiterentwickelt.
Laut Aufgabenstellung gibt es keine Technik-Vorgabe. Der Wechsel wurde mit den Betreuern abgestimmt bzw. wird noch abgestimmt.

## Stand

- **Live:** Die App läuft bei Vercel mit Supabase. Login funktioniert.
- **Fertig:** alle Seiten (Übersicht mit Karte oben, Melden über die Karte, Störungskarte mit Zoom Deutschland/Werk/Gebäude, Aufträge, Auftrag bearbeiten, Statistik, Login), Seitenleiste links, Logo, Glas-Design, Dunkelmodus, Animationen, `supabase/schema.sql` mit Views und RLS, `supabase/testdaten.sql`.
- **Beispielunternehmen:** 10 Standorte, 27 Gebäude, 107 Maschinen, 20 Techniker (2 pro Standort), 20 Ersatzteile, ca. 600 Meldungen über 12 Monate, davon 36 offen. Berlin hat bewusst keine offenen Störungen.
- **Getestet** gegen PostgreSQL 16 lokal: 106 Ende-zu-Ende-Prüfungen mit Playwright (alle Abläufe, Melden über die Karte, Zoom ohne Neuladen, Adressen der Karte, Seitenleiste, Validierung, Dunkelmodus, Tablet/Handy), Login-Schutz, RLS-Sperre für die Rolle `anon`.
- **Nach Schemaänderungen** muss in Supabase `schema.sql` + `testdaten.sql` erneut ausgeführt werden. Das setzt alle Daten zurück, Login-Konten bleiben erhalten.

## Team & andere KI-Assistenten

- Im Team arbeitet mindestens eine Person mit OpenAI Codex. Codex liest `AGENTS.md`, nicht diese Datei.
- `AGENTS.md` verweist auf `CLAUDE.md` und fasst die wichtigsten Regeln zusammen. Bei neuen Konventionen **beide Dateien** aktualisieren.
- Die Team-Anleitungen unter `docs/` (Codex-PDF) beschreiben noch den XAMPP-Ablauf und müssen auf Vercel/Supabase aktualisiert werden.

## Befehle

```bash
npm install          # Abhängigkeiten installieren
npm run dev          # Entwicklung auf http://localhost:3000 (braucht .env.local)
npm run build        # Produktions-Build – vor jedem Push ausführen, muss fehlerfrei sein
```

Lokales Testen ohne Supabase: `.env.local` mit `DATABASE_URL=postgresql://…@localhost:5432/…` und `LOGIN_DEAKTIVIERT=true`.
`LOGIN_DEAKTIVIERT` darf **nie** auf Vercel gesetzt werden.

## Aufbau & Konventionen

- **Seiten** sind Server-Komponenten in `app/**/page.js` mit `export const dynamic = 'force-dynamic'`. Jede Seite ruft zuerst `await benutzerPflicht()` auf (`lib/auth.js`).
- **Interaktive Teile** (Formulare, Seitenleiste, Karte, Diagramme) sind Client-Komponenten mit `'use client'` in eigenen Dateien.
- **Datenänderungen** laufen nur über Server-Aktionen in `app/aktionen.js` bzw. `app/login/aktionen.js`. Muster:
  1. `await benutzerPflicht()`
  2. Eingaben prüfen und bei Fehlern `return { fehler: { feld: 'Meldung' }, eingabe }` zurückgeben
  3. Speichern, mehrere Schreibzugriffe in `sql.begin(async (tx) => …)`
  4. `await flash(typ, text)`, `revalidatePath('/', 'layout')`, `redirect(…)`. `redirect` steht nie in try/catch.
- **Formulare** nutzen `useActionState` und werden mit `key={JSON.stringify(eingabe)}` neu aufgebaut, damit die Eingaben nach Fehlern erhalten bleiben (React setzt Formulare sonst zurück). Fehler zeigt `components/Feldfehler.js` an. Formulare haben `noValidate`, damit die Prüfung serverseitig auf Deutsch passiert.
- **Ladezeiten:** Jede Abfrage geht über das Internet zu Supabase. Deshalb:
  - Vercel-Funktionen laufen in Frankfurt (`vercel.json`: `"regions": ["fra1"]`), nah an der Supabase-Datenbank (eu-central-1). Liegt das Supabase-Projekt woanders, die Region anpassen.
  - Im Layout keine Datenbank-Abfragen: Es läuft bei jeder Anfrage. Die Zahl offener Aufträge holt die Seitenleiste selbst über `app/api/offene-auftraege/route.js`.
  - Pro Seite möglichst wenige Abfragen, gleichzeitig mit `Promise.all`. Daten wiederverwenden (z. B. nutzt die Übersicht die offenen Aufträge aus `alleKartenDaten()`).
  - `app/loading.js` zeigt sofort „Wird geladen …“. Folge des Streamings: `notFound()` liefert den Status 200 (mit „noindex“), der Inhalt „Nicht gefunden“ erscheint trotzdem.
- **Datenbank:** nur über `sql` aus `lib/db.js` (Bibliothek `postgres`). Werte **immer** als `${…}` im Tagged Template übergeben, nie per String-Verkettung. Dynamische Bedingungen werden aus `sql\`…\``-Bausteinen zusammengesetzt (siehe `app/auftraege/page.js`).
  - `COUNT(*)` liefert `bigint`, das kommt als String an. Deshalb immer `::int` casten. `AVG`/`ROUND` mit `::float` casten.
  - `prepare: false` wegen des Supabase-Transaction-Poolers.
- **Zeit:** Spalten sind `TIMESTAMPTZ`. Angezeigt wird immer in Europe/Berlin über `lib/format.js`. Eingaben aus `datetime-local` gehen über `berlinZuDate()`, Werte für Eingabefelder über `fuerDatetimeInput()`. In SQL `AT TIME ZONE 'Europe/Berlin'` für Monatsgruppierungen.
- **Hinweise nach Weiterleitung:** `flash()` (`lib/flash.js`) schreibt ein Cookie. Das Layout liest es und übergibt es an `components/FlashMeldungen.js`, das es anzeigt und löscht.
- **Sprache:** Oberfläche, Bezeichner, Kommentare und Doku sind auf **Deutsch**. Der Code ist ausführlich kommentiert, weil er in der Projektdoku erklärt wird.
- **Abhängigkeiten** sind exakt gepinnt (`--save-exact`). `postcss` ist per `overrides` auf eine gepatchte Version gesetzt. Nach Änderungen `npm audit --omit=dev` ausführen.

## Störungskarte

- Ebenen: Deutschland → Werk (Lageplan) → Gebäude (Grundriss), alles in **einer** Client-Komponente `components/karten/KartenExplorer.js`. Sie bekommt alle Daten auf einmal (`alleKartenDaten()` in `lib/karten/daten.js`) und wechselt die Ebenen ohne Neuladen.
- Zoom-Animation: Beim Wechsel bleibt die alte Ebene kurz stehen (`.ebene-alt`), die neue wächst aus dem angeklickten Punkt (`transform-origin` = Mitte des Elements mit `data-ort="st-<id>"` bzw. `"g-<id>"`). Beim Herauszoomen wird der Punkt in der neuen Ebene gemessen. CSS: Abschnitt „Zoom-Karte“ in `app/globals.css`.
- Verwendet auf `/karte` (`adresseMitfuehren`: Adresse `?werk=ham&halle=h2&maschine=12`, per `history.replaceState`), auf der Übersicht (`groesse="mittel"`) und beim Melden (`modus="auswahl"`, `onMaschine`). Alte Adressen `/karte/<werk>/<halle>` leiten per `redirects()` in `next.config.mjs` auf `/karte?werk=…&halle=…` um. Kürzel stehen in der URL klein, in der Datenbank groß (`HAM`, `H2`).
- Rechts neben der Karte zeigt die Info-Spalte je Ebene Standorte, Gebäude, offene Störungen, Techniker bzw. Maschinen-Details.
- Die Zahl auf jedem Punkt ist die Anzahl offener Aufträge (Status ≠ erledigt), die Farbe kommt von der höchsten offenen Priorität (`components/karten/stufe.js`).
- `DeutschlandKarte.js`, `Lageplan.js` und `Grundriss.js` zeichnen nur die jeweilige Ebene und rufen beim Klick `onWaehle(objekt, event)` auf.
- Aufbau: SVG für Hintergrund (Umriss, Gelände, Wände, Bereiche), darüber absolut positionierte HTML-Elemente in Prozent der Größe in Metern. Container haben `aspect-ratio` = Breite/Tiefe.
- Deutschland-Umriss: vorab berechnete SVG-Pfade in `lib/karten/deutschland.js` (Natural Earth über `world-atlas`, Mercator). `projizieren(breite, länge)` nutzt dieselbe Formel. Zur Laufzeit werden keine Kartenbibliotheken geladen.
- Melden: `app/melden/MeldeAssistent.js` (erst Karte, nach Wahl der Maschine das Formular; „Ändern“ öffnet die Karte im Gebäude der Maschine) und `MeldeFormular.js` (sendet `maschine_id` als verstecktes Feld). `?maschine=<id>` springt direkt zum Formular, `?standort=<id>` startet im Werk.

## Seitenleiste & Logo

- `components/Seitenleiste.js` ersetzt die frühere Navigation oben. Bereiche: Überblick (Übersicht, Störungskarte), Instandhaltung (Störung melden, Aufträge mit Zahl offener Aufträge), Auswertung (Statistik). Unten Darstellung und Konto (Abmelden).
- Zustand in `<html data-leiste="auf|zu">`, gemerkt in `localStorage` unter `seitenleiste`. Das Start-Skript in `app/layout.js` setzt ihn vor dem ersten Anzeigen (ohne Wahl: ab 1200 px offen). Die Breite steuert `--leiste-b`, der Inhalt rückt per `.app-rahmen` daneben.
- Eingeklappt wird der Text zur Sprechblase beim Darüberfahren. Unter 768 px gibt es oben `.mobil-kopf`, die Leiste fährt dann von links herein.
- Neue Seiten in `BEREICHE` in `Seitenleiste.js` eintragen (mit `symbol` und gefüllter Variante `symbolAktiv`).
- Logo: `components/Logo.js` (Sechseck mit Pulslinie auf Akzentfläche, Farbe aus CSS). Das Browser-Symbol `app/icon.svg` hat dieselbe Form mit festen Farben.

## Design

Angelehnt an die Apple Human Interface Guidelines, aber **ohne** Apple-Logos oder Markenzeichen.

- Alle Farben sind CSS-Variablen in `app/globals.css`, mit einem hellen Satz in `:root` und einem dunklen in `:root[data-theme="dark"]`. Nie feste Farben in Komponenten verwenden.
- „Glas“-Optik (dezent, angelehnt an Liquid Glass): `--karte` ist halbtransparent, dazu `backdrop-filter: var(--glas-unschaerfe)`, `border: 1px solid var(--glas-rand)` und `box-shadow: var(--glas-kante), var(--schatten)`. Der weiche Hintergrund entsteht in `body::before`. Wo eine feste Farbe nötig ist (z. B. Chart.js), `--karte-solid` verwenden. Bei `prefers-reduced-transparency` gibt es feste Flächen.
- Einblend-Animationen mit `backwards` statt `both`, sonst blockieren sie hinterher Hover-Transformationen.
- Hell/Dunkel: Ein Skript in `app/layout.js` setzt `data-theme` und `data-bs-theme` vor dem ersten Anzeigen. Die Auswahl steht in `localStorage` unter `darstellung` (`hell`, `dunkel` oder leer = automatisch). Beim Umschalten wird das Event `darstellungswechsel` ausgelöst, die Diagramme färben sich daraufhin neu ein.
- Karten (`.karte`) gleiten versetzt ein. Die Reihenfolge steuert `style={{ '--i': n }}`. Kennzahlen zählen hoch (`components/Zaehler.js`), Balken wachsen. Bei `prefers-reduced-motion` ist alles aus.
- Akzentfarbe `#0071e3` (dunkel `#2997ff`). Status und Priorität werden als Pills angezeigt (`components/Pills.js`), immer mit Text.
- Tablet und Handy müssen bedienbar sein: kein seitliches Scrollen der Seite, Tabellenspalten werden ab `md`/`lg` eingeblendet.

## Datenmodell (siehe `supabase/schema.sql`)

- Tabellen: `standort`, `gebaeude`, `maschine`, `techniker`, `stoermeldung`, `wartungsauftrag`, `ersatzteil`, `auftrag_ersatzteil`, `bestellung`.
- `standort` (GPS-Position, Geländegröße) 1:n `gebaeude` (Lage auf dem Gelände, `bereiche` als JSONB) 1:n `maschine` (`anlagennummer` eindeutig, `typ` vom ENUM `maschinentyp`, Position und Stellfläche in Metern). Techniker gehören zu einem Standort, Ersatzteile liegen zentral.
- Wertelisten als ENUM-Typen: `auftragsstatus`, `prioritaet` (Reihenfolge niedrig < mittel < hoch, deshalb gehen `ORDER BY prioritaet DESC` und `MAX(prioritaet)`), `schicht`, `bestellstatus`, `ursache`, `maschinentyp`. Gespiegelt in `lib/konstanten.js` (inkl. `MASCHINEN_SYMBOLE`).
- **Zu jeder Störmeldung gibt es genau einen Wartungsauftrag.** Links auf Detailseiten verwenden die **Auftrags-ID**: `/auftraege/<id>`.
- `auftrag_ersatzteil` hat den Primärschlüssel `(auftrag_id, ersatzteil_id)`. Mehrfachbuchungen laufen über `ON CONFLICT … DO UPDATE`.
- `bestellung.lieferdatum` ist das tatsächliche Lieferdatum und bis zur Lieferung NULL.
- **RLS** ist auf allen Tabellen an, ohne Policies. Views haben `security_invoker = true`. Die App verbindet sich direkt als Datenbank-Benutzer und ist davon nicht betroffen.
- Kennzahlen:
  - Reparaturdauer = `ende_zeit - start_zeit`
  - MTTR = Durchschnitt der Reparaturdauer über alle erledigten Aufträge
  - Ausfallzeit = `ende_zeit - stoermeldung.zeitpunkt`
  - Diese Definitionen gelten gleichermaßen für alle Views (`v_mttr_maschine`, `v_ausfallzeit_maschine`, `v_kennzahlen_standort`, `v_stoerungen_monat`, `v_stoerung_details`) und für `app/statistik/page.js`.

## SQL-Dateien

- **Die Datenbank läuft produktiv bei Supabase und enthält echte Eingaben des Teams.** Künftige Änderungen an der Struktur (neue Tabellen, Spalten, Views) deshalb **nicht** durch erneutes Ausführen von `schema.sql` + `testdaten.sql` einspielen, sondern als **Migrationsdatei** `supabase/migrationen/NNN_beschreibung.sql` (z. B. `001_wartungsplan.sql`). Sie soll vorhandene Daten erhalten (`ALTER TABLE …`, `CREATE TABLE IF NOT EXISTS …`, `CREATE OR REPLACE VIEW …`) und mehrfach ausführbar sein.
- Gleichzeitig `schema.sql` (und bei Bedarf `testdaten.sql`) nachziehen, damit eine Neuinstallation denselben Stand ergibt.
- Dem Nutzer bei jeder Strukturänderung ausdrücklich sagen, welche Migrationsdatei er im Supabase SQL Editor ausführen muss. Reine Code-Änderungen veröffentlicht Vercel automatisch.

- `schema.sql` ist wiederholt ausführbar. Es löscht alles und legt es neu an.
- `testdaten.sql` leert die Tabellen mit `TRUNCATE … RESTART IDENTITY CASCADE`, fügt feste IDs per `OVERRIDING SYSTEM VALUE` ein und setzt die Sequenzen danach mit `setval`.
- Zeitangaben in den Testdaten sind relativ: `now() - interval '90 minutes'`.
- Die Testdaten wurden mit einem Python-Skript mit festem Zufalls-Seed erzeugt. Es plant auch die Grundrisse: Maschinen in zwei Reihen mit Gang, daraus folgt die Gebäudegröße. Das Skript liegt nicht im Repository. Kleine Änderungen direkt in der SQL-Datei vornehmen und dabei darauf achten, dass Maschinen innerhalb ihres Gebäudes liegen.
- Die Verteilung ist bewusst gleichmäßig: ältere Meldungen 30–365 Tage zurück, im letzten Monat einige erledigte und die offenen. So gibt es keinen künstlichen Ausschlag im aktuellen Monat.
- Neue Ursachen-Kategorien: `ursache`-Typ in `schema.sql`, `URSACHEN_LISTE` in `lib/konstanten.js` und gegebenenfalls die Testdaten anpassen.
