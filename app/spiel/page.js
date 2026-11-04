/**
 * app/spiel/page.js – Gabelstapler-Spiel
 *
 * Kleines 3D-Spiel für Pausen und die Präsentation: Maschinen fallen aus, man holt mit dem
 * Gabelstapler das passende Ersatzteil aus dem Lager und bringt es zur Maschine.
 * Keine Datenbank-Abfrage – nur der Name der gewählten Person (Cookie) als Vorschlag für die Bestenliste.
 */
import { benutzerPflicht } from '@/lib/auth';
import { personAusCookie } from '@/lib/person';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import GabelstaplerSpiel from './GabelstaplerSpiel';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Gabelstapler-Spiel');

export default async function SpielSeite() {
  await benutzerPflicht();
  const t = await uebersetzer();
  const person = await personAusCookie();
  return (
    <>
      <div className="seitenkopf">
        <h1>{t('Gabelstapler-Spiel')}</h1>
        <p>{t('Maschine steht? Ersatzteil holen, hinfahren, reparieren – gegen die Uhr.')}</p>
      </div>
      <GabelstaplerSpiel personName={person?.name ?? ''} />
    </>
  );
}
