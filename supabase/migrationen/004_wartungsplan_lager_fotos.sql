-- =====================================================================
-- Migration 004: Wartungsplan, Fotos, Ausfallkosten, Checklisten, Chat zu Aufträgen
--
-- Im Supabase SQL Editor einmal ausführen. Vorhandene Daten bleiben
-- erhalten; die Datei kann gefahrlos mehrfach ausgeführt werden.
--
-- Neu:
--  - maschine.kosten_pro_stunde: was eine Stunde Stillstand kostet (für die Ausfallkosten)
--  - wartungsauftrag.checkliste: abgehakte Prüfpunkte (JSON-Liste der Nummern)
--  - nachricht.auftrag_id: Nachricht gehört zu einem Auftrag (z. B. „Neuer Auftrag für dich“)
--  - Tabelle "wartungsplan": vorbeugende Wartung je Maschine mit Intervall in Tagen
--  - Tabelle "wartung_durchfuehrung": wann eine geplante Wartung erledigt wurde
--  - Tabelle "stoermeldung_foto": Fotos zu einer Störmeldung (Bild direkt in der Datenbank)
--  - Beispiel-Wartungspläne mit Verlauf der letzten 12 Monate (nur, wenn noch keine da sind)
-- =====================================================================

-- ---------- Ausfallkosten: Kosten einer Stunde Stillstand je Maschine ----------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'maschine' AND column_name = 'kosten_pro_stunde') THEN
        ALTER TABLE maschine ADD COLUMN kosten_pro_stunde NUMERIC(8, 2) NOT NULL DEFAULT 300 CHECK (kosten_pro_stunde >= 0);
        -- Richtwerte je Maschinentyp (nur beim ersten Ausführen, danach frei änderbar)
        UPDATE maschine SET kosten_pro_stunde = CASE typ
            WHEN 'Fräsen' THEN 380 WHEN 'Drehen' THEN 320 WHEN 'Spritzguss' THEN 450 WHEN 'Laserschneiden' THEN 520
            WHEN 'Schweißen' THEN 410 WHEN 'Pressen' THEN 600 WHEN 'Fördertechnik' THEN 250 WHEN 'Lackieren' THEN 480
            WHEN 'Montage' THEN 350 WHEN 'Druckluft' THEN 900 WHEN 'Lagertechnik' THEN 200 ELSE 300 END;
    END IF;
END $$;

-- ---------- Checkliste am Auftrag ----------
ALTER TABLE wartungsauftrag ADD COLUMN IF NOT EXISTS checkliste JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ---------- Chat: Nachricht kann zu einem Auftrag gehören ----------
ALTER TABLE nachricht ADD COLUMN IF NOT EXISTS auftrag_id INTEGER NULL REFERENCES wartungsauftrag (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- ---------- Wartungsplan ----------
CREATE TABLE IF NOT EXISTS wartungsplan (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maschine_id     INTEGER NOT NULL REFERENCES maschine (id) ON UPDATE CASCADE ON DELETE CASCADE,
    aufgabe         VARCHAR(150) NOT NULL,
    intervall_tage  INTEGER NOT NULL CHECK (intervall_tage BETWEEN 1 AND 1095),
    dauer_min       INTEGER NOT NULL DEFAULT 60 CHECK (dauer_min BETWEEN 5 AND 1440),
    -- Erste Fälligkeit; danach: letzte Durchführung + Intervall
    start_datum     DATE NOT NULL DEFAULT current_date,
    aktiv           BOOLEAN NOT NULL DEFAULT true
);
COMMENT ON TABLE wartungsplan IS 'Vorbeugende Wartung je Maschine mit festem Intervall';
CREATE INDEX IF NOT EXISTS idx_wartungsplan_maschine ON wartungsplan (maschine_id);
ALTER TABLE wartungsplan ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS wartung_durchfuehrung (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_id    INTEGER NOT NULL REFERENCES wartungsplan (id) ON UPDATE CASCADE ON DELETE CASCADE,
    datum      DATE NOT NULL,
    person_id  INTEGER NULL REFERENCES person (id) ON UPDATE CASCADE ON DELETE SET NULL,
    notiz      VARCHAR(300) NULL
);
COMMENT ON TABLE wartung_durchfuehrung IS 'Erledigte Wartungen aus dem Wartungsplan';
CREATE INDEX IF NOT EXISTS idx_wartung_durchfuehrung_plan ON wartung_durchfuehrung (plan_id, datum);
ALTER TABLE wartung_durchfuehrung ENABLE ROW LEVEL SECURITY;

-- ---------- Fotos zu Störmeldungen ----------
-- Das Bild liegt direkt in der Datenbank (bytea). Der Browser verkleinert es vorher
-- (höchstens 1280 px, JPEG), deshalb bleibt jedes Foto bei wenigen hundert KB.
CREATE TABLE IF NOT EXISTS stoermeldung_foto (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stoermeldung_id  INTEGER NOT NULL REFERENCES stoermeldung (id) ON UPDATE CASCADE ON DELETE CASCADE,
    datei            BYTEA NOT NULL CHECK (octet_length(datei) <= 1500000),
    mime             VARCHAR(30) NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
    erstellt         TIMESTAMPTZ NOT NULL DEFAULT now(),
    person_id        INTEGER NULL REFERENCES person (id) ON UPDATE CASCADE ON DELETE SET NULL
);
COMMENT ON TABLE stoermeldung_foto IS 'Fotos zu einer Störmeldung';
CREATE INDEX IF NOT EXISTS idx_stoermeldung_foto_meldung ON stoermeldung_foto (stoermeldung_id);
ALTER TABLE stoermeldung_foto ENABLE ROW LEVEL SECURITY;

-- ---------- Beispiel-Wartungspläne (nur, wenn noch keine da sind) ----------
-- Je Maschinentyp ein bis zwei typische Aufgaben. Die Termine sind per hashtext gestreut
-- (bei jedem Lauf gleich); etwa jede zwölfte Wartung ist überfällig.
INSERT INTO wartungsplan (maschine_id, aufgabe, intervall_tage, dauer_min, start_datum)
SELECT m.id, a.aufgabe, a.intervall, a.dauer,
       current_date - 365 + (abs(hashtext(m.anlagennummer || a.aufgabe)) % a.intervall)
FROM maschine m
JOIN (VALUES
    ('Fräsen', 'Kühlschmierstoff prüfen und nachfüllen', 30, 30), ('Fräsen', 'Führungen schmieren, Spindel prüfen', 90, 90),
    ('Drehen', 'Spannfutter reinigen und schmieren', 30, 30), ('Drehen', 'Hydraulik und Riemen prüfen', 180, 120),
    ('Spritzguss', 'Düse und Heizbänder prüfen', 60, 60), ('Spritzguss', 'Hydrauliköl wechseln', 365, 180),
    ('Laserschneiden', 'Linse und Düse reinigen', 14, 20), ('Laserschneiden', 'Spiegel und Strahlweg prüfen', 180, 120),
    ('Schweißen', 'Schweißdüsen und Kontaktrohre tauschen', 30, 30), ('Schweißen', 'Roboterachsen kalibrieren', 180, 120),
    ('Pressen', 'Lichtgitter und Not-Halt prüfen', 30, 30), ('Pressen', 'Hydrauliköl und Filter wechseln', 365, 240),
    ('Fördertechnik', 'Bänder und Rollen prüfen', 30, 45), ('Fördertechnik', 'Antriebe schmieren', 90, 60),
    ('Lackieren', 'Kabinenfilter wechseln', 30, 60), ('Lackieren', 'Düsen und Pumpen reinigen', 60, 90),
    ('Montage', 'Greifer und Sensoren prüfen', 60, 45),
    ('Druckluft', 'Kondensat ablassen, Filter prüfen', 30, 20), ('Druckluft', 'Öl und Abscheider wechseln', 180, 120),
    ('Lagertechnik', 'Fahr- und Hubwerk prüfen', 90, 60), ('Lagertechnik', 'Regalprüfung (DIN EN 15635)', 365, 240)
) AS a(typ, aufgabe, intervall, dauer) ON a.typ = m.typ::text
WHERE NOT EXISTS (SELECT 1 FROM wartungsplan);

-- Verlauf: Durchführungen im Intervall seit dem Start bis heute. Bei etwa jeder zwölften
-- Wartung fehlt die letzte Durchführung (nur, wenn sie in den letzten 30 Tagen lag) –
-- sie ist damit höchstens 30 Tage überfällig.
INSERT INTO wartung_durchfuehrung (plan_id, datum, person_id)
SELECT p.id, d.datum::date,
       (SELECT pe.id FROM person pe JOIN techniker t ON t.id = pe.techniker_id JOIN gebaeude g ON g.standort_id = t.standort_id
        WHERE g.id = m.gebaeude_id ORDER BY abs(hashtext(pe.name || d.datum::text)) LIMIT 1)
FROM wartungsplan p
JOIN maschine m ON m.id = p.maschine_id
CROSS JOIN LATERAL generate_series(p.start_datum, current_date, make_interval(days => p.intervall_tage)) AS d(datum)
WHERE NOT EXISTS (SELECT 1 FROM wartung_durchfuehrung)
  AND NOT (abs(hashtext(m.anlagennummer || p.aufgabe)) % 12 = 0
           AND d.datum::date > current_date - LEAST(p.intervall_tage, 30));
