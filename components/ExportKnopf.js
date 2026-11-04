'use client';
/**
 * components/ExportKnopf.js – kleiner Knopf „Export“ mit Menü: CSV, Excel, PDF
 *
 *   <ExportKnopf titel="Störungen pro Monat" daten={() => ({ spalten, zeilen })} bild={() => canvas.toDataURL()} />
 *
 * daten und bild sind Funktionen: Sie werden erst beim Klick ausgewertet (aktuelle Ebene, aktuelles Diagramm).
 * Die eigentliche Arbeit macht lib/export.js.
 */
import { useEffect, useRef, useState } from 'react';
import { useT } from './SpracheKontext';
import { exportieren } from '@/lib/export';

export default function ExportKnopf({ titel, daten, bild, unterzeile }) {
  const t = useT();
  const [offen, setOffen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!offen) return undefined;
    const zu = (e) => { if (!ref.current?.contains(e.target)) setOffen(false); };
    const taste = (e) => { if (e.key === 'Escape') setOffen(false); };
    document.addEventListener('mousedown', zu);
    document.addEventListener('keydown', taste);
    return () => { document.removeEventListener('mousedown', zu); document.removeEventListener('keydown', taste); };
  }, [offen]);

  function los(format) {
    setOffen(false);
    exportieren(format, { titel, unterzeile, ...daten(), bild: format === 'pdf' ? bild?.() : undefined });
  }

  return (
    <div className="export-knopf" ref={ref}>
      <button type="button" className="rund-knopf" onClick={() => setOffen(!offen)} aria-haspopup="menu" aria-expanded={offen}
              title={t('Exportieren')} aria-label={t('„{titel}“ exportieren', { titel })}>
        <i className="bi bi-download" aria-hidden="true" />
      </button>
      {offen && (
        <div className="export-menue" role="menu">
          <button type="button" role="menuitem" onClick={() => los('csv')}><i className="bi bi-filetype-csv" aria-hidden="true" /> CSV</button>
          <button type="button" role="menuitem" onClick={() => los('xlsx')}><i className="bi bi-file-earmark-excel" aria-hidden="true" /> Excel</button>
          <button type="button" role="menuitem" onClick={() => los('pdf')}><i className="bi bi-file-earmark-pdf" aria-hidden="true" /> {t('PDF / Drucken')}</button>
        </div>
      )}
    </div>
  );
}
