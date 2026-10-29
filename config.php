<?php
/**
 * config.php – Zentrale Konfiguration der Anwendung
 *
 * Hier stehen alle Einstellungen, die sich je nach Rechner/Installation
 * unterscheiden können. Für eine Standard-XAMPP-Installation unter Windows
 * passen die Werte bereits (Benutzer "root" ohne Passwort).
 */

// --- Datenbank-Zugangsdaten ---------------------------------------------
define('DB_HOST', 'localhost');
define('DB_PORT', 3306);
define('DB_NAME', 'instandhaltung');
define('DB_USER', 'root');
define('DB_PASS', '');            // XAMPP-Standard: leeres Passwort
define('DB_CHARSET', 'utf8mb4');  // utf8mb4 = volle Unterstützung für Umlaute & Sonderzeichen

// --- Allgemeine Einstellungen ---------------------------------------------
define('APP_NAME', 'Instandhaltung');

// Zeitzone für alle Datums-/Zeitfunktionen in PHP
date_default_timezone_set('Europe/Berlin');

// Fehleranzeige: Während der Entwicklung sinnvoll (true),
// im "echten" Betrieb sollte das auf false stehen.
define('DEBUG', true);

if (DEBUG) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
}
