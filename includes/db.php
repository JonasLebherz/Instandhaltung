<?php
/**
 * includes/db.php – Datenbankverbindung über PDO
 *
 * Stellt die Funktion db() bereit, die überall in der Anwendung genutzt wird.
 * Die Verbindung wird nur einmal pro Seitenaufruf aufgebaut ("Singleton"):
 * Beim ersten Aufruf wird sie erstellt, danach wird dieselbe Verbindung
 * zurückgegeben.
 *
 * Alle Abfragen laufen über Prepared Statements (prepare + execute mit
 * Platzhaltern). Dadurch werden Benutzereingaben nie direkt in den SQL-Text
 * eingesetzt – das schützt zuverlässig vor SQL-Injection.
 */

require_once __DIR__ . '/../config.php';

function db(): PDO
{
    static $pdo = null;   // bleibt zwischen mehreren Aufrufen erhalten

    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            DB_HOST, DB_PORT, DB_NAME, DB_CHARSET
        );

        $optionen = [
            // Bei SQL-Fehlern eine Exception werfen statt still weiterzulaufen
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            // Ergebnisse standardmäßig als assoziatives Array (Spaltenname => Wert)
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // Echte Prepared Statements des Datenbankservers verwenden
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $optionen);
            // Zeitzone der Sitzung an PHP angleichen (wichtig für NOW())
            $pdo->exec("SET time_zone = '" . date('P') . "'");
        } catch (PDOException $e) {
            zeige_db_fehler($e);
        }
    }

    return $pdo;
}

/**
 * Gibt eine verständliche Fehlerseite aus, wenn keine Verbindung möglich ist
 * (z. B. MySQL in XAMPP nicht gestartet oder Datenbank nicht importiert).
 */
function zeige_db_fehler(PDOException $e): never
{
    http_response_code(500);
    $details = DEBUG ? htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8') : '';
    echo <<<HTML
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Datenbank nicht erreichbar</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           background:#f5f5f7; color:#1d1d1f; margin:0; padding:48px 16px; }
    .karte { max-width:560px; margin:0 auto; background:#fff; border-radius:16px;
             padding:32px; box-shadow:0 4px 24px rgba(0,0,0,.06); }
    h1 { font-size:24px; margin:0 0 12px; }
    p, li { color:#6e6e73; line-height:1.5; }
    code { background:#f5f5f7; padding:2px 6px; border-radius:6px; }
  </style>
</head>
<body>
  <div class="karte">
    <h1>Datenbank nicht erreichbar</h1>
    <p>Die Anwendung konnte keine Verbindung zur Datenbank herstellen. Bitte prüfen:</p>
    <ul>
      <li>Läuft MySQL im XAMPP Control Panel?</li>
      <li>Wurde die Datenbank <code>instandhaltung</code> über phpMyAdmin importiert?</li>
      <li>Stimmen die Zugangsdaten in <code>config.php</code>?</li>
    </ul>
    <p><small>{$details}</small></p>
  </div>
</body>
</html>
HTML;
    exit;
}
