-- =====================================================================
-- Migration 001: Personen mit Rollen und Verlauf der Aufträge
--
-- Im Supabase SQL Editor einmal ausführen. Vorhandene Daten bleiben
-- erhalten; die Datei kann gefahrlos mehrfach ausgeführt werden.
--
-- Neu:
--  - Werteliste "rolle": Produktion, Schichtleitung, Instandhaltung
--  - Tabelle "person": fiktive Personen des Unternehmens. In der App wählt man
--    unten im Konto, als welche Person man arbeitet. Techniker sind über
--    techniker_id mit ihrem Eintrag in "techniker" verbunden.
--  - wartungsauftrag.zugewiesen_von: wer den Techniker zugewiesen hat
--  - Tabelle "auftrag_verlauf": wer wann was an einem Auftrag getan hat
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rolle') THEN
        CREATE TYPE rolle AS ENUM ('Produktion', 'Schichtleitung', 'Instandhaltung');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS person (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    rolle         rolle        NOT NULL,
    standort_id   INTEGER NULL REFERENCES standort (id) ON UPDATE CASCADE ON DELETE SET NULL,
    -- Nur bei der Rolle Instandhaltung: der zugehörige Techniker (höchstens eine Person je Techniker)
    techniker_id  INTEGER NULL UNIQUE REFERENCES techniker (id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT chk_person_techniker CHECK (techniker_id IS NULL OR rolle = 'Instandhaltung')
);
COMMENT ON TABLE person IS 'Personen des Unternehmens mit Rolle und Werk';
ALTER TABLE person ENABLE ROW LEVEL SECURITY;

ALTER TABLE wartungsauftrag
    ADD COLUMN IF NOT EXISTS zugewiesen_von INTEGER NULL REFERENCES person (id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS auftrag_verlauf (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    auftrag_id  INTEGER NOT NULL REFERENCES wartungsauftrag (id) ON UPDATE CASCADE ON DELETE CASCADE,
    person_id   INTEGER NULL REFERENCES person (id) ON UPDATE CASCADE ON DELETE SET NULL,
    zeitpunkt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Was passiert ist; details enthält z. B. den neuen Status oder das gebuchte Teil
    aktion      VARCHAR(20) NOT NULL CHECK (aktion IN ('gemeldet', 'zugewiesen', 'status', 'teil', 'bearbeitet')),
    details     VARCHAR(300) NULL
);
COMMENT ON TABLE auftrag_verlauf IS 'Wer wann was an einem Wartungsauftrag getan hat';
CREATE INDEX IF NOT EXISTS idx_auftrag_verlauf_auftrag ON auftrag_verlauf (auftrag_id, zeitpunkt);
ALTER TABLE auftrag_verlauf ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Personen anlegen (vorhandene bleiben unverändert)
-- ---------------------------------------------------------------------
-- Jeder Techniker wird eine Person der Instandhaltung
INSERT INTO person (name, rolle, standort_id, techniker_id)
SELECT t.name, 'Instandhaltung', t.standort_id, t.id FROM techniker t
ON CONFLICT (name) DO NOTHING;

-- Je Werk eine Schichtleitung und eine Person aus der Produktion
INSERT INTO person (name, rolle, standort_id)
SELECT v.name, v.rolle::rolle, st.id
FROM (VALUES
    ('Claudia Richter', 'Schichtleitung', 'ALB'), ('Sabine Vogt', 'Produktion', 'ALB'),
    ('Peter Lang', 'Schichtleitung', 'STR'),      ('Jana Keller', 'Produktion', 'STR'),
    ('Murat Yılmaz', 'Schichtleitung', 'MUC'),    ('Elif Kaya', 'Produktion', 'MUC'),
    ('Ahmet Öztürk', 'Schichtleitung', 'NUE'),    ('Felix Bauer', 'Produktion', 'NUE'),
    ('Thomas Maier', 'Schichtleitung', 'KOE'),    ('Ivan Petrov', 'Produktion', 'KOE'),
    ('Heike Schwarz', 'Schichtleitung', 'DOR'),   ('Sven Neumann', 'Produktion', 'DOR'),
    ('Sandra Wolff', 'Schichtleitung', 'HAN'),    ('Laura Zimmermann', 'Produktion', 'HAN'),
    ('Oliver Franke', 'Schichtleitung', 'HAM'),   ('Julia Krause', 'Produktion', 'HAM'),
    ('Bettina Kühn', 'Schichtleitung', 'LEI'),    ('Marco Rossi', 'Produktion', 'LEI'),
    ('Kemal Aydın', 'Schichtleitung', 'BER'),     ('Nina Schäfer', 'Produktion', 'BER')
) AS v (name, rolle, kuerzel)
JOIN standort st ON st.kuerzel = v.kuerzel
ON CONFLICT (name) DO NOTHING;
