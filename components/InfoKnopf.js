'use client';
/**
 * components/InfoKnopf.js – kleiner „i“-Knopf: Woher kommt dieser Wert, und wie wird er berechnet?
 *
 * Beispiel (Statistik):
 *   <InfoKnopf titel={t('MTTR')} info={STATISTIK_INFO.mttr} grundlage={STATISTIK_GRUNDLAGE} />
 *
 * Klick öffnet ein kleines Fenster mit:
 *   - „Daten aus“: den Tabellen der Datenbank (als Code-Schild, Link zur Seite „Datenbasis“)
 *   - „Berechnung“: Erklärung in einem Satz und die Kurzformel mit den Spaltennamen
 *   - „Grundlage“: was für alle Werte gilt (z. B. Zeitraum)
 * Das Fenster liegt per Portal direkt in <body> und fest im Fenster (position: fixed) – so schneidet
 * keine Karte es ab, und die Zoom-Animation der Statistik (transform) verschiebt es nicht.
 * Beim Scrollen wandert es mit dem Knopf mit (verschwindet der Knopf aus dem Bild, schließt es).
 * Schließen: noch einmal klicken, daneben klicken, Esc oder Fenstergröße ändern.
 */
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/components/SpracheKontext';

const BREITE = 320;   // Breite des Fensters in px (auf dem Handy kleiner, siehe unten)

export default function InfoKnopf({ titel, info, grundlage }) {
  const t = useT();
  const knopf = useRef(null);
  const fenster = useRef(null);
  const id = useId();
  const [lage, setLage] = useState(null);   // { links, oben } oder null = geschlossen

  /** Lage aus dem Knopf: darunter, linksbündig, nie über den Fensterrand; passt es unten nicht, darüber. null = Knopf nicht im Bild */
  const positionieren = useCallback(() => {
    const r = knopf.current?.getBoundingClientRect();
    if (!r || r.bottom < 0 || r.top > window.innerHeight) return null;
    const breite = Math.min(BREITE, window.innerWidth - 24);
    const links = Math.max(12, Math.min(r.left - 12, window.innerWidth - breite - 12));
    const hoehe = fenster.current?.offsetHeight ?? 0;   // erst nach dem ersten Zeichnen bekannt
    let oben = r.bottom + 8;
    if (hoehe && oben + hoehe > window.innerHeight - 12) oben = Math.max(12, r.top - hoehe - 8);
    return { links, oben, breite, gemessen: hoehe > 0 };
  }, []);

  function umschalten() {
    setLage(lage ? null : positionieren());
  }

  // Nach dem ersten (unsichtbaren) Zeichnen ist die Höhe bekannt – jetzt endgültig platzieren
  useEffect(() => {
    if (lage && !lage.gemessen) setLage(positionieren());
  }, [lage, positionieren]);

  useEffect(() => {
    if (!lage) return undefined;
    const zu = () => setLage(null);
    const mitwandern = () => setLage(positionieren());
    const klick = (e) => { if (!fenster.current?.contains(e.target) && !knopf.current?.contains(e.target)) zu(); };
    const taste = (e) => { if (e.key === 'Escape') { zu(); knopf.current?.focus(); } };
    document.addEventListener('mousedown', klick);
    document.addEventListener('keydown', taste);
    window.addEventListener('resize', zu);
    window.addEventListener('scroll', mitwandern, { passive: true });
    return () => {
      document.removeEventListener('mousedown', klick);
      document.removeEventListener('keydown', taste);
      window.removeEventListener('resize', zu);
      window.removeEventListener('scroll', mitwandern);
    };
  }, [lage, positionieren]);

  if (!info) return null;
  return (
    <>
      <button ref={knopf} type="button" className={`info-knopf${lage ? ' offen' : ''}`} onClick={umschalten}
              aria-expanded={Boolean(lage)} aria-controls={lage ? id : undefined}
              aria-label={t('Woher kommt „{titel}“?', { titel })} title={t('Quelle und Berechnung')}>
        <i className="bi bi-info" aria-hidden="true" />
      </button>
      {lage && createPortal(
        <div ref={fenster} id={id} className="info-fenster" role="dialog" aria-label={titel}
             style={{ left: lage.links, top: lage.oben, width: lage.breite, visibility: lage.gemessen ? 'visible' : 'hidden' }}>
          <div className="info-titel">{titel}</div>
          <div className="info-abschnitt">
            <span className="info-label">{t('Daten aus')}</span>
            <span className="info-tabellen">
              {info.tabellen.map((tabelle) => <code key={tabelle}>{tabelle}</code>)}
            </span>
          </div>
          <div className="info-abschnitt">
            <span className="info-label">{t('Berechnung')}</span>
            <p>{t(info.berechnung)}</p>
            {info.formel && <pre className="info-formel">{info.formel}</pre>}
          </div>
          {grundlage && <p className="info-grundlage">{t(grundlage)}</p>}
          <Link href="/datenbasis" className="info-link">{t('Tabellen in der Datenbasis ansehen')} <i className="bi bi-arrow-right" aria-hidden="true" /></Link>
        </div>,
        document.body,
      )}
    </>
  );
}
