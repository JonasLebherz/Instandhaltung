<?php
/**
 * index.php – Startseite / Dashboard
 *
 * Zeigt auf einen Blick:
 *  - wichtige Kennzahlen (offene Meldungen, dringende Meldungen, Teile unter Mindestbestand)
 *  - die Verteilung der Aufträge nach Status
 *  - die aktuell offenen Störmeldungen
 *  - Ersatzteile unter Mindestbestand inkl. offener Bestellungen
 */

require_once __DIR__ . '/includes/funktionen.php';

$pdo = db();

// Platzhalter "?, ?, ?, ?" für die Liste der offenen Status erzeugen
$offenPlatzhalter = implode(', ', array_fill(0, count(OFFENE_STATUS), '?'));

/* ---------- Kennzahlen ---------- */

// Anzahl offener Aufträge (alles außer "erledigt") und davon mit Priorität "hoch"
$stmt = $pdo->prepare("
    SELECT COUNT(*)                          AS offen,
           SUM(s.prioritaet = 'hoch')        AS dringend
    FROM wartungsauftrag w
    JOIN stoermeldung s ON s.id = w.stoermeldung_id
    WHERE w.status IN ($offenPlatzhalter)
");
$stmt->execute(OFFENE_STATUS);
$kennzahlen = $stmt->fetch();

// In den letzten 30 Tagen abgeschlossene Aufträge
$stmt = $pdo->prepare("
    SELECT COUNT(*) FROM wartungsauftrag
    WHERE status = 'erledigt' AND ende_zeit >= NOW() - INTERVAL 30 DAY
");
$stmt->execute();
$erledigt30 = (int) $stmt->fetchColumn();

/* ---------- Aufträge nach Status ---------- */

$stmt = $pdo->prepare("SELECT status, COUNT(*) AS anzahl FROM wartungsauftrag GROUP BY status");
$stmt->execute();
// Ergebnis als Array "status => anzahl"
$proStatus = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

// Alle Status in fester Reihenfolge, auch wenn es 0 Aufträge gibt
$statusVerteilung = [];
foreach (array_keys(STATUS_LISTE) as $status) {
    $statusVerteilung[$status] = (int) ($proStatus[$status] ?? 0);
}
// Die Balken beziehen sich nur auf die offenen Status, damit "erledigt"
// (meist mit Abstand der größte Wert) die anderen nicht winzig macht.
$maxOffen = max(1, ...array_map(fn($s) => $statusVerteilung[$s], OFFENE_STATUS));

/* ---------- Offene Störmeldungen ---------- */

// Sortierung: zuerst nach Priorität (hoch → niedrig), dann neueste zuerst
$stmt = $pdo->prepare("
    SELECT w.id AS auftrag_id, w.status,
           s.zeitpunkt, s.beschreibung, s.prioritaet,
           m.bezeichnung AS maschine,
           t.name        AS techniker
    FROM wartungsauftrag w
    JOIN stoermeldung s   ON s.id = w.stoermeldung_id
    JOIN maschine m       ON m.id = s.maschine_id
    LEFT JOIN techniker t ON t.id = w.techniker_id
    WHERE w.status IN ($offenPlatzhalter)
    ORDER BY FIELD(s.prioritaet, 'hoch', 'mittel', 'niedrig'), s.zeitpunkt DESC
    LIMIT 8
");
$stmt->execute(OFFENE_STATUS);
$offeneMeldungen = $stmt->fetchAll();

/* ---------- Ersatzteile unter Mindestbestand & offene Bestellungen ---------- */

// Geladen werden alle Teile unter Mindestbestand sowie alle Teile mit offener
// Bestellung (dort kann der Wareneingang gebucht werden).
$stmt = $pdo->prepare("
    SELECT e.id, e.bezeichnung, e.bestand, e.mindestbestand,
           b.id AS bestellung_id, b.menge AS bestellmenge, b.bestelldatum
    FROM ersatzteil e
    LEFT JOIN bestellung b ON b.ersatzteil_id = e.id AND b.status = 'bestellt'
    WHERE e.bestand < e.mindestbestand OR b.id IS NOT NULL
    ORDER BY (e.bestand < e.mindestbestand) DESC, (e.bestand / e.mindestbestand), e.bezeichnung
");
$stmt->execute();
$kritischeTeile = $stmt->fetchAll();

// Anzahl unterschiedlicher Teile unter Mindestbestand
// (ein Teil kann mehrere offene Bestellungen haben und mehrfach vorkommen)
$unterMindest = array_filter($kritischeTeile, fn($t) => $t['bestand'] < $t['mindestbestand']);
$anzahlKritisch = count(array_unique(array_column($unterMindest, 'id')));

$seitentitel = 'Übersicht';
$aktiveSeite = 'index.php';
require __DIR__ . '/includes/header.php';
?>

<div class="seitenkopf">
    <h1>Übersicht</h1>
    <p>Aktueller Stand der Instandhaltung – <?= e(date('d.m.Y')) ?></p>
</div>

<!-- Kennzahlen -->
<div class="row g-4 mb-2">
    <div class="col-6 col-lg-3">
        <a class="karte kennzahl" href="auftraege.php?status=offen">
            <div class="kennzahl-label">Offene Meldungen</div>
            <div class="kennzahl-wert"><?= (int) $kennzahlen['offen'] ?></div>
            <div class="kennzahl-zusatz">noch nicht erledigt</div>
        </a>
    </div>
    <div class="col-6 col-lg-3">
        <a class="karte kennzahl" href="auftraege.php?status=offen&amp;prioritaet=hoch">
            <div class="kennzahl-label">Davon Priorität hoch</div>
            <div class="kennzahl-wert"><?= (int) $kennzahlen['dringend'] ?></div>
            <div class="kennzahl-zusatz">sofort bearbeiten</div>
        </a>
    </div>
    <div class="col-6 col-lg-3">
        <div class="karte kennzahl<?= $anzahlKritisch > 0 ? ' kennzahl-warnung' : '' ?>">
            <div class="kennzahl-label">Teile unter Mindestbestand</div>
            <div class="kennzahl-wert"><?= $anzahlKritisch ?></div>
            <div class="kennzahl-zusatz"><?= $anzahlKritisch > 0 ? 'Nachschub prüfen' : 'Lager in Ordnung' ?></div>
        </div>
    </div>
    <div class="col-6 col-lg-3">
        <div class="karte kennzahl">
            <div class="kennzahl-label">Erledigt (30 Tage)</div>
            <div class="kennzahl-wert"><?= $erledigt30 ?></div>
            <div class="kennzahl-zusatz">abgeschlossene Aufträge</div>
        </div>
    </div>
</div>

<div class="row g-4">
    <!-- Offene Störmeldungen -->
    <div class="col-lg-8">
        <section class="karte">
            <div class="karte-kopf">
                <h2 class="abschnitt-titel">Offene Störmeldungen</h2>
                <a href="auftraege.php?status=offen">Alle anzeigen</a>
            </div>

            <?php if (empty($offeneMeldungen)): ?>
                <p class="leer">Keine offenen Störmeldungen – alle Maschinen laufen.</p>
            <?php else: ?>
                <div class="tabelle-rahmen">
                    <table class="tabelle">
                        <thead>
                        <tr>
                            <th>Maschine</th>
                            <th>Priorität</th>
                            <th>Status</th>
                            <th class="d-none d-md-table-cell">Gemeldet</th>
                        </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($offeneMeldungen as $m): ?>
                            <tr class="klickbar">
                                <td>
                                    <a class="zeilen-link" href="auftrag_bearbeiten.php?id=<?= (int) $m['auftrag_id'] ?>">
                                        <?= e($m['maschine']) ?>
                                    </a>
                                    <div class="klein text-truncate beschreibung-kurz">
                                        <?= e($m['beschreibung']) ?>
                                    </div>
                                </td>
                                <td><?= prioritaet_pill($m['prioritaet']) ?></td>
                                <td>
                                    <?= status_pill($m['status']) ?>
                                    <?php if ($m['techniker']): ?>
                                        <div class="klein mt-1"><?= e($m['techniker']) ?></div>
                                    <?php endif; ?>
                                </td>
                                <td class="d-none d-md-table-cell klein"><?= e(datum_zeit($m['zeitpunkt'])) ?></td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        </section>
    </div>

    <!-- Aufträge nach Status -->
    <div class="col-lg-4">
        <section class="karte">
            <h2 class="abschnitt-titel">Aufträge nach Status</h2>
            <ul class="status-liste">
                <?php foreach ($statusVerteilung as $status => $anzahl): ?>
                    <li>
                        <?= status_pill($status) ?>
                        <?php if ($status !== 'erledigt'): ?>
                            <div class="status-balken" aria-hidden="true">
                                <span style="width: <?= round($anzahl / $maxOffen * 100) ?>%"></span>
                            </div>
                        <?php else: ?>
                            <div class="flex-grow-1 klein text-leise">gesamt</div>
                        <?php endif; ?>
                        <a class="status-anzahl" href="auftraege.php?status=<?= urlencode($status) ?>"><?= $anzahl ?></a>
                    </li>
                <?php endforeach; ?>
            </ul>
        </section>

        <a class="btn btn-primary w-100 py-3" href="meldung_neu.php">Neue Störung melden</a>
    </div>
</div>

<!-- Ersatzteile unter Mindestbestand & offene Bestellungen -->
<section class="karte mt-4">
    <div class="karte-kopf">
        <h2 class="abschnitt-titel">Ersatzteile unter Mindestbestand</h2>
        <span class="klein text-leise">inkl. offener Bestellungen</span>
    </div>

    <?php if (empty($kritischeTeile)): ?>
        <p class="leer">Alle Ersatzteile sind ausreichend auf Lager, keine offenen Bestellungen.</p>
    <?php else: ?>
        <div class="tabelle-rahmen">
            <table class="tabelle">
                <thead>
                <tr>
                    <th>Ersatzteil</th>
                    <th class="zahl">Bestand</th>
                    <th class="zahl">Mindestbestand</th>
                    <th>Nachbestellung</th>
                    <th></th>
                </tr>
                </thead>
                <tbody>
                <?php foreach ($kritischeTeile as $teil): ?>
                    <tr>
                        <td><?= e($teil['bezeichnung']) ?></td>
                        <td class="zahl">
                            <?php if ($teil['bestand'] < $teil['mindestbestand']): ?>
                                <strong class="text-orange"><?= (int) $teil['bestand'] ?></strong>
                            <?php else: ?>
                                <?= (int) $teil['bestand'] ?>
                            <?php endif; ?>
                        </td>
                        <td class="zahl"><?= (int) $teil['mindestbestand'] ?></td>
                        <td>
                            <?php if ($teil['bestellung_id']): ?>
                                <span class="pill pill-orange">bestellt</span>
                                <span class="klein ms-1">
                                    <?= (int) $teil['bestellmenge'] ?> Stk. am <?= e(datum($teil['bestelldatum'])) ?>
                                </span>
                            <?php else: ?>
                                <span class="pill pill-rot">nicht bestellt</span>
                            <?php endif; ?>
                        </td>
                        <td class="text-end">
                            <?php if ($teil['bestellung_id']): ?>
                                <!-- Wareneingang buchen: erhöht den Bestand um die Bestellmenge -->
                                <form method="post" action="bestellung_geliefert.php" class="d-inline">
                                    <?= csrf_feld() ?>
                                    <input type="hidden" name="bestellung_id" value="<?= (int) $teil['bestellung_id'] ?>">
                                    <button type="submit" class="btn btn-sekundaer btn-klein">Lieferung eingegangen</button>
                                </form>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
