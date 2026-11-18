/**
 * app/anlegen/page.js – Neu anlegen: Werk, Halle, Maschine, Mitarbeiter
 *
 * Erreichbar über das Konto-Menü („Neu anlegen“). Damit kann der Betrieb die App mit eigenen
 * Stammdaten füllen. Welche Art gerade offen ist, steht in der Adresse (?art=werk|halle|maschine|person);
 * ?werk=<kürzel> bzw. ?halle=<id> wählen das Werk bzw. die Halle vor (nach dem Anlegen geht es so weiter).
 * Gespeichert wird über werkAnlegen, halleAnlegen, maschineAnlegen, personAnlegen (app/aktionen.js). 3 Abfragen.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { idAus } from '@/lib/eingabe';
import { aktuellePerson } from '@/lib/person';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import AnlegenFormulare from './AnlegenFormulare';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Neu anlegen');

const ARTEN = ['werk', 'halle', 'maschine', 'person'];

export default async function AnlegenSeite({ searchParams }) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const q = await searchParams;
  const [laender, werke, hallen] = await Promise.all([
    sql`SELECT kuerzel, name FROM land ORDER BY hauptsitz DESC, name`,
    sql`SELECT st.id, st.kuerzel, st.name, l.name AS land FROM standort st JOIN land l ON l.kuerzel = st.land_kuerzel ORDER BY l.hauptsitz DESC, l.name, st.name`,
    sql`SELECT g.id, g.kuerzel, g.bezeichnung, st.name AS werk, (SELECT COUNT(*)::int FROM maschine m WHERE m.gebaeude_id = g.id) AS maschinen
        FROM gebaeude g JOIN standort st ON st.id = g.standort_id ORDER BY st.name, g.kuerzel`,
  ]);
  const person = await aktuellePerson();
  const art = ARTEN.includes(q.art) ? q.art : 'maschine';
  const werk = werke.find((w) => w.kuerzel.toLowerCase() === String(q.werk ?? '').toLowerCase()) ?? werke.find((w) => w.id === person?.standort_id);
  const halle = hallen.find((h) => h.id === idAus(q.halle));

  return (
    <>
      <div className="seitenkopf">
        <h1>{t('Neu anlegen')}</h1>
      </div>
      <AnlegenFormulare art={art} laender={laender} werke={werke} hallen={hallen}
                        vorwahl={{ werk: werk?.id ?? null, halle: halle?.id ?? null }} gesperrt={person?.rolle === 'Produktion'} />
    </>
  );
}
