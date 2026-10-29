<?php
/**
 * includes/funktionen.php – Hilfsfunktionen und feste Wertelisten
 *
 * Wird von jeder Seite eingebunden. Enthält:
 *  - die erlaubten Werte für Status, Priorität und Störursachen
 *  - Funktionen zur sicheren Ausgabe (Schutz vor XSS)
 *  - Formatierung von Datum und Dauer
 *  - "Flash"-Meldungen (Hinweise, die nach einer Weiterleitung angezeigt werden)
 *  - CSRF-Schutz für Formulare
 */

require_once __DIR__ . '/db.php';

// Session starten (wird für Flash-Meldungen und CSRF-Token benötigt)
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/* ------------------------------------------------------------------------
 * Feste Wertelisten
 * Diese Werte müssen mit den ENUM-Definitionen in database/schema.sql
 * übereinstimmen.
 * --------------------------------------------------------------------- */

// Status eines Wartungsauftrags in der Reihenfolge des Ablaufs.
// Schlüssel = Wert in der Datenbank, Wert = CSS-Klasse der Status-Pill.
const STATUS_LISTE = [
    'gemeldet'        => 'pill-grau',
    'zugewiesen'      => 'pill-blau',
    'in Arbeit'       => 'pill-lila',
    'wartet auf Teil' => 'pill-orange',
    'erledigt'        => 'pill-gruen',
];

// Alle Status außer "erledigt" gelten als offen
const OFFENE_STATUS = ['gemeldet', 'zugewiesen', 'in Arbeit', 'wartet auf Teil'];

// Prioritäten einer Störmeldung
const PRIORITAET_LISTE = [
    'hoch'    => 'pill-rot',
    'mittel'  => 'pill-orange',
    'niedrig' => 'pill-grau',
];

// Kategorien für die Störursache
const URSACHEN_LISTE = [
    'Mechanischer Defekt',
    'Elektrischer Fehler',
    'Hydraulik/Pneumatik',
    'Steuerung/Software',
    'Verschleiß',
    'Bedienfehler',
    'Materialfehler',
    'Sonstiges',
];

// Status einer Ersatzteil-Bestellung
const BESTELLSTATUS_LISTE = [
    'bestellt'  => 'pill-orange',
    'geliefert' => 'pill-gruen',
];

/* ------------------------------------------------------------------------
 * Ausgabe & Formatierung
 * --------------------------------------------------------------------- */

/**
 * Wandelt Sonderzeichen in HTML-Entities um.
 * JEDE Ausgabe von Daten aus der Datenbank oder aus Formularen läuft
 * über diese Funktion – so kann kein fremdes HTML/JavaScript eingeschleust
 * werden (Cross-Site-Scripting).
 */
function e(?string $text): string
{
    return htmlspecialchars($text ?? '', ENT_QUOTES, 'UTF-8');
}

/** Gibt eine farbige "Pill" für einen Auftragsstatus aus (Farbe + Text). */
function status_pill(string $status): string
{
    $klasse = STATUS_LISTE[$status] ?? 'pill-grau';
    return '<span class="pill ' . $klasse . '">' . e($status) . '</span>';
}

/** Gibt eine farbige "Pill" für eine Priorität aus. */
function prioritaet_pill(string $prioritaet): string
{
    $klasse = PRIORITAET_LISTE[$prioritaet] ?? 'pill-grau';
    return '<span class="pill ' . $klasse . '">' . e(ucfirst($prioritaet)) . '</span>';
}

/** Formatiert einen Datenbank-Zeitstempel als deutsches Datum mit Uhrzeit. */
function datum_zeit(?string $zeitstempel): string
{
    if (empty($zeitstempel)) {
        return '–';
    }
    return date('d.m.Y, H:i', strtotime($zeitstempel));
}

/** Formatiert einen Zeitstempel nur als Datum (TT.MM.JJJJ). */
function datum(?string $zeitstempel): string
{
    if (empty($zeitstempel)) {
        return '–';
    }
    return date('d.m.Y', strtotime($zeitstempel));
}

/**
 * Formatiert eine Dauer in Minuten lesbar, z. B. "2 h 15 min" oder "3 d 4 h".
 */
function dauer(?float $minuten): string
{
    if ($minuten === null) {
        return '–';
    }
    $minuten = (int) round($minuten);
    if ($minuten < 60) {
        return $minuten . ' min';
    }
    $stunden = intdiv($minuten, 60);
    if ($stunden < 24) {
        $rest = $minuten % 60;
        return $stunden . ' h' . ($rest > 0 ? ' ' . $rest . ' min' : '');
    }
    $tage = intdiv($stunden, 24);
    $rest = $stunden % 24;
    return $tage . ' d' . ($rest > 0 ? ' ' . $rest . ' h' : '');
}

/** Formatiert eine Zahl mit deutschem Dezimaltrennzeichen (Komma). */
function zahl(?float $wert, int $nachkomma = 1): string
{
    if ($wert === null) {
        return '–';
    }
    return number_format($wert, $nachkomma, ',', '.');
}

/**
 * Wandelt einen Zeitstempel in das Format für <input type="datetime-local">
 * (JJJJ-MM-TTTHH:MM) um.
 */
function fuer_datetime_input(?string $zeitstempel): string
{
    if (empty($zeitstempel)) {
        return '';
    }
    return date('Y-m-d\TH:i', strtotime($zeitstempel));
}

/**
 * Prüft einen Wert aus <input type="datetime-local"> und gibt ihn im
 * MySQL-Format (JJJJ-MM-TT HH:MM:SS) zurück – oder null, wenn ungültig.
 */
function datetime_aus_input(string $eingabe): ?string
{
    $dt = DateTime::createFromFormat('Y-m-d\TH:i', $eingabe);
    if ($dt === false || $dt->format('Y-m-d\TH:i') !== $eingabe) {
        return null;
    }
    return $dt->format('Y-m-d H:i:s');
}

/* ------------------------------------------------------------------------
 * Formular-Fehler
 * Fehler werden als Array "Feldname => Meldung" gesammelt.
 * --------------------------------------------------------------------- */

/** Gibt " is-invalid" zurück, wenn das Feld einen Fehler hat (Feld wird rot markiert). */
function fehlerklasse(array $fehler, string $feld): string
{
    return isset($fehler[$feld]) ? ' is-invalid' : '';
}

/** Gibt die Fehlermeldung direkt unter einem Feld aus (falls vorhanden). */
function fehlertext(array $fehler, string $feld): string
{
    return isset($fehler[$feld])
        ? '<div class="invalid-feedback d-block">' . e($fehler[$feld]) . '</div>'
        : '';
}

/* ------------------------------------------------------------------------
 * Flash-Meldungen
 * Nach dem Speichern eines Formulars wird auf eine andere Seite
 * weitergeleitet (Post/Redirect/Get). Die Erfolgsmeldung wird dafür kurz in
 * der Session gespeichert und auf der nächsten Seite einmalig angezeigt.
 * --------------------------------------------------------------------- */

/** Speichert eine Meldung. Typ: 'erfolg', 'hinweis' oder 'fehler'. */
function flash(string $typ, string $text): void
{
    $_SESSION['flash'][] = ['typ' => $typ, 'text' => $text];
}

/** Liest alle gespeicherten Meldungen aus und löscht sie danach. */
function flash_holen(): array
{
    $meldungen = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $meldungen;
}

/** Leitet auf eine andere Seite weiter und beendet das Skript. */
function weiterleiten(string $ziel): never
{
    header('Location: ' . $ziel);
    exit;
}

/* ------------------------------------------------------------------------
 * CSRF-Schutz
 * Jedes Formular enthält ein zufälliges Token, das auch in der Session
 * liegt. Beim Absenden wird verglichen – so können fremde Webseiten keine
 * Formulare im Namen des Benutzers abschicken.
 * --------------------------------------------------------------------- */

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/** Verstecktes Formularfeld mit dem Token. */
function csrf_feld(): string
{
    return '<input type="hidden" name="csrf_token" value="' . e(csrf_token()) . '">';
}

/** Bricht mit Fehler ab, wenn das mitgeschickte Token nicht stimmt. */
function csrf_pruefen(): void
{
    $gesendet = $_POST['csrf_token'] ?? '';
    if (!hash_equals(csrf_token(), $gesendet)) {
        http_response_code(400);
        exit('Ungültige Anfrage (Sicherheitstoken abgelaufen). Bitte Seite neu laden.');
    }
}
