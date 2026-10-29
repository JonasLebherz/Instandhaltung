# AGENTS.md

Hinweise für KI-Assistenten wie OpenAI Codex. Claude liest dieselben Regeln aus `CLAUDE.md`.

**Die vollständigen Projektregeln stehen in `CLAUDE.md`. Lies diese Datei vor jeder Änderung.**
Hier die wichtigsten Punkte in Kurzform:

## Projekt

Instandhaltungsmanagement als Webanwendung für ein Hochschulprojekt.
Es muss unter **XAMPP auf Windows** laufen: PHP 8 ohne Framework, MySQL/MariaDB.

## Regeln

- Oberfläche, Bezeichner, Kommentare und Doku sind auf **Deutsch**. Der Code wird ausführlich kommentiert, weil er in der Projektdoku erklärt wird.
- Datenbankzugriff nur über `db()` aus `includes/db.php` und **immer** mit Prepared Statements (`prepare()` + `execute()`). Werte nie direkt in SQL-Strings einsetzen.
- Jede dynamische Ausgabe läuft über `e()`, das entspricht `htmlspecialchars`.
- Formulare: CSRF mit `csrf_feld()` und `csrf_pruefen()`. Danach das Muster Post/Redirect/Get mit `flash()` und `weiterleiten()`.
- Neue Seiten folgen dem Aufbau der bestehenden: `require_once __DIR__ . '/includes/funktionen.php';`, dann die Logik, dann `includes/header.php`, dann HTML, dann `includes/footer.php`.
- Design: Farben nur über die CSS-Variablen in `assets/css/style.css`, eine Akzentfarbe `#0071e3`, Karten mit `.karte`, Status als Pills. Es gibt keinen Build-Schritt, Bootstrap und Chart.js kommen per CDN.
- Änderungen an der Datenbank immer in `database/schema.sql` **und** passend in `database/testdaten.sql` nachziehen. Beide Dateien beginnen mit `SET NAMES utf8mb4`. Die Testdaten leeren Tabellen mit `DELETE`, nicht mit `TRUNCATE`.
- Nach Änderungen prüfen, dass alle PHP-Dateien fehlerfrei sind (`php -l datei.php`).
