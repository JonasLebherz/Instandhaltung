/**
 * app/mitarbeiter/page.js – Mitarbeiter: Team mit Kennzahlen und Chat
 *
 *  - Oben Kennzahlen des Teams (Personen, Instandhaltung, offene Aufträge je Techniker, erledigt in 12 Monaten).
 *  - Links die Teamliste (MitarbeiterBereich.js): Suche, Filter nach Werk und Rolle; bei Personen der
 *    Instandhaltung offene und erledigte Aufträge (12 Monate) sowie MTTR ihres Technikers.
 *  - Rechts der Chat (Chat.js) der gewählten Person (Konto → Person). Ungelesene Nachrichten zeigt die
 *    Seitenleiste als rote Zahl bei „Mitarbeiter“.
 * Beachtet die Ansicht aus dem Konto (nur ein Land bzw. Werk). Eine Abfrage.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import { ansichtAusCookie, ansichtBedingung } from '@/lib/ansicht';
import { personAusCookie } from '@/lib/person';
import Kennzahl from '@/components/Kennzahl';
import MitarbeiterBereich from './MitarbeiterBereich';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Mitarbeiter');

export default async function MitarbeiterSeite() {
  await benutzerPflicht();
  const t = await uebersetzer();
  const ansicht = await ansichtAusCookie();
  const person = await personAusCookie();   // nur zur Anzeige; der Chat prüft die Person auf dem Server

  // Kennzahlen je Person. MTTR wie in den Views: Ø (ende − start) erledigter Aufträge.
  const personen = await sql`
    SELECT p.id, p.name, p.rolle::text AS rolle, st.id AS standort_id, st.name AS standort,
           st.land_kuerzel AS land, l.name AS land_name, tk.qualifikation, tk.schicht::text AS schicht,
           COALESCE(a.offen, 0) AS offen, COALESCE(a.erledigt, 0) AS erledigt, a.mttr_min
    FROM person p
    LEFT JOIN standort st  ON st.id = p.standort_id
    LEFT JOIN land l       ON l.kuerzel = st.land_kuerzel
    LEFT JOIN techniker tk ON tk.id = p.techniker_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE w.status <> 'erledigt')::int AS offen,
             COUNT(*) FILTER (WHERE w.status = 'erledigt' AND w.ende_zeit >= now() - interval '12 months')::int AS erledigt,
             (AVG(EXTRACT(EPOCH FROM (w.ende_zeit - w.start_zeit)) / 60)
               FILTER (WHERE w.status = 'erledigt' AND w.ende_zeit >= now() - interval '12 months'))::float AS mttr_min
      FROM wartungsauftrag w WHERE w.techniker_id = p.techniker_id
    ) a ON p.techniker_id IS NOT NULL
    WHERE ${ansichtBedingung(ansicht)}
    ORDER BY l.hauptsitz DESC NULLS LAST, st.name, p.rolle, p.name`;

  const techniker = personen.filter((p) => p.rolle === 'Instandhaltung');
  const offen = techniker.reduce((s, p) => s + p.offen, 0);
  const erledigt = techniker.reduce((s, p) => s + p.erledigt, 0);

  return (
    <>
      <div className="seitenkopf">
        <h1>{t('Mitarbeiter')}</h1>
        <p>{t('Wer im Team arbeitet, wie ausgelastet die Instandhaltung ist – und direkt Nachrichten schreiben.')}</p>
      </div>

      <div className="row g-4 mb-2">
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Personen')} wert={personen.length} zusatz={t('im Team')} symbol="bi-people" i={0} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Instandhaltung|Rolle')} wert={techniker.length} zusatz={t('Techniker')} symbol="bi-wrench-adjustable" i={1} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Offene Aufträge')} wert={techniker.length ? offen / techniker.length : 0} nachkomma={1}
                    zusatz={t('je Techniker im Schnitt')} symbol="bi-clipboard-check" i={2} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Erledigt')} wert={erledigt} zusatz={t('Aufträge in 12 Monaten')} symbol="bi-check2-circle" i={3} />
        </div>
      </div>

      <MitarbeiterBereich personen={personen} ich={person ? { id: person.id, name: person.name } : null} />
    </>
  );
}
