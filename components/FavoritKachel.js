'use client';
/**
 * components/FavoritKachel.js – Kachel „Favorit“ auf der Übersicht
 *
 * Zeigt eine angepinnte Kartenansicht (lib/favoriten.js) als kleines Kartenfenster, in 2D oder 3D wie angepinnt.
 *  - Leer: Feld „Favorit auswählen“. Ein Klick öffnet ein kleines Fenster mit der Liste der Favoriten.
 *  - Ohne Favoriten: Hinweis, zuerst in der Störungskarte eine Ansicht anzupinnen.
 *  - Ist eine Person gewählt und noch nichts ausgewählt, zeigt die Kachel „Mein Werk“ (Werk der Person).
 *  - Die Wahl steht in localStorage unter "uebersichtFavorit" (Adresse des Favoriten).
 * Die Kartendaten kommen erst bei Bedarf aus /api/kartendaten (die Übersicht selbst fragt nicht mehr ab).
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { useT } from './SpracheKontext';
import { startAusAdresse } from '@/lib/karten/adresse';
import { favoritenLesen, personFavorit, personAusBrowser, FAVORITEN_WECHSEL, FAVORIT_SYMBOLE } from '@/lib/favoriten';

// Die Karte wird nur geladen, wenn ein Favorit angezeigt wird (hält die Übersicht schlank)
const KartenExplorer = dynamic(() => import('./karten/KartenExplorer'), { ssr: false });
const SCHLUESSEL = 'uebersichtFavorit';

export default function FavoritKachel() {
  const t = useT();
  const [favoriten, setFavoriten] = useState(null);   // null = noch nicht gelesen (Server-Bild)
  const [gewaehlt, setGewaehlt] = useState(null);     // Adresse
  const [fenster, setFenster] = useState(false);
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    const lesen = () => {
      const alle = [...[personFavorit(personAusBrowser())].filter(Boolean), ...favoritenLesen()];
      setFavoriten(alle);
      let wahl = null;
      try { wahl = localStorage.getItem(SCHLUESSEL); } catch { /* privat */ }
      // Gewählter Favorit existiert nicht mehr → „Mein Werk“ bzw. nichts
      const passend = alle.find((f) => f.adresse === wahl) ?? alle.find((f) => f.person) ?? null;
      setGewaehlt(passend?.adresse ?? null);
    };
    lesen();
    window.addEventListener(FAVORITEN_WECHSEL, lesen);
    return () => window.removeEventListener(FAVORITEN_WECHSEL, lesen);
  }, []);

  // Kartendaten erst laden, wenn ein Favorit angezeigt wird
  useEffect(() => {
    if (!gewaehlt || daten) return undefined;
    let aktuell = true;
    fetch('/api/kartendaten').then((a) => (a.ok ? a.json() : Promise.reject())).then((d) => { if (aktuell) setDaten(d); })
      .catch(() => { if (aktuell) setFehler(true); });
    return () => { aktuell = false; };
  }, [gewaehlt, daten]);

  useEffect(() => {
    if (!fenster) return undefined;
    const taste = (e) => { if (e.key === 'Escape') setFenster(false); };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [fenster]);

  function waehlen(f) {
    try { localStorage.setItem(SCHLUESSEL, f.adresse); } catch { /* privat */ }
    setGewaehlt(f.adresse);
    setFenster(false);
  }

  const favorit = favoriten?.find((f) => f.adresse === gewaehlt) ?? null;
  const start = favorit && daten ? startAusAdresse(Object.fromEntries(new URL(favorit.adresse, 'http://x').searchParams), daten) : null;

  return (
    <section className="karte favorit-kachel" style={{ '--i': 6 }}>
      <div className="karte-kopf">
        <h2 className="abschnitt-titel"><i className="bi bi-star-fill favorit-kachel-stern" aria-hidden="true" /> {t('Favorit')}</h2>
        {favorit && (
          <span className="d-flex gap-3 align-items-center">
            <button type="button" className="link-knopf" onClick={() => setFenster(true)}>{t('Ändern')}</button>
            <Link href={favorit.adresse}>{t('In der Karte öffnen')}</Link>
          </span>
        )}
      </div>

      {favorit ? (
        <>
          <p className="klein mb-2">
            <i className={`bi ${favorit.person ? 'bi-house-door-fill' : FAVORIT_SYMBOLE[favorit.art] ?? 'bi-pin-angle'}`} aria-hidden="true" />{' '}
            {favorit.person ? t('Mein Werk: {name}', { name: favorit.name }) : favorit.name} · {favorit.ansicht === '3d' ? '3D' : '2D'}
          </p>
          {daten && start ? (
            // key: anderer Favorit → Karte beginnt neu in dessen Ansicht
            <KartenExplorer key={favorit.adresse} daten={daten} start={start} kompakt groesse="mittel" />
          ) : (
            <div className="favorit-kachel-laden">{fehler ? t('Die Karte konnte nicht geladen werden.') : <span className="leiste-laden aktiv" />}</div>
          )}
        </>
      ) : (
        <button type="button" className="favorit-kachel-leer" onClick={() => setFenster(true)} disabled={favoriten === null}>
          <i className="bi bi-plus-circle" aria-hidden="true" />
          <strong>{t('Favorit auswählen')}</strong>
          <span>{t('Eine angepinnte Kartenansicht hier als kleines Fenster zeigen')}</span>
        </button>
      )}

      {fenster && createPortal(
        <div className="dialog-hintergrund" onMouseDown={(e) => { if (e.target === e.currentTarget) setFenster(false); }}>
          <div className="dialog favorit-wahl" role="dialog" aria-modal="true" aria-label={t('Favorit auswählen')}>
            <div className="dialog-kopf">
              <h2 className="abschnitt-titel mb-0">{t('Favorit auswählen')}</h2>
              <button type="button" className="rund-knopf" onClick={() => setFenster(false)} aria-label={t('Schließen')}><i className="bi bi-x-lg" /></button>
            </div>
            {favoriten?.length ? (
              <ul className="ort-liste">
                {favoriten.map((f) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => waehlen(f)} aria-pressed={f.adresse === gewaehlt}>
                      <span className="favorit-symbol"><i className={`bi ${f.person ? 'bi-house-door-fill' : FAVORIT_SYMBOLE[f.art] ?? 'bi-pin-angle'}`} aria-hidden="true" /></span>
                      <span>
                        <span className="ort-titel">{f.person ? t('Mein Werk: {name}', { name: f.name }) : f.name}</span>
                        <span className="ort-unter">{f.ansicht === '3d' ? '3D' : '2D'}</span>
                      </span>
                      {f.adresse === gewaehlt && <i className="bi bi-check2 ms-auto" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="leer"><i className="bi bi-pin-angle" />{t('Bitte zuerst in der Störungskarte eine Ansicht anpinnen.')}</p>
            )}
            <Link href="/karte" className="btn btn-outline-secondary w-100 mt-3">{t('Zur Störungskarte')}</Link>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
