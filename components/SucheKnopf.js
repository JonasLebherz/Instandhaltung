'use client';
/**
 * components/SucheKnopf.js – Knopf, der das Suchfenster (components/Suche.js) öffnet
 * (Ereignis `suche-oeffnen`). Z. B. auf der Seite „nicht gefunden“.
 */
import { useT } from './SpracheKontext';

export default function SucheKnopf({ className = 'btn btn-sekundaer' }) {
  const t = useT();
  return (
    <button type="button" className={`${className} suche-knopf`} onClick={() => window.dispatchEvent(new Event('suche-oeffnen'))}>
      <i className="bi bi-search" aria-hidden="true" /> {t('Suchen')} <kbd>Strg K</kbd>
    </button>
  );
}
