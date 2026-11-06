/**
 * app/maschinen/page.js – Liste aller Maschinen
 *
 * Suche, Filter (Land/Werk, Typ, Zustand) und Sortierung laufen im Browser (MaschinenListe.js).
 * Beachtet die Ansicht aus dem Konto (nur ein Land bzw. Werk). Ein Klick öffnet die Maschinen-Seite
 * mit Kennzahlen und Historie (/maschinen/<id>).
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import { ansichtAusCookie, ansichtBedingung } from '@/lib/ansicht';
import MaschinenListe from './MaschinenListe';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Maschinen');

export default async function MaschinenUebersicht() {
  await benutzerPflicht();
  const t = await uebersetzer();
  const ansicht = await ansichtAusCookie();
  const maschinen = await sql`
    SELECT m.id, m.anlagennummer, m.bezeichnung, m.typ::text AS typ, m.baujahr,
           g.kuerzel AS gebaeude_kuerzel, st.id AS standort_id, st.name AS standort, st.land_kuerzel AS land, l.name AS land_name,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt')::int AS offen,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt' AND s.prioritaet = 'hoch')::int AS hoch,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt' AND s.prioritaet = 'mittel')::int AS mittel,
           COUNT(w.id) FILTER (WHERE w.status <> 'erledigt' AND s.prioritaet = 'niedrig')::int AS niedrig,
           MAX(s.prioritaet) FILTER (WHERE w.status <> 'erledigt')::text AS hoechste_prioritaet,
           COUNT(s.id) FILTER (WHERE s.zeitpunkt >= now() - interval '12 months')::int AS stoerungen_12m
    FROM maschine m
    JOIN gebaeude g  ON g.id = m.gebaeude_id
    JOIN standort st ON st.id = g.standort_id
    JOIN land l      ON l.kuerzel = st.land_kuerzel
    LEFT JOIN stoermeldung s    ON s.maschine_id = m.id
    LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
    WHERE ${ansichtBedingung(ansicht)}
    GROUP BY m.id, g.kuerzel, st.id, l.name, l.hauptsitz
    ORDER BY l.hauptsitz DESC, st.name, m.anlagennummer`;

  return (
    <>
      <div className="seitenkopf">
        <h1>{t('Maschinen')}</h1>
        <p>{t('{n} Maschinen – anklicken für Kennzahlen und Historie.', { n: maschinen.length })}</p>
      </div>
      <MaschinenListe maschinen={maschinen} />
    </>
  );
}
