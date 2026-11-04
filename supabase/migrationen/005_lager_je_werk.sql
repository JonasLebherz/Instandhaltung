-- =====================================================================
-- Migration 005: Ersatzteillager je Werk
--
-- Im Supabase SQL Editor einmal ausführen. Vorhandene Daten bleiben
-- erhalten; die Datei kann gefahrlos mehrfach ausgeführt werden.
--
-- Bisher gab es ein zentrales Lager (Bestand direkt in "ersatzteil"). Das passt
-- nicht zu einem Unternehmen mit Werken in acht Ländern. Neu:
--  - Tabelle "lagerbestand": Bestand, Mindestbestand und Lagerplatz je Werk und Teil
--  - "bestellung.standort_id": für welches Werk bestellt wurde
--  - Die bisherigen Bestände gehen in das Lager des Hauptwerks (erstes Werk im
--    Hauptsitz-Land), danach werden ersatzteil.bestand/mindestbestand entfernt.
--  - Die übrigen Werke bekommen Beispielbestände (per hashtext, bei jedem Lauf gleich).
-- =====================================================================

CREATE TABLE IF NOT EXISTS lagerbestand (
    standort_id     INTEGER NOT NULL REFERENCES standort (id) ON UPDATE CASCADE ON DELETE CASCADE,
    ersatzteil_id   INTEGER NOT NULL REFERENCES ersatzteil (id) ON UPDATE CASCADE ON DELETE CASCADE,
    bestand         INTEGER NOT NULL DEFAULT 0 CHECK (bestand >= 0),
    mindestbestand  INTEGER NOT NULL DEFAULT 0 CHECK (mindestbestand >= 0),
    lagerplatz      VARCHAR(10) NULL,          -- z. B. 'A-03' = Regal A, Fach 3
    PRIMARY KEY (standort_id, ersatzteil_id)
);
COMMENT ON TABLE lagerbestand IS 'Bestand der Ersatzteile im Lager jedes Werks';
ALTER TABLE lagerbestand ENABLE ROW LEVEL SECURITY;

ALTER TABLE bestellung ADD COLUMN IF NOT EXISTS standort_id INTEGER NULL REFERENCES standort (id) ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_bestellung_werk_teil_status ON bestellung (standort_id, ersatzteil_id, status);

-- Bisherige Bestände ins Hauptwerk übernehmen (nur solange die alten Spalten noch da sind)
DO $$
DECLARE
    hauptwerk INTEGER := (SELECT st.id FROM standort st JOIN land l ON l.kuerzel = st.land_kuerzel
                          WHERE l.hauptsitz ORDER BY st.id LIMIT 1);
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ersatzteil' AND column_name = 'bestand') THEN
        EXECUTE format('INSERT INTO lagerbestand (standort_id, ersatzteil_id, bestand, mindestbestand)
                        SELECT %s, id, bestand, mindestbestand FROM ersatzteil
                        ON CONFLICT (standort_id, ersatzteil_id) DO NOTHING', hauptwerk);
        ALTER TABLE ersatzteil DROP COLUMN bestand;
        ALTER TABLE ersatzteil DROP COLUMN mindestbestand;
    END IF;
    UPDATE bestellung SET standort_id = hauptwerk WHERE standort_id IS NULL;
END $$;
ALTER TABLE bestellung ALTER COLUMN standort_id SET NOT NULL;
COMMENT ON TABLE ersatzteil IS 'Ersatzteile (Katalog); Bestände je Werk in lagerbestand';

-- Übrige Werke: Beispielbestände. Mindestbestand ähnlich wie im Hauptwerk, etwa jedes
-- sechste Teil liegt unter dem Mindestbestand.
INSERT INTO lagerbestand (standort_id, ersatzteil_id, bestand, mindestbestand)
SELECT st.id, e.id,
       GREATEST(0, CASE WHEN h % 6 = 0 THEN m - 1 - (h / 6) % 2 ELSE m + (h / 7) % (m * 2 + 3) END),
       m
FROM standort st
CROSS JOIN ersatzteil e
CROSS JOIN LATERAL (SELECT abs(hashtext(st.kuerzel || '-' || e.id)) AS h) x
CROSS JOIN LATERAL (SELECT GREATEST(1, COALESCE((SELECT lb.mindestbestand FROM lagerbestand lb
                                                 WHERE lb.ersatzteil_id = e.id ORDER BY lb.standort_id LIMIT 1), 2)
                                       + (x.h % 3) - 1) AS m) y
ON CONFLICT (standort_id, ersatzteil_id) DO NOTHING;

-- Lagerplatz: in allen Werken gleich aufgebaut (Regal A–D, je 5 Fächer)
UPDATE lagerbestand
SET lagerplatz = chr(65 + ((ersatzteil_id - 1) / 5) % 26) || '-' || lpad((((ersatzteil_id - 1) % 5) + 1)::text, 2, '0')
WHERE lagerplatz IS NULL;
