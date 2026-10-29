-- =====================================================================
-- schema.sql – Datenbankschema für das Instandhaltungsmanagement
--
-- Import: phpMyAdmin → Reiter "Importieren" → diese Datei auswählen.
-- Das Skript legt die Datenbank "instandhaltung" selbst an. Ein erneuter
-- Import ist möglich, dabei werden alle Tabellen und Daten neu erstellt.
--
-- Getestet mit MariaDB 10.4+ (in XAMPP enthalten) und MySQL 8.
-- =====================================================================

-- Diese Datei ist UTF-8-kodiert. SET NAMES sorgt dafür, dass der Server sie auch
-- so liest – sonst würden Umlaute (ä, ö, ü, ß) beim Import verfälscht.
SET NAMES utf8mb4;

-- utf8mb4: volle Unterstützung für Umlaute, ß und alle Sonderzeichen
CREATE DATABASE IF NOT EXISTS instandhaltung
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE instandhaltung;

-- Bei erneutem Import: alte Views und Tabellen entfernen.
-- Reihenfolge beachten: erst abhängige Tabellen (mit Fremdschlüsseln) löschen.
DROP VIEW IF EXISTS v_stoerung_details;
DROP VIEW IF EXISTS v_stoerungen_monat;
DROP VIEW IF EXISTS v_ausfallzeit_maschine;
DROP VIEW IF EXISTS v_mttr_maschine;

DROP TABLE IF EXISTS bestellung;
DROP TABLE IF EXISTS auftrag_ersatzteil;
DROP TABLE IF EXISTS ersatzteil;
DROP TABLE IF EXISTS wartungsauftrag;
DROP TABLE IF EXISTS stoermeldung;
DROP TABLE IF EXISTS techniker;
DROP TABLE IF EXISTS maschine;


-- =====================================================================
-- Stammdaten
-- =====================================================================

-- Maschinen im Werk
CREATE TABLE maschine (
    id           INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    bezeichnung  VARCHAR(100)      NOT NULL,
    standort     VARCHAR(100)      NOT NULL,
    baujahr      SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_maschine_bezeichnung (bezeichnung),
    CONSTRAINT chk_maschine_baujahr CHECK (baujahr BETWEEN 1950 AND 2100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Maschinen und Anlagen der Produktion';

-- Instandhaltungstechniker
CREATE TABLE techniker (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name           VARCHAR(100) NOT NULL,
    qualifikation  VARCHAR(100) NOT NULL,
    schicht        ENUM('Frühschicht', 'Spätschicht', 'Nachtschicht') NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Techniker der Instandhaltung';

-- Ersatzteillager
CREATE TABLE ersatzteil (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    bezeichnung     VARCHAR(100) NOT NULL,
    bestand         INT UNSIGNED NOT NULL DEFAULT 0,   -- UNSIGNED: Bestand kann nie negativ werden
    mindestbestand  INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ersatzteil_bezeichnung (bezeichnung)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Ersatzteile mit aktuellem Lagerbestand';


-- =====================================================================
-- Bewegungsdaten
-- =====================================================================

-- Störmeldung: Was ist wann an welcher Maschine passiert?
CREATE TABLE stoermeldung (
    id                 INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    maschine_id        INT UNSIGNED  NOT NULL,
    gemeldet_von       VARCHAR(100)  NOT NULL,
    zeitpunkt          DATETIME      NOT NULL,
    beschreibung       VARCHAR(1000) NOT NULL,
    ursache_kategorie  VARCHAR(50)   NOT NULL,
    prioritaet         ENUM('niedrig', 'mittel', 'hoch') NOT NULL DEFAULT 'mittel',
    PRIMARY KEY (id),
    -- Index für "Störungen einer Maschine in einem Zeitraum" (Filter, Statistik)
    KEY idx_stoermeldung_maschine_zeit (maschine_id, zeitpunkt),
    -- Index für Auswertungen nach Zeitraum (Störungen pro Monat)
    KEY idx_stoermeldung_zeitpunkt (zeitpunkt),
    -- Index für die Auswertung der Störursachen
    KEY idx_stoermeldung_ursache (ursache_kategorie),
    KEY idx_stoermeldung_prioritaet (prioritaet),
    -- Eine Maschine mit Störmeldungen darf nicht gelöscht werden (RESTRICT)
    CONSTRAINT fk_stoermeldung_maschine
        FOREIGN KEY (maschine_id) REFERENCES maschine (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    -- Nur die festgelegten Ursachen (gleiche Liste wie URSACHEN_LISTE in includes/funktionen.php)
    CONSTRAINT chk_stoermeldung_ursache CHECK (ursache_kategorie IN (
        'Mechanischer Defekt', 'Elektrischer Fehler', 'Hydraulik/Pneumatik', 'Steuerung/Software',
        'Verschleiß', 'Bedienfehler', 'Materialfehler', 'Sonstiges'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Gemeldete Maschinenstörungen';

-- Wartungsauftrag: die Bearbeitung einer Störmeldung (genau einer pro Meldung)
CREATE TABLE wartungsauftrag (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    stoermeldung_id  INT UNSIGNED  NOT NULL,
    techniker_id     INT UNSIGNED  NULL,       -- NULL = noch nicht zugewiesen
    status           ENUM('gemeldet', 'zugewiesen', 'in Arbeit', 'wartet auf Teil', 'erledigt')
                     NOT NULL DEFAULT 'gemeldet',
    start_zeit       DATETIME      NULL,       -- Beginn der Reparatur
    ende_zeit        DATETIME      NULL,       -- Maschine läuft wieder
    massnahme        VARCHAR(2000) NULL,       -- durchgeführte Arbeiten
    PRIMARY KEY (id),
    -- UNIQUE: Zu jeder Störmeldung gibt es höchstens einen Auftrag (1:1-Beziehung)
    UNIQUE KEY uq_wartungsauftrag_meldung (stoermeldung_id),
    -- Indizes für Dashboard (Aufträge nach Status) und Filter
    KEY idx_wartungsauftrag_status (status),
    KEY idx_wartungsauftrag_techniker (techniker_id),
    KEY idx_wartungsauftrag_ende (ende_zeit),
    -- Wird eine Meldung gelöscht, verschwindet auch ihr Auftrag
    CONSTRAINT fk_wartungsauftrag_meldung
        FOREIGN KEY (stoermeldung_id) REFERENCES stoermeldung (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    -- Verlässt ein Techniker das Unternehmen, bleibt der Auftrag erhalten (ohne Techniker)
    CONSTRAINT fk_wartungsauftrag_techniker
        FOREIGN KEY (techniker_id) REFERENCES techniker (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    -- Plausibilität: Ende nicht vor Beginn
    CONSTRAINT chk_wartungsauftrag_zeiten
        CHECK (ende_zeit IS NULL OR start_zeit IS NULL OR ende_zeit >= start_zeit),
    -- Ein erledigter Auftrag braucht ein Ende
    CONSTRAINT chk_wartungsauftrag_erledigt
        CHECK (status <> 'erledigt' OR ende_zeit IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bearbeitung der Störmeldungen durch die Instandhaltung';

-- Verwendete Ersatzteile pro Auftrag (n:m-Beziehung zwischen Auftrag und Ersatzteil)
CREATE TABLE auftrag_ersatzteil (
    auftrag_id     INT UNSIGNED NOT NULL,
    ersatzteil_id  INT UNSIGNED NOT NULL,
    menge          INT UNSIGNED NOT NULL,
    -- Zusammengesetzter Primärschlüssel: jedes Teil einmal pro Auftrag,
    -- weitere Buchungen erhöhen die Menge (ON DUPLICATE KEY UPDATE)
    PRIMARY KEY (auftrag_id, ersatzteil_id),
    KEY idx_auftrag_ersatzteil_teil (ersatzteil_id),
    CONSTRAINT fk_auftrag_ersatzteil_auftrag
        FOREIGN KEY (auftrag_id) REFERENCES wartungsauftrag (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_auftrag_ersatzteil_teil
        FOREIGN KEY (ersatzteil_id) REFERENCES ersatzteil (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_auftrag_ersatzteil_menge CHECK (menge > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Gebuchte Ersatzteile je Wartungsauftrag';

-- Bestellungen von Ersatzteilen
CREATE TABLE bestellung (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ersatzteil_id  INT UNSIGNED NOT NULL,
    menge          INT UNSIGNED NOT NULL,
    bestelldatum   DATE         NOT NULL,
    lieferdatum    DATE         NULL,          -- tatsächliches Lieferdatum, NULL = noch offen
    status         ENUM('bestellt', 'geliefert') NOT NULL DEFAULT 'bestellt',
    PRIMARY KEY (id),
    -- Index für "Gibt es schon eine offene Bestellung für dieses Teil?"
    KEY idx_bestellung_teil_status (ersatzteil_id, status),
    KEY idx_bestellung_status (status),
    CONSTRAINT fk_bestellung_teil
        FOREIGN KEY (ersatzteil_id) REFERENCES ersatzteil (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_bestellung_menge CHECK (menge > 0),
    CONSTRAINT chk_bestellung_lieferung
        CHECK (lieferdatum IS NULL OR lieferdatum >= bestelldatum)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Nachbestellungen von Ersatzteilen';


-- =====================================================================
-- Views für Kennzahlen (z. B. für Power BI)
--
-- Definitionen (identisch zur Statistikseite der Webanwendung):
--   Reparaturdauer = ende_zeit − start_zeit
--   MTTR           = Durchschnitt der Reparaturdauer erledigter Aufträge
--   Ausfallzeit    = ende_zeit − Zeitpunkt der Störmeldung
-- Alle Zeiten in Minuten und zusätzlich in Stunden.
-- =====================================================================

-- MTTR (Mean Time To Repair) pro Maschine
-- LEFT JOIN: Auch Maschinen ohne erledigte Störung erscheinen (mit NULL).
CREATE OR REPLACE VIEW v_mttr_maschine AS
SELECT
    m.id                                        AS maschine_id,
    m.bezeichnung                               AS maschine,
    m.standort,
    COUNT(w.id)                                 AS anzahl_erledigt,
    ROUND(AVG(TIMESTAMPDIFF(MINUTE, w.start_zeit, w.ende_zeit)), 1)       AS mttr_minuten,
    ROUND(AVG(TIMESTAMPDIFF(MINUTE, w.start_zeit, w.ende_zeit)) / 60, 2)  AS mttr_stunden
FROM maschine m
LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
                           AND w.status = 'erledigt'
                           AND w.start_zeit IS NOT NULL
GROUP BY m.id, m.bezeichnung, m.standort;

-- Ausfallzeit pro Maschine (Summe über alle erledigten Störungen)
CREATE OR REPLACE VIEW v_ausfallzeit_maschine AS
SELECT
    m.id                                        AS maschine_id,
    m.bezeichnung                               AS maschine,
    m.standort,
    COUNT(s.id)                                 AS anzahl_stoerungen,
    COALESCE(SUM(CASE WHEN w.status = 'erledigt'
                      THEN TIMESTAMPDIFF(MINUTE, s.zeitpunkt, w.ende_zeit) END), 0)            AS ausfallzeit_minuten,
    ROUND(COALESCE(SUM(CASE WHEN w.status = 'erledigt'
                      THEN TIMESTAMPDIFF(MINUTE, s.zeitpunkt, w.ende_zeit) END), 0) / 60, 1)  AS ausfallzeit_stunden
FROM maschine m
LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
GROUP BY m.id, m.bezeichnung, m.standort;

-- Anzahl der Störungen pro Monat (gesamt und nach Priorität)
CREATE OR REPLACE VIEW v_stoerungen_monat AS
SELECT
    DATE_FORMAT(s.zeitpunkt, '%Y-%m')           AS monat,        -- z. B. 2026-03 (sortierbar)
    YEAR(s.zeitpunkt)                           AS jahr,
    MONTH(s.zeitpunkt)                          AS monat_nr,
    COUNT(*)                                    AS anzahl_stoerungen,
    SUM(s.prioritaet = 'hoch')                  AS davon_hoch,
    SUM(s.prioritaet = 'mittel')                AS davon_mittel,
    SUM(s.prioritaet = 'niedrig')               AS davon_niedrig
FROM stoermeldung s
GROUP BY DATE_FORMAT(s.zeitpunkt, '%Y-%m'), YEAR(s.zeitpunkt), MONTH(s.zeitpunkt);

-- Zusätzlich: eine flache Tabelle mit einer Zeile pro Störung.
-- Ideal als Faktentabelle in Power BI, weil man dort selbst nach Datum,
-- Maschine, Techniker oder Ursache filtern und gruppieren kann.
CREATE OR REPLACE VIEW v_stoerung_details AS
SELECT
    s.id                                        AS meldung_id,
    w.id                                        AS auftrag_id,
    s.zeitpunkt,
    DATE(s.zeitpunkt)                           AS datum,
    DATE_FORMAT(s.zeitpunkt, '%Y-%m')           AS monat,
    m.id                                        AS maschine_id,
    m.bezeichnung                               AS maschine,
    m.standort,
    s.ursache_kategorie,
    s.prioritaet,
    s.gemeldet_von,
    w.status,
    t.name                                      AS techniker,
    w.start_zeit,
    w.ende_zeit,
    TIMESTAMPDIFF(MINUTE, s.zeitpunkt, w.start_zeit)  AS reaktionszeit_minuten,
    TIMESTAMPDIFF(MINUTE, w.start_zeit, w.ende_zeit)  AS reparaturdauer_minuten,
    TIMESTAMPDIFF(MINUTE, s.zeitpunkt, w.ende_zeit)   AS ausfallzeit_minuten
FROM stoermeldung s
JOIN maschine m             ON m.id = s.maschine_id
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
LEFT JOIN techniker t       ON t.id = w.techniker_id;
