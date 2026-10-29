<?php
/**
 * statistik.php – Kennzahlen und Auswertungen
 *
 * Begriffe (gleiche Definition wie in den SQL-Views für Power BI):
 *  - Reparaturdauer = ende_zeit − start_zeit des Wartungsauftrags
 *  - MTTR (Mean Time To Repair) = durchschnittliche Reparaturdauer der erledigten Aufträge
 *  - Ausfallzeit = ende_zeit des Auftrags − zeitpunkt der Störmeldung
 *                  (also von der Meldung bis die Maschine wieder läuft)
 *
 * Zeitraum-Filter (GET): von, bis im Format JJJJ-MM-TT.
 * Ausgewertet werden alle Störmeldungen, deren Meldezeitpunkt im Zeitraum liegt.
 */

require_once __DIR__ . '/includes/funktionen.php';

$pdo = db();

/* ---------- Zeitraum bestimmen ---------- */

// Standard: die letzten 12 Monate (inkl. aktuellem Monat)
$standardVon = date('Y-m-01', strtotime('first day of -11 months'));
$standardBis = date('Y-m-d');

/** Prüft ein Datum im Format JJJJ-MM-TT; gibt es zurück oder null. */
function gueltiges_datum(string $wert): ?string
{
    $d = DateTime::createFromFormat('Y-m-d', $wert);
    return ($d && $d->format('Y-m-d') === $wert) ? $wert : null;
}

$von = gueltiges_datum((string) ($_GET['von'] ?? '')) ?? $standardVon;
$bis = gueltiges_datum((string) ($_GET['bis'] ?? '')) ?? $standardBis;
$filterFehler = '';
if ($von > $bis) {
    $filterFehler = 'Das Startdatum lag nach dem Enddatum – es wird der Standardzeitraum angezeigt.';
    [$von, $bis] = [$standardVon, $standardBis];
}

// Parameter für alle Abfragen: ganzer Tag von 00:00 bis 23:59:59
$zeitraum = [':von' => $von . ' 00:00:00', ':bis' => $bis . ' 23:59:59'];

// Schnellauswahl-Links
$schnellwahl = [
    '3 Monate'   => date('Y-m-01', strtotime('first day of -2 months')),
    '6 Monate'   => date('Y-m-01', strtotime('first day of -5 months')),
    '12 Monate'  => $standardVon,
    'Dieses Jahr'=> date('Y-01-01'),
];

/* ---------- Gesamt-Kennzahlen ---------- */

$stmt = $pdo->prepare("
    SELECT COUNT(*)                                                     AS anzahl,
           SUM(w.status <> 'erledigt')                                  AS offen,
           AVG(CASE WHEN w.status = 'erledigt'
                    THEN TIMESTAMPDIFF(MINUTE, w.start_zeit, w.ende_zeit) END) AS mttr_min,
           SUM(CASE WHEN w.status = 'erledigt'
                    THEN TIMESTAMPDIFF(MINUTE, s.zeitpunkt, w.ende_zeit) END)  AS ausfall_min
    FROM stoermeldung s
    JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    WHERE s.zeitpunkt BETWEEN :von AND :bis
");
$stmt->execute($zeitraum);
$gesamt = $stmt->fetch();

/* ---------- Kennzahlen pro Maschine ---------- */

// LEFT JOIN, damit auch Maschinen ohne Störung im Zeitraum erscheinen.
// Die Zeitraum-Bedingung steht deshalb im JOIN und nicht im WHERE.
$stmt = $pdo->prepare("
    SELECT m.id, m.bezeichnung, m.standort,
           COUNT(s.id)                                                  AS anzahl,
           AVG(CASE WHEN w.status = 'erledigt'
                    THEN TIMESTAMPDIFF(MINUTE, w.start_zeit, w.ende_zeit) END) AS mttr_min,
           COALESCE(SUM(CASE WHEN w.status = 'erledigt'
                    THEN TIMESTAMPDIFF(MINUTE, s.zeitpunkt, w.ende_zeit) END), 0) AS ausfall_min
    FROM maschine m
    LEFT JOIN stoermeldung s    ON s.maschine_id = m.id AND s.zeitpunkt BETWEEN :von AND :bis
    LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    GROUP BY m.id, m.bezeichnung, m.standort
    ORDER BY ausfall_min DESC, m.bezeichnung
");
$stmt->execute($zeitraum);
$proMaschine = $stmt->fetchAll();
$maxAusfall = max(1, ...array_map(fn($z) => (float) $z['ausfall_min'], $proMaschine ?: [['ausfall_min' => 0]]));

/* ---------- Störungen pro Monat ---------- */

$stmt = $pdo->prepare("
    SELECT DATE_FORMAT(zeitpunkt, '%Y-%m') AS monat, COUNT(*) AS anzahl
    FROM stoermeldung
    WHERE zeitpunkt BETWEEN :von AND :bis
    GROUP BY monat
    ORDER BY monat
");
$stmt->execute($zeitraum);
$monateDb = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);   // "2026-03" => 12

// Lückenlose Monatsliste erzeugen, damit Monate ohne Störung als 0 erscheinen
$monatsnamen = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
$proMonat = [];
$monat = new DateTime(substr($von, 0, 7) . '-01');
$letzter = new DateTime(substr($bis, 0, 7) . '-01');
while ($monat <= $letzter) {
    $schluessel = $monat->format('Y-m');
    $proMonat[] = [
        'label'  => $monatsnamen[(int) $monat->format('n') - 1] . ' ' . $monat->format('y'),
        'anzahl' => (int) ($monateDb[$schluessel] ?? 0),
    ];
    $monat->modify('+1 month');
}

/* ---------- Top-5-Störursachen ---------- */

$stmt = $pdo->prepare("
    SELECT ursache_kategorie AS ursache, COUNT(*) AS anzahl
    FROM stoermeldung
    WHERE zeitpunkt BETWEEN :von AND :bis
    GROUP BY ursache_kategorie
    ORDER BY anzahl DESC, ursache_kategorie
    LIMIT 5
");
$stmt->execute($zeitraum);
$topUrsachen = $stmt->fetchAll();

$seitentitel = 'Statistik';
$aktiveSeite = 'statistik.php';
require __DIR__ . '/includes/header.php';
?>

<div class="seitenkopf">
    <h1>Statistik</h1>
    <p>Zeitraum: <?= e(datum($von)) ?> bis <?= e(datum($bis)) ?></p>
</div>

<?php if ($filterFehler): ?>
    <div class="hinweis hinweis-hinweis"><?= e($filterFehler) ?></div>
<?php endif; ?>

<!-- Zeitraum-Filter -->
<form method="get" class="karte">
    <div class="filterleiste">
        <div>
            <label for="von" class="form-label">Von</label>
            <input type="date" id="von" name="von" class="form-control" value="<?= e($von) ?>">
        </div>
        <div>
            <label for="bis" class="form-label">Bis</label>
            <input type="date" id="bis" name="bis" class="form-control" value="<?= e($bis) ?>">
        </div>
        <div class="aktionen">
            <button type="submit" class="btn btn-primary">Anzeigen</button>
        </div>
    </div>
    <div class="d-flex flex-wrap gap-2 mt-3">
        <?php foreach ($schnellwahl as $text => $start): ?>
            <a class="btn btn-sekundaer btn-klein"
               href="statistik.php?von=<?= e($start) ?>&amp;bis=<?= e($standardBis) ?>"><?= e($text) ?></a>
        <?php endforeach; ?>
    </div>
</form>

<!-- Gesamt-Kennzahlen -->
<div class="row g-4 mb-2">
    <div class="col-6 col-lg-3">
        <div class="karte kennzahl">
            <div class="kennzahl-label">MTTR gesamt</div>
            <div class="kennzahl-wert">
                <?= $gesamt['mttr_min'] !== null ? zahl($gesamt['mttr_min'] / 60) : '–' ?><span class="kennzahl-einheit">h</span>
            </div>
            <div class="kennzahl-zusatz">Ø Reparaturdauer</div>
        </div>
    </div>
    <div class="col-6 col-lg-3">
        <div class="karte kennzahl">
            <div class="kennzahl-label">Ausfallzeit gesamt</div>
            <div class="kennzahl-wert">
                <?= zahl(($gesamt['ausfall_min'] ?? 0) / 60, 0) ?><span class="kennzahl-einheit">h</span>
            </div>
            <div class="kennzahl-zusatz">Meldung bis Behebung</div>
        </div>
    </div>
    <div class="col-6 col-lg-3">
        <div class="karte kennzahl">
            <div class="kennzahl-label">Störungen</div>
            <div class="kennzahl-wert"><?= (int) $gesamt['anzahl'] ?></div>
            <div class="kennzahl-zusatz">im Zeitraum gemeldet</div>
        </div>
    </div>
    <div class="col-6 col-lg-3">
        <div class="karte kennzahl">
            <div class="kennzahl-label">Davon offen</div>
            <div class="kennzahl-wert"><?= (int) $gesamt['offen'] ?></div>
            <div class="kennzahl-zusatz">noch nicht erledigt</div>
        </div>
    </div>
</div>

<!-- Diagramme -->
<div class="row g-4">
    <div class="col-lg-7">
        <section class="karte">
            <h2 class="abschnitt-titel">Störungen pro Monat</h2>
            <div class="diagramm">
                <canvas id="diagramm-monate" role="img"
                        aria-label="Liniendiagramm: Anzahl der Störungen pro Monat"></canvas>
            </div>
            <!-- Tabellenansicht als Alternative zum Diagramm (Barrierefreiheit) -->
            <details class="mt-3">
                <summary class="klein text-leise">Als Tabelle anzeigen</summary>
                <table class="tabelle mt-2">
                    <thead><tr><th>Monat</th><th class="zahl">Störungen</th></tr></thead>
                    <tbody>
                    <?php foreach ($proMonat as $pm): ?>
                        <tr><td><?= e($pm['label']) ?></td><td class="zahl"><?= $pm['anzahl'] ?></td></tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </details>
        </section>
    </div>
    <div class="col-lg-5">
        <section class="karte">
            <h2 class="abschnitt-titel">Top-5-Störursachen</h2>
            <?php if (empty($topUrsachen)): ?>
                <p class="leer">Keine Störungen im Zeitraum.</p>
            <?php else: ?>
                <div class="diagramm">
                    <canvas id="diagramm-ursachen" role="img"
                            aria-label="Balkendiagramm: die fünf häufigsten Störursachen"></canvas>
                </div>
                <details class="mt-3">
                    <summary class="klein text-leise">Als Tabelle anzeigen</summary>
                    <table class="tabelle mt-2">
                        <thead><tr><th>Ursache</th><th class="zahl">Anzahl</th></tr></thead>
                        <tbody>
                        <?php foreach ($topUrsachen as $u): ?>
                            <tr><td><?= e($u['ursache']) ?></td><td class="zahl"><?= (int) $u['anzahl'] ?></td></tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </details>
            <?php endif; ?>
        </section>
    </div>
</div>

<!-- Kennzahlen pro Maschine -->
<section class="karte">
    <div class="karte-kopf">
        <h2 class="abschnitt-titel">Kennzahlen pro Maschine</h2>
        <span class="klein text-leise">sortiert nach Ausfallzeit</span>
    </div>
    <div class="tabelle-rahmen">
        <table class="tabelle">
            <thead>
            <tr>
                <th>Maschine</th>
                <th class="zahl">Störungen</th>
                <th class="zahl">MTTR</th>
                <th class="zahl">Ausfallzeit</th>
                <th class="d-none d-md-table-cell" style="width: 30%;"><span class="visually-hidden">Anteil</span></th>
            </tr>
            </thead>
            <tbody>
            <?php foreach ($proMaschine as $pm): ?>
                <tr class="klickbar">
                    <td>
                        <a class="zeilen-link" href="auftraege.php?maschine=<?= (int) $pm['id'] ?>"><?= e($pm['bezeichnung']) ?></a>
                        <div class="klein"><?= e($pm['standort']) ?></div>
                    </td>
                    <td class="zahl"><?= (int) $pm['anzahl'] ?></td>
                    <td class="zahl"><?= $pm['mttr_min'] !== null ? zahl($pm['mttr_min'] / 60) . ' h' : '–' ?></td>
                    <td class="zahl"><?= zahl($pm['ausfall_min'] / 60) ?> h</td>
                    <td class="d-none d-md-table-cell">
                        <div class="mini-balken" aria-hidden="true">
                            <span style="width: <?= round($pm['ausfall_min'] / $maxAusfall * 100) ?>%"></span>
                        </div>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</section>

<!-- Chart.js per CDN -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"></script>
<script>
    // Daten aus PHP an JavaScript übergeben (json_encode wandelt Arrays sicher um)
    const monatsDaten   = <?= json_encode($proMonat, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?>;
    const ursachenDaten = <?= json_encode($topUrsachen, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?>;

    // Gemeinsames, ruhiges Erscheinungsbild für alle Diagramme
    const AKZENT = '#0071e3';
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.font.size = 13;
    Chart.defaults.color = '#6e6e73';
    Chart.defaults.plugins.legend.display = false;   // je Diagramm nur eine Datenreihe
    Chart.defaults.plugins.tooltip.backgroundColor = '#1d1d1f';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.displayColors = false;
    Chart.defaults.maintainAspectRatio = false;

    const gitter = { color: '#f0f0f2' };   // dezente Hilfslinien

    // Liniendiagramm: Störungen pro Monat
    new Chart(document.getElementById('diagramm-monate'), {
        type: 'line',
        data: {
            labels: monatsDaten.map(d => d.label),
            datasets: [{
                label: 'Störungen',
                data: monatsDaten.map(d => d.anzahl),
                borderColor: AKZENT,
                backgroundColor: 'rgba(0, 113, 227, 0.08)',
                borderWidth: 2,
                fill: true,
                cubicInterpolationMode: 'monotone',   // weiche Linie ohne Überschwingen
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#fff',
                pointBorderWidth: 2,
            }]
        },
        options: {
            interaction: { mode: 'index', intersect: false },   // Tooltip schon in der Nähe des Punktes
            scales: {
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
                y: { beginAtZero: true, ticks: { precision: 0 }, grid: gitter, border: { display: false } }
            },
            plugins: {
                tooltip: { callbacks: { label: ctx => ctx.parsed.y + ' Störungen' } }
            }
        }
    });

    // Balkendiagramm (liegend): Top-5-Störursachen
    const ursachenCanvas = document.getElementById('diagramm-ursachen');
    if (ursachenCanvas) {
        new Chart(ursachenCanvas, {
            type: 'bar',
            data: {
                labels: ursachenDaten.map(d => d.ursache),
                datasets: [{
                    label: 'Anzahl',
                    data: ursachenDaten.map(d => Number(d.anzahl)),
                    backgroundColor: AKZENT,
                    hoverBackgroundColor: '#0060c0',
                    borderRadius: 4,
                    borderSkipped: 'start',   // nur das Balkenende abrunden
                    barThickness: 22,
                }]
            },
            options: {
                indexAxis: 'y',   // waagerechte Balken: lange Ursachen-Texte bleiben lesbar
                scales: {
                    x: { beginAtZero: true, ticks: { precision: 0 }, grid: gitter, border: { display: false } },
                    y: { grid: { display: false }, ticks: { color: '#1d1d1f' } }
                },
                plugins: {
                    tooltip: { callbacks: { label: ctx => ctx.parsed.x + ' Störungen' } }
                }
            }
        });
    }
</script>

<?php require __DIR__ . '/includes/footer.php'; ?>
