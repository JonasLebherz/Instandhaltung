-- =====================================================================
-- Migration 006: Mehrtägige Wartungen (z. B. Generalüberholung über drei Arbeitstage)
--
-- 1. wartungsplan.dauer_min darf jetzt bis 4800 Minuten (= 10 Arbeitstage à 8 h) betragen
--    (vorher höchstens 1440). Ein Arbeitstag = 480 Minuten; die Zeitachse im Wartungsplan
--    zeigt längere Wartungen als Balken über mehrere Tage.
-- 2. Beispiel-Pläne für große Wartungen (Generalüberholung, Großinspektion …) an etwa jeder
--    dritten Maschine der passenden Typen. Der erste Termin liegt in den nächsten vier Wochen
--    (per hashtext gestreut – bei jedem Lauf gleich), damit sie in der Zeitachse sofort sichtbar sind.
--
-- Erhält alle vorhandenen Daten und ist mehrfach ausführbar (ein Plan wird nur angelegt, wenn es
-- an der Maschine noch keinen mit derselben Aufgabe gibt).
-- Ausführen: im Supabase SQL Editor den ganzen Inhalt einfügen und „Run“.
-- =====================================================================

ALTER TABLE wartungsplan DROP CONSTRAINT IF EXISTS wartungsplan_dauer_min_check;
ALTER TABLE wartungsplan ADD CONSTRAINT wartungsplan_dauer_min_check CHECK (dauer_min BETWEEN 5 AND 4800);
COMMENT ON COLUMN wartungsplan.dauer_min IS 'Dauer in Minuten; 480 = ein Arbeitstag (8 h), mehr = Wartung über mehrere Tage (bis 10 Arbeitstage)';

INSERT INTO wartungsplan (maschine_id, aufgabe, intervall_tage, dauer_min, start_datum)
SELECT m.id, a.aufgabe, a.intervall, a.dauer,
       current_date + (abs(hashtext(m.anlagennummer || a.aufgabe)) % 28)
FROM maschine m
JOIN (VALUES
    -- Typ, Aufgabe, Intervall in Tagen, Dauer in Minuten (480 = 1 Arbeitstag)
    ('Pressen',        'Generalüberholung: Zylinder, Dichtungen und Steuerung', 730, 1920),   -- 4 Arbeitstage
    ('Spritzguss',     'Generalüberholung: Schnecke, Zylinder und Rückstromsperre', 730, 1440),   -- 3 Arbeitstage
    ('Fräsen',         'Generalüberholung: Spindel und Führungsbahnen', 730, 1440),
    ('Drehen',         'Großinspektion: Lager, Riemen und Spannzylinder tauschen', 365, 960),   -- 2 Arbeitstage
    ('Laserschneiden', 'Resonator-Service und Strahlweg neu justieren', 365, 960),
    ('Lackieren',      'Grundreinigung der Lackierkabine mit Filterwechsel', 365, 960),
    ('Schweißen',      'Roboter-Revision: Getriebe und Kabelpaket tauschen', 730, 1440),
    ('Druckluft',      'Kompressor-Hauptinspektion (Verdichterstufe)', 730, 960),
    ('Lagertechnik',   'Generalüberholung Regalbediengerät', 1095, 2400)                      -- 5 Arbeitstage
) AS a(typ, aufgabe, intervall, dauer) ON a.typ = m.typ::text
WHERE abs(hashtext(m.anlagennummer || 'grosswartung')) % 3 = 0
  AND NOT EXISTS (SELECT 1 FROM wartungsplan p WHERE p.maschine_id = m.id AND p.aufgabe = a.aufgabe);
