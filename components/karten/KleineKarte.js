'use client';
/**
 * components/karten/KleineKarte.js – kleine Weltkarte für die Übersicht
 *
 * Zeigt alle Länder mit Werken und der Zahl offener Störungen. Ein Klick auf ein
 * Land öffnet die Störungskarte direkt in diesem Land (/karte?land=de).
 */
import { useRouter } from 'next/navigation';
import WeltKarte from './WeltKarte';
import { laenderAus } from '@/lib/karten/laender';

export default function KleineKarte({ standorte }) {
  const router = useRouter();
  return (
    <WeltKarte laender={laenderAus(standorte)} klein
               onWaehle={(land) => router.push(`/karte?land=${land.kuerzel.toLowerCase()}`)} />
  );
}
