'use client';
/**
 * app/statistik/Streuung.js – Streudiagramm „Maschinen: Häufigkeit × Reparaturdauer“
 *
 * Jeder Punkt ist eine Maschine: rechts = viele Störungen, oben = lange Reparaturen (MTTR),
 * Größe = Ausfallzeit. Oben rechts liegen also die Sorgenkinder. Klick auf einen Punkt
 * zoomt die Statistik auf diese Maschine (onKlick(maschinenId)).
 * Farben aus den CSS-Variablen, neu gezeichnet beim Wechsel Hell/Dunkel.
 */
import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { useT } from '@/components/SpracheKontext';

const farbe = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export default function Streuung({ punkte, onKlick, hoehe = 320 }) {
  const t = useT();
  const ref = useRef(null);
  const klickRef = useRef(onKlick);
  klickRef.current = onKlick;

  useEffect(() => {
    let diagramm = null;
    const ohneBewegung = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function zeichnen() {
      diagramm?.destroy();
      const akzent = farbe('--akzent');
      const gitter = { color: farbe('--linie') };
      const groesste = Math.max(1, ...punkte.map((p) => p.ausfall_h));
      diagramm = new Chart(ref.current, {
        type: 'bubble',
        data: {
          datasets: [{
            data: punkte.map((p) => ({ x: p.anzahl, y: p.mttr_h, r: 4 + 14 * Math.sqrt(p.ausfall_h / groesste), p })),
            backgroundColor: `${akzent}55`, borderColor: akzent, borderWidth: 1.5, hoverBackgroundColor: akzent,
          }],
        },
        options: {
          maintainAspectRatio: false,
          animation: ohneBewegung ? false : { duration: 600 },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: farbe('--text'), titleColor: farbe('--karte-solid'), bodyColor: farbe('--karte-solid'), padding: 10, cornerRadius: 10, displayColors: false,
              callbacks: {
                title: (k) => k[0].raw.p.name,
                label: (k) => [t('{n} Störungen', { n: k.raw.p.anzahl }), `MTTR ${k.raw.p.mttr_h.toLocaleString(t.locale, { maximumFractionDigits: 1 })} h`,
                  `${t('Ausfall')} ${Math.round(k.raw.p.ausfall_h)} h`],
              },
            },
          },
          scales: {
            x: { title: { display: true, text: t('Störungen') }, beginAtZero: true, grid: gitter, ticks: { precision: 0 } },
            y: { title: { display: true, text: 'MTTR (h)' }, beginAtZero: true, grid: gitter },
          },
          onClick: (_, el) => { if (el.length) klickRef.current?.(el[0].element.$context.raw.p.id); },
          onHover: (e, el) => { e.native.target.style.cursor = el.length ? 'pointer' : 'default'; },
        },
      });
    }
    zeichnen();
    window.addEventListener('darstellungswechsel', zeichnen);
    return () => { window.removeEventListener('darstellungswechsel', zeichnen); diagramm?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(punkte), t.locale]);

  return <div className="diagramm klickbar" style={{ height: hoehe }}><canvas ref={ref} role="img" aria-label={t('Maschinen: Häufigkeit × Reparaturdauer')} /></div>;
}
