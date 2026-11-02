/**
 * components/Logo.js – Bildmarke der Anwendung
 *
 * Schlicht und dunkel: ein fast schwarzes, abgerundetes Quadrat, darin eine
 * Sechskantmutter als feine weiße Linie (= Instandhaltung, Schrauben, Anlagen
 * in Ordnung halten). Fläche und Rand kommen aus dem CSS (.logo in
 * app/globals.css, Variablen --logo-*), damit sich das Zeichen auch im
 * Dunkelmodus vom Hintergrund abhebt.
 * Dieselbe Form liegt als Browser-Symbol in app/icon.svg.
 */
export default function Logo({ groesse = 32 }) {
  return (
    <span className="logo" style={{ '--logo-groesse': `${groesse}px` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinejoin="round">
        <path d="M12 4.2 18.75 8.1v7.8L12 19.8 5.25 15.9V8.1Z" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="2.7" strokeWidth="1.5" />
      </svg>
    </span>
  );
}
