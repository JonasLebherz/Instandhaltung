# AGENTS.md

Hinweise für KI-Assistenten wie OpenAI Codex. Claude liest dieselben Regeln aus `CLAUDE.md`.

**Die vollständigen Projektregeln stehen in `CLAUDE.md`. Lies diese Datei vor jeder Änderung.**
Hier die wichtigsten Punkte in Kurzform:

## Projekt

Instandhaltungsmanagement als Webanwendung für ein Hochschulprojekt.
**Next.js 15** (App Router, React 19, JavaScript), Datenbank **Supabase (PostgreSQL)**, Hosting **Vercel**.
Jeder Push nach GitHub wird von Vercel automatisch veröffentlicht. Deshalb vor jedem Push `npm run build` ausführen, er muss fehlerfrei durchlaufen.

## Regeln

- Bezeichner, Kommentare und Doku sind auf **Deutsch**. Der Code wird ausführlich kommentiert, weil er in der Projektdoku erklärt wird.
- Die Oberfläche gibt es auf Deutsch und Englisch: Jeden sichtbaren Text mit `t('Deutscher Text')` ausgeben (Server: `await uebersetzer()`, Client: `useT()`), die englische Fassung in `lib/sprache/en.js` eintragen und `npm run texte` ausführen. Details in `CLAUDE.md` unter „Oberfläche zweisprachig“.
- Datenbankzugriff nur über `sql` aus `lib/db.js`. Werte **immer** als `${…}` im Tagged Template übergeben, nie in SQL-Strings einbauen. `COUNT(*)` mit `::int` casten.
- Seiten sind Server-Komponenten (`app/**/page.js`) und rufen zuerst `await benutzerPflicht()` auf.
- Datenänderungen laufen nur über Server-Aktionen in `app/aktionen.js`: erst Login prüfen, dann Eingaben prüfen (`{ fehler, eingabe }` zurückgeben), dann speichern (bei mehreren Schritten in `sql.begin`), dann `flash()`, `revalidatePath('/', 'layout')` und `redirect()`.
- Formulare sind Client-Komponenten mit `useActionState`, `noValidate` und Fehleranzeige über `components/Feldfehler.js`.
- Zeiten: In der Datenbank als `TIMESTAMPTZ`, angezeigt in Europe/Berlin über `lib/format.js`.
- Design: Farben nur über die CSS-Variablen in `app/globals.css`, jeweils hell **und** dunkel. Karten mit `.karte`, Status als Pills (`components/Pills.js`). Animationen müssen bei `prefers-reduced-motion` aus sein.
- Störungskarte (`app/karte/`, `components/karten/`): Eine Zoom-Karte (`KartenExplorer.js`) für Welt → Land → Werk → Gebäude, ohne Neuladen. Positionen kommen in Metern aus der Datenbank und werden prozentual über ein SVG gelegt. Details stehen in `CLAUDE.md` unter „Störungskarte“.
- Navigation: Seitenleiste links (`components/Seitenleiste.js`). Neue Seiten dort in `BEREICHE` eintragen. Details in `CLAUDE.md` unter „Seitenleiste & Logo“.
- Statistik (`app/statistik/`) und Datenbasis (`app/datenbasis/`): Aufbau in `CLAUDE.md` in den gleichnamigen Abschnitten. Pro Seite höchstens 5 Datenbankabfragen gleichzeitig.
- Strukturänderungen an der Datenbank als Migrationsdatei `supabase/migrationen/NNN_beschreibung.sql` anlegen. Vorhandene Daten müssen erhalten bleiben, denn die Datenbank läuft produktiv. Zusätzlich `supabase/schema.sql` **und** passend `supabase/testdaten.sql` nachziehen. Neue Tabellen bekommen `ENABLE ROW LEVEL SECURITY`, neue Views `WITH (security_invoker = true)`.
- Personen & Rollen: Die gewählte fiktive Person steht im Cookie `person`. Für Speichern und Rechte zählt nur `aktuellePerson()` aus `lib/person.js` (Abgleich mit der Datenbank). Produktion darf melden, aber keine Aufträge bearbeiten (`darfBearbeiten`). Änderungen an Aufträgen zusätzlich in `auftrag_verlauf` schreiben. Ansicht (nur Land/Werk anzeigen) über `lib/ansicht.js`. Details in `CLAUDE.md` unter „Personen & Rollen“.
- Auswahlfelder immer mit `components/Auswahl.js`, nie natives `<select>`.
- Störungskarte: Werk und Halle auch in 3D (`components/karten/raum/`, three.js, nur per `next/dynamic` laden). Farben dort nur über CSS-Variablen `--raum-*`. Abwechslung je Werk in `lib/karten/werkGestaltung.js`.
- Tests: `node tests/e2e.cjs` (lokale Datenbank, Voraussetzungen im Kopf der Datei) – bei neuen Funktionen erweitern.
- Zugangsdaten nie in den Code oder ins Repository. Sie gehören in `.env.local` bzw. zu Vercel.
