'use client';
/**
 * app/statistik/Diagramm.js – ein einzelnes Diagramm mit Chart.js
 *
 *   <Diagramm art="saeulen" labels={['Jan', 'Feb']} werte={[12, 9]} einheit="Störungen" />
 *
 * art: "saeulen" (senkrechte Balken), "balken" (waagerecht, für lange Texte)
 *      oder "linie" (Verlauf mit weicher Fläche darunter)
 *
 * Gestaltung: eine Datenreihe, eine Farbe (Akzent), dünne Balken mit
 * abgerundetem Ende, zurückhaltendes Gitter. Die Farben kommen aus den
 * CSS-Variablen; beim Wechsel Hell/Dunkel wird neu gezeichnet.
 * Unter jedem Diagramm gibt es die Werte auch als Tabelle (Barrierefreiheit).
 */
import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { useT } from '@/components/SpracheKontext';

/** Liest eine Farbe aus den CSS-Variablen (z. B. "--akzent") */
function farbe(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Farbe "#rrggbb" mit Transparenz – z. B. für die Fläche unter der Linie */
function mitDeckkraft(hex, deckkraft) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${deckkraft})`;
}

export default function Diagramm({ art = 'saeulen', labels, werte, einheit = '', nachkomma = 0, beschreibung, hoehe = 260, spalte = '', abNull = true }) {
  const t = useT();
  const leinwandRef = useRef(null);
  const formatiert = (wert) => (wert === null || wert === undefined ? '–'
    : `${Number(wert).toLocaleString(t.locale, { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma })}${einheit ? ` ${einheit}` : ''}`);

  useEffect(() => {
    const ohneBewegung = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let diagramm = null;

    function zeichnen() {
      diagramm?.destroy();
      const akzent = farbe('--akzent');
      const gitter = { color: farbe('--linie') };
      const schrift = { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', size: 12 };
      Chart.defaults.color = farbe('--text-leise');
      const waagerecht = art === 'balken';
      const tooltip = {
        backgroundColor: farbe('--text'), titleColor: farbe('--karte-solid'), bodyColor: farbe('--karte-solid'),
        padding: 10, cornerRadius: 10, displayColors: false,
        callbacks: { label: (k) => formatiert(waagerecht ? k.parsed.x : k.parsed.y) },
      };
      // abNull = false: Achse beginnt knapp unter dem kleinsten Wert (z. B. Verfügbarkeit 99,x %)
      const wertAchse = { beginAtZero: abNull, grace: abNull ? 0 : '5%', grid: gitter, border: { display: false }, ticks: { precision: nachkomma ? undefined : 0, font: schrift } };
      const textAchse = { grid: { display: false }, border: { color: gitter.color }, ticks: { font: schrift, maxRotation: 0, autoSkipPadding: 10, color: waagerecht ? farbe('--text') : undefined } };

      diagramm = new Chart(leinwandRef.current, {
        type: art === 'linie' ? 'line' : 'bar',
        data: {
          labels,
          datasets: [art === 'linie' ? {
            data: werte,
            borderColor: akzent,
            borderWidth: 2,
            fill: true,
            backgroundColor: (k) => {
              const { ctx, chartArea } = k.chart;
              if (!chartArea) return mitDeckkraft(akzent, 0.1);
              const verlauf = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              verlauf.addColorStop(0, mitDeckkraft(akzent, 0.22));
              verlauf.addColorStop(1, mitDeckkraft(akzent, 0));
              return verlauf;
            },
            cubicInterpolationMode: 'monotone',
            spanGaps: true,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: farbe('--karte-solid'),
            pointBorderWidth: 2,
          } : {
            data: werte,
            backgroundColor: akzent,
            hoverBackgroundColor: farbe('--akzent-hover'),
            borderRadius: 4,
            borderSkipped: 'start',            // nur das Balkenende abrunden
            maxBarThickness: waagerecht ? 18 : 26,
          }],
        },
        options: {
          maintainAspectRatio: false,
          animation: ohneBewegung ? false : { duration: 700, easing: 'easeOutQuart' },
          indexAxis: waagerecht ? 'y' : 'x',
          interaction: { mode: 'index', intersect: false },   // Tooltip schon in der Nähe
          plugins: { legend: { display: false }, tooltip },
          scales: waagerecht ? { x: wertAchse, y: textAchse } : { x: textAchse, y: wertAchse },
        },
      });
    }

    zeichnen();
    window.addEventListener('darstellungswechsel', zeichnen);
    return () => {
      window.removeEventListener('darstellungswechsel', zeichnen);
      diagramm?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art, JSON.stringify(labels), JSON.stringify(werte), einheit, nachkomma, t.locale]);

  return (
    <>
      <div className="diagramm" style={{ height: hoehe }}>
        <canvas ref={leinwandRef} role="img" aria-label={beschreibung} />
      </div>
      <details className="mt-2">
        <summary className="klein">{t('Als Tabelle anzeigen')}</summary>
        <table className="tabelle mt-2">
          <thead><tr><th>{spalte}</th><th className="zahl">{einheit || t('Wert')}</th></tr></thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label}><td>{label}</td><td className="zahl">{formatiert(werte[i]).replace(` ${einheit}`, '')}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
