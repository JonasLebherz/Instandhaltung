/**
 * lib/karten/ampel.js – Zustand der Signalampel an einer Maschine (vier Leuchten wie eine echte Signalsäule)
 *   rot    = Stillstand      (offene Störung mit Priorität „hoch“ – „Maschine steht“)
 *   orange = Störung         (höchste offene Priorität „mittel“)
 *   blau   = Kleine Störung  (höchste offene Priorität „niedrig“ – Maschine läuft weiter)
 *   grün   = Läuft           (keine offene Störung)
 * Dieselben Farben wie die Punkte der Störungskarte (components/karten/stufe.js): hoch rot, mittel orange,
 * niedrig blau, keine offenen grün.
 */
import { T } from '@/lib/sprache';

export function ampelZustand(maschine) {
  if (!maschine.offen) return 'gruen';
  return { hoch: 'rot', mittel: 'orange', niedrig: 'blau' }[maschine.hoechste_prioritaet] ?? 'blau';
}

export const AMPEL_TEXT = { rot: T('Stillstand'), orange: T('Störung'), blau: T('Kleine Störung'), gruen: T('Läuft') };
/** Reihenfolge von oben nach unten an der Säule = von dringend nach ruhig */
export const AMPEL_REIHENFOLGE = ['rot', 'orange', 'blau', 'gruen'];
/** Welche Priorität zu welcher Leuchte gehört (für Legenden und das Melden) */
export const AMPEL_PRIORITAET = { rot: 'hoch', orange: 'mittel', blau: 'niedrig', gruen: null };

/** Kleine Signalsäule für HTML (vier Leuchten; die aktive leuchtet über die Klasse ampel-<zustand> am Elternelement) */
export function AmpelSymbol() {
  return <span className="ampel-symbol" aria-hidden="true"><i /><i /><i /><i /></span>;
}
