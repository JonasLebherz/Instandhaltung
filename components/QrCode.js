/**
 * components/QrCode.js – QR-Code als SVG (ohne Bilddatei, gestochen scharf beim Drucken)
 *
 * Erzeugt mit der Bibliothek "qrcode-generator" (Fehlerkorrektur M = 15 % dürfen fehlen,
 * z. B. bei Kratzern auf dem Etikett). Funktioniert auf dem Server und im Browser.
 * Farben: Für zuverlässiges Scannen immer dunkel auf hell – auch im Dunkelmodus
 * (CSS-Variablen --qr-dunkel / --qr-hell, in beiden Darstellungen gleich).
 */
import qrcode from 'qrcode-generator';

export default function QrCode({ text, titel, className = '' }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const rand = 4;   // Ruhezone: 4 Module Rand sind für Scanner vorgeschrieben
  // Alle dunklen Module als ein Pfad (ein Quadrat je Modul) – klein und schnell
  let pfad = '';
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) if (qr.isDark(y, x)) pfad += `M${x + rand} ${y + rand}h1v1h-1z`;
  }
  const g = n + rand * 2;
  return (
    <svg className={`qr-code ${className}`} viewBox={`0 0 ${g} ${g}`} role="img" aria-label={titel ?? text} shapeRendering="crispEdges">
      <rect width={g} height={g} fill="var(--qr-hell)" />
      <path d={pfad} fill="var(--qr-dunkel)" />
    </svg>
  );
}
