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

> **Hinweis:** Die SQL-Dateien `database/schema.sql` und `database/testdaten.sql`
> kommen im nächsten Projektschritt dazu. Bis dahin zeigt die Anwendung beim Aufruf
> die Meldung „Datenbank nicht erreichbar“.

1. Im Browser <http://localhost/phpmyadmin> öffnen.
2. Oben auf den Reiter **Importieren** klicken.
3. Bei **Datei auswählen** die Datei `database/schema.sql` wählen und unten auf **Importieren** klicken.
   Das Skript legt die Datenbank `instandhaltung` mit allen Tabellen und Views an.
4. Links die Datenbank **instandhaltung** anklicken, erneut **Importieren** wählen
   und die Datei `database/testdaten.sql` importieren.

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
| Umlaute werden falsch angezeigt | Die Datenbank muss mit `utf8mb4` angelegt sein. `schema.sql` macht das automatisch. |

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
└── database/                SQL-Dateien (Schema, Testdaten), folgen im nächsten Schritt
```

## Kennzahlen: Definitionen

- **Reparaturdauer:** Zeit vom Arbeitsbeginn bis zum Ende der Reparatur (`start_zeit` bis `ende_zeit`).
- **MTTR (Mean Time To Repair):** durchschnittliche Reparaturdauer aller erledigten Aufträge.
- **Ausfallzeit:** Zeit von der Störmeldung bis zum Ende der Reparatur (`zeitpunkt` der Meldung bis `ende_zeit`).
