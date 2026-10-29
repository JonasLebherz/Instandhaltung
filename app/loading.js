/**
 * app/loading.js – Anzeige, während eine Seite geladen wird
 *
 * Erscheint sofort nach einem Klick, bis die Daten vom Server da sind.
 * So sieht man, dass etwas passiert – auch wenn die Datenbank mal länger braucht.
 */
export default function Laden() {
  return (
    <div className="lade-seite" role="status" aria-live="polite">
      <span className="lade-kreis" aria-hidden="true" />
      <span>Wird geladen …</span>
    </div>
  );
}
