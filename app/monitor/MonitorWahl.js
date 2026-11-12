'use client';
/**
 * app/monitor/MonitorWahl.js – Halle für den Hallen-Monitor auf der Karte wählen
 *
 * Dieselbe Karte wie die Störungskarte (Welt → Land → Werk → Halle). Ist eine Halle geöffnet,
 * meldet der KartenExplorer das über onHalle – dann geht es weiter zum Monitor dieser Halle.
 */
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import KartenExplorer from '@/components/karten/KartenExplorer';

export default function MonitorWahl({ daten }) {
  const router = useRouter();
  // useCallback: gleiche Funktion bei jedem Zeichnen, sonst startet der Zeitschalter im Explorer neu
  const halleGewaehlt = useCallback(({ werk, halle }) => router.push(`/monitor?werk=${werk}&halle=${halle}`), [router]);
  return <KartenExplorer daten={daten} onHalle={halleGewaehlt} />;
}
