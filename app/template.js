/**
 * app/template.js – wird bei jedem Seitenwechsel neu erzeugt
 *
 * Dadurch startet die Einblend-Animation (.seiten-einstieg) bei jedem
 * Wechsel zwischen den Seiten erneut.
 */
export default function Template({ children }) {
  return <div className="seiten-einstieg">{children}</div>;
}
