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
--
-- Aufbau des Unternehmens (für die Störungskarte):
--   standort (Werk) 1 ── n gebaeude 1 ── n maschine 1 ── n stoermeldung 1 ── 1 wartungsauftrag
-- =====================================================================

-- ---------------------------------------------------------------------
-- Aufräumen (für erneutes Ausführen)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_stoerung_details, v_stoerungen_monat, v_ausfallzeit_maschine, v_mttr_maschine,
                    v_kennzahlen_standort;
DROP TABLE IF EXISTS bestellung, auftrag_ersatzteil, ersatzteil, wartungsauftrag,
                     stoermeldung, techniker, maschine, gebaeude, standort CASCADE;
DROP TYPE IF EXISTS auftragsstatus, prioritaet, schicht, bestellstatus, ursache, maschinentyp;


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
-- Maschinenart: bestimmt u. a. das Symbol im Grundriss
CREATE TYPE maschinentyp   AS ENUM ('Fräsen', 'Drehen', 'Spritzguss', 'Laserschneiden', 'Schweißen', 'Pressen',
                                    'Fördertechnik', 'Lackieren', 'Montage', 'Druckluft', 'Lagertechnik');


-- =====================================================================
-- Stammdaten
-- =====================================================================

-- Standorte (Werke) des Unternehmens – mit GPS-Position für die Deutschlandkarte
CREATE TABLE standort (
    id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kuerzel            VARCHAR(5)   NOT NULL UNIQUE,      -- z. B. 'HAM'
    name               VARCHAR(100) NOT NULL UNIQUE,      -- z. B. 'Werk Hamburg'
    stadt              VARCHAR(100) NOT NULL,
    adresse            VARCHAR(150) NOT NULL,
    schwerpunkt        VARCHAR(100) NOT NULL,             -- was dort hauptsächlich gefertigt wird
    breitengrad        DOUBLE PRECISION NOT NULL CHECK (breitengrad BETWEEN -90 AND 90),
    laengengrad        DOUBLE PRECISION NOT NULL CHECK (laengengrad BETWEEN -180 AND 180),
    -- Größe des Werksgeländes in Metern (für den Lageplan)
    gelaende_breite_m  REAL NOT NULL CHECK (gelaende_breite_m > 0),
    gelaende_tiefe_m   REAL NOT NULL CHECK (gelaende_tiefe_m > 0)
);
COMMENT ON TABLE standort IS 'Werke des Unternehmens';

-- Gebäude eines Standorts – mit Lage auf dem Werksgelände und Raumaufteilung
CREATE TABLE gebaeude (
    id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    standort_id  INTEGER      NOT NULL REFERENCES standort (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    kuerzel      VARCHAR(10)  NOT NULL,                   -- z. B. 'H2'
    bezeichnung  VARCHAR(100) NOT NULL,                   -- z. B. 'Halle 2 – Montage'
    -- Position und Größe auf dem Lageplan des Werksgeländes (Meter, Ursprung oben links)
    lage_x_m     REAL NOT NULL CHECK (lage_x_m >= 0),
    lage_y_m     REAL NOT NULL CHECK (lage_y_m >= 0),
    breite_m     REAL NOT NULL CHECK (breite_m > 0),
    tiefe_m      REAL NOT NULL CHECK (tiefe_m > 0),
    -- Raumaufteilung für den Grundriss, z. B. [{"name":"Fertigung","x":0,"y":0,"b":60,"t":40}, …]
    bereiche     JSONB NOT NULL DEFAULT '[]',
    UNIQUE (standort_id, kuerzel)                         -- 'H1' gibt es an jedem Standort, aber nur einmal
);
COMMENT ON TABLE gebaeude IS 'Gebäude (Hallen) der Standorte';
CREATE INDEX idx_gebaeude_standort ON gebaeude (standort_id);

-- Maschinen – mit Position im Grundriss ihres Gebäudes
CREATE TABLE maschine (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gebaeude_id    INTEGER      NOT NULL REFERENCES gebaeude (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    anlagennummer  VARCHAR(20)  NOT NULL UNIQUE,          -- z. B. 'HAM-H2-03'
    bezeichnung    VARCHAR(100) NOT NULL,                 -- z. B. 'CNC-Fräszentrum FZ-500'
    typ            maschinentyp NOT NULL,
    baujahr        SMALLINT     NOT NULL CHECK (baujahr BETWEEN 1950 AND 2100),
    -- Position (linke obere Ecke) und Stellfläche im Gebäude, in Metern
    pos_x_m        REAL NOT NULL CHECK (pos_x_m >= 0),
    pos_y_m        REAL NOT NULL CHECK (pos_y_m >= 0),
    breite_m       REAL NOT NULL CHECK (breite_m > 0),
    tiefe_m        REAL NOT NULL CHECK (tiefe_m > 0)
);
COMMENT ON TABLE maschine IS 'Maschinen und Anlagen der Produktion';
CREATE INDEX idx_maschine_gebaeude ON maschine (gebaeude_id);

-- Instandhaltungstechniker – jeweils einem Standort zugeordnet
CREATE TABLE techniker (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    standort_id    INTEGER      NULL REFERENCES standort (id) ON UPDATE CASCADE ON DELETE SET NULL,
    name           VARCHAR(100) NOT NULL,
    qualifikation  VARCHAR(100) NOT NULL,
    schicht        schicht      NOT NULL
);
COMMENT ON TABLE techniker IS 'Techniker der Instandhaltung';
CREATE INDEX idx_techniker_standort ON techniker (standort_id);

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
ALTER TABLE standort           ENABLE ROW LEVEL SECURITY;
ALTER TABLE gebaeude           ENABLE ROW LEVEL SECURITY;
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
    m.anlagennummer,
    m.bezeichnung                               AS maschine,
    st.name                                     AS standort,
    g.bezeichnung                               AS gebaeude,
    COUNT(w.id)                                 AS anzahl_erledigt,
    ROUND(AVG(EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 60)::numeric, 1)        AS mttr_minuten,
    ROUND(AVG(EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 3600)::numeric, 2)      AS mttr_stunden
FROM maschine m
JOIN gebaeude g             ON g.id = m.gebaeude_id
JOIN standort st            ON st.id = g.standort_id
LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
                           AND w.status = 'erledigt'
                           AND w.start_zeit IS NOT NULL
GROUP BY m.id, m.anlagennummer, m.bezeichnung, st.name, g.bezeichnung;

-- Ausfallzeit pro Maschine (Summe über alle erledigten Störungen)
CREATE VIEW v_ausfallzeit_maschine WITH (security_invoker = true) AS
SELECT
    m.id                                        AS maschine_id,
    m.anlagennummer,
    m.bezeichnung                               AS maschine,
    st.name                                     AS standort,
    g.bezeichnung                               AS gebaeude,
    COUNT(s.id)                                 AS anzahl_stoerungen,
    ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 60)
          FILTER (WHERE w.status = 'erledigt'), 0)::numeric, 0)                          AS ausfallzeit_minuten,
    ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 3600)
          FILTER (WHERE w.status = 'erledigt'), 0)::numeric, 1)                          AS ausfallzeit_stunden
FROM maschine m
JOIN gebaeude g             ON g.id = m.gebaeude_id
JOIN standort st            ON st.id = g.standort_id
LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
GROUP BY m.id, m.anlagennummer, m.bezeichnung, st.name, g.bezeichnung;

-- Kennzahlen pro Standort (Werk): Störungen, offene Aufträge, MTTR, Ausfallzeit
CREATE VIEW v_kennzahlen_standort WITH (security_invoker = true) AS
SELECT
    st.id                                       AS standort_id,
    st.kuerzel,
    st.name                                     AS standort,
    st.stadt,
    st.breitengrad,
    st.laengengrad,
    COUNT(DISTINCT g.id)                        AS anzahl_gebaeude,
    COUNT(DISTINCT m.id)                        AS anzahl_maschinen,
    COUNT(s.id)                                 AS anzahl_stoerungen,
    COUNT(s.id) FILTER (WHERE w.status <> 'erledigt')                                   AS offene_auftraege,
    ROUND((AVG(EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 3600)
          FILTER (WHERE w.status = 'erledigt'))::numeric, 2)                            AS mttr_stunden,
    ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 3600)
          FILTER (WHERE w.status = 'erledigt'), 0)::numeric, 1)                         AS ausfallzeit_stunden
FROM standort st
LEFT JOIN gebaeude g        ON g.standort_id = st.id
LEFT JOIN maschine m        ON m.gebaeude_id = g.id
LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
GROUP BY st.id, st.kuerzel, st.name, st.stadt, st.breitengrad, st.laengengrad;

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
-- Ideal als Faktentabelle in Power BI (eigene Filter nach Datum, Standort, Maschine, Techniker, Ursache).
CREATE VIEW v_stoerung_details WITH (security_invoker = true) AS
SELECT
    s.id                                                         AS meldung_id,
    w.id                                                         AS auftrag_id,
    s.zeitpunkt AT TIME ZONE 'Europe/Berlin'                     AS zeitpunkt,
    (s.zeitpunkt AT TIME ZONE 'Europe/Berlin')::date             AS datum,
    to_char(s.zeitpunkt AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS monat,
    st.kuerzel                                                   AS standort_kuerzel,
    st.name                                                      AS standort,
    st.stadt,
    g.bezeichnung                                                AS gebaeude,
    m.id                                                         AS maschine_id,
    m.anlagennummer,
    m.bezeichnung                                                AS maschine,
    m.typ::text                                                  AS maschinentyp,
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
JOIN gebaeude g             ON g.id = m.gebaeude_id
JOIN standort st            ON st.id = g.standort_id
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
LEFT JOIN techniker t       ON t.id = w.techniker_id;
