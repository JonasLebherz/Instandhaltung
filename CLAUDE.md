# CLAUDE.md

## Projekt

Instandhaltungsmanagement als Webanwendung. Hochschulprojekt „Company database“ im Fach Digital Production (HS Albstadt-Sigmaringen, Abgabe 21.01.2027).
Zielgruppe: Produktionsmitarbeiter, Schichtleiter, Instandhaltungstechniker.

**Technik:** Next.js 15 (App Router, React 19, **JavaScript**, kein TypeScript), Datenbank **Supabase/PostgreSQL**, Hosting **Vercel**.
Die frühere Version mit PHP, MySQL und XAMPP liegt im Branch `php-xampp` und wird nicht mehr weiterentwickelt.
Laut Aufgabenstellung gibt es keine Technik-Vorgabe. Der Wechsel wurde mit den Betreuern abgestimmt bzw. wird noch abgestimmt.

## Stand

- **Fertig:** alle Seiten (Übersicht, Melden, Aufträge, Auftrag bearbeiten, Statistik, Login), Dunkelmodus, Animationen, `supabase/schema.sql` mit Views und RLS, `supabase/testdaten.sql`.
- **Getestet** gegen PostgreSQL 16 lokal: 54 Ende-zu-Ende-Prüfungen mit Playwright (alle Abläufe, Validierung, Dunkelmodus, Tablet/Handy), Login-Schutz mit eingeschaltetem Login, RLS-Sperre für die Rolle `anon`.
- **Noch nicht live getestet:** echtes Supabase-Projekt und Vercel-Deployment. Die Einrichtung steht im README.

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
- **Interaktive Teile** (Formulare, Navigation, Diagramme) sind Client-Komponenten mit `'use client'` in eigenen Dateien.
- **Datenänderungen** laufen nur über Server-Aktionen in `app/aktionen.js` bzw. `app/login/aktionen.js`. Muster:
  1. `await benutzerPflicht()`
  2. Eingaben prüfen und bei Fehlern `return { fehler: { feld: 'Meldung' }, eingabe }` zurückgeben
  3. Speichern, mehrere Schreibzugriffe in `sql.begin(async (tx) => …)`
  4. `await flash(typ, text)`, `revalidatePath('/', 'layout')`, `redirect(…)`. `redirect` steht nie in try/catch.
- **Formulare** nutzen `useActionState` und werden mit `key={JSON.stringify(eingabe)}` neu aufgebaut, damit die Eingaben nach Fehlern erhalten bleiben (React setzt Formulare sonst zurück). Fehler zeigt `components/Feldfehler.js` an. Formulare haben `noValidate`, damit die Prüfung serverseitig auf Deutsch passiert.
- **Datenbank:** nur über `sql` aus `lib/db.js` (Bibliothek `postgres`). Werte **immer** als `${…}` im Tagged Template übergeben, nie per String-Verkettung. Dynamische Bedingungen werden aus `sql\`…\``-Bausteinen zusammengesetzt (siehe `app/auftraege/page.js`).
  - `COUNT(*)` liefert `bigint`, das kommt als String an. Deshalb immer `::int` casten. `AVG`/`ROUND` mit `::float` casten.
  - `prepare: false` wegen des Supabase-Transaction-Poolers.
- **Zeit:** Spalten sind `TIMESTAMPTZ`. Angezeigt wird immer in Europe/Berlin über `lib/format.js`. Eingaben aus `datetime-local` gehen über `berlinZuDate()`, Werte für Eingabefelder über `fuerDatetimeInput()`. In SQL `AT TIME ZONE 'Europe/Berlin'` für Monatsgruppierungen.
- **Hinweise nach Weiterleitung:** `flash()` (`lib/flash.js`) schreibt ein Cookie. Das Layout liest es und übergibt es an `components/FlashMeldungen.js`, das es anzeigt und löscht.
- **Sprache:** Oberfläche, Bezeichner, Kommentare und Doku sind auf **Deutsch**. Der Code ist ausführlich kommentiert, weil er in der Projektdoku erklärt wird.
- **Abhängigkeiten** sind exakt gepinnt (`--save-exact`). `postcss` ist per `overrides` auf eine gepatchte Version gesetzt. Nach Änderungen `npm audit --omit=dev` ausführen.

## Design

Angelehnt an die Apple Human Interface Guidelines, aber **ohne** Apple-Logos oder Markenzeichen.

- Alle Farben sind CSS-Variablen in `app/globals.css`, mit einem hellen Satz in `:root` und einem dunklen in `:root[data-theme="dark"]`. Nie feste Farben in Komponenten verwenden.
- Hell/Dunkel: Ein Skript in `app/layout.js` setzt `data-theme` und `data-bs-theme` vor dem ersten Anzeigen. Die Auswahl steht in `localStorage` unter `darstellung` (`hell`, `dunkel` oder leer = automatisch). Beim Umschalten wird das Event `darstellungswechsel` ausgelöst, die Diagramme färben sich daraufhin neu ein.
- Karten (`.karte`) gleiten versetzt ein. Die Reihenfolge steuert `style={{ '--i': n }}`. Kennzahlen zählen hoch (`components/Zaehler.js`), Balken wachsen. Bei `prefers-reduced-motion` ist alles aus.
- Akzentfarbe `#0071e3` (dunkel `#2997ff`). Status und Priorität werden als Pills angezeigt (`components/Pills.js`), immer mit Text.
- Tablet und Handy müssen bedienbar sein: kein seitliches Scrollen der Seite, Tabellenspalten werden ab `md`/`lg` eingeblendet.

## Datenmodell (siehe `supabase/schema.sql`)

- Tabellen: `maschine`, `techniker`, `stoermeldung`, `wartungsauftrag`, `ersatzteil`, `auftrag_ersatzteil`, `bestellung`.
- Wertelisten als ENUM-Typen: `auftragsstatus`, `prioritaet` (Reihenfolge niedrig < mittel < hoch, deshalb `ORDER BY prioritaet DESC`), `schicht`, `bestellstatus`, `ursache`. Gespiegelt in `lib/konstanten.js`.
- **Zu jeder Störmeldung gibt es genau einen Wartungsauftrag.** Links auf Detailseiten verwenden die **Auftrags-ID**: `/auftraege/<id>`.
- `auftrag_ersatzteil` hat den Primärschlüssel `(auftrag_id, ersatzteil_id)`. Mehrfachbuchungen laufen über `ON CONFLICT … DO UPDATE`.
- `bestellung.lieferdatum` ist das tatsächliche Lieferdatum und bis zur Lieferung NULL.
- **RLS** ist auf allen Tabellen an, ohne Policies. Views haben `security_invoker = true`. Die App verbindet sich direkt als Datenbank-Benutzer und ist davon nicht betroffen.
- Kennzahlen:
  - Reparaturdauer = `ende_zeit - start_zeit`
  - MTTR = Durchschnitt der Reparaturdauer über alle erledigten Aufträge
  - Ausfallzeit = `ende_zeit - stoermeldung.zeitpunkt`
  - Diese Definitionen gelten gleichermaßen für die Views und für `app/statistik/page.js`.

## SQL-Dateien

- `schema.sql` ist wiederholt ausführbar. Es löscht alles und legt es neu an.
- `testdaten.sql` leert die Tabellen mit `TRUNCATE … RESTART IDENTITY CASCADE`, fügt feste IDs per `OVERRIDING SYSTEM VALUE` ein und setzt die Sequenzen danach mit `setval`.
- Zeitangaben in den Testdaten sind relativ: `now() - interval '90 minutes'`.
- Die Testdaten wurden mit einem Python-Skript mit festem Zufalls-Seed erzeugt. Das Skript liegt nicht im Repository. Kleine Änderungen direkt in der SQL-Datei vornehmen.
- Neue Ursachen-Kategorien: `ursache`-Typ in `schema.sql`, `URSACHEN_LISTE` in `lib/konstanten.js` und gegebenenfalls die Testdaten anpassen.
