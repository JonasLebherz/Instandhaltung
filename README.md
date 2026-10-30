# Instandhaltungsmanagement

Webanwendung zur Erfassung und Bearbeitung von Maschinenstörungen.
Entstanden im Hochschulprojekt **„Company database“** im Fach **Digital Production** (Hochschule Albstadt-Sigmaringen).

Zielgruppe:

- **Produktionsmitarbeiter** melden Störungen direkt an der Maschine.
- **Schichtleiter** behalten offene Meldungen und Kennzahlen im Blick.
- **Instandhaltungstechniker** bearbeiten Aufträge und buchen Ersatzteile.

Die Anwendung läuft online: Die Webseite liegt bei **Vercel**, die Datenbank bei **Supabase** (PostgreSQL).
Alle im Team arbeiten mit denselben Daten und brauchen nur einen Browser.

**Beispielunternehmen:** Ein fiktives, international tätiges Industrieunternehmen mit Hauptsitz in Deutschland
(Stammwerk Albstadt). **19 Werke in 8 Ländern**: 10 in Deutschland, dazu USA (2), China (2), Mexiko, Indien,
Frankreich, Russland und Polen – zusammen gut 50 Gebäude und **207 Maschinen**. Dazu kommen rund 1.000 Störmeldungen
aus den letzten 12 Monaten.

> Die frühere Version mit PHP, MySQL und XAMPP liegt im Branch [`php-xampp`](https://github.com/JonasLebherz/Instandhaltung/tree/php-xampp).

## Funktionen

| Seite | Adresse | Inhalt |
|---|---|---|
| Anmelden | `/login` | Login mit E-Mail und Passwort, nur für angelegte Team-Konten |
| Übersicht | `/` | Aufgaben der gewählten Person („Dir zugewiesene Aufgaben“), Kennzahlen, offene Meldungen, Aufträge nach Status, kleine Weltkarte (Klick öffnet die Störungskarte im Land), Ersatzteile unter Mindestbestand, Wareneingang buchen |
| Störung melden | `/melden` | In vier Schritten mit eigener Schritt-Leiste: Werk → Gebäude → Maschine auf der Karte antippen (ohne Störungszahlen), dann Beschreibung, Ursache und Priorität angeben (mit Eingabeprüfung) |
| Störungskarte | `/karte` | Weltkarte mit allen Ländern und der Zahl offener Störungen (Europa vergrößert in einer Lupe). Ein Klick zoomt animiert in das Land (Karte mit seinen Werken), dann in das Werk (Lageplan mit Gebäuden, offenen Störungen, Technikern vor Ort) und in das Gebäude (Grundriss mit allen Maschinen). Werk und Halle gibt es auch **in 3D**: Hallen mit Dach, Klick fliegt hinein, Maschinen als einfache Formen, laufende Figuren; drehen und zoomen mit Maus oder Finger. Jedes Werk sieht etwas anders aus. |
| Aufträge | `/auftraege` | Alle Meldungen mit Suche und Filter nach Status, Standort, Maschine und Priorität |
| Auftrag bearbeiten | `/auftraege/123` | Techniker zuweisen („Mir zuweisen“), Status ändern, Ersatzteile buchen, Auftrag abschließen; Verlauf zeigt, wer wann gemeldet, zugewiesen und bearbeitet hat |
| Statistik | `/statistik` | Zum Hineinzoomen wie die Karte: alle Standorte → Werk → Gebäude → Maschine. Je Ebene MTTR, Ausfallzeit, Störungen, offene Aufträge, MTBF bzw. Störungen je Maschine, Vergleich der Unterebene, Störungen und MTTR pro Monat, Ursachen, Wochentag × Uhrzeit, Prioritäten, Schichten, Techniker, verbaute Ersatzteile. Filter nach Zeitraum. |
| Datenbasis | `/datenbasis` | Verbindungen mit Live-Status (Claude/Codex → GitHub → Vercel → Supabase-Datenbank und -Login, Power BI), Datenmodell als Diagramm mit allen Tabellen, Spalten und Beziehungen, Views, Wertelisten und eine Vorschau der Datensätze jeder Tabelle |

**Automatik beim Buchen von Ersatzteilen:** Ist ein Teil nicht in ausreichender Menge auf Lager,
wird nichts gebucht. Der Auftrag wechselt auf **„wartet auf Teil“**, und es wird automatisch eine
Bestellung angelegt. Den Eingang der Lieferung bucht man auf der Übersicht.

**Personen und Rollen:** Unten in der Seitenleiste (Konto) steht die echte Anmeldung (E-Mail). Zusätzlich
wählt man eine fiktive Person des Unternehmens, als die man arbeitet – mit Rolle und Werk:

| Rolle | darf | Übersicht zeigt |
|---|---|---|
| Produktion | Störungen melden (Name ist vorausgefüllt, Karte startet im eigenen Werk) – Aufträge nur ansehen | offene Störungen im eigenen Werk |
| Schichtleitung | Techniker zuweisen, Aufträge bearbeiten | offene Aufträge im eigenen Werk, nicht zugewiesene zuerst |
| Instandhaltung | eigene Aufträge bearbeiten, „Mir zuweisen“ | die dem eigenen Techniker zugewiesenen Aufträge |

Gespeichert wird, wer einen Techniker zugewiesen hat (`zugewiesen_von`), und jeder Schritt landet im Verlauf (`auftrag_verlauf`).

**Direktlinks:**
- `/melden?maschine=12` springt direkt zur Beschreibung. Das eignet sich z. B. für einen QR-Code an der Maschine.
- `/karte?werk=ham&halle=h2&maschine=12` öffnet die Karte gleich im Grundriss mit markierter Maschine.

**Störungskarte ohne Wartezeit:** Alle Standorte, Gebäude und Maschinen werden beim Öffnen einmal geladen
(nur wenige Kilobyte). Das Hinein- und Herauszoomen läuft danach komplett im Browser, ohne die Seite neu zu laden.

**Darstellung:**
- Ruhige „Glas“-Optik mit halbtransparenten Karten auf einem weichen Hintergrund.
- Navigation in einer Seitenleiste links, bündig am Rand mit feiner Trennlinie: eingeklappt nur Symbole, aufgeklappt mit Text. Unten stehen Sprache, Darstellung und Konto (mit Personenwahl). Auf dem Handy öffnet sie sich über den Menü-Knopf.
- Hell, Dunkel oder automatisch nach Systemeinstellung (unten in der Seitenleiste).
- Sprache Deutsch oder Englisch (unten in der Seitenleiste bzw. auf der Login-Seite). Daten wie Maschinennamen und Beschreibungen bleiben so, wie sie eingegeben wurden.
- Sanfte Animationen.
- Bei „Bewegung reduzieren“ bzw. „Transparenz reduzieren“ im Betriebssystem werden Animationen und Glas-Effekt automatisch abgeschaltet.

## Technik

| Teil | Verwendet | Wofür |
|---|---|---|
| Webanwendung | [Next.js](https://nextjs.org) 15 (React 19, JavaScript) | Seiten und Formulare; Datenbankzugriffe laufen nur auf dem Server |
| Datenbank | [Supabase](https://supabase.com) (PostgreSQL) | Tabellen, Views, Benutzerkonten (Login) |
| Hosting | [Vercel](https://vercel.com) | Veröffentlicht die Seite, aktualisiert sie automatisch bei jedem Push |
| Design | Bootstrap 5 (Raster), Bootstrap Icons, eigenes CSS | ruhige, reduzierte Oberfläche mit Dunkelmodus |
| Diagramme | Chart.js 4 | Statistikseite |

Alle Kosten: **0 €** (kostenlose Tarife von Supabase und Vercel).

## Einrichtung (einmalig, ca. 30 Minuten)

Diese Schritte macht **eine Person** (Projektleitung). Danach arbeitet das ganze Team mit derselben Online-Version.

### 1. Supabase: Datenbank anlegen

1. Auf <https://supabase.com> mit dem GitHub-Konto anmelden (**Sign in with GitHub**).
2. **New project** wählen:
   - Name: `instandhaltung`
   - **Database Password**: ein sicheres Passwort vergeben und **aufschreiben**. Es wird später gebraucht.
   - Region: **Central EU (Frankfurt)**
   - Auf **Create new project** klicken und 1–2 Minuten warten.
3. Links auf **SQL Editor** → **New query** klicken.
4. Den kompletten Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen und **Run** klicken.
   Supabase warnt eventuell vor „destructive operations“. Das liegt an den `DROP`-Befehlen am Anfang, also mit **Run this query** bestätigen.
5. Eine neue Abfrage öffnen, den Inhalt von [`supabase/testdaten.sql`](supabase/testdaten.sql) einfügen und **Run** klicken.
6. Zur Kontrolle links **Table Editor** öffnen. Dort stehen 9 Tabellen, z. B. `standort` mit 10 und `maschine` mit 107 Einträgen.

### 2. Supabase: Team-Konten anlegen

1. Links auf **Authentication** → **Users** → **Add user** → **Create new user** klicken.
2. E-Mail-Adresse und ein Start-Passwort eintragen und **Auto Confirm User** anhaken.
3. Das für jedes Teammitglied wiederholen.
4. Empfohlen: Unter **Authentication → Sign In / Providers** die Option **Allow new users to sign up** ausschalten.
   Dann kann sich niemand selbst ein Konto anlegen.

### 3. Zugangsdaten heraussuchen

Oben im Supabase-Projekt auf **Connect** klicken:

| Wert | Wo | Beispiel |
|---|---|---|
| `DATABASE_URL` | **Connect** → **Transaction pooler** → URI kopieren, `[YOUR-PASSWORD]` durch das Passwort aus Schritt 1 ersetzen | `postgresql://postgres.abcd:…@aws-0-eu-central-1.pooler.supabase.com:6543/postgres` |
| `SUPABASE_URL` | **Project Settings** → **Data API** → Project URL | `https://abcd.supabase.co` |
| `SUPABASE_ANON_KEY` | **Project Settings** → **API Keys** → `anon` bzw. **publishable** key | `eyJ…` oder `sb_publishable_…` |

### 4. Vercel: Webseite veröffentlichen

1. Auf <https://vercel.com> mit GitHub anmelden. Den kostenlosen Tarif **Hobby** wählen.
2. **Add New…** → **Project** → das Repository **Instandhaltung** auswählen und auf **Import** klicken.
   Erscheint es nicht, über **Adjust GitHub App Permissions** den Zugriff freigeben.
3. Vor dem Deploy **Environment Variables** aufklappen und die drei Werte aus Schritt 3 eintragen:
   `DATABASE_URL`, `SUPABASE_URL` und `SUPABASE_ANON_KEY`.
   **Nicht** `LOGIN_DEAKTIVIERT` setzen.
4. Auf **Deploy** klicken. Nach ca. 1 Minute ist die Seite unter `https://instandhaltung-….vercel.app` erreichbar.
5. Testen: Die Seite öffnen, mit einem Konto aus Schritt 2 anmelden, und die Übersicht erscheint.

Ab jetzt baut Vercel die Seite **bei jedem Push nach GitHub automatisch neu**. Niemand muss etwas hochladen.

### Datenbank aktualisieren

Änderungen am Datenbankschema kommen als **Migrationsdatei** in `supabase/migrationen/`, durchnummeriert:

| Datei | Inhalt |
|---|---|
| `001_personen_und_verlauf.sql` | Personen mit Rollen, „zugewiesen von“, Verlauf der Aufträge |
| `002_laender_und_auslandswerke.sql` | Länder, 9 Werke im Ausland mit Gebäuden, Maschinen, Personen und Störungen |

Jede Datei im SQL Editor öffnen und **in der Reihenfolge der Nummern** einmal ausführen. Vorhandene Daten bleiben erhalten,
mehrfaches Ausführen schadet nicht.

Nur für einen kompletten Neuanfang: erst `schema.sql` und danach `testdaten.sql` ausführen.
**Achtung:** Dabei werden alle Daten auf den Stand der Testdaten zurückgesetzt. Die Team-Konten (Login) bleiben erhalten.

## Mitarbeit im Team

- **Nur benutzen:** Link öffnen und anmelden. Mehr braucht es nicht.
- **Am Code arbeiten:** Am einfachsten mit Claude oder Codex, die Änderungen nach GitHub pushen. Vercel
  veröffentlicht sie dann automatisch. Siehe die Team-Anleitungen unter `docs/`.

### Lokal entwickeln (optional)

Wer den Code auf dem eigenen Rechner ausprobieren möchte:

1. [Node.js](https://nodejs.org) installieren (Version „LTS“).
2. Das Repository klonen, z. B. mit GitHub Desktop.
3. Im Projektordner die Datei `.env.example` nach **`.env.local`** kopieren und die Werte aus Schritt 3 eintragen.
4. Im Terminal im Projektordner ausführen:
   ```bash
   npm install
   npm run dev
   ```
5. <http://localhost:3000> öffnen.
6. Neue Texte in der Oberfläche? `npm run texte` zeigt, welche englischen Übersetzungen in `lib/sprache/en.js` noch fehlen.
7. Automatische Tests: `tests/e2e.cjs` prüft alle Abläufe im Browser (Playwright) – aber nur gegen eine **lokale** Datenbank, weil die Tests Daten ändern. Die Voraussetzungen stehen im Kopf der Datei.

> **Achtung:** Lokal arbeitet man dann mit **derselben Datenbank** wie die Online-Version.
> Testmeldungen sind also für alle sichtbar. Zurücksetzen geht jederzeit, indem man `supabase/testdaten.sql` erneut ausführt.

## Auswertung mit Power BI

Für Power BI gibt es fertige Views in der Datenbank:

| View | Inhalt |
|---|---|
| `v_mttr_maschine` | MTTR pro Maschine (Minuten und Stunden) |
| `v_ausfallzeit_maschine` | Anzahl Störungen und Ausfallzeit pro Maschine |
| `v_kennzahlen_standort` | Pro Werk: Gebäude, Maschinen, Störungen, offene Aufträge, MTTR, Ausfallzeit, GPS-Position (für eine Kartenansicht in Power BI) |
| `v_stoerungen_monat` | Störungen pro Monat, aufgeteilt nach Priorität |
| `v_stoerung_details` | Eine Zeile pro Störung mit allen Angaben und Zeiten, inkl. Standort und Gebäude. Gut geeignet für eigene Filter. |

So verbindet ihr Power BI Desktop mit der Datenbank:

1. In Supabase auf **Connect** → **Session pooler** klicken und dort **Host**, **Port** (5432), **Database** und **User** ablesen.
2. In Power BI auf **Daten abrufen** → **PostgreSQL-Datenbank** klicken.
3. Server: `<Host>:5432`, Datenbank: `postgres`.
4. Anmeldung über **Datenbank**: Benutzer `postgres.<projekt-id>` und das Datenbank-Passwort.
5. Die Views (`v_…`) auswählen und **Laden** klicken.

## Kennzahlen: Definitionen

- **Reparaturdauer:** Zeit vom Arbeitsbeginn bis zum Ende der Reparatur (`start_zeit` bis `ende_zeit`).
- **MTTR (Mean Time To Repair):** durchschnittliche Reparaturdauer aller erledigten Aufträge.
- **Ausfallzeit:** Zeit von der Störmeldung bis zum Ende der Reparatur (`zeitpunkt` der Meldung bis `ende_zeit`).

## Datenmodell

```
land 1 ── n standort (Werk) 1 ── n gebaeude 1 ── n maschine 1 ── n stoermeldung 1 ── 1 wartungsauftrag
```

| Tabelle | Inhalt |
|---|---|
| `land` | Länder mit Werken (ISO-Kürzel, Name, Hauptsitz) |
| `standort` | Werke mit Land, Adresse, Schwerpunkt, GPS-Position (Breiten-/Längengrad) und Größe des Geländes |
| `gebaeude` | Gebäude eines Werks mit Lage auf dem Werksgelände und Raumaufteilung (`bereiche`, JSON) |
| `maschine` | Maschinen mit Anlagennummer, Typ, Baujahr und Position bzw. Stellfläche im Grundriss (Meter) |
| `techniker` | Techniker mit Standort, Qualifikation und Schicht |
| `person` | Fiktive Personen des Unternehmens mit Rolle (Produktion, Schichtleitung, Instandhaltung) und Werk; Personen der Instandhaltung sind mit ihrem Techniker verbunden |
| `stoermeldung` | Gemeldete Störungen (Maschine, Zeitpunkt, Beschreibung, Ursache, Priorität) |
| `wartungsauftrag` | Bearbeitung einer Störung: genau ein Auftrag pro Meldung (Techniker, wer zugewiesen hat, Status, Start, Ende, Maßnahme) |
| `auftrag_verlauf` | Wer wann was an einem Auftrag getan hat (gemeldet, zugewiesen, Status, Teil gebucht, bearbeitet) |
| `ersatzteil` | Lagerbestand und Mindestbestand |
| `auftrag_ersatzteil` | Verwendete Ersatzteile pro Auftrag (n:m) |
| `bestellung` | Nachbestellungen von Ersatzteilen |

Status eines Auftrags: **gemeldet → zugewiesen → in Arbeit → wartet auf Teil → erledigt**

## Sicherheit

- **Login:** Alle Seiten und Aktionen sind nur mit Anmeldung erreichbar (`middleware.js` und zusätzlich jede Seite und Aktion).
- **SQL-Injection:** Alle Abfragen übergeben Werte als Parameter (`sql\`… ${wert}\``), nie als Teil des SQL-Textes.
- **Datenbank:** Row Level Security ist für alle Tabellen eingeschaltet. Über die öffentliche Supabase-Schnittstelle sind die Daten nicht erreichbar.
- **Zugangsdaten:** Sie stehen nur in `.env.local` bzw. bei Vercel, nie im Code oder auf GitHub.

## Ordnerstruktur

```
app/                         Seiten (Next.js App Router)
├── layout.js                Grundgerüst: Seitenleiste, Hinweise, Fußzeile, Hell/Dunkel
├── globals.css              Design inkl. Dunkelmodus und Animationen
├── aktionen.js              Alle Aktionen, die Daten ändern (Server-Aktionen)
├── page.js                  Übersicht
├── melden/                  Störung melden
├── auftraege/               Auftragsübersicht und [id]/ = Auftrag bearbeiten
├── statistik/               Statistik mit Zoom (StatistikExplorer) und Diagramme
├── datenbasis/              Verbindungen, Datenmodell und Datenvorschau
├── api/                     Kleine Schnittstellen für die Seiten (offene Aufträge, Verbindungen, Tabellenvorschau)
├── karte/                   Störungskarte mit Zoom (alte Adressen /karte/ham/h2 leiten dorthin um, siehe next.config.mjs)
└── login/                   Anmeldung
components/                  Wiederverwendbare Bausteine (Seitenleiste, Logo, Pills, Kennzahlen …)
components/karten/           Zoom-Karte (KartenExplorer) mit Weltkarte, Länderkarte, Lageplan, Grundriss; raum/ = 3D-Ansicht
lib/                         Datenbankverbindung, Login-Prüfung, Formatierung, Wertelisten
lib/karten/                  Kartendaten (Umriss Deutschland) und Abfragen für die Karte
lib/sprache/                 Übersetzung: index.js (t-Funktion), server.js, en.js (englische Texte)
scripts/texte-pruefen.mjs    Findet fehlende englische Übersetzungen (npm run texte)
middleware.js                Schickt nicht angemeldete Besucher zum Login
supabase/                    schema.sql und testdaten.sql
docs/                        Team-Anleitungen
```

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| „Daten konnten nicht geladen werden“ | Kostenlose Supabase-Projekte werden nach **1 Woche ohne Nutzung pausiert**. Im Supabase-Dashboard auf **Restore project** klicken. Vor Präsentationen rechtzeitig prüfen! |
| „Login nicht eingerichtet“ | `SUPABASE_URL` und `SUPABASE_ANON_KEY` fehlen bei Vercel. Eintragen und unter **Deployments** → **Redeploy** neu bauen. |
| Anmeldung schlägt fehl | Im Supabase-Dashboard prüfen, ob das Konto existiert und bestätigt ist („Auto Confirm User“). |
| Seiten laden sehr langsam | Prüfen, ob die Supabase-Datenbank in Frankfurt (eu-central-1) liegt: In `DATABASE_URL` steht dann `eu-central-1`. Die App läuft laut `vercel.json` ebenfalls in Frankfurt (`fra1`). Liegt die Datenbank woanders, die Region in `vercel.json` anpassen. Außerdem muss `DATABASE_URL` der **Transaction pooler** (Port **6543**) sein. |
| Änderungen erscheinen nicht online | Bei Vercel unter **Deployments** prüfen, ob der letzte Build erfolgreich war (grün). |

## Quellen

- Umriss von Deutschland: [Natural Earth](https://www.naturalearthdata.com) (gemeinfrei), Maßstab 1:50 Mio.,
  über das npm-Paket `world-atlas`. Daraus wurde einmalig mit einer Mercator-Projektion die Datei
  `lib/karten/deutschland.js` erzeugt.
- Die Unternehmensdaten sind frei erfunden. Die Koordinaten der Standorte liegen in den jeweiligen Städten.
