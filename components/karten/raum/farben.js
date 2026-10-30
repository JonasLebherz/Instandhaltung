'use client';
/**
 * components/karten/raum/farben.js – Farben der 3D-Ansicht aus den CSS-Variablen
 *
 * WebGL kann keine CSS-Variablen lesen. Deshalb werden die Werte (--raum-*, --rot …)
 * einmal ausgelesen und beim Umschalten hell/dunkel ("darstellungswechsel") neu geholt.
 * nacht = Dunkelmodus: Dann brennen Straßenlaternen und Hallenlicht.
 */
import { useEffect, useState } from 'react';

const NAMEN = ['umgebung', 'gelaende', 'strasse', 'markierung', 'wand', 'fenster', 'tor', 'dach-0', 'dach-1', 'dach-2', 'dach-3',
  'hallenboden', 'linie', 'maschine', 'maschine-dunkel', 'signal', 'glas', 'baum', 'stamm', 'buero', 'tank',
  'person-0', 'person-1', 'person-2', 'haut', 'ampel-rot', 'ampel-orange', 'ampel-gruen', 'licht'];

export function farbenLesen() {
  const stil = getComputedStyle(document.documentElement);
  const f = {};
  NAMEN.forEach((n) => { f[n] = stil.getPropertyValue(`--raum-${n}`).trim() || '#999999'; });
  ['rot', 'orange', 'blau', 'gruen', 'akzent'].forEach((n) => { f[n] = stil.getPropertyValue(`--${n}`).trim() || '#888888'; });
  f.nacht = document.documentElement.getAttribute('data-theme') === 'dark';
  return f;
}

/** Farben + "Bewegung erlaubt?" – aktualisiert sich bei hell/dunkel */
export function useRaum() {
  const [f, setF] = useState(farbenLesen);
  const [bewegt, setBewegt] = useState(true);
  useEffect(() => {
    const neu = () => setF(farbenLesen());
    window.addEventListener('darstellungswechsel', neu);
    setBewegt(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    return () => window.removeEventListener('darstellungswechsel', neu);
  }, []);
  return { f, bewegt };
}

/**
 * Ist das Element (Canvas) im sichtbaren Bereich? Sonst wird nicht gezeichnet –
 * spart Rechenzeit und Akku, z. B. wenn man auf der Seite weiter nach unten scrollt.
 */
export function useSichtbar(ref) {
  const [sichtbar, setSichtbar] = useState(true);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return undefined;
    const beobachter = new IntersectionObserver(([e]) => setSichtbar(e.isIntersecting));
    beobachter.observe(ref.current);
    return () => beobachter.disconnect();
  }, [ref]);
  return sichtbar;
}
