<?php
/**
 * meldung_neu.php – Neue Störmeldung erfassen
 *
 * Ablauf (Post/Redirect/Get):
 *  - GET:  leeres Formular anzeigen
 *  - POST: Eingaben prüfen
 *          → Fehler: Formular erneut mit Fehlermeldungen und den bisherigen Eingaben anzeigen
 *          → OK:     Störmeldung + zugehörigen Wartungsauftrag (Status "gemeldet")
 *                    speichern und zur Übersicht weiterleiten
 */

require_once __DIR__ . '/includes/funktionen.php';

$pdo = db();

// Maschinen für die Auswahlliste laden
$stmt = $pdo->prepare("SELECT id, bezeichnung, standort FROM maschine ORDER BY bezeichnung");
$stmt->execute();
$maschinen = $stmt->fetchAll();
$maschinenIds = array_map('intval', array_column($maschinen, 'id'));

// Startwerte des Formulars. Eine Maschine kann per Link vorausgewählt werden
// (z. B. meldung_neu.php?maschine=3 – praktisch für QR-Codes an der Maschine).
$eingabe = [
    'maschine_id'       => (string) (filter_input(INPUT_GET, 'maschine', FILTER_VALIDATE_INT) ?: ''),
    'gemeldet_von'      => '',
    'zeitpunkt'         => date('Y-m-d\TH:i'),
    'beschreibung'      => '',
    'ursache_kategorie' => '',
    'prioritaet'        => 'mittel',
];
$fehler = [];   // Feldname => Fehlermeldung

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_pruefen();

    // Eingaben übernehmen und Leerzeichen am Anfang/Ende entfernen
    foreach (array_keys($eingabe) as $feld) {
        $eingabe[$feld] = trim((string) ($_POST[$feld] ?? ''));
    }

    /* ---------- Eingabeprüfung (serverseitig) ---------- */

    // Maschine: muss eine existierende Maschine sein
    if ($eingabe['maschine_id'] === '') {
        $fehler['maschine_id'] = 'Bitte eine Maschine auswählen.';
    } elseif (!in_array((int) $eingabe['maschine_id'], $maschinenIds, true)) {
        $fehler['maschine_id'] = 'Die gewählte Maschine existiert nicht.';
    }

    // Name der meldenden Person
    if ($eingabe['gemeldet_von'] === '') {
        $fehler['gemeldet_von'] = 'Bitte Ihren Namen angeben.';
    } elseif (mb_strlen($eingabe['gemeldet_von']) > 100) {
        $fehler['gemeldet_von'] = 'Der Name darf höchstens 100 Zeichen lang sein.';
    }

    // Zeitpunkt: gültiges Datum, nicht in der Zukunft
    $zeitpunktDb = datetime_aus_input($eingabe['zeitpunkt']);
    if ($zeitpunktDb === null) {
        $fehler['zeitpunkt'] = 'Bitte einen gültigen Zeitpunkt angeben.';
    } elseif (strtotime($zeitpunktDb) > time() + 300) {   // 5 Minuten Toleranz
        $fehler['zeitpunkt'] = 'Der Zeitpunkt darf nicht in der Zukunft liegen.';
    }

    // Beschreibung: aussagekräftig, aber nicht endlos
    $laenge = mb_strlen($eingabe['beschreibung']);
    if ($laenge === 0) {
        $fehler['beschreibung'] = 'Bitte die Störung beschreiben.';
    } elseif ($laenge < 10) {
        $fehler['beschreibung'] = 'Die Beschreibung ist zu kurz (mindestens 10 Zeichen).';
    } elseif ($laenge > 1000) {
        $fehler['beschreibung'] = 'Die Beschreibung darf höchstens 1000 Zeichen lang sein.';
    }

    // Ursache: nur Werte aus der festen Liste
    if (!in_array($eingabe['ursache_kategorie'], URSACHEN_LISTE, true)) {
        $fehler['ursache_kategorie'] = 'Bitte eine Ursache auswählen.';
    }

    // Priorität: nur niedrig / mittel / hoch
    if (!array_key_exists($eingabe['prioritaet'], PRIORITAET_LISTE)) {
        $fehler['prioritaet'] = 'Bitte eine Priorität auswählen.';
    }

    /* ---------- Speichern ---------- */

    if (empty($fehler)) {
        // Meldung und Auftrag gehören zusammen → gemeinsam in einer Transaktion speichern
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("
                INSERT INTO stoermeldung
                    (maschine_id, gemeldet_von, zeitpunkt, beschreibung, ursache_kategorie, prioritaet)
                VALUES
                    (:maschine_id, :gemeldet_von, :zeitpunkt, :beschreibung, :ursache, :prioritaet)
            ");
            $stmt->execute([
                ':maschine_id'  => (int) $eingabe['maschine_id'],
                ':gemeldet_von' => $eingabe['gemeldet_von'],
                ':zeitpunkt'    => $zeitpunktDb,
                ':beschreibung' => $eingabe['beschreibung'],
                ':ursache'      => $eingabe['ursache_kategorie'],
                ':prioritaet'   => $eingabe['prioritaet'],
            ]);
            $meldungId = (int) $pdo->lastInsertId();

            // Zu jeder Meldung gehört genau ein Wartungsauftrag
            $stmt = $pdo->prepare("INSERT INTO wartungsauftrag (stoermeldung_id, status) VALUES (?, 'gemeldet')");
            $stmt->execute([$meldungId]);

            $pdo->commit();

            flash('erfolg', "Störmeldung Nr. $meldungId wurde erfasst. Die Instandhaltung ist informiert.");
            weiterleiten('index.php');
        } catch (PDOException $e) {
            $pdo->rollBack();
            $fehler['allgemein'] = 'Die Meldung konnte nicht gespeichert werden. Bitte erneut versuchen.';
        }
    }
}

$seitentitel = 'Störung melden';
$aktiveSeite = 'meldung_neu.php';
require __DIR__ . '/includes/header.php';
?>

<div class="row justify-content-center">
    <div class="col-lg-8 col-xl-7">

        <div class="seitenkopf">
            <h1>Störung melden</h1>
            <p>Beschreiben Sie kurz, was an der Maschine passiert ist.</p>
        </div>

        <?php if (!empty($fehler)): ?>
            <div class="hinweis hinweis-fehler" role="alert">
                <?= isset($fehler['allgemein'])
                    ? e($fehler['allgemein'])
                    : 'Bitte prüfen Sie die markierten Felder.' ?>
            </div>
        <?php endif; ?>

        <!--
            novalidate: Die Prüfung übernimmt der Server (siehe oben), damit die
            Fehlermeldungen einheitlich auf Deutsch und direkt am Feld erscheinen.
        -->
        <form method="post" class="karte" novalidate>
            <?= csrf_feld() ?>

            <!-- Maschine -->
            <div class="mb-4">
                <label for="maschine_id" class="form-label">Maschine</label>
                <select id="maschine_id" name="maschine_id"
                        class="form-select<?= fehlerklasse($fehler, 'maschine_id') ?>" required>
                    <option value="">Bitte auswählen …</option>
                    <?php foreach ($maschinen as $m): ?>
                        <option value="<?= (int) $m['id'] ?>"
                            <?= (string) $m['id'] === $eingabe['maschine_id'] ? 'selected' : '' ?>>
                            <?= e($m['bezeichnung']) ?> – <?= e($m['standort']) ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <?= fehlertext($fehler, 'maschine_id') ?>
            </div>

            <div class="row g-4 mb-4">
                <!-- Gemeldet von -->
                <div class="col-md-6">
                    <label for="gemeldet_von" class="form-label">Gemeldet von</label>
                    <input type="text" id="gemeldet_von" name="gemeldet_von" maxlength="100"
                           class="form-control<?= fehlerklasse($fehler, 'gemeldet_von') ?>"
                           value="<?= e($eingabe['gemeldet_von']) ?>" placeholder="Vor- und Nachname"
                           autocomplete="name" required>
                    <?= fehlertext($fehler, 'gemeldet_von') ?>
                </div>

                <!-- Zeitpunkt -->
                <div class="col-md-6">
                    <label for="zeitpunkt" class="form-label">Zeitpunkt der Störung</label>
                    <input type="datetime-local" id="zeitpunkt" name="zeitpunkt"
                           class="form-control<?= fehlerklasse($fehler, 'zeitpunkt') ?>"
                           value="<?= e($eingabe['zeitpunkt']) ?>" max="<?= e(date('Y-m-d\TH:i')) ?>" required>
                    <?= fehlertext($fehler, 'zeitpunkt') ?>
                </div>
            </div>

            <!-- Beschreibung -->
            <div class="mb-4">
                <label for="beschreibung" class="form-label">Beschreibung</label>
                <textarea id="beschreibung" name="beschreibung" rows="4" maxlength="1000"
                          class="form-control<?= fehlerklasse($fehler, 'beschreibung') ?>"
                          placeholder="z. B. Spindel läuft unruhig, ungewöhnliches Geräusch beim Anfahren"
                          required><?= e($eingabe['beschreibung']) ?></textarea>
                <?= fehlertext($fehler, 'beschreibung') ?>
                <div class="form-text">Mindestens 10, höchstens 1000 Zeichen.</div>
            </div>

            <!-- Ursache -->
            <div class="mb-4">
                <label for="ursache_kategorie" class="form-label">Vermutete Ursache</label>
                <select id="ursache_kategorie" name="ursache_kategorie"
                        class="form-select<?= fehlerklasse($fehler, 'ursache_kategorie') ?>" required>
                    <option value="">Bitte auswählen …</option>
                    <?php foreach (URSACHEN_LISTE as $ursache): ?>
                        <option value="<?= e($ursache) ?>" <?= $ursache === $eingabe['ursache_kategorie'] ? 'selected' : '' ?>>
                            <?= e($ursache) ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <?= fehlertext($fehler, 'ursache_kategorie') ?>
            </div>

            <!-- Priorität als große Auswahlfelder (gut mit dem Finger zu treffen) -->
            <fieldset class="mb-4">
                <legend class="form-label fs-6">Priorität</legend>
                <div class="segmente<?= fehlerklasse($fehler, 'prioritaet') ?>">
                    <?php foreach (['niedrig' => 'Niedrig', 'mittel' => 'Mittel', 'hoch' => 'Hoch – Maschine steht'] as $wert => $text): ?>
                        <input type="radio" name="prioritaet" id="prio-<?= e($wert) ?>" value="<?= e($wert) ?>"
                            <?= $eingabe['prioritaet'] === $wert ? 'checked' : '' ?>>
                        <label for="prio-<?= e($wert) ?>"><?= e($text) ?></label>
                    <?php endforeach; ?>
                </div>
                <?= fehlertext($fehler, 'prioritaet') ?>
            </fieldset>

            <div class="d-flex gap-2 justify-content-end flex-wrap">
                <a href="index.php" class="btn btn-sekundaer">Abbrechen</a>
                <button type="submit" class="btn btn-primary">Störung melden</button>
            </div>
        </form>
    </div>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
