/**
 * components/Logo.js – Bildmarke der Anwendung
 *
 * Ein abgerundetes Quadrat in der Akzentfarbe, darin ein Sechseck (Form einer
 * Schraubenmutter = Technik) mit einer Pulslinie (= Zustand der Maschinen).
 * Die Fläche kommt aus dem CSS (.logo in app/globals.css), damit sie im
 * Dunkelmodus automatisch die passende Akzentfarbe bekommt.
 * Dieselbe Form liegt als Browser-Symbol in app/icon.svg.
 */
export default function Logo({ groesse = 32 }) {
  return (
    <span className="logo" style={{ '--logo-groesse': `${groesse}px` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6Z" strokeWidth="1.6" />
        <path d="M6.6 12.4h2.9l1.4-3 2.4 6 1.5-3h2.6" strokeWidth="1.7" />
      </svg>
    </span>
  );
}
