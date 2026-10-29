'use client';
/**
 * components/Navigation.js – Hauptnavigation oben
 *
 * Enthält: Logo, Seitenlinks (aktuelle Seite hervorgehoben), auf dem
 * Smartphone ein Menü-Knopf, die Auswahl Hell/Dunkel/Automatisch und das
 * Benutzermenü mit Abmelden.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { abmelden } from '@/app/login/aktionen';

const SEITEN = [
  { pfad: '/', text: 'Übersicht', symbol: 'bi-grid-1x2' },
  { pfad: '/melden', text: 'Störung melden', symbol: 'bi-exclamation-triangle' },
  { pfad: '/karte', text: 'Karte', symbol: 'bi-map' },
  { pfad: '/auftraege', text: 'Aufträge', symbol: 'bi-list-check' },
  { pfad: '/statistik', text: 'Statistik', symbol: 'bi-bar-chart' },
];

const DARSTELLUNGEN = [
  { wert: 'hell', text: 'Hell', symbol: 'bi-sun' },
  { wert: 'dunkel', text: 'Dunkel', symbol: 'bi-moon-stars' },
  { wert: 'automatisch', text: 'Automatisch', symbol: 'bi-circle-half' },
];

/** Setzt Hell/Dunkel am <html>-Element und informiert z. B. die Diagramme */
function darstellungAnwenden(wahl) {
  const dunkel = wahl === 'dunkel'
    || (wahl === 'automatisch' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const html = document.documentElement;
  html.setAttribute('data-theme', dunkel ? 'dark' : 'light');
  html.setAttribute('data-bs-theme', dunkel ? 'dark' : 'light');
  window.dispatchEvent(new Event('darstellungswechsel'));
}

export default function Navigation({ benutzer }) {
  const pfad = usePathname();
  const [menueOffen, setMenueOffen] = useState(false);
  const [offenesFenster, setOffenesFenster] = useState(null); // 'darstellung' | 'benutzer' | null
  const [darstellung, setDarstellung] = useState('automatisch');
  const navRef = useRef(null);

  // Gespeicherte Wahl beim Start lesen
  useEffect(() => {
    try {
      setDarstellung(localStorage.getItem('darstellung') ?? 'automatisch');
    } catch { /* z. B. privater Modus */ }
  }, []);

  // Bei "Automatisch" der Systemeinstellung folgen, auch wenn sie sich ändert
  useEffect(() => {
    if (darstellung !== 'automatisch') return undefined;
    const abfrage = window.matchMedia('(prefers-color-scheme: dark)');
    const folgen = () => darstellungAnwenden('automatisch');
    abfrage.addEventListener('change', folgen);
    return () => abfrage.removeEventListener('change', folgen);
  }, [darstellung]);

  // Menüs schließen bei Seitenwechsel, Klick daneben oder Escape-Taste
  useEffect(() => { setMenueOffen(false); setOffenesFenster(null); }, [pfad]);
  useEffect(() => {
    const klick = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setOffenesFenster(null); };
    const taste = (e) => { if (e.key === 'Escape') { setOffenesFenster(null); setMenueOffen(false); } };
    document.addEventListener('mousedown', klick);
    document.addEventListener('keydown', taste);
    return () => { document.removeEventListener('mousedown', klick); document.removeEventListener('keydown', taste); };
  }, []);

  function waehleDarstellung(wahl) {
    setDarstellung(wahl);
    try {
      if (wahl === 'automatisch') localStorage.removeItem('darstellung');
      else localStorage.setItem('darstellung', wahl);
    } catch { /* ignorieren */ }
    darstellungAnwenden(wahl);
    setOffenesFenster(null);
  }

  const aktuelleDarstellung = DARSTELLUNGEN.find((d) => d.wert === darstellung) ?? DARSTELLUNGEN[2];
  const istAktiv = (seite) => (seite.pfad === '/' ? pfad === '/' : pfad.startsWith(seite.pfad));

  return (
    <nav className="app-nav" ref={navRef} aria-label="Hauptnavigation">
      <div className="container nav-zeile">
        <Link href="/" className="marke">
          <span className="marke-symbol" aria-hidden="true"><i className="bi bi-wrench-adjustable" /></span>
          Instandhaltung
        </Link>

        <ul className={`nav-links${menueOffen ? ' offen' : ''}`} id="hauptmenue">
          {SEITEN.map((seite) => (
            <li key={seite.pfad}>
              <Link href={seite.pfad} className={istAktiv(seite) ? 'aktiv' : ''} title={seite.text}
                    aria-current={istAktiv(seite) ? 'page' : undefined}>
                <i className={`bi ${seite.symbol}`} aria-hidden="true" />
                <span className="nav-text">{seite.text}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="nav-werkzeuge">
          {/* Darstellung: Hell / Dunkel / Automatisch */}
          <div className="aufklapp">
            <button type="button" className="rund-knopf" aria-haspopup="menu"
                    aria-expanded={offenesFenster === 'darstellung'}
                    aria-label={`Darstellung: ${aktuelleDarstellung.text}`} title="Darstellung"
                    onClick={() => setOffenesFenster(offenesFenster === 'darstellung' ? null : 'darstellung')}>
              <i className={`bi ${aktuelleDarstellung.symbol}`} />
            </button>
            {offenesFenster === 'darstellung' && (
              <div className="aufklapp-menue" role="menu">
                <div className="menue-titel">Darstellung</div>
                {DARSTELLUNGEN.map((d) => (
                  <button key={d.wert} type="button" role="menuitemradio" aria-checked={darstellung === d.wert}
                          onClick={() => waehleDarstellung(d.wert)}>
                    <i className={`bi ${d.symbol}`} /> {d.text}
                    {darstellung === d.wert && <i className="bi bi-check2 haken" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Benutzer & Abmelden */}
          <div className="aufklapp">
            <button type="button" className="rund-knopf" aria-haspopup="menu"
                    aria-expanded={offenesFenster === 'benutzer'} aria-label="Benutzermenü" title={benutzer.email}
                    onClick={() => setOffenesFenster(offenesFenster === 'benutzer' ? null : 'benutzer')}>
              <i className="bi bi-person-circle" />
            </button>
            {offenesFenster === 'benutzer' && (
              <div className="aufklapp-menue" role="menu">
                <div className="menue-info">
                  {benutzer.anzeigename}
                  <small>{benutzer.email}</small>
                </div>
                <form action={abmelden}>
                  <button type="submit" role="menuitem"><i className="bi bi-box-arrow-right" /> Abmelden</button>
                </form>
              </div>
            )}
          </div>

          {/* Menü-Knopf nur auf schmalen Bildschirmen */}
          <button type="button" className="rund-knopf nav-menue-knopf" aria-controls="hauptmenue"
                  aria-expanded={menueOffen} aria-label="Menü ein-/ausblenden"
                  onClick={() => setMenueOffen(!menueOffen)}>
            <i className={`bi ${menueOffen ? 'bi-x-lg' : 'bi-list'}`} />
          </button>
        </div>
      </div>
    </nav>
  );
}
