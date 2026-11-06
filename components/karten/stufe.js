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

/**
 * Offene Störungen aufgeteilt nach Priorität: [['rot', 1], ['orange', 2], ['blau', 4]] – nur Farben mit Anzahl > 0.
 * So sieht man auf einen Blick, ob von fünf Störungen eine dringend ist oder alle. Fehlen die Felder
 * hoch/mittel/niedrig (ältere Daten), gibt es einen Teil in der Farbe der höchsten Priorität.
 */
export function prioTeile(o) {
  if (!o?.offen) return [];
  if (o.hoch === undefined && o.mittel === undefined && o.niedrig === undefined) return [[stufe(o.offen, o.hoechste_prioritaet), o.offen]];
  return [['rot', o.hoch ?? 0], ['orange', o.mittel ?? 0], ['blau', o.niedrig ?? 0]].filter(([, n]) => n > 0);
}

/**
 * Inhalt einer Zahl-Marke (Kartenpunkt, Halle, Maschine, Liste): bei nur einer Priorität einfach die Zahl
 * (die Marke trägt schon deren Farbe), bei mehreren eine Kapsel mit farbigen Abschnitten, z. B. 2 orange | 1 blau.
 * Die Marke bekommt dafür die Klasse aus geteiltKlasse() (durchsichtiger Hintergrund, Abschnitte färben selbst).
 */
export function PrioZahlen({ o }) {
  const teile = prioTeile(o);
  if (teile.length <= 1) return o?.offen ?? 0;
  return (
    <span className="prio-zahlen">
      {teile.map(([farbe, n]) => <b key={farbe} className={`prio-zahl stufe-${farbe}`}>{n}</b>)}
    </span>
  );
}
export const geteiltKlasse = (o) => (prioTeile(o).length > 1 ? ' geteilt' : '');

/**
 * Für Welt- und Länderkarte: eine Zahl (alle offenen Störungen) und darum ein Ring als Tortendiagramm, der die
 * Verteilung auf die Prioritäten zeigt (rot hoch, orange mittel, blau niedrig). Es geht um den Eindruck
 * („viel Rot oder nur ein bisschen?“), nicht um genaue Zahlen – die stehen erst an Hallen und Maschinen.
 * Rückgabe: CSS-Verlauf für die Eigenschaft --torte (conic-gradient), bei mehreren Farben mit feinen Fugen.
 */
const TORTEN_FARBE = { rot: 'var(--rot)', orange: 'var(--orange)', blau: 'var(--blau)', ruhig: 'var(--gruen)' };
export function tortenVerlauf(o) {
  const teile = prioTeile(o);
  if (teile.length === 0) return null;
  if (teile.length === 1) return TORTEN_FARBE[teile[0][0]];
  const summe = teile.reduce((a, [, n]) => a + n, 0);
  const fuge = 2.5;   // Grad zwischen zwei Stücken (Farbe der Karte)
  let start = 0;
  const stuecke = teile.map(([farbe, n]) => {
    const ende = start + (n / summe) * 360;
    const teil = `var(--karte-solid) ${start}deg ${start + fuge}deg, ${TORTEN_FARBE[farbe]} ${start + fuge}deg ${ende}deg`;
    start = ende;
    return teil;
  });
  return `conic-gradient(${stuecke.join(', ')})`;
}

/** Inhalt eines Kartenpunkts mit Tortenring: Zahl in der Mitte auf heller Fläche (Ring kommt aus --torte) */
export function TortenZahl({ o }) {
  return <span className="torte-zahl">{o.offen}</span>;
}

/** Text für Bildschirmleser und Tooltips: „3 offene Störungen (1 hoch, 2 niedrig)“ */
export function prioText(o, t) {
  const teile = prioTeile(o);
  if (teile.length <= 1 || o.hoch === undefined) return offenText(o?.offen ?? 0, t);
  const name = { rot: 'hoch', orange: 'mittel', blau: 'niedrig' };
  return `${offenText(o.offen, t)} (${teile.map(([farbe, n]) => `${n} ${t(name[farbe])}`).join(', ')})`;
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
