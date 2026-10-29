# Instandhaltungsmanagement

Webanwendung zur Erfassung und Bearbeitung von Maschinenstörungen.
Entstanden im Hochschulprojekt **„Company database“** im Fach **Digital Production**.

Zielgruppe:

- **Produktionsmitarbeiter** melden Störungen direkt an der Maschine.
- **Schichtleiter** behalten offene Meldungen und Kennzahlen im Blick.
- **Instandhaltungstechniker** bearbeiten Aufträge und buchen Ersatzteile.

## Funktionen

| Seite | Datei | Inhalt |
|---|---|---|
| Übersicht | `index.php` | offene Meldungen, Aufträge nach Status, Ersatzteile unter Mindestbestand, Wareneingang buchen |
| Störung melden | `meldung_neu.php` | Formular mit Maschine, Beschreibung, Ursache und Priorität, mit Eingabeprüfung |
| Aufträge | `auftraege.php` | Liste aller Meldungen, filterbar nach Status, Maschine und Priorität |
| Auftrag bearbeiten | `auftrag_bearbeiten.php` | Techniker zuweisen, Status ändern, Ersatzteile buchen, Auftrag abschließen |
| Statistik | `statistik.php` | MTTR, Ausfallzeit pro Maschine, Störungen pro Monat, Top-5-Störursachen, Zeitraumfilter |

**Automatik beim Buchen von Ersatzteilen:** Ist ein Teil nicht in ausreichender Menge
auf Lager, wird nichts gebucht. Stattdessen wechselt der Auftrag auf **„wartet auf Teil“**
und es wird automatisch eine Bestellung angelegt. Den Eingang der Lieferung bucht man
auf der Übersichtsseite.

## Technik

- PHP 8 ohne Framework
- MySQL/MariaDB über PDO mit Prepared Statements
- Bootstrap 5 und Chart.js 4, beide per CDN eingebunden. Dafür braucht der Browser Internetzugang.

## Installation unter XAMPP (Windows)

### 1. XAMPP installieren und starten

1. XAMPP von <https://www.apachefriends.org> herunterladen und installieren. Benötigt wird PHP 8.
2. Das **XAMPP Control Panel** öffnen.
3. Bei **Apache** und bei **MySQL** jeweils auf **Start** klicken. Beide Einträge werden grün.

### 2. Projektordner kopieren

1. Den kompletten Projektordner nach `C:\xampp\htdocs\` kopieren.
2. Den Ordner in `instandhaltung` umbenennen. Ergebnis: `C:\xampp\htdocs\instandhaltung\index.php`.

### 3. Datenbank importieren (phpMyAdmin)

1. Im Browser <http://localhost/phpmyadmin> öffnen.
2. Oben auf den Reiter **Importieren** klicken.
3. Bei **Datei auswählen** die Datei `database/schema.sql` wählen und unten auf **Importieren** klicken.
   Das Skript legt die Datenbank `instandhaltung` mit allen Tabellen und Views an.
4. Links die Datenbank **instandhaltung** anklicken, erneut **Importieren** wählen
   und die Datei `database/testdaten.sql` importieren.
   Sie enthält 8 Maschinen, 5 Techniker, 15 Ersatzteile und 150 Störmeldungen der letzten 12 Monate.

Beide Dateien kann man jederzeit erneut importieren, z. B. um den Ausgangszustand wiederherzustellen.
Dabei werden alle vorhandenen Daten überschrieben. Die Zeitangaben der Testdaten beziehen sich auf den
Importzeitpunkt, die Daten decken also immer die letzten 12 Monate ab.

### 4. Anwendung aufrufen

Im Browser <http://localhost/instandhaltung/> öffnen.

### Zugangsdaten anpassen (falls nötig)

Die Zugangsdaten zur Datenbank stehen zentral in `config.php`. Für eine Standard-XAMPP-Installation
passen sie bereits: Benutzer `root`, kein Passwort. Falls ihr ein Passwort für MySQL vergeben habt,
tragt es dort bei `DB_PASS` ein.

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| „Datenbank nicht erreichbar“ | Prüfen, ob MySQL im XAMPP Control Panel läuft und ob die Datenbank importiert wurde. |
| Apache startet nicht | Port 80 ist belegt, oft durch Skype oder IIS. Das Programm beenden oder in XAMPP den Port ändern. |
| Seite ohne Design, keine Diagramme | Bootstrap und Chart.js kommen aus dem Internet (CDN). Internetverbindung prüfen. |
| Umlaute werden falsch angezeigt | Beide SQL-Dateien erneut importieren. Beim Import in phpMyAdmin den Zeichensatz `utf-8` lassen (Standard). |
| Beim Import von `schema.sql` erscheinen „#1046 Keine Datenbank ausgewählt“ oder „#4092 Unknown VIEW“ | Harmlos, solange oben „Der Import wurde erfolgreich abgeschlossen“ steht. phpMyAdmin zeigt das an, wenn man auf der Startseite (ohne ausgewählte Datenbank) importiert, und beim allerersten Import gibt es die alten Views noch nicht. |
| Fehler beim Import von `testdaten.sql` | Zuerst `schema.sql` importieren, erst danach die Testdaten. |

## Ordnerstruktur

```
instandhaltung/
├── config.php               Zentrale Einstellungen (Datenbank-Zugangsdaten)
├── index.php                Übersicht / Dashboard
├── meldung_neu.php          Störmeldung erfassen
├── auftraege.php            Auftragsübersicht mit Filtern
├── auftrag_bearbeiten.php   Auftrag bearbeiten, Ersatzteile buchen
├── bestellung_geliefert.php Wareneingang buchen (ohne eigene Ansicht)
├── statistik.php            Kennzahlen und Diagramme
├── includes/
│   ├── db.php               Datenbankverbindung (PDO)
│   ├── funktionen.php       Hilfsfunktionen, Wertelisten, CSRF-Schutz
│   ├── header.php           Kopfbereich und Navigation
│   └── footer.php           Fußbereich
├── assets/css/style.css     Eigenes Design
└── database/
    ├── schema.sql           Tabellen, Fremdschlüssel, Indizes und Views
    └── testdaten.sql        Beispieldaten (12 Monate Störhistorie)
```

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

## Auswertung mit Power BI

Für Power BI gibt es fertige Views in der Datenbank:

| View | Inhalt |
|---|---|
| `v_mttr_maschine` | MTTR pro Maschine (Minuten und Stunden) |
| `v_ausfallzeit_maschine` | Anzahl Störungen und Ausfallzeit pro Maschine |
| `v_stoerungen_monat` | Störungen pro Monat, aufgeteilt nach Priorität |
| `v_stoerung_details` | Eine Zeile pro Störung mit allen Angaben und Zeiten. Gut geeignet für eigene Filter in Power BI. |

So verbindet ihr Power BI Desktop mit der Datenbank:

1. Einmalig den **MySQL Connector/NET** installieren: <https://dev.mysql.com/downloads/connector/net/>.
   Power BI benötigt ihn für MySQL/MariaDB.
2. In Power BI auf **Daten abrufen → Weitere … → MySQL-Datenbank** klicken.
3. Server: `localhost`, Datenbank: `instandhaltung` eintragen.
4. Anmeldung über **Datenbank**: Benutzer `root`, Passwort leer (XAMPP-Standard).
5. Die gewünschten Views (`v_…`) auswählen und **Laden** klicken.

XAMPP mit MySQL muss dabei laufen.

## Kennzahlen: Definitionen

- **Reparaturdauer:** Zeit vom Arbeitsbeginn bis zum Ende der Reparatur (`start_zeit` bis `ende_zeit`).
- **MTTR (Mean Time To Repair):** durchschnittliche Reparaturdauer aller erledigten Aufträge.
- **Ausfallzeit:** Zeit von der Störmeldung bis zum Ende der Reparatur (`zeitpunkt` der Meldung bis `ende_zeit`).
