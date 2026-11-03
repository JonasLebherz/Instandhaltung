'use client';
/**
 * lib/ton.js – leises „Wusch“ bei Kamerafahrten der Karte
 *
 * Kein Tondatei-Download: Der Klang entsteht im Browser (Web Audio) aus Rauschen, das durch einen
 * Bandpass-Filter läuft. Rein: Filter fährt nach oben (heller werdend), raus: nach unten,
 * sanft (Werk ↔ Halle, 3D → 2D): kürzer und leiser.
 * Abschaltbar über den Lautsprecher-Knopf in der Karte; die Wahl steht in localStorage unter "kartenton".
 * Browser spielen Töne erst nach einer Nutzeraktion – die Kamerafahrten folgen immer auf einen Klick.
 */
let kontext = null;
let rauschen = null;

export function tonAn() {
  try { return localStorage.getItem('kartenton') !== 'aus'; } catch { return true; }
}

export function tonSetzen(an) {
  try { localStorage.setItem('kartenton', an ? 'an' : 'aus'); } catch { /* privat: nicht merken */ }
  window.dispatchEvent(new Event('kartentonwechsel'));
}

export function ton(art = 'rein') {
  if (typeof window === 'undefined' || !tonAn()) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  try {
    kontext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (kontext.state === 'suspended') kontext.resume();
    if (!rauschen) {
      rauschen = kontext.createBuffer(1, kontext.sampleRate * 1.5, kontext.sampleRate);
      const d = rauschen.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    }
    const dauer = art === 'sanft' ? 0.55 : 0.85;
    const lautstaerke = art === 'sanft' ? 0.05 : 0.09;
    const jetzt = kontext.currentTime;
    const quelle = kontext.createBufferSource();
    quelle.buffer = rauschen;
    const filter = kontext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    const [von, bis] = art === 'raus' ? [1800, 320] : art === 'sanft' ? [500, 1200] : [320, 2000];
    filter.frequency.setValueAtTime(von, jetzt);
    filter.frequency.exponentialRampToValueAtTime(bis, jetzt + dauer);
    const huelle = kontext.createGain();
    huelle.gain.setValueAtTime(0.0001, jetzt);
    huelle.gain.exponentialRampToValueAtTime(lautstaerke, jetzt + dauer * 0.35);
    huelle.gain.exponentialRampToValueAtTime(0.0001, jetzt + dauer);
    quelle.connect(filter).connect(huelle).connect(kontext.destination);
    quelle.start(jetzt);
    quelle.stop(jetzt + dauer + 0.05);
  } catch { /* ohne Ton weiter */ }
}
