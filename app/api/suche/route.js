/**
 * app/api/suche/route.js – Suche über die ganze App (für das Suchfenster mit Strg+K, components/Suche.js)
 *
 *   GET /api/suche?q=fräs  →  { treffer: [{ art, id, titel, zusatz, wert, href }, …] }
 *
 * Durchsucht in EINER Abfrage (UNION ALL, je Art höchstens ein paar Treffer):
 *   Maschinen (Bezeichnung, Anlagennummer, Typ), Aufträge (Nummer, Beschreibung, Anlagennummer),
 *   Werke (Name, Kürzel, Stadt), Hallen (Bezeichnung, Kürzel), Personen (Name), Ersatzteile (Bezeichnung).
 * `wert` ist ein fester Wert aus der Datenbank (Status, Rolle, Typ), den der Browser übersetzt.
 * Nur für angemeldete Benutzer. Der Suchtext wird nur als Parameter übergeben (nie in SQL eingesetzt),
 * % und _ werden maskiert, damit sie wörtlich gesucht werden.
 */
import { sql } from '@/lib/db';
import { aktuellerBenutzer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!(await aktuellerBenutzer())) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 60);
  if (!q) return Response.json({ treffer: [] });
  const muster = `%${q.replace(/[\\%_]/g, (z) => `\\${z}`)}%`;
  // „123“ oder „#123“ = Auftragsnummer
  const nummer = /^#?\d{1,9}$/.test(q) ? Number(q.replace('#', '')) : null;

  const zeilen = await sql`
    (SELECT 'maschine' AS art, m.id::text AS id, m.bezeichnung::text AS titel,
            (m.anlagennummer || ' · ' || st.name || ' · ' || g.kuerzel)::text AS zusatz, m.typ::text AS wert,
            ('/maschinen/' || m.id)::text AS href
       FROM maschine m JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id
      WHERE m.bezeichnung ILIKE ${muster} OR m.anlagennummer ILIKE ${muster} OR m.typ::text ILIKE ${muster}
      ORDER BY (m.anlagennummer ILIKE ${q}) DESC, m.bezeichnung LIMIT 6)
    UNION ALL
    (SELECT 'auftrag', w.id::text, ('Nr. ' || w.id || ' – ' || left(s.beschreibung, 70))::text,
            (m.anlagennummer || ' · ' || st.name)::text, w.status::text, ('/auftraege/' || w.id)::text
       FROM wartungsauftrag w JOIN stoermeldung s ON s.id = w.stoermeldung_id
       JOIN maschine m ON m.id = s.maschine_id JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id
      WHERE w.id = ${nummer}::int OR s.beschreibung ILIKE ${muster} OR m.anlagennummer ILIKE ${muster}
      ORDER BY (w.id = ${nummer}::int) DESC NULLS LAST, (w.status <> 'erledigt') DESC, s.zeitpunkt DESC LIMIT 6)
    UNION ALL
    (SELECT 'werk', st.id::text, st.name::text, (st.stadt || ' · ' || l.name)::text, NULL,
            ('/karte?werk=' || lower(st.kuerzel))::text
       FROM standort st JOIN land l ON l.kuerzel = st.land_kuerzel
      WHERE st.name ILIKE ${muster} OR st.kuerzel ILIKE ${muster} OR st.stadt ILIKE ${muster} OR l.name ILIKE ${muster}
      ORDER BY st.name LIMIT 4)
    UNION ALL
    (SELECT 'halle', g.id::text, g.bezeichnung::text, (st.name || ' · ' || st.kuerzel || '-' || g.kuerzel)::text, NULL,
            ('/karte?werk=' || lower(st.kuerzel) || '&halle=' || lower(g.kuerzel))::text
       FROM gebaeude g JOIN standort st ON st.id = g.standort_id
      WHERE g.bezeichnung ILIKE ${muster} OR (st.kuerzel || '-' || g.kuerzel) ILIKE ${muster}
      ORDER BY st.name, g.kuerzel LIMIT 4)
    UNION ALL
    (SELECT 'person', p.id::text, p.name::text, st.name::text, p.rolle::text, NULL
       FROM person p LEFT JOIN standort st ON st.id = p.standort_id
      WHERE p.name ILIKE ${muster}
      ORDER BY p.name LIMIT 4)
    UNION ALL
    (SELECT 'teil', e.id::text, e.bezeichnung::text, NULL, NULL, ('/lager?teil=' || e.id)::text
       FROM ersatzteil e
      WHERE e.bezeichnung ILIKE ${muster}
      ORDER BY e.bezeichnung LIMIT 4)`;

  // Personen: Link auf die Teamliste mit dem Namen als Suche (Name im Link richtig kodiert)
  const treffer = zeilen.map((z) => (z.art === 'person' ? { ...z, href: `/mitarbeiter?suche=${encodeURIComponent(z.titel)}` } : z));
  return Response.json({ treffer });
}
