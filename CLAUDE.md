# CLAUDE.md

## Projekt

Instandhaltungsmanagement als Webanwendung. Hochschulprojekt „Company database“ im Fach Digital Production.
Zielgruppe: Produktionsmitarbeiter, Schichtleiter, Instandhaltungstechniker.
Die Anwendung muss unter **XAMPP auf Windows** laufen (Apache, PHP 8, MySQL/MariaDB).

## Stand

- **Fertig:** Oberfläche mit allen fünf Seiten, Layout und Design.
- **Offen:**
  - `database/schema.sql` mit Tabellen, Fremdschlüsseln, Indizes und Views für Power BI
  - `database/testdaten.sql` mit 8 Maschinen, 5 Technikern, 15 Ersatzteilen und ca. 150 Meldungen über 12 Monate, einige davon noch offen
  - Danach alle Seiten gegen die echte Datenbank testen. Bisher sind sie nur mit `php -l` und gegen Beispieldaten geprüft.

## Technik & Konventionen

- PHP 8 **ohne Framework**. Jede Seite ist eine eigene `.php`-Datei im Hauptordner.
- Jede Seite beginnt mit `require_once __DIR__ . '/includes/funktionen.php';`. Das lädt automatisch `db.php` und `config.php`.
- Seitenaufbau: erst PHP-Logik (Daten laden, POST verarbeiten), dann `$seitentitel` und `$aktiveSeite` setzen, dann `includes/header.php` einbinden, HTML ausgeben und zum Schluss `includes/footer.php` einbinden.
- Datenbank: nur über `db()`, das liefert eine PDO-Instanz. **Immer** `prepare()` und `execute()` mit Platzhaltern verwenden, nie Werte in SQL-Strings einsetzen.
  - Wegen `ATTR_EMULATE_PREPARES = false` darf ein benannter Platzhalter pro Statement nur **einmal** vorkommen.
- Ausgabe: **jede** dynamische Ausgabe läuft über `e()`, das entspricht `htmlspecialchars`.
- Formulare: POST mit `csrf_feld()`, prüfen mit `csrf_pruefen()`. Danach das Muster Post/Redirect/Get mit `flash()` und `weiterleiten()`.
- Formularfehler werden als Array `$fehler['feldname']` gesammelt und mit `fehlerklasse()` und `fehlertext()` angezeigt. Die Formulare haben `novalidate`, damit die Prüfung serverseitig auf Deutsch passiert.
- Mehrere zusammenhängende Schreibzugriffe laufen in einer Transaktion. Bestandsänderungen sperren die Zeile vorher mit `SELECT … FOR UPDATE`.
- Sprache: Oberfläche, Bezeichner, Kommentare und Doku sind auf **Deutsch**. Der Code ist ausführlich kommentiert, weil er in der Projektdoku erklärt wird.
- Bootstrap 5.3.3 und Chart.js 4.4.1 kommen per CDN von jsdelivr. Es gibt keinen Build-Schritt.

## Design

Angelehnt an die Apple Human Interface Guidelines, aber **ohne** Apple-Logos oder Markenzeichen.

- Hintergrund `#f5f5f7`, weiße Karten (`.karte`) mit 16px Radius und weichem Schatten.
- Einzige Akzentfarbe ist `#0071e3`.
- Status und Priorität werden als dezente Pills angezeigt (`status_pill()`, `prioritaet_pill()`), immer mit Text.
- Große Kennzahlen über `.kennzahl`, `.kennzahl-wert` und `.kennzahl-label`.
- Alle Farben sind CSS-Variablen in `assets/css/style.css`.
- Die Seiten müssen auf dem Tablet bedienbar sein: große Touch-Ziele, Tabellenspalten werden ab `md`/`lg` ein- und ausgeblendet.

## Datenmodell (Annahmen, an die sich `schema.sql` halten muss)

- Tabellen: `maschine`, `techniker`, `stoermeldung`, `wartungsauftrag`, `ersatzteil`, `auftrag_ersatzteil`, `bestellung`. Die Spalten stehen in der Aufgabenstellung bzw. ergeben sich aus den Queries.
- **Zu jeder Störmeldung gibt es genau einen Wartungsauftrag.** `meldung_neu.php` legt beide in einer Transaktion an. Links auf Detailseiten verwenden die **Auftrags-ID**: `auftrag_bearbeiten.php?id=`.
- `wartungsauftrag.status` ist ein ENUM: `'gemeldet','zugewiesen','in Arbeit','wartet auf Teil','erledigt'`. Die Werte sind in `STATUS_LISTE` in `includes/funktionen.php` gespiegelt.
- `stoermeldung.prioritaet` ist ein ENUM: `'niedrig','mittel','hoch'`.
- `stoermeldung.ursache_kategorie` ist VARCHAR mit den Werten aus `URSACHEN_LISTE`.
- `techniker_id`, `start_zeit`, `ende_zeit` und `massnahme` sind NULL-fähig.
- `auftrag_ersatzteil` hat den Primärschlüssel `(auftrag_id, ersatzteil_id)`. Der wird für `ON DUPLICATE KEY UPDATE` benötigt.
- `bestellung.status` ist ein ENUM: `'bestellt','geliefert'`. `lieferdatum` ist das tatsächliche Lieferdatum und bis zur Lieferung NULL.
- Kennzahlen:
  - Reparaturdauer = `ende_zeit - start_zeit`
  - MTTR = Durchschnitt der Reparaturdauer über alle erledigten Aufträge
  - Ausfallzeit = `ende_zeit - stoermeldung.zeitpunkt`
  - Die SQL-Views für Power BI sollen genau diese Definitionen verwenden.
