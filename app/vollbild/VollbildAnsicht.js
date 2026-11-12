'use client';
/**
 * app/vollbild/VollbildAnsicht.js – Kopf und Karte des Vollbildmodus
 * Setzt <html data-vollbild="an"> (blendet Seitenleiste und Kopf aus, wie beim Hallen-Monitor) und
 * nimmt es beim Verlassen wieder weg. Die Karte führt die Adresse mit (?land, ?werk, ?halle).
 */
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import KartenExplorer from '@/components/karten/KartenExplorer';
import { useT } from '@/components/SpracheKontext';

export default function VollbildAnsicht({ daten, start }) {
  const t = useT();
  const router = useRouter();
  useEffect(() => {
    document.documentElement.dataset.vollbild = 'an';
    // Daten jede Minute neu laden, solange die Seite sichtbar ist
    const takt = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, 60000);
    return () => { delete document.documentElement.dataset.vollbild; clearInterval(takt); };
  }, [router]);
  const bildschirm = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  return (
    <div className="vollbild">
      <header className="monitor-kopf">
        <h1>{t('Vollbildmodus')}</h1>
        <div className="monitor-knoepfe ms-auto">
          <button type="button" className="rund-knopf" onClick={bildschirm} title={t('Vollbild')} aria-label={t('Vollbild')}><i className="bi bi-arrows-fullscreen" /></button>
          <Link href="/karte" className="rund-knopf vollbild-schliessen" title={t('Zurück zur Karte')} aria-label={t('Zurück zur Karte')}><i className="bi bi-x-lg" /></Link>
        </div>
      </header>
      <KartenExplorer daten={daten} start={start} adresseMitfuehren vollbild />
    </div>
  );
}
