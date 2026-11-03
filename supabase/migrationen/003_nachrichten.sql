-- =====================================================================
-- Migration 003: Nachrichten zwischen Personen (Chat auf der Seite „Mitarbeiter“)
--
-- Im Supabase SQL Editor einmal ausführen. Vorhandene Daten bleiben
-- erhalten; die Datei kann gefahrlos mehrfach ausgeführt werden.
--
-- Neu:
--  - Tabelle "nachricht": von Person an Person, mit Text, Zeitpunkt und
--    gelesen_am (NULL = noch ungelesen → rote Zahl in der Seitenleiste)
--  - einige Beispielnachrichten im Werk Albstadt (nur wenn noch keine da sind)
-- =====================================================================

CREATE TABLE IF NOT EXISTS nachricht (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    von_id      INTEGER NOT NULL REFERENCES person (id) ON UPDATE CASCADE ON DELETE CASCADE,
    an_id       INTEGER NOT NULL REFERENCES person (id) ON UPDATE CASCADE ON DELETE CASCADE,
    text        VARCHAR(1000) NOT NULL CHECK (length(trim(text)) > 0),
    zeitpunkt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    gelesen_am  TIMESTAMPTZ NULL,
    CONSTRAINT chk_nachricht_nicht_an_sich CHECK (von_id <> an_id)
);
COMMENT ON TABLE nachricht IS 'Nachrichten zwischen Personen (Chat)';
-- Index für „ungelesene Nachrichten an mich“ und für den Verlauf zweier Personen
CREATE INDEX IF NOT EXISTS idx_nachricht_an ON nachricht (an_id, gelesen_am);
CREATE INDEX IF NOT EXISTS idx_nachricht_verlauf ON nachricht (von_id, an_id, zeitpunkt);
ALTER TABLE nachricht ENABLE ROW LEVEL SECURITY;

-- Beispielnachrichten (Albstadt: Schichtleitung, Produktion und die beiden Techniker)
INSERT INTO nachricht (von_id, an_id, text, zeitpunkt, gelesen_am)
SELECT von.id, an.id, v.text, now() - v.vor, CASE WHEN v.gelesen THEN now() - v.vor + interval '5 minutes' END
FROM (VALUES
    ('Claudia Richter', 1, 'Kannst du dir heute noch die Fräse in Halle 1 ansehen? Sie läuft unruhig.', interval '3 hours', true),
    (NULL, 1, 'Ja, ich komme nach der Pause vorbei.', interval '170 minutes', true),
    ('Sabine Vogt', 2, 'Die Presse hat wieder kurz gestoppt, Meldung ist drin.', interval '50 minutes', false),
    ('Claudia Richter', 2, 'Bitte die Presse vorziehen, wir brauchen sie für die Spätschicht.', interval '20 minutes', false)
) AS v(von_name, techniker_id, text, vor, gelesen)
JOIN person tech ON tech.techniker_id = v.techniker_id
JOIN person von  ON von.id = COALESCE((SELECT id FROM person WHERE name = v.von_name), tech.id)
JOIN person an   ON an.id = CASE WHEN v.von_name IS NULL THEN (SELECT id FROM person WHERE name = 'Claudia Richter') ELSE tech.id END
WHERE NOT EXISTS (SELECT 1 FROM nachricht);
