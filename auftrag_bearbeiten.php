<?php
/**
 * auftrag_bearbeiten.php – Wartungsauftrag bearbeiten
 *
 * Aufruf: auftrag_bearbeiten.php?id=<ID des Wartungsauftrags>
 *
 * Die Seite enthält zwei Formulare, unterschieden über das Feld "aktion":
 *
 *  1. aktion = "speichern"
 *     Techniker zuweisen, Status ändern, Arbeitsbeginn/-ende und Maßnahme erfassen.
 *     Regeln:
 *      - Ab Status "zugewiesen" muss ein Techniker eingetragen sein.
 *      - Wird ein Techniker zugewiesen und der Status steht noch auf "gemeldet",
 *        wechselt der Status automatisch auf "zugewiesen".
 *      - Ab "in Arbeit" wird der Arbeitsbeginn automatisch gesetzt (falls leer).
 *      - Für "erledigt" sind Maßnahme, Arbeitsbeginn und Endzeit Pflicht.
 *
 *  2. aktion = "teil_buchen"
 *     Ein verwendetes Ersatzteil auf den Auftrag buchen.
 *      - Genug auf Lager:   Bestand wird reduziert, Teil wird dem Auftrag zugeordnet.
 *      - Nicht genug Lager: Es wird nichts gebucht, der Auftrag wechselt auf
 *                           "wartet auf Teil" und es wird eine Bestellung angelegt.
 */

require_once __DIR__ . '/includes/funktionen.php';

$pdo = db();

$auftragId = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
if (!$auftragId) {
    flash('fehler', 'Kein gültiger Auftrag ausgewählt.');
    weiterleiten('auftraege.php');
}

/**
 * Lädt den Auftrag inkl. Störmeldung, Maschine und Techniker.
 * Als Funktion, weil er nach dem Speichern bei Fehlern erneut gebraucht wird.
 */
function auftrag_laden(PDO $pdo, int $id): array|false
{
    $stmt = $pdo->prepare("
        SELECT w.id, w.stoermeldung_id, w.techniker_id, w.status,
               w.start_zeit, w.ende_zeit, w.massnahme,
               s.zeitpunkt, s.gemeldet_von, s.beschreibung, s.ursache_kategorie, s.prioritaet,
               m.id AS maschine_id, m.bezeichnung AS maschine, m.standort
        FROM wartungsauftrag w
        JOIN stoermeldung s ON s.id = w.stoermeldung_id
        JOIN maschine m     ON m.id = s.maschine_id
        WHERE w.id = ?
    ");
    $stmt->execute([$id]);
    return $stmt->fetch();
}

$auftrag = auftrag_laden($pdo, $auftragId);
if (!$auftrag) {
    flash('fehler', 'Der Auftrag wurde nicht gefunden.');
    weiterleiten('auftraege.php');
}

// Auswahllisten
$stmt = $pdo->prepare("SELECT id, name, qualifikation, schicht FROM techniker ORDER BY name");
$stmt->execute();
$techniker = $stmt->fetchAll();
$technikerIds = array_map('intval', array_column($techniker, 'id'));

$stmt = $pdo->prepare("SELECT id, bezeichnung, bestand, mindestbestand FROM ersatzteil ORDER BY bezeichnung");
$stmt->execute();
$ersatzteile = $stmt->fetchAll();

// Formularwerte = aktueller Stand aus der Datenbank
$eingabe = [
    'techniker_id' => (string) ($auftrag['techniker_id'] ?? ''),
    'status'       => $auftrag['status'],
    'start_zeit'   => fuer_datetime_input($auftrag['start_zeit']),
    'ende_zeit'    => fuer_datetime_input($auftrag['ende_zeit']),
    'massnahme'    => (string) ($auftrag['massnahme'] ?? ''),
];
$teilEingabe = ['ersatzteil_id' => '', 'menge' => '1'];
$fehler = [];

/* ======================================================================
 * Formularverarbeitung
 * ==================================================================== */

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_pruefen();
    $aktion = $_POST['aktion'] ?? '';

    /* ---------- 1. Auftrag speichern ---------- */
    if ($aktion === 'speichern') {
        foreach (array_keys($eingabe) as $feld) {
            $eingabe[$feld] = trim((string) ($_POST[$feld] ?? ''));
        }

        // Techniker: leer oder ein existierender Techniker
        $technikerId = null;
        if ($eingabe['techniker_id'] !== '') {
            if (in_array((int) $eingabe['techniker_id'], $technikerIds, true)) {
                $technikerId = (int) $eingabe['techniker_id'];
            } else {
                $fehler['techniker_id'] = 'Der gewählte Techniker existiert nicht.';
            }
        }

        // Status: nur erlaubte Werte
        $status = $eingabe['status'];
        if (!array_key_exists($status, STATUS_LISTE)) {
            $fehler['status'] = 'Ungültiger Status.';
        }

        // Automatik: Techniker eingetragen, Status noch "gemeldet" → "zugewiesen"
        if ($technikerId !== null && $status === 'gemeldet') {
            $status = 'zugewiesen';
            $eingabe['status'] = $status;
        }

        // Ab "zugewiesen" wird ein Techniker benötigt
        if ($status !== 'gemeldet' && $technikerId === null && !isset($fehler['techniker_id'])) {
            $fehler['techniker_id'] = 'Für diesen Status muss ein Techniker zugewiesen sein.';
        }

        // Arbeitsbeginn
        $startZeit = null;
        if ($eingabe['start_zeit'] !== '') {
            $startZeit = datetime_aus_input($eingabe['start_zeit']);
            if ($startZeit === null) {
                $fehler['start_zeit'] = 'Bitte einen gültigen Zeitpunkt angeben.';
            } elseif (strtotime($startZeit) < strtotime($auftrag['zeitpunkt'])) {
                $fehler['start_zeit'] = 'Der Arbeitsbeginn kann nicht vor der Störmeldung liegen ('
                    . datum_zeit($auftrag['zeitpunkt']) . ').';
            }
        } elseif (in_array($status, ['in Arbeit', 'wartet auf Teil'], true)) {
            // Arbeit beginnt jetzt → Startzeit automatisch setzen
            $startZeit = date('Y-m-d H:i:s');
            $eingabe['start_zeit'] = fuer_datetime_input($startZeit);
        }

        // Endzeit und Maßnahme – nur beim Abschluss relevant
        $endeZeit = null;
        if ($status === 'erledigt') {
            if ($startZeit === null && !isset($fehler['start_zeit'])) {
                $fehler['start_zeit'] = 'Bitte den Arbeitsbeginn angeben.';
            }

            $endeZeit = datetime_aus_input($eingabe['ende_zeit']);
            if ($eingabe['ende_zeit'] === '') {
                $fehler['ende_zeit'] = 'Bitte die Endzeit der Reparatur angeben.';
            } elseif ($endeZeit === null) {
                $fehler['ende_zeit'] = 'Bitte einen gültigen Zeitpunkt angeben.';
            } elseif (strtotime($endeZeit) > time() + 300) {
                $fehler['ende_zeit'] = 'Die Endzeit darf nicht in der Zukunft liegen.';
            } elseif ($startZeit !== null && strtotime($endeZeit) < strtotime($startZeit)) {
                $fehler['ende_zeit'] = 'Die Endzeit muss nach dem Arbeitsbeginn liegen.';
            }

            if (mb_strlen($eingabe['massnahme']) < 5) {
                $fehler['massnahme'] = 'Bitte die durchgeführte Maßnahme beschreiben (mindestens 5 Zeichen).';
            }
        } else {
            // Auftrag (wieder) offen → keine Endzeit
            $eingabe['ende_zeit'] = '';
        }

        if (mb_strlen($eingabe['massnahme']) > 2000) {
            $fehler['massnahme'] = 'Die Maßnahme darf höchstens 2000 Zeichen lang sein.';
        }

        if (empty($fehler)) {
            $stmt = $pdo->prepare("
                UPDATE wartungsauftrag
                SET techniker_id = :techniker,
                    status       = :status,
                    start_zeit   = :start,
                    ende_zeit    = :ende,
                    massnahme    = :massnahme
                WHERE id = :id
            ");
            $stmt->execute([
                ':techniker' => $technikerId,
                ':status'    => $status,
                ':start'     => $startZeit,
                ':ende'      => $endeZeit,
                ':massnahme' => $eingabe['massnahme'] !== '' ? $eingabe['massnahme'] : null,
                ':id'        => $auftragId,
            ]);

            flash('erfolg', $status === 'erledigt'
                ? 'Auftrag abgeschlossen. Danke!'
                : 'Änderungen gespeichert. Status: ' . $status . '.');
            weiterleiten('auftrag_bearbeiten.php?id=' . $auftragId);
        }
    }

    /* ---------- 2. Ersatzteil buchen ---------- */
    elseif ($aktion === 'teil_buchen') {
        $teilEingabe['ersatzteil_id'] = trim((string) ($_POST['ersatzteil_id'] ?? ''));
        $teilEingabe['menge']         = trim((string) ($_POST['menge'] ?? ''));

        $teilId = filter_var($teilEingabe['ersatzteil_id'], FILTER_VALIDATE_INT);
        $menge  = filter_var($teilEingabe['menge'], FILTER_VALIDATE_INT,
                             ['options' => ['min_range' => 1, 'max_range' => 999]]);

        if ($auftrag['status'] === 'erledigt') {
            $fehler['teil_allgemein'] = 'Auf erledigte Aufträge können keine Teile mehr gebucht werden.';
        }
        if ($teilId === false) {
            $fehler['ersatzteil_id'] = 'Bitte ein Ersatzteil auswählen.';
        }
        if ($menge === false) {
            $fehler['menge'] = 'Bitte eine Menge zwischen 1 und 999 angeben.';
        }

        if (empty($fehler)) {
            // Alles in einer Transaktion: Bestand prüfen und ändern darf nicht
            // durch eine gleichzeitige Buchung eines Kollegen gestört werden.
            $pdo->beginTransaction();
            try {
                // Ersatzteil-Zeile sperren (FOR UPDATE), bis die Transaktion endet
                $stmt = $pdo->prepare("
                    SELECT id, bezeichnung, bestand, mindestbestand
                    FROM ersatzteil WHERE id = ? FOR UPDATE
                ");
                $stmt->execute([$teilId]);
                $teil = $stmt->fetch();

                if (!$teil) {
                    $pdo->rollBack();
                    $fehler['ersatzteil_id'] = 'Das Ersatzteil existiert nicht.';
                } elseif ($teil['bestand'] >= $menge) {
                    /* --- Fall A: genug auf Lager → buchen --- */

                    // Bestand reduzieren
                    $stmt = $pdo->prepare("UPDATE ersatzteil SET bestand = bestand - ? WHERE id = ?");
                    $stmt->execute([$menge, $teilId]);

                    // Teil dem Auftrag zuordnen. Wurde das Teil schon einmal
                    // gebucht, wird die Menge addiert (Primärschlüssel auftrag_id + ersatzteil_id).
                    $stmt = $pdo->prepare("
                        INSERT INTO auftrag_ersatzteil (auftrag_id, ersatzteil_id, menge)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE menge = menge + ?
                    ");
                    $stmt->execute([$auftragId, $teilId, $menge, $menge]);

                    $pdo->commit();

                    flash('erfolg', sprintf('%d × %s gebucht.', $menge, $teil['bezeichnung']));
                    $neuerBestand = $teil['bestand'] - $menge;
                    if ($neuerBestand < $teil['mindestbestand']) {
                        flash('hinweis', sprintf(
                            'Achtung: %s ist jetzt unter dem Mindestbestand (%d von %d).',
                            $teil['bezeichnung'], $neuerBestand, $teil['mindestbestand']
                        ));
                    }
                    weiterleiten('auftrag_bearbeiten.php?id=' . $auftragId);
                } else {
                    /* --- Fall B: nicht genug auf Lager → warten & bestellen --- */

                    // Auftrag auf "wartet auf Teil" setzen
                    $stmt = $pdo->prepare("UPDATE wartungsauftrag SET status = 'wartet auf Teil', ende_zeit = NULL WHERE id = ?");
                    $stmt->execute([$auftragId]);

                    // Gibt es schon eine offene Bestellung für dieses Teil?
                    $stmt = $pdo->prepare("SELECT id FROM bestellung WHERE ersatzteil_id = ? AND status = 'bestellt' LIMIT 1");
                    $stmt->execute([$teilId]);
                    $offeneBestellung = $stmt->fetchColumn();

                    if ($offeneBestellung) {
                        $pdo->commit();
                        flash('hinweis', sprintf(
                            '%s ist nicht ausreichend auf Lager (Bestand: %d). Es läuft bereits eine Bestellung. '
                            . 'Der Auftrag wartet jetzt auf das Teil.',
                            $teil['bezeichnung'], $teil['bestand']
                        ));
                    } else {
                        // Bestellmenge: fehlende Menge + Mindestbestand wieder auffüllen
                        $bestellmenge = ($menge - $teil['bestand']) + $teil['mindestbestand'];

                        $stmt = $pdo->prepare("
                            INSERT INTO bestellung (ersatzteil_id, menge, bestelldatum, status)
                            VALUES (?, ?, CURDATE(), 'bestellt')
                        ");
                        $stmt->execute([$teilId, $bestellmenge]);
                        $pdo->commit();

                        flash('hinweis', sprintf(
                            '%s ist nicht ausreichend auf Lager (Bestand: %d). Es wurde eine Bestellung über %d Stück angelegt. '
                            . 'Der Auftrag wartet jetzt auf das Teil – bitte nach Lieferung erneut buchen.',
                            $teil['bezeichnung'], $teil['bestand'], $bestellmenge
                        ));
                    }
                    weiterleiten('auftrag_bearbeiten.php?id=' . $auftragId);
                }
            } catch (PDOException $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                $fehler['teil_allgemein'] = 'Die Buchung konnte nicht gespeichert werden.';
            }
        }
    }
}

/* ======================================================================
 * Daten für die Anzeige
 * ==================================================================== */

// Bereits gebuchte Ersatzteile dieses Auftrags
$stmt = $pdo->prepare("
    SELECT e.bezeichnung, ae.menge
    FROM auftrag_ersatzteil ae
    JOIN ersatzteil e ON e.id = ae.ersatzteil_id
    WHERE ae.auftrag_id = ?
    ORDER BY e.bezeichnung
");
$stmt->execute([$auftragId]);
$gebuchteTeile = $stmt->fetchAll();

// Position des aktuellen Status im Ablauf (für die Fortschrittsanzeige)
$ablauf = array_keys(STATUS_LISTE);
$aktuellerIndex = array_search($auftrag['status'], $ablauf, true);

// Ausfall- bzw. Reparaturdauer (nur bei abgeschlossenen Aufträgen)
$ausfallMinuten = $reparaturMinuten = null;
if ($auftrag['ende_zeit']) {
    $ausfallMinuten = (strtotime($auftrag['ende_zeit']) - strtotime($auftrag['zeitpunkt'])) / 60;
    if ($auftrag['start_zeit']) {
        $reparaturMinuten = (strtotime($auftrag['ende_zeit']) - strtotime($auftrag['start_zeit'])) / 60;
    }
}

$seitentitel = 'Auftrag ' . $auftragId;
$aktiveSeite = 'auftraege.php';
require __DIR__ . '/includes/header.php';
?>

<div class="mb-3">
    <a href="auftraege.php">‹ Alle Aufträge</a>
</div>

<div class="seitenkopf">
    <div class="d-flex align-items-center gap-2 flex-wrap mb-2">
        <?= status_pill($auftrag['status']) ?>
        <?= prioritaet_pill($auftrag['prioritaet']) ?>
    </div>
    <h1><?= e($auftrag['maschine']) ?></h1>
    <p>Störmeldung Nr. <?= (int) $auftrag['stoermeldung_id'] ?> · <?= e($auftrag['standort']) ?></p>
</div>

<?php if (!empty($fehler)): ?>
    <div class="hinweis hinweis-fehler" role="alert">
        <?= e($fehler['teil_allgemein'] ?? 'Bitte prüfen Sie die markierten Felder.') ?>
    </div>
<?php endif; ?>

<div class="row g-4">
    <div class="col-lg-7">

        <!-- Störmeldung (nur lesend) -->
        <section class="karte">
            <h2 class="abschnitt-titel">Störmeldung</h2>
            <p class="mb-4"><?= nl2br(e($auftrag['beschreibung'])) ?></p>
            <dl class="details mb-4">
                <dt>Gemeldet am</dt>   <dd><?= e(datum_zeit($auftrag['zeitpunkt'])) ?></dd>
                <dt>Gemeldet von</dt>  <dd><?= e($auftrag['gemeldet_von']) ?></dd>
                <dt>Ursache</dt>       <dd><?= e($auftrag['ursache_kategorie']) ?></dd>
                <?php if ($ausfallMinuten !== null): ?>
                    <dt>Ausfallzeit</dt>   <dd><?= e(dauer($ausfallMinuten)) ?></dd>
                    <dt>Reparaturdauer</dt><dd><?= e(dauer($reparaturMinuten)) ?></dd>
                <?php endif; ?>
            </dl>

            <!-- Fortschritt: gemeldet → zugewiesen → in Arbeit → wartet auf Teil → erledigt -->
            <ol class="ablauf" aria-label="Bearbeitungsstand">
                <?php foreach ($ablauf as $i => $schritt): ?>
                    <li class="<?= $i <= $aktuellerIndex ? 'erreicht' : '' ?><?= $i === $aktuellerIndex ? ' aktuell' : '' ?>"
                        <?= $i === $aktuellerIndex ? 'aria-current="step"' : '' ?>>
                        <?= e(ucfirst($schritt)) ?>
                    </li>
                <?php endforeach; ?>
            </ol>
        </section>

        <!-- Bearbeitung -->
        <form method="post" class="karte" novalidate>
            <?= csrf_feld() ?>
            <input type="hidden" name="aktion" value="speichern">

            <h2 class="abschnitt-titel">Bearbeitung</h2>

            <div class="row g-4 mb-4">
                <div class="col-md-6">
                    <label for="techniker_id" class="form-label">Techniker</label>
                    <select id="techniker_id" name="techniker_id"
                            class="form-select<?= fehlerklasse($fehler, 'techniker_id') ?>">
                        <option value="">Noch nicht zugewiesen</option>
                        <?php foreach ($techniker as $t): ?>
                            <option value="<?= (int) $t['id'] ?>" <?= $eingabe['techniker_id'] === (string) $t['id'] ? 'selected' : '' ?>>
                                <?= e($t['name']) ?> (<?= e($t['qualifikation']) ?>, <?= e($t['schicht']) ?>)
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <?= fehlertext($fehler, 'techniker_id') ?>
                </div>

                <div class="col-md-6">
                    <label for="status" class="form-label">Status</label>
                    <select id="status" name="status" class="form-select<?= fehlerklasse($fehler, 'status') ?>">
                        <?php foreach (array_keys(STATUS_LISTE) as $s): ?>
                            <option value="<?= e($s) ?>" <?= $eingabe['status'] === $s ? 'selected' : '' ?>>
                                <?= e(ucfirst($s)) ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <?= fehlertext($fehler, 'status') ?>
                </div>

                <div class="col-md-6">
                    <label for="start_zeit" class="form-label">Arbeitsbeginn</label>
                    <input type="datetime-local" id="start_zeit" name="start_zeit"
                           class="form-control<?= fehlerklasse($fehler, 'start_zeit') ?>"
                           value="<?= e($eingabe['start_zeit']) ?>">
                    <?= fehlertext($fehler, 'start_zeit') ?>
                    <div class="form-text">Wird bei „in Arbeit“ automatisch gesetzt.</div>
                </div>

                <div class="col-md-6">
                    <label for="ende_zeit" class="form-label">Endzeit</label>
                    <input type="datetime-local" id="ende_zeit" name="ende_zeit"
                           class="form-control<?= fehlerklasse($fehler, 'ende_zeit') ?>"
                           value="<?= e($eingabe['ende_zeit']) ?>" max="<?= e(date('Y-m-d\TH:i')) ?>">
                    <?= fehlertext($fehler, 'ende_zeit') ?>
                    <div class="form-text">Pflicht beim Abschluss.</div>
                </div>
            </div>

            <div class="mb-4">
                <label for="massnahme" class="form-label">Durchgeführte Maßnahme</label>
                <textarea id="massnahme" name="massnahme" rows="4" maxlength="2000"
                          class="form-control<?= fehlerklasse($fehler, 'massnahme') ?>"
                          placeholder="z. B. Lager getauscht, Spindel neu ausgerichtet, Probelauf ok"><?= e($eingabe['massnahme']) ?></textarea>
                <?= fehlertext($fehler, 'massnahme') ?>
                <div class="form-text">Pflicht beim Abschluss.</div>
            </div>

            <div class="d-flex justify-content-end">
                <button type="submit" class="btn btn-primary">Speichern</button>
            </div>
        </form>
    </div>

    <!-- Ersatzteile -->
    <div class="col-lg-5">
        <section class="karte">
            <h2 class="abschnitt-titel">Verwendete Ersatzteile</h2>

            <?php if (empty($gebuchteTeile)): ?>
                <p class="text-leise">Noch keine Ersatzteile gebucht.</p>
            <?php else: ?>
                <table class="tabelle mb-4">
                    <thead><tr><th>Ersatzteil</th><th class="zahl">Menge</th></tr></thead>
                    <tbody>
                    <?php foreach ($gebuchteTeile as $gt): ?>
                        <tr>
                            <td><?= e($gt['bezeichnung']) ?></td>
                            <td class="zahl"><?= (int) $gt['menge'] ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>

            <?php if ($auftrag['status'] !== 'erledigt'): ?>
                <form method="post" novalidate>
                    <?= csrf_feld() ?>
                    <input type="hidden" name="aktion" value="teil_buchen">

                    <div class="mb-3">
                        <label for="ersatzteil_id" class="form-label">Ersatzteil buchen</label>
                        <select id="ersatzteil_id" name="ersatzteil_id"
                                class="form-select<?= fehlerklasse($fehler, 'ersatzteil_id') ?>">
                            <option value="">Bitte auswählen …</option>
                            <?php foreach ($ersatzteile as $et): ?>
                                <option value="<?= (int) $et['id'] ?>" <?= $teilEingabe['ersatzteil_id'] === (string) $et['id'] ? 'selected' : '' ?>>
                                    <?= e($et['bezeichnung']) ?> – Bestand: <?= (int) $et['bestand'] ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <?= fehlertext($fehler, 'ersatzteil_id') ?>
                    </div>

                    <div class="d-flex gap-2 align-items-start">
                        <div style="width: 110px;">
                            <label for="menge" class="form-label visually-hidden">Menge</label>
                            <input type="number" id="menge" name="menge" min="1" max="999" inputmode="numeric"
                                   class="form-control<?= fehlerklasse($fehler, 'menge') ?>"
                                   value="<?= e($teilEingabe['menge']) ?>" aria-label="Menge">
                        </div>
                        <button type="submit" class="btn btn-primary flex-grow-1">Buchen</button>
                    </div>
                    <?= fehlertext($fehler, 'menge') ?>
                    <p class="form-text mt-3 mb-0">
                        Ist ein Teil nicht ausreichend auf Lager, wird automatisch eine Bestellung angelegt
                        und der Auftrag auf „wartet auf Teil“ gesetzt.
                    </p>
                </form>
            <?php endif; ?>
        </section>
    </div>
</div>

<script>
    // Komfortfunktion: Beim Wechsel auf "erledigt" die Endzeit mit der aktuellen
    // Uhrzeit vorbelegen (falls noch leer) und das Maßnahmen-Feld fokussieren.
    document.getElementById('status').addEventListener('change', function () {
        if (this.value !== 'erledigt') return;
        const ende = document.getElementById('ende_zeit');
        if (ende.value === '') {
            const jetzt = new Date();
            jetzt.setMinutes(jetzt.getMinutes() - jetzt.getTimezoneOffset());   // Ortszeit
            ende.value = jetzt.toISOString().slice(0, 16);
        }
        document.getElementById('massnahme').focus();
    });
</script>

<?php require __DIR__ . '/includes/footer.php'; ?>
