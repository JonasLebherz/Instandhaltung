-- =====================================================================
-- schema.sql – Datenbankschema für das Instandhaltungsmanagement (PostgreSQL / Supabase)
--
-- Ausführen: Supabase → SQL Editor → "New query" → Inhalt einfügen → "Run".
-- Ein erneutes Ausführen ist möglich: Alle Tabellen, Views und Daten werden
-- dabei neu angelegt (vorhandene Daten gehen verloren!).
--
-- Unterschiede zur früheren MySQL-Version (Branch php-xampp):
--   - feste Wertelisten als eigene Datentypen (CREATE TYPE … AS ENUM)
--   - fortlaufende IDs mit GENERATED ALWAYS AS IDENTITY statt AUTO_INCREMENT
--   - Zeitpunkte als TIMESTAMPTZ (mit Zeitzone), angezeigt wird in Europe/Berlin
--   - Row Level Security: Die Tabellen sind für die öffentliche Supabase-API
--     gesperrt. Zugriff nur über die Webanwendung (Server) und Power BI.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Aufräumen (für erneutes Ausführen)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_stoerung_details, v_stoerungen_monat, v_ausfallzeit_maschine, v_mttr_maschine;
DROP TABLE IF EXISTS bestellung, auftrag_ersatzteil, ersatzteil, wartungsauftrag,
                     stoermeldung, techniker, maschine CASCADE;
DROP TYPE IF EXISTS auftragsstatus, prioritaet, schicht, bestellstatus, ursache;


-- ---------------------------------------------------------------------
-- Wertelisten (gleiche Werte wie in lib/konstanten.js)
-- Die Reihenfolge ist wichtig: Danach wird z. B. sortiert.
-- ---------------------------------------------------------------------
CREATE TYPE auftragsstatus AS ENUM ('gemeldet', 'zugewiesen', 'in Arbeit', 'wartet auf Teil', 'erledigt');
CREATE TYPE prioritaet     AS ENUM ('niedrig', 'mittel', 'hoch');
CREATE TYPE schicht        AS ENUM ('Frühschicht', 'Spätschicht', 'Nachtschicht');
CREATE TYPE bestellstatus  AS ENUM ('bestellt', 'geliefert');
CREATE TYPE ursache        AS ENUM ('Mechanischer Defekt', 'Elektrischer Fehler', 'Hydraulik/Pneumatik',
                                    'Steuerung/Software', 'Verschleiß', 'Bedienfehler',
                                    'Materialfehler', 'Sonstiges');


-- =====================================================================
-- Stammdaten
-- =====================================================================

-- Maschinen im Werk
CREATE TABLE maschine (
    id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bezeichnung  VARCHAR(100) NOT NULL UNIQUE,
    standort     VARCHAR(100) NOT NULL,
    baujahr      SMALLINT     NOT NULL CHECK (baujahr BETWEEN 1950 AND 2100)
);
COMMENT ON TABLE maschine IS 'Maschinen und Anlagen der Produktion';

-- Instandhaltungstechniker
CREATE TABLE techniker (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,
    qualifikation  VARCHAR(100) NOT NULL,
    schicht        schicht      NOT NULL
);
COMMENT ON TABLE techniker IS 'Techniker der Instandhaltung';

-- Ersatzteillager
CREATE TABLE ersatzteil (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bezeichnung     VARCHAR(100) NOT NULL UNIQUE,
    bestand         INTEGER NOT NULL DEFAULT 0 CHECK (bestand >= 0),   -- Bestand kann nie negativ werden
    mindestbestand  INTEGER NOT NULL DEFAULT 0 CHECK (mindestbestand >= 0)
);
COMMENT ON TABLE ersatzteil IS 'Ersatzteile mit aktuellem Lagerbestand';


-- =====================================================================
-- Bewegungsdaten
-- =====================================================================

-- Störmeldung: Was ist wann an welcher Maschine passiert?
CREATE TABLE stoermeldung (
    id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Eine Maschine mit Störmeldungen darf nicht gelöscht werden (RESTRICT)
    maschine_id        INTEGER       NOT NULL REFERENCES maschine (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    gemeldet_von       VARCHAR(100)  NOT NULL,
    zeitpunkt          TIMESTAMPTZ   NOT NULL,
    beschreibung       VARCHAR(1000) NOT NULL,
    ursache_kategorie  ursache       NOT NULL,
    prioritaet         prioritaet    NOT NULL DEFAULT 'mittel'
);
COMMENT ON TABLE stoermeldung IS 'Gemeldete Maschinenstörungen';
-- Index für "Störungen einer Maschine in einem Zeitraum" (Filter, Statistik)
CREATE INDEX idx_stoermeldung_maschine_zeit ON stoermeldung (maschine_id, zeitpunkt);
-- Index für Auswertungen nach Zeitraum (Störungen pro Monat)
CREATE INDEX idx_stoermeldung_zeitpunkt ON stoermeldung (zeitpunkt);
-- Indizes für die Auswertung nach Ursache und Priorität
CREATE INDEX idx_stoermeldung_ursache ON stoermeldung (ursache_kategorie);
CREATE INDEX idx_stoermeldung_prioritaet ON stoermeldung (prioritaet);

-- Wartungsauftrag: die Bearbeitung einer Störmeldung (genau einer pro Meldung)
CREATE TABLE wartungsauftrag (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- UNIQUE: Zu jeder Störmeldung gibt es höchstens einen Auftrag (1:1-Beziehung).
    -- Wird eine Meldung gelöscht, verschwindet auch ihr Auftrag (CASCADE).
    stoermeldung_id  INTEGER NOT NULL UNIQUE REFERENCES stoermeldung (id) ON UPDATE CASCADE ON DELETE CASCADE,
    -- Verlässt ein Techniker das Unternehmen, bleibt der Auftrag erhalten (ohne Techniker)
    techniker_id     INTEGER NULL REFERENCES techniker (id) ON UPDATE CASCADE ON DELETE SET NULL,
    status           auftragsstatus NOT NULL DEFAULT 'gemeldet',
    start_zeit       TIMESTAMPTZ NULL,       -- Beginn der Reparatur
    ende_zeit        TIMESTAMPTZ NULL,       -- Maschine läuft wieder
    massnahme        VARCHAR(2000) NULL,     -- durchgeführte Arbeiten
    -- Plausibilität: Ende nicht vor Beginn
    CONSTRAINT chk_wartungsauftrag_zeiten CHECK (ende_zeit IS NULL OR start_zeit IS NULL OR ende_zeit >= start_zeit),
    -- Ein erledigter Auftrag braucht ein Ende
    CONSTRAINT chk_wartungsauftrag_erledigt CHECK (status <> 'erledigt' OR ende_zeit IS NOT NULL)
);
COMMENT ON TABLE wartungsauftrag IS 'Bearbeitung der Störmeldungen durch die Instandhaltung';
-- Indizes für Dashboard (Aufträge nach Status) und Filter
CREATE INDEX idx_wartungsauftrag_status ON wartungsauftrag (status);
CREATE INDEX idx_wartungsauftrag_techniker ON wartungsauftrag (techniker_id);
CREATE INDEX idx_wartungsauftrag_ende ON wartungsauftrag (ende_zeit);

-- Verwendete Ersatzteile pro Auftrag (n:m-Beziehung zwischen Auftrag und Ersatzteil)
CREATE TABLE auftrag_ersatzteil (
    auftrag_id     INTEGER NOT NULL REFERENCES wartungsauftrag (id) ON UPDATE CASCADE ON DELETE CASCADE,
    ersatzteil_id  INTEGER NOT NULL REFERENCES ersatzteil (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    menge          INTEGER NOT NULL CHECK (menge > 0),
    -- Zusammengesetzter Primärschlüssel: jedes Teil einmal pro Auftrag,
    -- weitere Buchungen erhöhen die Menge (INSERT … ON CONFLICT … DO UPDATE)
    PRIMARY KEY (auftrag_id, ersatzteil_id)
);
COMMENT ON TABLE auftrag_ersatzteil IS 'Gebuchte Ersatzteile je Wartungsauftrag';
CREATE INDEX idx_auftrag_ersatzteil_teil ON auftrag_ersatzteil (ersatzteil_id);

-- Bestellungen von Ersatzteilen
CREATE TABLE bestellung (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ersatzteil_id  INTEGER NOT NULL REFERENCES ersatzteil (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    menge          INTEGER NOT NULL CHECK (menge > 0),
    bestelldatum   DATE    NOT NULL,
    lieferdatum    DATE    NULL,           -- tatsächliches Lieferdatum, NULL = noch offen
    status         bestellstatus NOT NULL DEFAULT 'bestellt',
    CONSTRAINT chk_bestellung_lieferung CHECK (lieferdatum IS NULL OR lieferdatum >= bestelldatum)
);
COMMENT ON TABLE bestellung IS 'Nachbestellungen von Ersatzteilen';
-- Index für "Gibt es schon eine offene Bestellung für dieses Teil?"
CREATE INDEX idx_bestellung_teil_status ON bestellung (ersatzteil_id, status);


-- =====================================================================
-- Sicherheit: Row Level Security (RLS)
--
-- Supabase stellt jede Tabelle automatisch über eine öffentliche
-- Programmierschnittstelle (REST-API) bereit. Mit eingeschaltetem RLS und
-- ohne Freigaben (Policies) ist über diesen Weg KEIN Zugriff möglich.
-- Die Webanwendung greift serverseitig direkt auf die Datenbank zu und
-- ist davon nicht betroffen, ebenso Power BI.
-- =====================================================================
ALTER TABLE maschine           ENABLE ROW LEVEL SECURITY;
ALTER TABLE techniker          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ersatzteil         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stoermeldung       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wartungsauftrag    ENABLE ROW LEVEL SECURITY;
ALTER TABLE auftrag_ersatzteil ENABLE ROW LEVEL SECURITY;
ALTER TABLE bestellung         ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- Views für Kennzahlen (z. B. für Power BI)
--
-- Definitionen (identisch zur Statistikseite der Webanwendung):
--   Reparaturdauer = ende_zeit − start_zeit
--   MTTR           = Durchschnitt der Reparaturdauer erledigter Aufträge
--   Ausfallzeit    = ende_zeit − Zeitpunkt der Störmeldung
-- Zeitdifferenzen: EXTRACT(EPOCH FROM …) liefert Sekunden, / 60 = Minuten.
--
-- security_invoker = true: Die View prüft die Rechte des Abfragenden.
-- So gilt der RLS-Schutz oben auch für die Views.
-- =====================================================================

-- MTTR (Mean Time To Repair) pro Maschine
-- LEFT JOIN: Auch Maschinen ohne erledigte Störung erscheinen (mit NULL).
CREATE VIEW v_mttr_maschine WITH (security_invoker = true) AS
SELECT
    m.id                                        AS maschine_id,
    m.bezeichnung                               AS maschine,
    m.standort,
    COUNT(w.id)                                 AS anzahl_erledigt,
    ROUND(AVG(EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 60)::numeric, 1)        AS mttr_minuten,
    ROUND(AVG(EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 3600)::numeric, 2)      AS mttr_stunden
FROM maschine m
LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
                           AND w.status = 'erledigt'
                           AND w.start_zeit IS NOT NULL
GROUP BY m.id, m.bezeichnung, m.standort;

-- Ausfallzeit pro Maschine (Summe über alle erledigten Störungen)
CREATE VIEW v_ausfallzeit_maschine WITH (security_invoker = true) AS
SELECT
    m.id                                        AS maschine_id,
    m.bezeichnung                               AS maschine,
    m.standort,
    COUNT(s.id)                                 AS anzahl_stoerungen,
    ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 60)
          FILTER (WHERE w.status = 'erledigt'), 0)::numeric, 0)                          AS ausfallzeit_minuten,
    ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 3600)
          FILTER (WHERE w.status = 'erledigt'), 0)::numeric, 1)                          AS ausfallzeit_stunden
FROM maschine m
LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
GROUP BY m.id, m.bezeichnung, m.standort;

-- Anzahl der Störungen pro Monat (gesamt und nach Priorität), Monate nach deutscher Zeit
CREATE VIEW v_stoerungen_monat WITH (security_invoker = true) AS
SELECT
    to_char(s.zeitpunkt AT TIME ZONE 'Europe/Berlin', 'YYYY-MM')            AS monat,   -- z. B. 2026-03 (sortierbar)
    EXTRACT(YEAR  FROM s.zeitpunkt AT TIME ZONE 'Europe/Berlin')::int        AS jahr,
    EXTRACT(MONTH FROM s.zeitpunkt AT TIME ZONE 'Europe/Berlin')::int        AS monat_nr,
    COUNT(*)                                                                 AS anzahl_stoerungen,
    COUNT(*) FILTER (WHERE s.prioritaet = 'hoch')                            AS davon_hoch,
    COUNT(*) FILTER (WHERE s.prioritaet = 'mittel')                          AS davon_mittel,
    COUNT(*) FILTER (WHERE s.prioritaet = 'niedrig')                         AS davon_niedrig
FROM stoermeldung s
GROUP BY 1, 2, 3;

-- Zusätzlich: eine flache Tabelle mit einer Zeile pro Störung.
-- Ideal als Faktentabelle in Power BI (eigene Filter nach Datum, Maschine, Techniker, Ursache).
CREATE VIEW v_stoerung_details WITH (security_invoker = true) AS
SELECT
    s.id                                                         AS meldung_id,
    w.id                                                         AS auftrag_id,
    s.zeitpunkt AT TIME ZONE 'Europe/Berlin'                     AS zeitpunkt,
    (s.zeitpunkt AT TIME ZONE 'Europe/Berlin')::date             AS datum,
    to_char(s.zeitpunkt AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS monat,
    m.id                                                         AS maschine_id,
    m.bezeichnung                                                AS maschine,
    m.standort,
    s.ursache_kategorie::text                                    AS ursache_kategorie,
    s.prioritaet::text                                           AS prioritaet,
    s.gemeldet_von,
    w.status::text                                               AS status,
    t.name                                                       AS techniker,
    w.start_zeit AT TIME ZONE 'Europe/Berlin'                    AS start_zeit,
    w.ende_zeit  AT TIME ZONE 'Europe/Berlin'                    AS ende_zeit,
    ROUND((EXTRACT(EPOCH FROM (w.start_zeit - s.zeitpunkt)) / 60)::numeric)  AS reaktionszeit_minuten,
    ROUND((EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 60)::numeric)  AS reparaturdauer_minuten,
    ROUND((EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 60)::numeric)   AS ausfallzeit_minuten
FROM stoermeldung s
JOIN maschine m             ON m.id = s.maschine_id
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
LEFT JOIN techniker t       ON t.id = w.techniker_id;
