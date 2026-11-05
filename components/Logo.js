/**
 * components/Logo.js – Bildmarke von „PitStop 01“
 *
 * Schlicht und dunkel: ein fast schwarzes, abgerundetes Quadrat, darin eine Stoppuhr als feine weiße Linie.
 * Der Körper der Uhr ist eine Sechskantmutter (= Instandhaltung, Schrauben, Anlagen in Ordnung halten),
 * oben die Krone der Stoppuhr, innen der Zeiger. Die drei Striche links sind Tempo-Linien: wie beim
 * Boxenstopp in der Formel 1 – kurz rein, reparieren, weiterfahren. Sie sind etwas zurückgenommen
 * (geringere Deckkraft), damit die Uhr das Hauptmotiv bleibt.
 * Fläche und Rand kommen aus dem CSS (.logo in app/globals.css, Variablen --logo-*), damit sich das Zeichen
 * auch im Dunkelmodus vom Hintergrund abhebt. Beim Darüberfahren dreht sich der Zeiger (.logo-zeiger).
 * Dieselbe Form liegt als Browser-Symbol in app/icon.svg.
 */
export const PRODUKTNAME = 'PitStop 01';

export default function Logo({ groesse = 32 }) {
  return (
    <span className="logo" style={{ '--logo-groesse': `${groesse}px` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round">
        {/* Uhrkörper als Sechskantmutter (flache Seite oben) */}
        <path d="M20 13.4 16.6 19.29 9.8 19.29 6.4 13.4 9.8 7.51 16.6 7.51Z" strokeWidth="1.5" />
        {/* Krone der Stoppuhr */}
        <path d="M13.2 7.5V5.2M11.5 4.9h3.4" strokeWidth="1.5" />
        {/* Zeiger (dreht sich beim Darüberfahren um die Mitte) */}
        <g className="logo-zeiger">
          <path d="M13.2 13.4 15.7 10.9" strokeWidth="1.5" />
          <circle cx="13.2" cy="13.4" r="1" fill="currentColor" stroke="none" />
        </g>
        {/* Tempo-Linien */}
        <path d="M2.6 11.2h2.4M2 14.2h2.2M2.9 17.2h2.3" strokeWidth="1.4" opacity=".6" />
      </svg>
    </span>
  );
}
