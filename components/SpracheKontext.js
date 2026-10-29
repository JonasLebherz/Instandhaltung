'use client';
/**
 * components/SpracheKontext.js – Sprache für Client-Komponenten
 *
 * app/layout.js legt die Sprache aus dem Cookie hier hinein. Client-Komponenten
 * holen sich dann die Übersetzungsfunktion mit
 *
 *     const t = useT();
 *     t('Speichern')
 *
 * spracheWechseln() schreibt das Cookie und lädt die Daten der Seite neu
 * (router.refresh) – ohne die ganze Seite neu aufzubauen.
 */
import { createContext, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { uebersetzerFuer } from '@/lib/sprache';

const SpracheKontext = createContext('de');

export function SpracheProvider({ sprache, children }) {
  return <SpracheKontext.Provider value={sprache}>{children}</SpracheKontext.Provider>;
}

/** 'de' oder 'en' */
export function useSprache() {
  return useContext(SpracheKontext);
}

/** Übersetzungsfunktion t(text, werte) für die aktuelle Sprache */
export function useT() {
  const sprache = useSprache();
  return useMemo(() => uebersetzerFuer(sprache), [sprache]);
}

/** Liefert eine Funktion, die die Sprache umstellt (Cookie für ein Jahr) */
export function useSpracheWechseln() {
  const router = useRouter();
  return (neu) => {
    document.cookie = `sprache=${neu === 'en' ? 'en' : 'de'}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = neu;
    router.refresh();
  };
}
