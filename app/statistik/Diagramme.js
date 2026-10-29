'use client';
/**
 * app/statistik/Diagramme.js – Diagramme mit Chart.js
 *
 *  - Liniendiagramm: Störungen pro Monat (mit weichem Farbverlauf unter der Linie)
 *  - Balkendiagramm (liegend): Top-5-Störursachen
 *
 * Die Farben werden aus den CSS-Variablen gelesen. Wechselt jemand zwischen
 * Hell und Dunkel, werden die Diagramme sofort neu eingefärbt.
 * Unter jedem Diagramm gibt es die Werte auch als Tabelle (Barrierefreiheit).
 */
import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

/** Liest eine Farbe aus den CSS-Variablen (z. B. "--akzent") */
function farbe(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Akzentfarbe mit Transparenz, z. B. für den Verlauf unter der Linie */
function mitDeckkraft(hex, deckkraft) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${deckkraft})`;
}

/** Gemeinsames, ruhiges Erscheinungsbild für alle Diagramme */
function grundeinstellungen() {
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  Chart.defaults.font.size = 13;
  Chart.defaults.color = farbe('--text-leise');
  Chart.defaults.plugins.legend.display = false;   // je Diagramm nur eine Datenreihe
  Chart.defaults.plugins.tooltip.backgroundColor = farbe('--text');
  Chart.defaults.plugins.tooltip.titleColor = farbe('--karte-solid');
  Chart.defaults.plugins.tooltip.bodyColor = farbe('--karte-solid');
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.displayColors = false;
  Chart.defaults.maintainAspectRatio = false;
}

export default function Diagramme({ proMonat, topUrsachen }) {
  const linieRef = useRef(null);
  const balkenRef = useRef(null);

  useEffect(() => {
    const ohneBewegung = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let diagramme = [];

    function zeichnen() {
      diagramme.forEach((d) => d.destroy());
      grundeinstellungen();
      // Sanftes Aufbauen der Diagramme – außer bei "Bewegung reduzieren"
      const animation = ohneBewegung ? false : { duration: 900, easing: 'easeOutQuart' };
      const akzent = farbe('--akzent');
      const gitter = { color: farbe('--linie') };

      // Liniendiagramm: Störungen pro Monat
      const linie = new Chart(linieRef.current, {
        type: 'line',
        data: {
          labels: proMonat.map((d) => d.label),
          datasets: [{
            label: 'Störungen',
            data: proMonat.map((d) => d.anzahl),
            borderColor: akzent,
            borderWidth: 2.5,
            fill: true,
            // Verlauf von oben (Akzentfarbe, leicht) nach unten (durchsichtig)
            backgroundColor: (kontext) => {
              const { ctx, chartArea } = kontext.chart;
              if (!chartArea) return mitDeckkraft(akzent, 0.1);
              const verlauf = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              verlauf.addColorStop(0, mitDeckkraft(akzent, 0.25));
              verlauf.addColorStop(1, mitDeckkraft(akzent, 0));
              return verlauf;
            },
            cubicInterpolationMode: 'monotone',   // weiche Linie ohne Überschwingen
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: farbe('--karte-solid'),
            pointBorderWidth: 2,
          }],
        },
        options: {
          animation,
          interaction: { mode: 'index', intersect: false },   // Tooltip schon in der Nähe des Punktes
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
            y: { beginAtZero: true, ticks: { precision: 0 }, grid: gitter, border: { display: false } },
          },
          plugins: { tooltip: { callbacks: { label: (c) => `${c.parsed.y} Störungen` } } },
        },
      });
      diagramme = [linie];

      // Balkendiagramm (liegend): Top-5-Störursachen
      if (balkenRef.current) {
        diagramme.push(new Chart(balkenRef.current, {
          type: 'bar',
          data: {
            labels: topUrsachen.map((d) => d.ursache),
            datasets: [{
              label: 'Anzahl',
              data: topUrsachen.map((d) => d.anzahl),
              backgroundColor: akzent,
              hoverBackgroundColor: farbe('--akzent-hover'),
              borderRadius: 6,
              borderSkipped: 'start',   // nur das Balkenende abrunden
              barThickness: 22,
            }],
          },
          options: {
            animation,
            indexAxis: 'y',   // waagerechte Balken: lange Ursachen-Texte bleiben lesbar
            scales: {
              x: { beginAtZero: true, ticks: { precision: 0 }, grid: gitter, border: { display: false } },
              y: { grid: { display: false }, ticks: { color: farbe('--text') } },
            },
            plugins: { tooltip: { callbacks: { label: (c) => `${c.parsed.x} Störungen` } } },
          },
        }));
      }
    }

    zeichnen();
    window.addEventListener('darstellungswechsel', zeichnen);
    return () => {
      window.removeEventListener('darstellungswechsel', zeichnen);
      diagramme.forEach((d) => d.destroy());
    };
  }, [proMonat, topUrsachen]);

  return (
    <div className="row g-4">
      <div className="col-lg-7">
        <section className="karte" style={{ '--i': 5 }}>
          <h2 className="abschnitt-titel">Störungen pro Monat</h2>
          <div className="diagramm">
            <canvas ref={linieRef} role="img" aria-label="Liniendiagramm: Anzahl der Störungen pro Monat" />
          </div>
          <details className="mt-3">
            <summary className="klein">Als Tabelle anzeigen</summary>
            <table className="tabelle mt-2">
              <thead><tr><th>Monat</th><th className="zahl">Störungen</th></tr></thead>
              <tbody>
                {proMonat.map((m) => <tr key={m.label}><td>{m.label}</td><td className="zahl">{m.anzahl}</td></tr>)}
              </tbody>
            </table>
          </details>
        </section>
      </div>
      <div className="col-lg-5">
        <section className="karte" style={{ '--i': 6 }}>
          <h2 className="abschnitt-titel">Top-5-Störursachen</h2>
          {topUrsachen.length === 0 ? (
            <p className="leer">Keine Störungen im Zeitraum.</p>
          ) : (
            <>
              <div className="diagramm">
                <canvas ref={balkenRef} role="img" aria-label="Balkendiagramm: die fünf häufigsten Störursachen" />
              </div>
              <details className="mt-3">
                <summary className="klein">Als Tabelle anzeigen</summary>
                <table className="tabelle mt-2">
                  <thead><tr><th>Ursache</th><th className="zahl">Anzahl</th></tr></thead>
                  <tbody>
                    {topUrsachen.map((u) => <tr key={u.ursache}><td>{u.ursache}</td><td className="zahl">{u.anzahl}</td></tr>)}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
