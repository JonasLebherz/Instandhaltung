'use client';
/**
 * app/statistik/Diagramm.js – ein einzelnes Diagramm mit Chart.js
 *
 *   <Diagramm art="saeulen" labels={['Jan', 'Feb']} werte={[12, 9]} einheit="Störungen" />
 *
 * art: "saeulen" (senkrechte Balken), "balken" (waagerecht, für lange Texte),
 *      "linie" (Verlauf mit weicher Fläche darunter) oder "ring" (Anteile, Farben aus `farben`)
 * reihen: mehrere Datenreihen gestapelt, z. B. Störungen je Monat nach Priorität
 *      ([{ name, werte, farbe: '--rot' }], statt `werte`)
 * Kreuzfilter (Statistik): onKlick(index) beim Klick auf einen Balken/ein Segment, auswahl = gewählter
 *      Index – die übrigen werden blass, die Auswahl bleibt kräftig (wie in Power BI).
 *
 * Gestaltung: eine Datenreihe, eine Farbe (Akzent), dünne Balken mit
 * abgerundetem Ende, zurückhaltendes Gitter. Die Farben kommen aus den
 * CSS-Variablen; beim Wechsel Hell/Dunkel wird neu gezeichnet.
 * Unter jedem Diagramm gibt es die Werte auch als Tabelle (Barrierefreiheit).
 * Oben rechts: Export als CSV, Excel oder PDF (components/ExportKnopf.js) – Titel aus `titel` bzw. `beschreibung`.
 */
import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { useT } from '@/components/SpracheKontext';
import ExportKnopf from '@/components/ExportKnopf';

/** Liest eine Farbe aus den CSS-Variablen (z. B. "--akzent") */
function farbe(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Farbe "#rrggbb" mit Transparenz – z. B. für die Fläche unter der Linie */
function mitDeckkraft(hex, deckkraft) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;   // andere Schreibweisen (rgba …) unverändert
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${deckkraft})`;
}

export default function Diagramm({ art = 'saeulen', labels, werte, einheit = '', nachkomma = 0, beschreibung, titel, unterzeile, hoehe = 260, spalte = '', abNull = true, max,
  reihen = null, farben = null, onKlick = null, auswahl = null }) {
  const t = useT();
  const leinwandRef = useRef(null);
  // Immer die aktuelle Klick-Funktion verwenden (das Diagramm wird nicht bei jedem Zeichnen neu gebaut)
  const klickRef = useRef(onKlick);
  klickRef.current = onKlick;
  // Bei gestapelten Reihen zählt für Tabelle und Export die Summe je Zeile
  if (reihen) werte = labels.map((_, i) => reihen.reduce((sum, r) => sum + (r.werte[i] ?? 0), 0));
  const formatiert = (wert) => (wert === null || wert === undefined ? '–'
    : `${Number(wert).toLocaleString(t.locale, { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma })}${einheit ? ` ${einheit}` : ''}`);

  useEffect(() => {
    const ohneBewegung = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let diagramm = null;

    function zeichnen() {
      diagramm?.destroy();
      const akzent = farbe('--akzent');
      const gitter = { color: farbe('--linie') };
      const schrift = { family: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', size: 12 };
      Chart.defaults.color = farbe('--text-leise');
      const waagerecht = art === 'balken';
      const tooltip = {
        backgroundColor: farbe('--text'), titleColor: farbe('--karte-solid'), bodyColor: farbe('--karte-solid'),
        padding: 10, cornerRadius: 10, displayColors: false,
        callbacks: { label: (k) => formatiert(waagerecht ? k.parsed.x : k.parsed.y) },
      };
      // abNull = false: Achse beginnt knapp unter dem kleinsten Wert (z. B. Verfügbarkeit 99,x %)
      const wertAchse = { beginAtZero: abNull, grace: abNull ? 0 : '5%', grid: gitter, border: { display: false }, ticks: { precision: nachkomma ? undefined : 0, font: schrift } };
      // max: Obergrenze der Achse (z. B. 100 bei Prozent – sonst zeigte „grace“ unsinnige 100,1 %)
      if (max !== undefined) wertAchse.max = max;
      const textAchse = { grid: { display: false }, border: { color: gitter.color }, ticks: { font: schrift, maxRotation: 0, autoSkipPadding: 10, color: waagerecht ? farbe('--text') : undefined } };

      // Auswahl im Kreuzfilter: gewählter Index kräftig, die anderen blass
      const keineAuswahl = auswahl === null || auswahl === undefined || auswahl < 0;   // findIndex liefert −1, wenn nichts gewählt ist
      const blass = (f, i) => (keineAuswahl || i === auswahl ? f : mitDeckkraft(f, 0.28));
      const klick = {
        onClick: (_, elemente) => { if (klickRef.current && elemente.length) klickRef.current(elemente[0].index); },
        onHover: (e, elemente) => { if (klickRef.current) e.native.target.style.cursor = elemente.length ? 'pointer' : 'default'; },
      };

      if (art === 'ring') {
        diagramm = new Chart(leinwandRef.current, {
          type: 'doughnut',
          data: { labels, datasets: [{ data: werte, backgroundColor: werte.map((_, i) => blass(farbe(farben?.[i] ?? '--akzent'), i)), borderColor: farbe('--karte-solid'), borderWidth: 3, hoverOffset: 6 }] },
          options: {
            maintainAspectRatio: false, cutout: '64%',
            animation: ohneBewegung ? false : { duration: 700, easing: 'easeOutQuart' },
            plugins: {
              legend: { position: 'right', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, font: schrift, color: farbe('--text') } },
              tooltip: { ...tooltip, callbacks: { label: (k) => `${k.label}: ${formatiert(k.parsed)}` } },
            },
            ...klick,
          },
        });
        return;
      }

      diagramm = new Chart(leinwandRef.current, {
        type: art === 'linie' ? 'line' : 'bar',
        data: {
          labels,
          datasets: reihen ? reihen.map((r) => ({
            label: r.name, data: r.werte, stack: 'summe',
            backgroundColor: r.werte.map((_, i) => blass(farbe(r.farbe), i)),
            borderRadius: 3, maxBarThickness: 26,
          })) : [art === 'linie' ? {
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
            backgroundColor: werte.map((_, i) => blass(akzent, i)),
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
          plugins: {
            legend: reihen ? { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, font: schrift, color: farbe('--text') } } : { display: false },
            tooltip: reihen ? { ...tooltip, displayColors: true, callbacks: { label: (k) => `${k.dataset.label}: ${formatiert(k.parsed.y)}` } } : tooltip,
          },
          scales: waagerecht ? { x: wertAchse, y: textAchse } : reihen ? { x: { ...textAchse, stacked: true }, y: { ...wertAchse, stacked: true } } : { x: textAchse, y: wertAchse },
          ...klick,
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
  }, [art, JSON.stringify(labels), JSON.stringify(werte), JSON.stringify(reihen), JSON.stringify(farben), auswahl, einheit, nachkomma, abNull, max, t.locale]);

  return (
    <>
      <div className={`diagramm${onKlick ? ' klickbar' : ''}`} style={{ height: hoehe }}>
        <canvas ref={leinwandRef} role="img" aria-label={beschreibung} />
        <ExportKnopf titel={titel ?? beschreibung} unterzeile={unterzeile}
                     daten={() => ({ spalten: [spalte || t('Wert'), einheit || t('Wert')], zeilen: labels.map((l, i) => [l, werte[i] === null || werte[i] === undefined ? null : Math.round(werte[i] * 100) / 100]) })}
                     bild={() => leinwandRef.current?.toDataURL('image/png')} />
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
