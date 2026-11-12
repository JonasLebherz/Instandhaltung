/**
 * app/vollbild/page.js – Vollbildmodus der Störungskarte (Konto-Menü → „Vollbildmodus“)
 *
 * Die Karte über den ganzen Bildschirm ohne Seitenleiste, rechts die offenen Aufträge der Ebene,
 * auf der man gerade ist (weltweit, Land, Werk, Halle). Adresse wie bei der Karte (?werk=&halle=).
 * 2 Abfragen (Kartendaten + Ansicht aus dem Konto).
 */
import { benutzerPflicht } from '@/lib/auth';
import { ansichtAusCookie } from '@/lib/ansicht';
import { alleKartenDaten, nachAnsicht } from '@/lib/karten/daten';
import { startAusAdresse } from '@/lib/karten/adresse';
import { seitentitel } from '@/lib/sprache/server';
import VollbildAnsicht from './VollbildAnsicht';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Vollbildmodus');

export default async function VollbildSeite({ searchParams }) {
  await benutzerPflicht();
  const parameter = await searchParams;
  const [alleDaten, ansicht] = await Promise.all([alleKartenDaten(), ansichtAusCookie()]);
  const daten = nachAnsicht(alleDaten, ansicht);
  const start = Object.keys(parameter ?? {}).length > 0 ? startAusAdresse(parameter, daten) : { land: ansicht.land, standortId: ansicht.standortId };
  return <VollbildAnsicht daten={daten} start={start} />;
}
