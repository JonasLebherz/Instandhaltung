/**
 * lib/flash.js – Hinweise, die nach einer Weiterleitung einmalig erscheinen
 *
 * Beispiel: Nach dem Speichern einer Störmeldung wird zur Übersicht
 * weitergeleitet. Die Meldung "Störmeldung Nr. 151 wurde erfasst" wird dafür
 * kurz in einem Cookie abgelegt und von components/FlashMeldungen.js angezeigt
 * und sofort wieder gelöscht.
 */
import 'server-only';
import { cookies } from 'next/headers';

/** typ: 'erfolg', 'hinweis' oder 'fehler' */
export async function flash(typ, text) {
  const speicher = await cookies();
  let liste = [];
  try {
    liste = JSON.parse(speicher.get('flash')?.value ?? '[]');
  } catch {
    liste = [];
  }
  // Eindeutige Kennung: Auch zwei gleiche Meldungen hintereinander werden beide angezeigt
  liste.push({ typ, text, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
  speicher.set('flash', JSON.stringify(liste), { path: '/', maxAge: 60, sameSite: 'lax' });
}
