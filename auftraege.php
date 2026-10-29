<?php
/**
 * auftraege.php – Auftragsübersicht
 *
 * Listet alle Störmeldungen mit ihrem Wartungsauftrag auf.
 * Filter (per GET-Parameter, damit gefilterte Ansichten als Link teilbar sind):
 *   status      – ein Auftragsstatus oder "offen" (= alle außer "erledigt")
 *   maschine    – ID einer Maschine
 *   prioritaet  – niedrig / mittel / hoch
 */

require_once __DIR__ . '/includes/funktionen.php';

$pdo = db();

// Maschinen für das Filter-Auswahlfeld
$stmt = $pdo->prepare("SELECT id, bezeichnung FROM maschine ORDER BY bezeichnung");
$stmt->execute();
$maschinen = $stmt->fetchAll();

/* ---------- Filterwerte einlesen und prüfen ---------- */

$filter = [
    'status'     => (string) ($_GET['status'] ?? ''),
    'maschine'   => (string) ($_GET['maschine'] ?? ''),
    'prioritaet' => (string) ($_GET['prioritaet'] ?? ''),
];

// Ungültige Werte werden einfach ignoriert (= kein Filter)
if ($filter['status'] !== 'offen' && !array_key_exists($filter['status'], STATUS_LISTE)) {
    $filter['status'] = '';
}
if (!ctype_digit($filter['maschine'])) {
    $filter['maschine'] = '';
}
if (!array_key_exists($filter['prioritaet'], PRIORITAET_LISTE)) {
    $filter['prioritaet'] = '';
}

/* ---------- SQL-Abfrage dynamisch zusammensetzen ----------
 * Für jeden gesetzten Filter wird eine Bedingung mit Platzhalter ergänzt.
 * Die eigentlichen Werte landen ausschließlich im Parameter-Array.
 */
$bedingungen = [];
$parameter   = [];

if ($filter['status'] === 'offen') {
    $bedingungen[] = "w.status <> 'erledigt'";
} elseif ($filter['status'] !== '') {
    $bedingungen[] = 'w.status = :status';
    $parameter[':status'] = $filter['status'];
}
if ($filter['maschine'] !== '') {
    $bedingungen[] = 's.maschine_id = :maschine';
    $parameter[':maschine'] = (int) $filter['maschine'];
}
if ($filter['prioritaet'] !== '') {
    $bedingungen[] = 's.prioritaet = :prioritaet';
    $parameter[':prioritaet'] = $filter['prioritaet'];
}

$where = $bedingungen ? 'WHERE ' . implode(' AND ', $bedingungen) : '';

$stmt = $pdo->prepare("
    SELECT w.id AS auftrag_id, w.status,
           s.id AS meldung_id, s.zeitpunkt, s.beschreibung, s.ursache_kategorie, s.prioritaet,
           m.bezeichnung AS maschine,
           t.name        AS techniker
    FROM stoermeldung s
    JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    JOIN maschine m        ON m.id = s.maschine_id
    LEFT JOIN techniker t  ON t.id = w.techniker_id
    $where
    ORDER BY s.zeitpunkt DESC
");
$stmt->execute($parameter);
$auftraege = $stmt->fetchAll();

$filterAktiv = $filter['status'] !== '' || $filter['maschine'] !== '' || $filter['prioritaet'] !== '';

$seitentitel = 'Aufträge';
$aktiveSeite = 'auftraege.php';
require __DIR__ . '/includes/header.php';
?>

<div class="seitenkopf d-flex justify-content-between align-items-end flex-wrap gap-3">
    <div>
        <h1>Aufträge</h1>
        <p><?= count($auftraege) ?> <?= count($auftraege) === 1 ? 'Meldung' : 'Meldungen' ?><?= $filterAktiv ? ' (gefiltert)' : '' ?></p>
    </div>
    <a href="meldung_neu.php" class="btn btn-primary">Neue Störung melden</a>
</div>

<!-- Filterleiste -->
<form method="get" class="karte">
    <div class="filterleiste">
        <div>
            <label for="f-status" class="form-label">Status</label>
            <select id="f-status" name="status" class="form-select">
                <option value="">Alle</option>
                <option value="offen" <?= $filter['status'] === 'offen' ? 'selected' : '' ?>>Alle offenen</option>
                <?php foreach (array_keys(STATUS_LISTE) as $status): ?>
                    <option value="<?= e($status) ?>" <?= $filter['status'] === $status ? 'selected' : '' ?>>
                        <?= e(ucfirst($status)) ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label for="f-maschine" class="form-label">Maschine</label>
            <select id="f-maschine" name="maschine" class="form-select">
                <option value="">Alle</option>
                <?php foreach ($maschinen as $m): ?>
                    <option value="<?= (int) $m['id'] ?>" <?= $filter['maschine'] === (string) $m['id'] ? 'selected' : '' ?>>
                        <?= e($m['bezeichnung']) ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label for="f-prio" class="form-label">Priorität</label>
            <select id="f-prio" name="prioritaet" class="form-select">
                <option value="">Alle</option>
                <?php foreach (array_keys(PRIORITAET_LISTE) as $prio): ?>
                    <option value="<?= e($prio) ?>" <?= $filter['prioritaet'] === $prio ? 'selected' : '' ?>>
                        <?= e(ucfirst($prio)) ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="aktionen">
            <button type="submit" class="btn btn-primary">Filtern</button>
            <?php if ($filterAktiv): ?>
                <a href="auftraege.php" class="btn btn-sekundaer">Zurücksetzen</a>
            <?php endif; ?>
        </div>
    </div>
</form>

<!-- Ergebnisliste -->
<section class="karte">
    <?php if (empty($auftraege)): ?>
        <p class="leer">Keine Meldungen gefunden. Passen Sie ggf. die Filter an.</p>
    <?php else: ?>
        <div class="tabelle-rahmen">
            <table class="tabelle">
                <thead>
                <tr>
                    <th class="zahl">Nr.</th>
                    <th>Maschine / Beschreibung</th>
                    <th class="d-none d-lg-table-cell">Ursache</th>
                    <th>Priorität</th>
                    <th>Status</th>
                    <th class="d-none d-lg-table-cell">Techniker</th>
                    <th class="d-none d-md-table-cell">Gemeldet</th>
                </tr>
                </thead>
                <tbody>
                <?php foreach ($auftraege as $a): ?>
                    <tr class="klickbar">
                        <td class="zahl klein"><?= (int) $a['meldung_id'] ?></td>
                        <td>
                            <a class="zeilen-link" href="auftrag_bearbeiten.php?id=<?= (int) $a['auftrag_id'] ?>">
                                <?= e($a['maschine']) ?>
                            </a>
                            <div class="klein text-truncate beschreibung-kurz"><?= e($a['beschreibung']) ?></div>
                        </td>
                        <td class="d-none d-lg-table-cell klein"><?= e($a['ursache_kategorie']) ?></td>
                        <td><?= prioritaet_pill($a['prioritaet']) ?></td>
                        <td>
                            <?= status_pill($a['status']) ?>
                            <?php // Auf Tablets steht der Techniker unter dem Status statt in eigener Spalte ?>
                            <?php if ($a['techniker']): ?>
                                <div class="klein mt-1 d-lg-none"><?= e($a['techniker']) ?></div>
                            <?php endif; ?>
                        </td>
                        <td class="d-none d-lg-table-cell klein"><?= e($a['techniker'] ?? '–') ?></td>
                        <td class="d-none d-md-table-cell klein"><?= e(datum_zeit($a['zeitpunkt'])) ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
