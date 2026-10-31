# CLAUDE.md

## Projekt

Instandhaltungsmanagement als Webanwendung. Hochschulprojekt „Company database“ im Fach Digital Production (HS Albstadt-Sigmaringen, Abgabe 21.01.2027).
Zielgruppe: Produktionsmitarbeiter, Schichtleiter, Instandhaltungstechniker.

**Technik:** Next.js 15 (App Router, React 19, **JavaScript**, kein TypeScript), Datenbank **Supabase/PostgreSQL**, Hosting **Vercel**.
Die frühere Version mit PHP, MySQL und XAMPP liegt im Branch `php-xampp` und wird nicht mehr weiterentwickelt.
Laut Aufgabenstellung gibt es keine Technik-Vorgabe. Der Wechsel wurde mit den Betreuern abgestimmt bzw. wird noch abgestimmt.

## Stand

- **Live:** Die App läuft bei Vercel mit Supabase. Login funktioniert.
- **Fertig:** alle Seiten (Übersicht mit kleiner Karte, Melden über die Karte, Störungskarte mit Zoom Welt/Land/Werk/Gebäude (Werk und Halle wahlweise in 3D), Aufträge, Auftrag bearbeiten, Statistik mit Zoom, Datenbasis, Login), Seitenleiste links, Logo, Sprache Deutsch/Englisch, Glas-Design, Dunkelmodus, Animationen, `supabase/schema.sql` mit Views und RLS, `supabase/testdaten.sql`.
- **Beispielunternehmen:** international, Hauptsitz Deutschland. 8 Länder, 19 Standorte (10 in Deutschland; USA 2, China 2, Mexiko, Indien, Frankreich, Russland, Polen je 1), 52 Gebäude, 207 Maschinen, 38 Techniker (2 pro Standort), 76 Personen (je Werk 2 Instandhaltung, 1 Schichtleitung, 1 Produktion), 20 Ersatzteile, ca. 1.000 Meldungen über 12 Monate, davon gut 60 offen. Berlin hat bewusst keine offenen Störungen.
- Auslandswerke (Migration `002_laender_und_auslandswerke.sql`, gleicher Teil am Ende von `testdaten.sql`) übernehmen Gelände, Gebäude und Maschinen eines deutschen Vorbilds mit gleichem Schwerpunkt; ihre Störungen sind eine per `hashtext` (statt Zufall, also bei jedem Lauf gleich) ausgewählte und zeitlich verschobene Teilmenge der Störungen des Vorbilds. Zeiten werden weiter in deutscher Zeit angezeigt.
- **Getestet** gegen PostgreSQL 16 lokal: 183 Ende-zu-Ende-Prüfungen mit Playwright in `tests/e2e.cjs` (alle Abläufe, Personenwahl und Rollen, Welt-/Länderkarte, 3D-Ansicht, Melden über die Karte, Zoom ohne Neuladen, Adressen der Karte, Seitenleiste, Statistik-Zoom gegen SQL, Datenbasis, Sprache Englisch, Validierung, Dunkelmodus, Tablet/Handy), Login-Schutz, RLS-Sperre für die Rolle `anon`.
- **Nach Schemaänderungen** wird in Supabase nur die neue Migrationsdatei aus `supabase/migrationen/` ausgeführt (Daten bleiben erhalten, siehe „SQL-Dateien“). `schema.sql` + `testdaten.sql` nur für eine Neuinstallation – das setzt alle Daten zurück, Login-Konten bleiben erhalten.

## Team & andere KI-Assistenten

- Im Team arbeitet mindestens eine Person mit OpenAI Codex. Codex liest `AGENTS.md`, nicht diese Datei.
- `AGENTS.md` verweist auf `CLAUDE.md` und fasst die wichtigsten Regeln zusammen. Bei neuen Konventionen **beide Dateien** aktualisieren.
- Die Team-Anleitungen unter `docs/` (Codex-PDF) beschreiben noch den XAMPP-Ablauf und müssen auf Vercel/Supabase aktualisiert werden.

## Befehle

```bash
npm install          # Abhängigkeiten installieren
npm run dev          # Entwicklung auf http://localhost:3000 (braucht .env.local)
npm run build        # Produktions-Build – vor jedem Push ausführen, muss fehlerfrei sein
npm run texte        # fehlende englische Übersetzungen finden – muss "Alle Texte sind übersetzt." melden
node tests/e2e.cjs   # Ende-zu-Ende-Tests (Voraussetzungen im Kopf der Datei; Daten vorher neu einspielen)
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
  - Pro Seite **höchstens 5 Abfragen gleichzeitig** (`max: 5` in `lib/db.js`). Bei mehr schickt postgres.js mehrere Abfragen über eine Verbindung (Pipelining), was mit dem Supabase-Pooler zu Hängern bis zum Timeout führen kann. `max_pipeline: 0` ist keine Lösung, damit scheitern Transaktionen (`UNSAFE_TRANSACTION`).
  - Die Übersicht zeigt nur eine kleine Weltkarte (`components/karten/KleineKarte.js`, Klick → `/karte?land=…`), nicht die ganze Zoom-Karte.
  - **Kein `app/loading.js`:** Damit blieben Formulare nach dem Speichern (Server-Aktion mit `redirect`) endlos hängen. Rückmeldung beim Seitenwechsel gibt stattdessen ein drehender Ring in der Seitenleiste (`useLinkStatus`).
  - `/status` misst Login- und Datenbankzeiten und zeigt Regionen und Port (ohne Zugangsdaten). Hilfreich bei langsamen Ladezeiten. Ausführlicher und grafisch: Seite „Datenbasis“.
- **CSS-Reihenfolge:** Bootstrap und Bootstrap Icons werden per `@import` ganz oben in `app/globals.css` geladen, nicht im Layout. Getrennte Imports hat Next.js im Build vertauscht – dann überschreibt Bootstrap unser Design (z. B. unterstrichene Links).
- **Datenbank:** nur über `sql` aus `lib/db.js` (Bibliothek `postgres`). Werte **immer** als `${…}` im Tagged Template übergeben, nie per String-Verkettung. Dynamische Bedingungen werden aus `sql\`…\``-Bausteinen zusammengesetzt (siehe `app/auftraege/page.js`).
  - `COUNT(*)` liefert `bigint`, das kommt als String an. Deshalb immer `::int` casten. `AVG`/`ROUND` mit `::float` casten.
  - `prepare: false` wegen des Supabase-Transaction-Poolers.
- **Zeit:** Spalten sind `TIMESTAMPTZ`. Angezeigt wird immer in Europe/Berlin über `lib/format.js`. Eingaben aus `datetime-local` gehen über `berlinZuDate()`, Werte für Eingabefelder über `fuerDatetimeInput()`. In SQL `AT TIME ZONE 'Europe/Berlin'` für Monatsgruppierungen.
- **Hinweise nach Weiterleitung:** `flash()` (`lib/flash.js`) schreibt ein Cookie. Das Layout liest es und übergibt es an `components/FlashMeldungen.js`, das es anzeigt und löscht.
- **Sprache:** Bezeichner, Kommentare und Doku sind auf **Deutsch**. Der Code ist ausführlich kommentiert, weil er in der Projektdoku erklärt wird.
- **Oberfläche zweisprachig (Deutsch/Englisch):** Jeder sichtbare Text läuft über `t('Deutscher Text')`. Der deutsche Text ist der Schlüssel, die englische Fassung steht in `lib/sprache/en.js`.
  - Server-Komponenten und Server-Aktionen: `const t = await uebersetzer()` aus `lib/sprache/server.js`. Seitentitel: `export const generateMetadata = () => seitentitel('Titel')`.
  - Client-Komponenten: `const t = useT()` aus `components/SpracheKontext.js`.
  - Platzhalter: `t('{n} Maschinen', { n })`. Texte in festen Listen mit `T('…')` markieren und beim Anzeigen `t(text)`. Gleiches Wort, andere Bedeutung: Zusatz nach `|`, z. B. `t('Gebäude|Schritt')`.
  - Feste Wertelisten (Status, Priorität, Ursache, Maschinentyp, Schicht) bleiben in der Datenbank deutsch und werden bei der Anzeige mit `t(wert)` übersetzt, `gross()` macht den ersten Buchstaben groß. Freie Daten (Namen, Beschreibungen) werden nicht übersetzt.
  - Datum und Zahlen: `datumZeit(wert, t.sprache)`, `zahl(wert, 1, t.sprache)` usw. (`lib/format.js`).
  - Gewählt wird im Cookie `sprache` (Seitenleiste unten, Login-Seite). Nach neuen Texten `npm run texte` ausführen und fehlende Einträge in `en.js` ergänzen.
- **Auswahlfelder:** kein natives `<select>` (dessen Liste zeichnet der Browser, im Dunkelmodus unpassend), sondern `components/Auswahl.js`: `optionen` (auch Gruppen `{ gruppe, optionen }`), `name` → verstecktes Feld für Formulare, `wert`+`onAendern` gesteuert oder `standard`. Tastatur wie beim Select. In Tests: Knopf `#id` klicken, dann `#id-liste [role=option][data-wert="…"]`.
- **Abhängigkeiten** sind exakt gepinnt (`--save-exact`). `postcss` ist per `overrides` auf eine gepatchte Version gesetzt. Nach Änderungen `npm audit --omit=dev` ausführen.

## Störungskarte

- Ebenen: Welt → Land → Werk (Lageplan) → Gebäude (Grundriss), alles in **einer** Client-Komponente `components/karten/KartenExplorer.js`. Sie bekommt alle Daten auf einmal (`alleKartenDaten()` in `lib/karten/daten.js`) und wechselt die Ebenen ohne Neuladen.
- Zoom = **Kamerafahrt** (`kamerafahrt()` in `KartenExplorer.js`, Web-Animationen statt CSS-Klassen, damit React-Neuzeichnen sie nicht abbricht): Vor dem ersten Zeichnen wird gemessen, wo die angeklickte Fläche in der Elternebene liegt (A: unsichtbares Rechteck `data-flaeche="land-XX"` um die Hauptfläche des Landes – `WELT_KERNE` bzw. `LUPE.kerne`, ohne Inseln wie Alaska –, sonst `.punkt-blase` im Element mit `data-ort="st-<id>"` bzw. `"g-<id>"`) und wie groß der Inhalt der Kindebene ist (B: `.dkarte-land`, `.lageplan`, `.grundriss`, `.raum`). Beide Ebenen bewegen sich gemeinsam wie ein Globus-Flug: erst schwenkt die Kamera die angeklickte Fläche in die Mitte (`schwenk`), dann taucht sie senkrecht hinein (`zoom`, Maßstab logarithmisch). Die Weltkarte ist oben verankert (`.ebene-inhalt.ebene-welt`), die Bühne behält während des Zooms die volle Höhe (keine Höhen-Animation – sonst rutschte die Karte), die neue Ebene blendet ein, die alte aus. Die Ebenen haben React-Schlüssel (`schluesselVon`): Die alte Ebene ist dieselbe DOM-Ebene wie vorher (wird nicht neu aufgebaut) – beim Herauszoomen aus 3D bleibt so die 3D-Szene sichtbar. Dauer 1 s (Land/Werk) bzw. 0,7 s (Halle). Beschriftungen der alten Ebene (und beim Herauszoomen der neuen) sind währenddessen verborgen. Welt, Land und Werk haben `overflow: hidden` (kein Scrollbalken).
- Ebene im Zustand: `{ land, standortId, gebaeudeId }`. Ein Werk legt sein Land mit fest.
- Verwendet auf `/karte` (`adresseMitfuehren`: Adresse `?land=us` bzw. `?werk=ham&halle=h2&maschine=12`, per `history.replaceState`), und beim Melden (`modus="auswahl"`, `onMaschine`). Alte Adressen `/karte/<werk>/<halle>` leiten per `redirects()` in `next.config.mjs` auf `/karte?werk=…&halle=…` um. Kürzel stehen in der URL klein, in der Datenbank groß (`HAM`, `H2`).
- Rechts neben der Karte zeigt die Info-Spalte je Ebene Länder, Standorte, Gebäude, offene Störungen, Techniker bzw. Maschinen-Details.
- Die Zahl auf jedem Punkt ist die Anzahl offener Aufträge (Status ≠ erledigt), die Farbe kommt von der höchsten offenen Priorität (`components/karten/stufe.js`).
- `WeltKarte.js`, `LandKarte.js`, `Lageplan.js` und `Grundriss.js` zeichnen nur die jeweilige Ebene und rufen beim Klick `onWaehle(objekt, event)` auf.
- Aufbau: SVG für Hintergrund (Umriss, Gelände, Wände, Bereiche), darüber absolut positionierte HTML-Elemente in Prozent der Größe in Metern. Container haben `aspect-ratio` = Breite/Tiefe.
- Umrisse: vorab berechnete SVG-Pfade (Natural Earth über `world-atlas`). Zur Laufzeit werden keine Kartenbibliotheken geladen.
  - Deutschland: `lib/karten/deutschland.js` (fein, Mercator, `projizieren`).
  - Welt und übrige Länder: `lib/karten/welt.js`, **erzeugt** mit `scripts/weltkarte-erzeugen.cjs` (Anleitung im Kopf der Datei). **Eine** Weltkarte in Equal Earth, Ausschnitt 128° W bis 152° O, 75° N bis 10° S (`weltPunkt`, `WELT_MITTEN` = Markierung je Land). Deutschland, Frankreich und Polen stehen in einer **Lupe** (`LUPE`: runder, vergrößerter Europa-Ausschnitt über dem Atlantik, `quelle` = gestrichelter Kreis um Europa, `markiert`/`mitten` = Markierungen in der Lupe); Namen dort seitlich bzw. oben/unten, weg von den Nachbarn. Länder in Mercator auf festem Ausschnitt (`LAENDER_KARTEN`, `landPunkt`). Ganzzahlige, relative Pfade, Datumsgrenze behandelt.
  - Auf der Weltebene ist die Bühne nur so hoch wie die Karte (`.buehne-welt`, Container-Abfrage `cqw`). Unter 520 px Breite schaltet `WeltKarte` selbst auf kompakt (Namen nur im Tooltip).
  - `lib/karten/laender.js`: `laenderAus(standorte)` (Länder aus den Werken, Hauptsitz zuerst), `landKarte(kuerzel)` (Deutschland, fertige Karte oder Ausschnitt um die Werke ohne Umriss), `markenPositionen()` (schiebt nahe Markierungen auseinander; feine Linie zur echten Lage), `inLupe()`, `weltVerhaeltnis()`.
  - Neues Land: Zeile in `land` (Migration) und für einen Umriss ISO-Nummer + Ausschnitt in `scripts/weltkarte-erzeugen.cjs` ergänzen, Skript ausführen, Ländernamen in `en.js`.
- **3D-Ansicht für Werk und Halle** (`components/karten/raum/`, three + @react-three/fiber + @react-three/drei, per `next/dynamic` mit `ssr: false` nur bei Bedarf geladen):
  - Umschalter „2D/3D“ oben rechts in der Bühne, Wahl in `localStorage` unter `kartenansicht`; ohne Wahl ab 768 px Breite 3D (wenn WebGL vorhanden). Auch beim Melden (dann `neutral`: keine Zahlen/Störungsfarben, Ampeln aus, Name beim Darüberfahren, Wahl über Klick oder die Liste rechts).
  - `Werk3D.js`: Gelände als Modellplatte, Hallen in Echtmaßen (Quader, Fensterband, Rolltor, Sockel in Störungsfarbe, Dach). Werk ↔ Halle bleibt dieselbe Szene: die Kamera fliegt (`Kamera`, `easing`), die Ebene wird nicht neu aufgebaut (`wechsle()` überspringt die Zoom-Animation). In der Halle: Dach weg, Wände durchsichtig (neues Material per `key`, sonst übernimmt Three.js `transparent` nicht), Bereiche als gelbe Bodenlinien, Regale/Schreibtische, Maschinen, Figuren im Gang (`gangInHalle`).
  - Weltkarte läuft oben und unten weich aus (SVG-Maske `welt-blende`).
  - Figuren mit schwingenden Beinen/Armen, Warnweste und Helm; ab und zu fahren Autos und ein Lkw über die Zufahrt (`Fahrzeug`, nachts mit Scheinwerfern). Ampeln leuchten auch beim Melden. Maschinen in der Halle mit `detail="mittel"` (Bedienpult, typische Teile), im Infofenster `"voll"`.
  - `Maschine3D.js`: einfache Form je `maschinentyp` aus Quadern/Zylindern mit bewegten Teilen (Spindel, Futter, Stößel, Portal, Pakete, Roboterarm, Lüfter) – still bei Stillstand. **Signalampel** an jeder Maschine (`Ampel`, Zustand aus `lib/karten/ampel.js`: grün läuft, orange Störung, rot Stillstand = offene Störung mit Priorität hoch).
  - `MaschineDetail3D.js`: Modell der gewählten Maschine im Infofenster (2D und 3D), feste Kamera (Abstand aus der Größe), ausführlichere Fassung (`detail`: Bedienpult mit Bildschirm und Not-Halt, Warnstreifen, Kabelkanal, typische Teile je Typ), dazu die Ampel als Text (`.ampel-zeile`). In der Halle ist die Ampel größer (`ampelGroesse`) und hat einen Leuchtschein.
  - Nacht = Dunkelmodus (`f.nacht` aus `farben.js`): helles Mondlicht und aufgehellte Nachtfarben (`--raum-*` im dunklen Satz), Straßenlaternen leuchten (höchstens 6 mit `pointLight`), Fenster und Büro hell, in der geöffneten Halle Leuchtenreihen und 2 warme Lichtquellen. Tagsüber sind die Lampen aus.
  - Sparsam: `dpr` höchstens 1,5, Schattenkarte 1024, wenige Lichtquellen, `useSichtbar` (IntersectionObserver) setzt `frameloop="never"`, solange die 3D-Fläche nicht im Bild ist.
  - Beschriftungen sind HTML-Knöpfe (`Html` aus drei, `zIndexRange` klein halten): `.raum-halle` (data-ort `g-<id>`) und `.raum-marke` (Maschinen mit Störung bzw. gewählt). Sie werden erst nach dem ersten Bild eingeblendet (sonst fehlte die erste).
  - Farben nur über CSS-Variablen `--raum-*` (hell/dunkel, inkl. `--raum-ampel-*`, `--raum-licht`), gelesen in `raum/farben.js` (`useRaum`), neu bei `darstellungswechsel`. `prefers-reduced-motion`: Figuren stehen, Kamera springt, `frameloop="demand"`.
  - `Canvas resize={{ offsetSize: true }}`: Größe ohne CSS-Transform messen (die Ebene wird beim Hineinzoomen skaliert).
- **Land erkennbar** (`raum/Landesdeko.js`): Fahnen am Tor (Land, Firma, Land), Torschild in Landessprache/-schrift, ein typisches Objekt je Land (DE Biergarten, MX Taco-Truck/Kakteen, CN Ehrentor mit Laternen, US Wasserturm, IN Tuk-Tuks/Palmen, FR Eiffelturm/Café, RU Birken/Zwiebelturm-Kiosk, PL Pierogi-Stand) auf `landPlatz` (`landGroesse`). Flaggen und Schrift als Canvas-Textur (keine Bild- oder Schriftdateien); Nationalfarben sind dort fest hinterlegt. Realistischer: Betonvorplätze um die Hallen (`--raum-beton`), Trapezblech-Wände (`rippenTextur`), Oberlichter auf Flachdächern. Laternen bis 18 m um die geöffnete Halle werden durchsichtig.
- **Abwechslung je Werk** ohne Datenbankänderung: `lib/karten/werkGestaltung.js` (Pseudozufall aus dem Kürzel): Gelände gespiegelt, Dachform (flach/Sattel/Shed) und -farbe, Hallenhöhe, Bürogebäude, Tanks/Silos, Bäume. Gilt für 2D-Lageplan und 3D gleich.
- **Melden sieht bewusst anders aus als die Störungskarte:** warmer Orange-Ton, Schritt-Leiste `components/karten/MeldeSchritte.js` (1 Land → 2 Werk → 3 Gebäude → 4 Maschine → 5 Beschreibung) statt Pfad, und **keine Störungszahlen**: `WeltKarte`, `LandKarte`, `Lageplan` und `Grundriss` bekommen `neutral` (Ortsmarken, Farbe `stufe-neutral`), Legende und Zahlen in den Listen entfallen. CSS: Abschnitt 5 in `app/globals.css` (`.explorer-melden`).
- Melden: `app/melden/MeldeAssistent.js` (erst Karte, nach Wahl der Maschine das Formular; „Ändern“ öffnet die Karte im Gebäude der Maschine) und `MeldeFormular.js` (sendet `maschine_id` als verstecktes Feld). `?maschine=<id>` springt direkt zum Formular, `?standort=<id>` startet im Werk.

## Statistik (`app/statistik/`)

- `page.js` lädt die Störmeldungen des Zeitraums **einmal** (mit Monat, Wochentag, Stunde nach deutscher Zeit, Reparatur- und Ausfallminuten), dazu Maschinen mit Gebäude/Standort, verbaute Ersatzteile und Techniker (4 Abfragen).
- `StatistikExplorer.js` rechnet im Browser je Ebene (weltweit → Land → Werk → Gebäude → Maschine). Kacheln „im Vergleich“ zoomen hinein, der Pfad oben heraus. Die Adresse wird per `history.replaceState` mitgeführt (`?von&bis&land` bzw. `&werk&halle&maschine`, alt: `?standort=<id>`).
- Definitionen wie in den Views: MTTR = Ø (ende − start) erledigter Aufträge, Ausfallzeit = Σ (ende − Meldung) erledigter Aufträge, MTBF = Zeitraum / Anzahl Störungen.
- Diagramme: `Diagramm.js` (Chart.js, eine Reihe, eine Farbe, Tabellenansicht darunter). Nie zwei y-Achsen in einem Diagramm – Anzahl und MTTR pro Monat sind zwei Diagramme. Heatmap, Prioritäten, Schichten und Ersatzteile sind HTML/CSS.

## Datenbasis (`app/datenbasis/`)

- `lib/datenbasis.js` liest den Aufbau live aus `pg_catalog`/`information_schema` (Tabellen, Spalten, Schlüssel, ENUMs, Anzahl Datensätze). Neue Tabellen erscheinen automatisch; ihr Platz im Diagramm steht in `PLATZ` in `Datenmodell.js` (fehlende werden hinten angefügt).
- `Datenmodell.js` zeichnet die Fremdschlüssel als SVG-Linien zwischen den Spalten (Positionen werden gemessen). Klick öffnet Spalten und eine Vorschau über `/api/datenbasis/<tabelle>?seite=` (nur Tabellen/Views aus `public`, Name wird gegen die Liste geprüft, Bezeichner über `sql(name)`).
- `Verbindungen.js` zeigt den Live-Status aus `/api/verbindungen`: Datenbank (Zeit, Region, Port), Supabase-Login (`/auth/v1/health`), Vercel (Systemvariablen `VERCEL_*`), GitHub (öffentliche API, 5 Min. zwischengespeichert; privat → Stand über Vercel), Claude/Codex (Kennung in Commit-Nachrichten), Power BI (Views vorhanden). Nie Zugangsdaten ausgeben.

## Seitenleiste & Logo

- `components/Seitenleiste.js` ersetzt die frühere Navigation oben. Bereiche: Überblick (Übersicht, Störungskarte), Instandhaltung (Störung melden, Aufträge mit Zahl offener Aufträge), Auswertung (Statistik), System (Datenbasis). Unten Sprache, Darstellung und Konto (E-Mail der Anmeldung, gewählte Person, „Person wechseln …“, Abmelden).
- Die Leiste liegt bündig am linken Rand (`--leiste-abstand: 0px`) mit Trennlinie `border-right`, ohne Schatten. Auf dem Handy schwebt sie mit Abstand und Rundung.
- Zustand in `<html data-leiste="auf|zu">`, gemerkt in `localStorage` unter `seitenleiste`. Das Start-Skript in `app/layout.js` setzt ihn vor dem ersten Anzeigen (ohne Wahl: ab 1200 px offen). Die Breite steuert `--leiste-b`, der Inhalt rückt per `.app-rahmen` daneben.
- Eingeklappt wird der Text zur Sprechblase beim Darüberfahren. Unter 768 px gibt es oben `.mobil-kopf`, die Leiste fährt dann von links herein.
- Neue Seiten in `BEREICHE` in `Seitenleiste.js` eintragen (mit `symbol` und gefüllter Variante `symbolAktiv`).
- Logo: `components/Logo.js` (Schild mit Pulslinie auf Akzentfläche, Farbe aus CSS). Das Browser-Symbol `app/icon.svg` hat dieselbe Form mit festen Farben.

## Personen & Rollen

- Tabelle `person` (Rolle als ENUM `rolle`: `Produktion`, `Schichtleitung`, `Instandhaltung`; `standort_id`; `techniker_id` nur bei Instandhaltung). Eingeführt mit `supabase/migrationen/001_personen_und_verlauf.sql`.
- Gewählt wird im Konto-Menü der Seitenleiste über `components/PersonWahl.js` (Fenster per Portal in `<body>`, Liste aus `/api/personen`). Andere Stellen öffnen die Wahl mit `PersonWaehlenKnopf` (Ereignis `person-waehlen`).
- Cookie `person` = URL-kodiertes JSON `{ id, name, rolle, stadt }`. Das Layout liest es ohne Datenbank (`personAusCookie()`) nur zur Anzeige. Für Rechte und Speichern immer `aktuellePerson()` (mit `cache`, gleicht die ID mit der Datenbank ab).
- Rechte: `darfBearbeiten(person)` – Produktion darf melden, aber keine Aufträge bearbeiten und keine Teile buchen. Die Seite sperrt das Formular (`<fieldset disabled>`), die Server-Aktionen prüfen es zusätzlich. Ohne gewählte Person ist alles erlaubt.
- `wartungsauftrag.zugewiesen_von` speichert, wer den Techniker zugewiesen hat. `auftrag_verlauf` (aktion `gemeldet|zugewiesen|status|teil|bearbeitet`, `details`) wird in `meldungAnlegen`, `auftragSpeichern` und `teilBuchen` in derselben Transaktion geschrieben. Auf der Auftragsseite steht die Meldung selbst immer als erster Eintrag (aus `stoermeldung`, auch für alte Meldungen ohne Verlauf).
- Übersicht: Abschnitt „Dir zugewiesene Aufgaben“ (`aufgabenDerPerson` in `app/page.js`) läuft **nach** den 5 gleichzeitigen Abfragen. Instandhaltung: eigene Aufträge; Schichtleitung: Aufträge im Werk, nicht zugewiesene zuerst; Produktion: offene Störungen im Werk.
- Melden: Name der Person in „Gemeldet von“, Karte startet in ihrem Werk. Auftragsseite: „Mir zuweisen“ für Personen der Instandhaltung.
- In der Auswahl steht bei Personen der Instandhaltung die Zahl offener Aufträge ihres Technikers.
- **Ansicht** (Konto → Ansicht, `components/AnsichtWahl.js`, Liste aus `/api/standorte`): nur ein Land bzw. Werk anzeigen, Standard alles. Cookie `ansicht` = `{ land, werk }`, gelesen von `ansichtAusCookie()` in `lib/ansicht.js`; `ansichtBedingung()` liefert die SQL-Bedingung (Abfrage braucht `standort st`). Wirkt auf Übersicht (Hinweis `.ansicht-chip`, kleine Karte), Aufträge (ohne eigenen Standort-Filter), Zahl in der Seitenleiste, Karte und Melden (zeigen nur das Land/Werk, `nachAnsicht()` in `lib/karten/daten.js`) und den Start der Statistik (Adresse bzw. Person gehen vor).
- Rollenfarben: `.rolle-produktion` (orange), `.rolle-schichtleitung` (lila), `.rolle-instandhaltung` (blau), Abzeichen `RollenAbzeichen`.

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

- Tabellen: `land`, `standort`, `gebaeude`, `maschine`, `techniker`, `person`, `stoermeldung`, `wartungsauftrag`, `ersatzteil`, `auftrag_ersatzteil`, `bestellung`, `auftrag_verlauf`.
- `land` (`kuerzel` = ISO 3166-1 als Primärschlüssel, `hauptsitz` höchstens einmal wahr) 1:n `standort` (`land_kuerzel`, Standard `'DE'`; GPS-Position, Geländegröße) 1:n `gebaeude` (Lage auf dem Gelände, `bereiche` als JSONB) 1:n `maschine` (`anlagennummer` eindeutig, `typ` vom ENUM `maschinentyp`, Position und Stellfläche in Metern). Techniker gehören zu einem Standort, Ersatzteile liegen zentral.
- Wertelisten als ENUM-Typen: `auftragsstatus`, `prioritaet` (Reihenfolge niedrig < mittel < hoch, deshalb gehen `ORDER BY prioritaet DESC` und `MAX(prioritaet)`), `schicht`, `bestellstatus`, `ursache`, `maschinentyp`, `rolle`. Gespiegelt in `lib/konstanten.js` (inkl. `MASCHINEN_SYMBOLE`).
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
