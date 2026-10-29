/**
 * components/karten/stufe.js – Farbe eines Kartenpunkts
 *
 * Ergibt sich aus der höchsten Priorität der offenen Aufträge:
 *   hoch → rot, mittel → orange, niedrig → blau, keine offenen → ruhig (grün)
 * Auf der Karte steht immer zusätzlich die Zahl – die Farbe ist nur eine Hilfe.
 */
import { useT } from '@/components/SpracheKontext';

export function stufe(offen, hoechstePrioritaet) {
  if (!offen) return 'ruhig';
  return { hoch: 'rot', mittel: 'orange', niedrig: 'blau' }[hoechstePrioritaet] ?? 'blau';
}

/** "3 offene Störungen" – mit Übersetzungsfunktion t aus useT() bzw. uebersetzer() */
export function offenText(offen, t = (x, w) => x.replace('{n}', w?.n)) {
  if (!offen) return t('keine offenen Störungen');
  return offen === 1 ? t('1 offene Störung') : t('{n} offene Störungen', { n: offen });
}

/** Legende unter den Karten */
export function Legende() {
  const t = useT();
  return (
    <div className="karten-legende" aria-hidden="true">
      <span><i className="punkt stufe-rot" /> {t('Priorität hoch')}</span>
      <span><i className="punkt stufe-orange" /> {t('mittel')}</span>
      <span><i className="punkt stufe-blau" /> {t('niedrig')}</span>
      <span><i className="punkt stufe-ruhig" /> {t('keine offenen Störungen')}</span>
    </div>
  );
}
