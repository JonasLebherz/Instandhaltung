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
- Design: Glas im Apple-Stil mit Akzent Petrol und ruhigem Hintergrund „Morgendunst“ (keine bunten Farbwolken, soll nicht nach KI-Vorlage aussehen). Farben nur über die CSS-Variablen in `app/globals.css`, jeweils hell **und** dunkel. Karten mit `.karte`, Status als Pills (`components/Pills.js`). Animationen müssen bei `prefers-reduced-motion` aus sein.
- Störungskarte (`app/karte/`, `components/karten/`): Eine Zoom-Karte (`KartenExplorer.js`) für Welt → Land → Werk → Gebäude, ohne Neuladen. Positionen kommen in Metern aus der Datenbank und werden prozentual über ein SVG gelegt. Details stehen in `CLAUDE.md` unter „Störungskarte“.
- Navigation: Seitenleiste links (`components/Seitenleiste.js`). Neue Seiten dort in `BEREICHE` eintragen. Details in `CLAUDE.md` unter „Seitenleiste & Logo“.
- Statistik (`app/statistik/`), Mitarbeiter mit Chat (`app/mitarbeiter/`, Tabelle `nachricht`) und Datenbasis (`app/datenbasis/`, einfach erklärt, ohne Power BI): Aufbau in `CLAUDE.md` in den gleichnamigen Abschnitten. Pro Seite höchstens 5 Datenbankabfragen gleichzeitig.
- Strukturänderungen an der Datenbank als Migrationsdatei `supabase/migrationen/NNN_beschreibung.sql` anlegen. Vorhandene Daten müssen erhalten bleiben, denn die Datenbank läuft produktiv. Zusätzlich `supabase/schema.sql` **und** passend `supabase/testdaten.sql` nachziehen. Neue Tabellen bekommen `ENABLE ROW LEVEL SECURITY`, neue Views `WITH (security_invoker = true)`.
- Personen & Rollen: Die gewählte fiktive Person steht im Cookie `person`. Für Speichern und Rechte zählt nur `aktuellePerson()` aus `lib/person.js` (Abgleich mit der Datenbank). Produktion darf melden, aber keine Aufträge bearbeiten (`darfBearbeiten`). Änderungen an Aufträgen zusätzlich in `auftrag_verlauf` schreiben. Ansicht (nur Land/Werk anzeigen) über `lib/ansicht.js`. Details in `CLAUDE.md` unter „Personen & Rollen“.
- Auswahlfelder immer mit `components/Auswahl.js`, nie natives `<select>`.
- Störungskarte: Werk und Halle auch in 3D (`components/karten/raum/`, three.js, nur per `next/dynamic` laden). Farben dort nur über CSS-Variablen `--raum-*` (Ausnahmen: Flaggen, Landesstil, Autolacke). Viele gleiche Teile als Instanzen (`Viele` in `raum/Bausteine.js`), damit es flüssig bleibt. Abwechslung je Werk in `lib/karten/werkGestaltung.js`.
- Störungskarte: Favoriten (Pin-Knopf in der Karte ab Land → Seitenleiste, `lib/favoriten.js`, höchstens 10, im Browser gespeichert; „Mein Werk“ der gewählten Person automatisch, Kachel auf der Übersicht) und Ton (`lib/ton.js`, an/aus im Konto-Menü). Störungszahlen in 3D als LED-Anzeige auf der Ampel. Maschinen-Seiten unter `app/maschinen/`. Übergänge mit 3D laufen über Ereignisse (Kamera angekommen → flach → überblenden), nicht über feste Zeiten. Details in `CLAUDE.md`.
- Wartungsplan mit Kalender/Zeitachse (`app/wartung/`), Lager je Werk (`app/lager/`, Tabelle `lagerbestand`, Migration 005 – Bestände nie mehr in `ersatzteil`; 3D-Regal von vorn mit echten Teile-Modellen und rot durchsichtigen fehlenden Stücken in `components/karten/raum/LagerRegal3D.js`, umschaltbar auf Liste), QR-Etiketten (`app/qr/`), Hallen-Monitor (`app/monitor/`), Fotos zu Meldungen (`stoermeldung_foto`, im Browser verkleinert), Checkliste je Maschinentyp, Ausfallkosten (`maschine.kosten_pro_stunde`) und Export (CSV/Excel/PDF, `lib/export.js`): Migrationen `004_wartungsplan_lager_fotos.sql` und `005_lager_je_werk.sql`, Details in `CLAUDE.md` unter „Wartungsplan, Lager, QR …“. Die Seite soll übersichtlich bleiben: neue Funktionen dort einbauen, wo sie hingehören, nicht als eigene Seite.
- Design-Prüfung: Unter `.claude/skills/apple-design/` liegt eine Anleitung für Design-Reviews nach Apples Human Interface Guidelines (`SKILL.md`, Texte in `references/hig/`). Sie kann auch ohne Claude gelesen werden.
- Tests: `node tests/e2e.cjs` (lokale Datenbank, Voraussetzungen im Kopf der Datei) – bei neuen Funktionen erweitern.
- Zugangsdaten nie in den Code oder ins Repository. Sie gehören in `.env.local` bzw. zu Vercel.
