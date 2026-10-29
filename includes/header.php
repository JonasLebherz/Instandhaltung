<?php
/**
 * includes/header.php – Kopfbereich jeder Seite
 *
 * Erwartet vor dem Einbinden zwei Variablen:
 *   $seitentitel  – Titel im Browser-Tab
 *   $aktiveSeite  – Dateiname der aktuellen Seite (für die Markierung im Menü)
 */

$seitentitel = $seitentitel ?? APP_NAME;
$aktiveSeite = $aktiveSeite ?? '';

// Einträge der Hauptnavigation: Dateiname => Beschriftung
$navigation = [
    'index.php'       => 'Übersicht',
    'meldung_neu.php' => 'Störung melden',
    'auftraege.php'   => 'Aufträge',
    'statistik.php'   => 'Statistik',
];
?>
<!doctype html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($seitentitel) ?> · <?= e(APP_NAME) ?></title>

    <!-- Bootstrap 5 (Raster, Formulare, Tabellen) per CDN -->
    <link rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
    <!-- Eigenes Design (überschreibt Bootstrap-Standards) -->
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>

<!-- Hauptnavigation: bleibt beim Scrollen oben sichtbar -->
<nav class="navbar navbar-expand-md app-nav sticky-top">
    <div class="container">
        <a class="navbar-brand" href="index.php"><?= e(APP_NAME) ?></a>

        <!-- Menü-Button für schmale Bildschirme (Smartphone/Tablet hochkant) -->
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
                data-bs-target="#hauptmenue" aria-controls="hauptmenue"
                aria-expanded="false" aria-label="Menü ein-/ausblenden">
            <span class="navbar-toggler-icon"></span>
        </button>

        <div class="collapse navbar-collapse" id="hauptmenue">
            <ul class="navbar-nav ms-auto">
                <?php foreach ($navigation as $datei => $beschriftung): ?>
                    <li class="nav-item">
                        <a class="nav-link<?= $datei === $aktiveSeite ? ' active' : '' ?>"
                           <?= $datei === $aktiveSeite ? 'aria-current="page"' : '' ?>
                           href="<?= e($datei) ?>"><?= e($beschriftung) ?></a>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>
    </div>
</nav>

<main class="container app-main">

    <?php // Hinweise aus der Session (z. B. "Gespeichert") einmalig anzeigen ?>
    <?php foreach (flash_holen() as $meldung): ?>
        <div class="hinweis hinweis-<?= e($meldung['typ']) ?>" role="status">
            <?= e($meldung['text']) ?>
        </div>
    <?php endforeach; ?>
