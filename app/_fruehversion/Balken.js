'use client';
/**
 * app/_fruehversion/Balken.js – einfaches Diagramm für Version 3 (Chart.js mit Standard-Einstellungen)
 * Bewusst ohne Anpassung an das Design der App: Standardfarben, Standardschrift, Legende oben.
 */
import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function Balken({ art = 'bar', titel, labels, werte }) {
  const ref = useRef(null);
  useEffect(() => {
    const diagramm = new Chart(ref.current, {
      type: art,
      data: { labels, datasets: [{ label: titel, data: werte, borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false },
    });
    return () => diagramm.destroy();
  }, [art, titel, JSON.stringify(labels), JSON.stringify(werte)]);
  return <div className="fv-diagramm"><canvas ref={ref} aria-label={titel} role="img" /></div>;
}
