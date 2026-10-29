# Instandhaltungsmanagement

Webanwendung zur Erfassung und Bearbeitung von Maschinenstörungen.
Entstanden im Hochschulprojekt **„Company database“** im Fach **Digital Production** (Hochschule Albstadt-Sigmaringen).

Zielgruppe:

- **Produktionsmitarbeiter** melden Störungen direkt an der Maschine.
- **Schichtleiter** behalten offene Meldungen und Kennzahlen im Blick.
- **Instandhaltungstechniker** bearbeiten Aufträge und buchen Ersatzteile.

Die Anwendung läuft online: Die Webseite liegt bei **Vercel**, die Datenbank bei **Supabase** (PostgreSQL).
Alle im Team arbeiten mit denselben Daten und brauchen nur einen Browser.

> Die frühere Version mit PHP, MySQL und XAMPP liegt im Branch [`php-xampp`](https://github.com/JonasLebherz/Instandhaltung/tree/php-xampp).

## Funktionen

| Seite | Adresse | Inhalt |
|---|---|---|
| Anmelden | `/login` | Login mit E-Mail und Passwort, nur für angelegte Team-Konten |
| Übersicht | `/` | Kennzahlen, offene Meldungen, Aufträge nach Status, Ersatzteile unter Mindestbestand, Wareneingang buchen |
| Störung melden | `/melden` | Formular mit Maschine, Beschreibung, Ursache und Priorität, mit Eingabeprüfung |
| Aufträge | `/auftraege` | Alle Meldungen mit Suche und Filter nach Status, Maschine und Priorität |
| Auftrag bearbeiten | `/auftraege/123` | Techniker zuweisen, Status ändern, Ersatzteile buchen, Auftrag abschließen |
| Statistik | `/statistik` | MTTR, Ausfallzeit pro Maschine, Störungen pro Monat, Top-5-Störursachen, Zeitraumfilter |

**Automatik beim Buchen von Ersatzteilen:** Ist ein Teil nicht in ausreichender Menge auf Lager,
wird nichts gebucht. Der Auftrag wechselt auf **„wartet auf Teil“**, und es wird automatisch eine
Bestellung angelegt. Den Eingang der Lieferung bucht man auf der Übersicht.

**Darstellung:** Hell, Dunkel oder automatisch nach Systemeinstellung (Symbol oben rechts).
Sanfte Animationen, die bei „Bewegung reduzieren“ im Betriebssystem automatisch abgeschaltet werden.

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
6. Zur Kontrolle links **Table Editor** öffnen. Dort stehen 7 Tabellen, z. B. `stoermeldung` mit 150 Einträgen.

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

> **Achtung:** Lokal arbeitet man dann mit **derselben Datenbank** wie die Online-Version.
> Testmeldungen sind also für alle sichtbar. Zurücksetzen geht jederzeit, indem man `supabase/testdaten.sql` erneut ausführt.

## Auswertung mit Power BI

Für Power BI gibt es fertige Views in der Datenbank:

| View | Inhalt |
|---|---|
| `v_mttr_maschine` | MTTR pro Maschine (Minuten und Stunden) |
| `v_ausfallzeit_maschine` | Anzahl Störungen und Ausfallzeit pro Maschine |
| `v_stoerungen_monat` | Störungen pro Monat, aufgeteilt nach Priorität |
| `v_stoerung_details` | Eine Zeile pro Störung mit allen Angaben und Zeiten. Gut geeignet für eigene Filter. |

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

| Tabelle | Inhalt |
|---|---|
| `maschine` | Maschinen mit Standort und Baujahr |
| `techniker` | Techniker mit Qualifikation und Schicht |
| `stoermeldung` | Gemeldete Störungen (Maschine, Zeitpunkt, Beschreibung, Ursache, Priorität) |
| `wartungsauftrag` | Bearbeitung einer Störung: genau ein Auftrag pro Meldung (Techniker, Status, Start, Ende, Maßnahme) |
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
├── layout.js                Grundgerüst: Navigation, Hinweise, Fußzeile, Hell/Dunkel
├── globals.css              Design inkl. Dunkelmodus und Animationen
├── aktionen.js              Alle Aktionen, die Daten ändern (Server-Aktionen)
├── page.js                  Übersicht
├── melden/                  Störung melden
├── auftraege/               Auftragsübersicht und [id]/ = Auftrag bearbeiten
├── statistik/               Statistik und Diagramme
└── login/                   Anmeldung
components/                  Wiederverwendbare Bausteine (Navigation, Pills, Kennzahlen …)
lib/                         Datenbankverbindung, Login-Prüfung, Formatierung, Wertelisten
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
| Änderungen erscheinen nicht online | Bei Vercel unter **Deployments** prüfen, ob der letzte Build erfolgreich war (grün). |
