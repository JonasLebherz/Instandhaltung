'use client';
/**
 * components/karten/KleineKarte.js – kleine Deutschlandkarte für die Übersicht
 *
 * Zeigt alle Werke mit der Zahl offener Störungen. Ein Klick auf ein Werk
 * öffnet die Störungskarte direkt in diesem Werk (/karte?werk=ham).
 */
import { useRouter } from 'next/navigation';
import DeutschlandKarte from './DeutschlandKarte';

export default function KleineKarte({ standorte }) {
  const router = useRouter();
  return (
    <DeutschlandKarte standorte={standorte}
                      onWaehle={(st) => router.push(`/karte?werk=${st.kuerzel.toLowerCase()}`)} />
  );
}
