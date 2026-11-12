/**
 * lib/eingabe.js – Eingaben aus der Adresse prüfen
 *
 * Nummern (IDs) kommen als Text aus der Adresse, z. B. /auftraege/12 oder ?maschine=7.
 * In der Datenbank sind IDs vom Typ INTEGER (höchstens 2 147 483 647). Eine längere Ziffernfolge
 * wie /auftraege/999999999999 besteht zwar nur aus Ziffern, würde in der Abfrage aber einen
 * Datenbankfehler auslösen (Serverfehler 500 statt „Nicht gefunden“). Deshalb hier zentral:
 * nur 1 bis 9 Ziffern gelten als ID – das passt immer in INTEGER.
 */

/** ID aus einem Text: Zahl (1 … 999 999 999) oder null bei allem anderen */
export function idAus(wert) {
  return typeof wert === 'string' && /^\d{1,9}$/.test(wert) && Number(wert) > 0 ? Number(wert) : null;
}
