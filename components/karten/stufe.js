/**
 * components/karten/stufe.js – Farbe eines Kartenpunkts
 *
 * Ergibt sich aus der höchsten Priorität der offenen Aufträge:
 *   hoch → rot, mittel → orange, niedrig → blau, keine offenen → ruhig (grün)
 * Auf der Karte steht immer zusätzlich die Zahl – die Farbe ist nur eine Hilfe.
 */
export function stufe(offen, hoechstePrioritaet) {
  if (!offen) return 'ruhig';
  return { hoch: 'rot', mittel: 'orange', niedrig: 'blau' }[hoechstePrioritaet] ?? 'blau';
}

export function offenText(offen) {
  if (!offen) return 'keine offenen Störungen';
  return offen === 1 ? '1 offene Störung' : `${offen} offene Störungen`;
}

/** Legende unter den Karten */
export function Legende() {
  return (
    <div className="karten-legende" aria-hidden="true">
      <span><i className="punkt stufe-rot" /> Priorität hoch</span>
      <span><i className="punkt stufe-orange" /> mittel</span>
      <span><i className="punkt stufe-blau" /> niedrig</span>
      <span><i className="punkt stufe-ruhig" /> keine offenen Störungen</span>
    </div>
  );
}
