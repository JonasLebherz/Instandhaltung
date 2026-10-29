<?php
/**
 * bestellung_geliefert.php – Wareneingang einer Ersatzteil-Bestellung buchen
 *
 * Wird per Formular (POST) vom Dashboard aufgerufen und zeigt selbst nichts an.
 * Ablauf:
 *  1. Bestellung als "geliefert" markieren und Lieferdatum setzen
 *  2. Lagerbestand des Ersatzteils um die Bestellmenge erhöhen
 *  3. Zurück zum Dashboard
 *
 * Beide Änderungen laufen in einer Transaktion: Entweder werden beide
 * gespeichert oder keine (z. B. bei einem Fehler dazwischen).
 */

require_once __DIR__ . '/includes/funktionen.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    weiterleiten('index.php');
}
csrf_pruefen();

$bestellungId = filter_input(INPUT_POST, 'bestellung_id', FILTER_VALIDATE_INT);
if (!$bestellungId) {
    flash('fehler', 'Ungültige Bestellung.');
    weiterleiten('index.php');
}

$pdo = db();
$pdo->beginTransaction();

try {
    // Bestellung sperren (FOR UPDATE), damit sie nicht doppelt gebucht wird
    $stmt = $pdo->prepare("
        SELECT b.id, b.ersatzteil_id, b.menge, b.status, e.bezeichnung
        FROM bestellung b
        JOIN ersatzteil e ON e.id = b.ersatzteil_id
        WHERE b.id = ?
        FOR UPDATE
    ");
    $stmt->execute([$bestellungId]);
    $bestellung = $stmt->fetch();

    if (!$bestellung || $bestellung['status'] !== 'bestellt') {
        $pdo->rollBack();
        flash('fehler', 'Diese Bestellung ist nicht (mehr) offen.');
        weiterleiten('index.php');
    }

    // 1. Bestellung abschließen
    $stmt = $pdo->prepare("UPDATE bestellung SET status = 'geliefert', lieferdatum = CURDATE() WHERE id = ?");
    $stmt->execute([$bestellungId]);

    // 2. Bestand erhöhen
    $stmt = $pdo->prepare("UPDATE ersatzteil SET bestand = bestand + ? WHERE id = ?");
    $stmt->execute([$bestellung['menge'], $bestellung['ersatzteil_id']]);

    $pdo->commit();

    flash('erfolg', sprintf(
        'Wareneingang gebucht: %d × %s. Aufträge, die auf dieses Teil warten, können fortgesetzt werden.',
        $bestellung['menge'],
        $bestellung['bezeichnung']
    ));
} catch (PDOException $e) {
    $pdo->rollBack();
    flash('fehler', 'Der Wareneingang konnte nicht gespeichert werden.');
}

weiterleiten('index.php');
