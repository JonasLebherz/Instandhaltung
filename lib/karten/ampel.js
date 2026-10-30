/**
 * lib/karten/ampel.js – Zustand der Signalampel an einer Maschine
 *   grün   = läuft (keine offene Störung)
 *   orange = Störung (offene Störung, Priorität niedrig/mittel)
 *   rot    = Stillstand (offene Störung mit Priorität "hoch" – "Maschine steht")
 */
import { T } from '@/lib/sprache';

export function ampelZustand(maschine) {
  if (!maschine.offen) return 'gruen';
  return maschine.hoechste_prioritaet === 'hoch' ? 'rot' : 'orange';
}

export const AMPEL_TEXT = { gruen: T('Läuft'), orange: T('Störung'), rot: T('Stillstand') };
