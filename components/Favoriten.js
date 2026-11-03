'use client';
/**
 * components/Favoriten.js – angepinnte Kartenansichten in der Seitenleiste (unter „Störungskarte“)
 *
 * Angelegt werden Favoriten nur über den Pin-Knopf in der Karte. Hier: öffnen (Link auf die Kartenadresse
 * mit Ebene und 2D/3D), umbenennen (Stift → Eingabefeld, Enter speichert, Escape bricht ab) und entfernen.
 * Eingeklappte Leiste: nur das Symbol, der Name erscheint als Sprechblase (wie bei den anderen Einträgen).
 * Ein gerade angepinnter Favorit „landet“ mit einer kurzen Animation (Klasse favorit-neu).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useT } from './SpracheKontext';
import {
  favoritenLesen, favoritEntfernen, favoritUmbenennen, FAVORITEN_WECHSEL, FAVORIT_OEFFNEN, FAVORIT_SYMBOLE, MAX_FAVORITEN,
} from '@/lib/favoriten';

export default function Favoriten({ onOeffnen }) {
  const t = useT();
  const [liste, setListe] = useState([]);
  const [bearbeiten, setBearbeiten] = useState(null);   // ID des Favoriten, der gerade umbenannt wird
  const [neu, setNeu] = useState(null);                 // ID des zuletzt angepinnten Favoriten
  const bekannt = useRef(null);
  const pfad = usePathname();

  // Ist die Karte schon offen, springt sie selbst (mit kurzer Überblendung) in die Ansicht des Favoriten –
  // ohne Neuladen. Sonst normaler Seitenwechsel auf die Adresse.
  function oeffnen(e, f) {
    onOeffnen?.();
    if (pfad === '/karte') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(FAVORIT_OEFFNEN, { detail: f.adresse }));
    }
  }

  useEffect(() => {
    const lesen = () => {
      const l = favoritenLesen();
      // Neuer Eintrag (nicht beim ersten Lesen): kurz hervorheben
      if (bekannt.current) {
        const hinzu = l.find((f) => !bekannt.current.has(f.id));
        if (hinzu) setNeu(hinzu.id);
      }
      bekannt.current = new Set(l.map((f) => f.id));
      setListe(l);
    };
    lesen();
    window.addEventListener(FAVORITEN_WECHSEL, lesen);
    window.addEventListener('storage', lesen);   // Änderungen in einem anderen Tab
    return () => { window.removeEventListener(FAVORITEN_WECHSEL, lesen); window.removeEventListener('storage', lesen); };
  }, []);

  return (
    <li className="favoriten" data-favoriten-ziel="">
      <div className="favoriten-titel">
        <span>{t('Favoriten')}</span>
        {liste.length > 0 && <span className="favoriten-anzahl">{liste.length}/{MAX_FAVORITEN}</span>}
      </div>
      {liste.length === 0 ? (
        <p className="favoriten-leer">
          <i className="bi bi-pin-angle" aria-hidden="true" /> {t('Ansicht in der Karte mit dem Pin anheften')}
        </p>
      ) : (
        <ul>
          {liste.map((f) => (
            <li key={f.id} data-favorit-id={f.id} className={`favorit${f.id === neu ? ' favorit-neu' : ''}`}>
              {bearbeiten === f.id ? (
                <form className="favorit-bearbeiten" onSubmit={(e) => { e.preventDefault(); favoritUmbenennen(f.id, e.currentTarget.elements.name.value); setBearbeiten(null); }}>
                  <input name="name" defaultValue={f.name} maxLength={60} autoFocus aria-label={t('Neuer Name')}
                         onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setBearbeiten(null); } }}
                         onBlur={(e) => { favoritUmbenennen(f.id, e.target.value); setBearbeiten(null); }} />
                </form>
              ) : (
                <>
                  <Link href={f.adresse} className="leiste-link favorit-link" onClick={(e) => oeffnen(e, f)}
                        aria-label={`${f.name} (${f.ansicht === '3d' ? '3D' : '2D'})`}>
                    <span className="leiste-symbol">
                      <span className="favorit-symbol"><i className={`bi ${FAVORIT_SYMBOLE[f.art] ?? 'bi-pin-angle'}`} aria-hidden="true" /></span>
                    </span>
                    <span className="leiste-text">
                      <span className="favorit-name">{f.name}</span>
                      <span className="favorit-ansicht">{f.ansicht === '3d' ? '3D' : '2D'}</span>
                    </span>
                  </Link>
                  <span className="favorit-aktionen">
                    <button type="button" onClick={() => setBearbeiten(f.id)} aria-label={t('„{name}“ umbenennen', { name: f.name })} title={t('Umbenennen')}>
                      <i className="bi bi-pencil" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => favoritEntfernen(f.id)} aria-label={t('„{name}“ entfernen', { name: f.name })} title={t('Entfernen')}>
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
