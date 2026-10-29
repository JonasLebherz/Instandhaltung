'use client';
/**
 * components/Zaehler.js – große Zahl, die beim Öffnen der Seite hochzählt
 *
 * Auf dem Server wird sofort der Endwert ausgegeben (die Seite ist also auch
 * ohne JavaScript vollständig). Im Browser zählt die Zahl dann in knapp einer
 * Sekunde von 0 auf den Endwert hoch – außer, "Bewegung reduzieren" ist an.
 */
import { useEffect, useState } from 'react';

function formatieren(wert, nachkomma) {
  return wert.toLocaleString('de-DE', { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma });
}

export default function Zaehler({ wert, nachkomma = 0, dauer = 900 }) {
  const ziel = wert === null || wert === undefined ? null : Number(wert);
  const [anzeige, setAnzeige] = useState(ziel);

  useEffect(() => {
    if (ziel === null || ziel === 0) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let start = null;
    let rahmen;
    const schritt = (zeit) => {
      if (start === null) start = zeit;
      const fortschritt = Math.min((zeit - start) / dauer, 1);
      const weich = 1 - Math.pow(1 - fortschritt, 3); // schnell starten, sanft abbremsen
      setAnzeige(ziel * weich);
      if (fortschritt < 1) rahmen = requestAnimationFrame(schritt);
    };
    rahmen = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(rahmen);
  }, [ziel, dauer]);

  if (ziel === null) return '–';
  return formatieren(anzeige ?? ziel, nachkomma);
}
