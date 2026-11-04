/**
 * app/lager/page.js – Ersatzteillager je Werk
 *
 * Jedes Werk hat ein eigenes Lager (Tabelle lagerbestand). Oben wählt man Land/Werk:
 *  - ein Werk (?werk=<id>): Kennzahlen des Werks und das Regal als übersichtliche Fächer
 *    (Symbol, Name, Lagerplatz, Bestand/Mindestbestand) – LagerAnsicht.js. Rechts das gewählte Teil mit
 *    Verbrauch, offener Bestellung, Nachbestellen und „In anderen Werken“ (wo das Teil noch liegt).
 *  - alle Werke (?werk=alle): je Werk eine Kachel (Teile unter Mindestbestand, offene Bestellungen),
 *    gruppiert nach Land – Klick öffnet das Werk.
 * Startwerk ohne Adresse: Werk der gewählten Person, sonst Werk aus der Ansicht (Konto), sonst „alle“.
 * 3 Abfragen gleichzeitig.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { seitentitel } from '@/lib/sprache/server';
import { aktuellePerson, darfBearbeiten } from '@/lib/person';
import { ansichtAusCookie, ansichtBedingung } from '@/lib/ansicht';
import LagerAnsicht from './LagerAnsicht';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Lager');

export default async function LagerSeite({ searchParams }) {
  await benutzerPflicht();
  const q = await searchParams;
  const ansicht = await ansichtAusCookie();
  const person = await aktuellePerson();

  // Welches Werk? Adresse → Person → Ansicht → alle
  const werkId = /^\d+$/.test(q.werk ?? '') ? Number(q.werk)
    : q.werk === 'alle' ? null
      : person?.standort_id ?? ansicht.standortId ?? null;

  const [werke, teile, verteilung] = await Promise.all([
    // Alle Werke (der Ansicht) mit Zusammenfassung ihres Lagers
    sql`
      SELECT st.id, st.name, st.stadt, st.kuerzel, st.land_kuerzel AS land, l.name AS land_name, l.hauptsitz,
             COUNT(lb.ersatzteil_id) FILTER (WHERE lb.bestand < lb.mindestbestand)::int AS unter,
             COUNT(lb.ersatzteil_id) FILTER (WHERE lb.bestand >= lb.mindestbestand AND lb.bestand <= lb.mindestbestand * 1.5)::int AS knapp,
             COUNT(lb.ersatzteil_id)::int AS teile,
             (SELECT COUNT(*)::int FROM bestellung b WHERE b.standort_id = st.id AND b.status = 'bestellt') AS bestellt
      FROM standort st
      JOIN land l ON l.kuerzel = st.land_kuerzel
      LEFT JOIN lagerbestand lb ON lb.standort_id = st.id
      WHERE ${ansichtBedingung(ansicht)}
      GROUP BY st.id, l.name, l.hauptsitz
      ORDER BY l.hauptsitz DESC, l.name, st.name`,
    // Teile im gewählten Werk: Bestand, Lagerplatz, offene Bestellung, Verbrauch 12 Monate in diesem Werk
    werkId === null ? [] : sql`
      SELECT e.id, e.bezeichnung, COALESCE(lb.bestand, 0) AS bestand, COALESCE(lb.mindestbestand, 0) AS mindestbestand, lb.lagerplatz,
             b.id AS bestellung_id, b.menge AS bestellt_menge, to_char(b.bestelldatum, 'YYYY-MM-DD') AS bestellt_am,
             COALESCE(v.menge, 0)::int AS verbrauch, COALESCE(v.auftraege, 0)::int AS auftraege
      FROM ersatzteil e
      LEFT JOIN lagerbestand lb ON lb.ersatzteil_id = e.id AND lb.standort_id = ${werkId}
      LEFT JOIN bestellung b    ON b.ersatzteil_id = e.id AND b.standort_id = ${werkId} AND b.status = 'bestellt'
      LEFT JOIN LATERAL (
        SELECT SUM(ae.menge) AS menge, COUNT(DISTINCT ae.auftrag_id) AS auftraege
        FROM auftrag_ersatzteil ae
        JOIN wartungsauftrag w ON w.id = ae.auftrag_id
        JOIN stoermeldung s    ON s.id = w.stoermeldung_id
        JOIN maschine m        ON m.id = s.maschine_id
        JOIN gebaeude g        ON g.id = m.gebaeude_id
        WHERE ae.ersatzteil_id = e.id AND g.standort_id = ${werkId} AND s.zeitpunkt >= now() - interval '12 months'
      ) v ON TRUE
      ORDER BY lb.lagerplatz NULLS LAST, e.bezeichnung`,
    // Wo liegt welches Teil? (für „In anderen Werken“)
    sql`
      SELECT lb.ersatzteil_id AS teil, lb.standort_id AS werk, st.name AS werkname, st.land_kuerzel AS land, lb.bestand
      FROM lagerbestand lb JOIN standort st ON st.id = lb.standort_id
      WHERE lb.bestand > 0
      ORDER BY lb.bestand DESC`,
  ]);

  const werk = werke.find((w) => w.id === werkId) ?? null;
  return (
    <LagerAnsicht werke={werke} werk={werk} teile={teile} verteilung={verteilung}
                  start={/^\d+$/.test(q.teil ?? '') ? Number(q.teil) : null} darf={darfBearbeiten(person)} />
  );
}
