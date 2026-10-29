-- =====================================================================
-- Migration 002: Länder und Werke im Ausland
--
-- Im Supabase SQL Editor einmal ausführen (nach Migration 001). Vorhandene
-- Daten bleiben erhalten; die Datei kann gefahrlos mehrfach ausgeführt werden.
--
-- Das Unternehmen ist international: Hauptsitz Deutschland, dazu Werke in
-- den USA, Mexiko, China, Indien, Frankreich, Russland und Polen.
-- Die Störungskarte beginnt deshalb mit der Weltkarte: Land → Werk → Gebäude.
--
-- Neu:
--  - Tabelle "land" (ISO-Kürzel, Name, Hauptsitz)
--  - standort.land_kuerzel (alle bisherigen Werke liegen in Deutschland)
--  - 9 Auslandswerke mit Gebäuden und Maschinen. Grundriss und Maschinenpark
--    übernimmt jedes Werk von einem deutschen Werk mit gleichem Schwerpunkt.
--  - je Werk 2 Techniker und 4 Personen (2 Instandhaltung, Schichtleitung, Produktion)
--  - Störungen der letzten 12 Monate für die neuen Werke: ausgewählt aus den
--    Störungen des deutschen Vorbilds, zeitlich etwas verschoben
--  - Views v_kennzahlen_standort und v_stoerung_details: zusätzliche Spalte "land"
--
-- Teil 2 (ab "DATEN") steht genauso am Ende von testdaten.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Teil 1: STRUKTUR
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS land (
    kuerzel    CHAR(2)     PRIMARY KEY,               -- ISO 3166-1, z. B. 'DE'
    name       VARCHAR(60) NOT NULL UNIQUE,           -- deutscher Name, z. B. 'Deutschland'
    hauptsitz  BOOLEAN     NOT NULL DEFAULT false     -- Land des Hauptsitzes (genau eines)
);
COMMENT ON TABLE land IS 'Länder, in denen das Unternehmen Werke hat';
-- Höchstens ein Land ist Hauptsitz
CREATE UNIQUE INDEX IF NOT EXISTS idx_land_ein_hauptsitz ON land (hauptsitz) WHERE hauptsitz;
ALTER TABLE land ENABLE ROW LEVEL SECURITY;

-- Deutschland muss existieren, bevor die Spalte mit Standardwert 'DE' angelegt wird
INSERT INTO land (kuerzel, name, hauptsitz) VALUES ('DE', 'Deutschland', true) ON CONFLICT (kuerzel) DO NOTHING;

ALTER TABLE standort ADD COLUMN IF NOT EXISTS
    land_kuerzel CHAR(2) NOT NULL DEFAULT 'DE' REFERENCES land (kuerzel) ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_standort_land ON standort (land_kuerzel);

-- Views: Land als zusätzliche Spalte am Ende (CREATE OR REPLACE erlaubt nur neue Spalten hinten)
CREATE OR REPLACE VIEW v_kennzahlen_standort WITH (security_invoker = true) AS
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
          FILTER (WHERE w.status = 'erledigt'), 0)::numeric, 1)                         AS ausfallzeit_stunden,
    l.name                                      AS land
FROM standort st
JOIN land l                 ON l.kuerzel = st.land_kuerzel
LEFT JOIN gebaeude g        ON g.standort_id = st.id
LEFT JOIN maschine m        ON m.gebaeude_id = g.id
LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
GROUP BY st.id, st.kuerzel, st.name, st.stadt, st.breitengrad, st.laengengrad, l.name;

CREATE OR REPLACE VIEW v_stoerung_details WITH (security_invoker = true) AS
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
    ROUND((EXTRACT(EPOCH FROM (w.ende_zeit - s.zeitpunkt)) / 60)::numeric)   AS ausfallzeit_minuten,
    l.name                                                       AS land
FROM stoermeldung s
JOIN maschine m             ON m.id = s.maschine_id
JOIN gebaeude g             ON g.id = m.gebaeude_id
JOIN standort st            ON st.id = g.standort_id
JOIN land l                 ON l.kuerzel = st.land_kuerzel
LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
LEFT JOIN techniker t       ON t.id = w.techniker_id;

-- =====================================================================
-- Teil 2: DATEN – Länder und Auslandswerke
-- =====================================================================
INSERT INTO land (kuerzel, name, hauptsitz) VALUES
    ('DE', 'Deutschland', true), ('US', 'USA', false), ('MX', 'Mexiko', false), ('CN', 'China', false),
    ('IN', 'Indien', false), ('FR', 'Frankreich', false), ('RU', 'Russland', false), ('PL', 'Polen', false)
ON CONFLICT (kuerzel) DO NOTHING;

-- Auslandswerke: Gelände, Gebäude und Maschinen kommen vom deutschen Vorbild ("vorbild")
CREATE TEMP TABLE neue_werke (kuerzel, name, stadt, land_kuerzel, adresse, breitengrad, laengengrad, vorbild) AS VALUES
    ('DET', 'Werk Detroit',   'Detroit',   'US', '2400 Industrial Parkway, Detroit, MI 48211', 42.39, -83.05, 'ALB'),
    ('HOU', 'Werk Houston',   'Houston',   'US', '8800 Clinton Drive, Houston, TX 77029',       29.74, -95.27, 'HAN'),
    ('QRO', 'Werk Querétaro', 'Querétaro', 'MX', 'Av. de la Industria 120, 76220 Querétaro',    20.65, -100.38, 'NUE'),
    ('SHA', 'Werk Shanghai',  'Shanghai',  'CN', '88 Jinqiao Road, Pudong, 201206 Shanghai',    31.27, 121.60, 'MUC'),
    ('SZX', 'Werk Shenzhen',  'Shenzhen',  'CN', '16 Gaoxin Road, Nanshan, 518057 Shenzhen',    22.54, 113.95, 'LEI'),
    ('PNQ', 'Werk Pune',      'Pune',      'IN', 'Plot 42, MIDC Chakan, Pune 410501',           18.75, 73.83, 'DOR'),
    ('LYS', 'Werk Lyon',      'Lyon',      'FR', '25 Rue de l''Industrie, 69200 Vénissieux',    45.71, 4.88, 'KOE'),
    ('KLG', 'Werk Kaluga',    'Kaluga',    'RU', 'Promyschlennaja-Straße 8, 248000 Kaluga',     54.51, 36.26, 'STR'),
    ('WRO', 'Werk Wrocław',   'Wrocław',   'PL', 'ul. Fabryczna 14, 53-609 Wrocław',            51.11, 17.00, 'HAM');

INSERT INTO standort (kuerzel, name, stadt, land_kuerzel, adresse, schwerpunkt, breitengrad, laengengrad, gelaende_breite_m, gelaende_tiefe_m)
SELECT n.kuerzel, n.name, n.stadt, n.land_kuerzel, n.adresse, v.schwerpunkt, n.breitengrad, n.laengengrad, v.gelaende_breite_m, v.gelaende_tiefe_m
FROM neue_werke n JOIN standort v ON v.kuerzel = n.vorbild
ON CONFLICT (kuerzel) DO NOTHING;

-- Gebäude wie beim Vorbild
INSERT INTO gebaeude (standort_id, kuerzel, bezeichnung, lage_x_m, lage_y_m, breite_m, tiefe_m, bereiche)
SELECT st.id, g.kuerzel, g.bezeichnung, g.lage_x_m, g.lage_y_m, g.breite_m, g.tiefe_m, g.bereiche
FROM neue_werke n
JOIN standort st ON st.kuerzel = n.kuerzel
JOIN standort v  ON v.kuerzel = n.vorbild
JOIN gebaeude g  ON g.standort_id = v.id
ON CONFLICT (standort_id, kuerzel) DO NOTHING;

-- Maschinen wie beim Vorbild; Anlagennummer mit dem eigenen Kürzel (z. B. DET-H1-01), etwas jünger
INSERT INTO maschine (gebaeude_id, anlagennummer, bezeichnung, typ, baujahr, pos_x_m, pos_y_m, breite_m, tiefe_m)
SELECT gn.id, n.kuerzel || substr(m.anlagennummer, length(n.vorbild) + 1), m.bezeichnung, m.typ,
       LEAST(m.baujahr + 3, 2025), m.pos_x_m, m.pos_y_m, m.breite_m, m.tiefe_m
FROM neue_werke n
JOIN standort st ON st.kuerzel = n.kuerzel
JOIN standort v  ON v.kuerzel = n.vorbild
JOIN gebaeude gv ON gv.standort_id = v.id
JOIN gebaeude gn ON gn.standort_id = st.id AND gn.kuerzel = gv.kuerzel
JOIN maschine m  ON m.gebaeude_id = gv.id
ON CONFLICT (anlagennummer) DO NOTHING;

-- Je Werk zwei Techniker sowie Schichtleitung und Produktion
CREATE TEMP TABLE neue_leute (kuerzel, name, rolle, qualifikation, schicht) AS VALUES
    ('DET', 'Jason Miller', 'Instandhaltung', 'Mechatroniker/in', 'Frühschicht'),
    ('DET', 'Ashley Brown', 'Instandhaltung', 'Elektroniker/in für Betriebstechnik', 'Spätschicht'),
    ('DET', 'Michael Johnson', 'Schichtleitung', NULL, NULL), ('DET', 'Emily Davis', 'Produktion', NULL, NULL),
    ('HOU', 'Tyler Anderson', 'Instandhaltung', 'Industriemechaniker/in', 'Frühschicht'),
    ('HOU', 'Brandon Lee', 'Instandhaltung', 'Mechatroniker/in', 'Nachtschicht'),
    ('HOU', 'Carlos Ramirez', 'Schichtleitung', NULL, NULL), ('HOU', 'Megan Taylor', 'Produktion', NULL, NULL),
    ('QRO', 'Diego López', 'Instandhaltung', 'Mechatroniker/in', 'Frühschicht'),
    ('QRO', 'Valeria García', 'Instandhaltung', 'Elektroniker/in für Betriebstechnik', 'Spätschicht'),
    ('QRO', 'Alejandro Hernández', 'Schichtleitung', NULL, NULL), ('QRO', 'Sofía Martínez', 'Produktion', NULL, NULL),
    ('SHA', 'Zhang Wei', 'Instandhaltung', 'Elektroniker/in für Betriebstechnik', 'Frühschicht'),
    ('SHA', 'Liu Yang', 'Instandhaltung', 'Automatisierungstechniker/in (SPS)', 'Spätschicht'),
    ('SHA', 'Wang Fang', 'Schichtleitung', NULL, NULL), ('SHA', 'Li Na', 'Produktion', NULL, NULL),
    ('SZX', 'Zhao Lei', 'Instandhaltung', 'Mechatroniker/in', 'Frühschicht'),
    ('SZX', 'Wu Hao', 'Instandhaltung', 'Industriemechaniker/in', 'Nachtschicht'),
    ('SZX', 'Chen Jing', 'Schichtleitung', NULL, NULL), ('SZX', 'Huang Min', 'Produktion', NULL, NULL),
    ('PNQ', 'Amit Kumar', 'Instandhaltung', 'Industriemechaniker/in', 'Frühschicht'),
    ('PNQ', 'Sunita Rao', 'Instandhaltung', 'Elektroniker/in für Betriebstechnik', 'Spätschicht'),
    ('PNQ', 'Rahul Sharma', 'Schichtleitung', NULL, NULL), ('PNQ', 'Priya Patel', 'Produktion', NULL, NULL),
    ('LYS', 'Lucas Petit', 'Instandhaltung', 'Mechatroniker/in', 'Frühschicht'),
    ('LYS', 'Chloé Dubois', 'Instandhaltung', 'Automatisierungstechniker/in (SPS)', 'Spätschicht'),
    ('LYS', 'Camille Bernard', 'Schichtleitung', NULL, NULL), ('LYS', 'Julien Moreau', 'Produktion', NULL, NULL),
    ('KLG', 'Sergei Popow', 'Instandhaltung', 'Industriemechaniker/in', 'Frühschicht'),
    ('KLG', 'Natalja Wolkowa', 'Instandhaltung', 'Elektroniker/in für Betriebstechnik', 'Nachtschicht'),
    ('KLG', 'Dmitri Iwanow', 'Schichtleitung', NULL, NULL), ('KLG', 'Olga Smirnowa', 'Produktion', NULL, NULL),
    ('WRO', 'Tomasz Wiśniewski', 'Instandhaltung', 'Mechatroniker/in', 'Frühschicht'),
    ('WRO', 'Agnieszka Wójcik', 'Instandhaltung', 'Industriemechaniker/in', 'Spätschicht'),
    ('WRO', 'Katarzyna Nowak', 'Schichtleitung', NULL, NULL), ('WRO', 'Piotr Kowalski', 'Produktion', NULL, NULL);

INSERT INTO techniker (standort_id, name, qualifikation, schicht)
SELECT st.id, l.name, l.qualifikation, l.schicht::schicht
FROM neue_leute l JOIN standort st ON st.kuerzel = l.kuerzel
WHERE l.rolle = 'Instandhaltung'
  AND NOT EXISTS (SELECT 1 FROM techniker t WHERE t.name = l.name AND t.standort_id = st.id);

INSERT INTO person (name, rolle, standort_id, techniker_id)
SELECT l.name, l.rolle::rolle, st.id, t.id
FROM neue_leute l
JOIN standort st       ON st.kuerzel = l.kuerzel
LEFT JOIN techniker t  ON t.name = l.name AND t.standort_id = st.id AND l.rolle = 'Instandhaltung'
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- Störungen der neuen Werke: rund 70 % der Störungen des Vorbilds, je Werk
-- anders ausgewählt (hashtext statt Zufall – so kommt bei jedem Lauf dasselbe heraus)
-- und um bis zu zwei Wochen verschoben. Nur für Werke, die noch keine Störungen haben.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE klon AS
WITH paare AS (
    SELECT n.kuerzel, st.id AS standort_id, v.id AS vorbild_id
    FROM neue_werke n
    JOIN standort st ON st.kuerzel = n.kuerzel
    JOIN standort v  ON v.kuerzel = n.vorbild
    WHERE NOT EXISTS (SELECT 1 FROM stoermeldung s JOIN maschine m ON m.id = s.maschine_id
                      JOIN gebaeude g ON g.id = m.gebaeude_id WHERE g.standort_id = st.id)
),
-- Techniker nach Reihenfolge zuordnen: 1. Techniker des Vorbilds → 1. Techniker des neuen Werks
tech_rang AS (
    SELECT id, standort_id, row_number() OVER (PARTITION BY standort_id ORDER BY id) AS rang FROM techniker
),
auswahl AS (
    SELECT p.kuerzel, p.standort_id, s.id AS alt_meldung, w.id AS alt_auftrag, mn.id AS maschine_id,
           s.beschreibung, s.ursache_kategorie, s.prioritaet, w.status, w.massnahme,
           s.zeitpunkt, w.start_zeit, w.ende_zeit, w.techniker_id AS alt_techniker,
           make_interval(days => abs(hashtext(p.kuerzel || s.id || 't')) % 15,
                         hours => abs(hashtext(p.kuerzel || s.id || 'h')) % 6) AS versatz
    FROM paare p
    JOIN gebaeude gv       ON gv.standort_id = p.vorbild_id
    JOIN maschine mv       ON mv.gebaeude_id = gv.id
    JOIN stoermeldung s    ON s.maschine_id = mv.id
    JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    JOIN gebaeude gn       ON gn.standort_id = p.standort_id AND gn.kuerzel = gv.kuerzel
    JOIN maschine mn       ON mn.gebaeude_id = gn.id AND mn.anlagennummer = p.kuerzel || substr(mv.anlagennummer, 4)
    WHERE abs(hashtext(p.kuerzel || s.id)) % 10 < 7
)
SELECT a.*,
       -- Was zu weit in die Vergangenheit rutscht, kommt ans jüngere Ende (30–45 Tage zurück)
       CASE WHEN a.zeitpunkt - a.versatz < now() - interval '365 days'
            THEN a.versatz - interval '335 days' ELSE a.versatz END AS verschiebung,
       tn.id AS techniker_id,
       nextval(pg_get_serial_sequence('stoermeldung', 'id'))    AS neue_meldung,
       nextval(pg_get_serial_sequence('wartungsauftrag', 'id')) AS neuer_auftrag
FROM auswahl a
LEFT JOIN tech_rang tv ON tv.id = a.alt_techniker
LEFT JOIN tech_rang tn ON tn.standort_id = a.standort_id
                      AND tn.rang = CASE WHEN tv.standort_id = (SELECT vorbild_id FROM paare WHERE paare.kuerzel = a.kuerzel) THEN tv.rang ELSE 1 END
                      AND a.alt_techniker IS NOT NULL;

-- Offene Aufträge dürfen nicht in der Zukunft liegen: bei ihnen nur um Stunden verschieben
UPDATE klon SET verschiebung = make_interval(hours => abs(hashtext(kuerzel || alt_meldung || 'h')) % 6)
WHERE status <> 'erledigt' OR zeitpunkt > now() - interval '30 days';

INSERT INTO stoermeldung (id, maschine_id, gemeldet_von, zeitpunkt, beschreibung, ursache_kategorie, prioritaet)
OVERRIDING SYSTEM VALUE
SELECT k.neue_meldung, k.maschine_id,
       -- gemeldet von Produktion oder Schichtleitung des Werks
       (SELECT p.name FROM person p WHERE p.standort_id = k.standort_id AND p.rolle <> 'Instandhaltung'
        ORDER BY (p.rolle = 'Produktion') = (abs(hashtext(k.alt_meldung || 'v')) % 3 > 0) DESC, p.id LIMIT 1),
       k.zeitpunkt - k.verschiebung, k.beschreibung, k.ursache_kategorie, k.prioritaet
FROM klon k;

INSERT INTO wartungsauftrag (id, stoermeldung_id, techniker_id, status, start_zeit, ende_zeit, massnahme, zugewiesen_von)
OVERRIDING SYSTEM VALUE
SELECT k.neuer_auftrag, k.neue_meldung, k.techniker_id, k.status,
       k.start_zeit - k.verschiebung, k.ende_zeit - k.verschiebung, k.massnahme,
       CASE WHEN k.techniker_id IS NOT NULL
            THEN (SELECT p.id FROM person p WHERE p.standort_id = k.standort_id AND p.rolle = 'Schichtleitung' LIMIT 1) END
FROM klon k;

INSERT INTO auftrag_ersatzteil (auftrag_id, ersatzteil_id, menge)
SELECT k.neuer_auftrag, ae.ersatzteil_id, ae.menge
FROM klon k JOIN auftrag_ersatzteil ae ON ae.auftrag_id = k.alt_auftrag
ON CONFLICT DO NOTHING;

-- Verlauf: Zuweisung durch die Schichtleitung, Arbeitsbeginn und Abschluss durch den Techniker
INSERT INTO auftrag_verlauf (auftrag_id, person_id, zeitpunkt, aktion, details)
SELECT w.id, w.zugewiesen_von,
       LEAST(s.zeitpunkt + interval '20 minutes', s.zeitpunkt + (COALESCE(w.start_zeit, now()) - s.zeitpunkt) / 2),
       'zugewiesen', t.name
FROM klon k
JOIN wartungsauftrag w ON w.id = k.neuer_auftrag
JOIN stoermeldung s    ON s.id = w.stoermeldung_id
JOIN techniker t       ON t.id = w.techniker_id;

INSERT INTO auftrag_verlauf (auftrag_id, person_id, zeitpunkt, aktion, details)
SELECT w.id, p.id, w.start_zeit, 'status', 'in Arbeit'
FROM klon k
JOIN wartungsauftrag w ON w.id = k.neuer_auftrag
LEFT JOIN person p     ON p.techniker_id = w.techniker_id
WHERE w.start_zeit IS NOT NULL;

INSERT INTO auftrag_verlauf (auftrag_id, person_id, zeitpunkt, aktion, details)
SELECT w.id, p.id, w.ende_zeit, 'status', 'erledigt'
FROM klon k
JOIN wartungsauftrag w ON w.id = k.neuer_auftrag
LEFT JOIN person p     ON p.techniker_id = w.techniker_id
WHERE w.status = 'erledigt' AND w.ende_zeit IS NOT NULL;

DROP TABLE klon, neue_leute, neue_werke;
