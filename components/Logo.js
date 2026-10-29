/**
 * components/Logo.js – Bildmarke der Anwendung
 *
 * Ein abgerundetes Quadrat in der Akzentfarbe, darin ein Schild (= Anlagen
 * schützen und verfügbar halten) mit einer Pulslinie (= Zustand der Maschinen).
 * Die Fläche kommt aus dem CSS (.logo in app/globals.css), damit sie im
 * Dunkelmodus automatisch die passende Akzentfarbe bekommt.
 * Dieselbe Form liegt als Browser-Symbol in app/icon.svg.
 */
export default function Logo({ groesse = 32 }) {
  return (
    <span className="logo" style={{ '--logo-groesse': `${groesse}px` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 4.5 6v5.6c0 4.4 3.1 8.2 7.5 9.4 4.4-1.2 7.5-5 7.5-9.4V6Z" strokeWidth="1.6" />
        <path d="M7.6 12.6h2.3l1.3-2.8 2 5.2 1.3-2.4h1.9" strokeWidth="1.7" />
      </svg>
    </span>
  );
}
