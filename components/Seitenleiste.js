'use client';
/**
 * components/Seitenleiste.js – Hauptnavigation links
 *
 * Zwei Zustände (gemerkt im Browser unter localStorage "seitenleiste"):
 *  - eingeklappt ("zu"): nur Symbole; beim Darüberfahren erscheint der Name daneben
 *  - aufgeklappt ("auf"): Symbole mit Text, gruppiert nach Bereichen
 * Der Zustand steht als Attribut data-leiste am <html>-Element. Ein kleines
 * Skript in app/layout.js setzt es schon vor dem ersten Anzeigen, damit nichts
 * springt. Ohne gespeicherte Wahl ist die Leiste auf großen Bildschirmen offen.
 *
 * Unten: Darstellung (Hell/Dunkel/Automatisch) und das Konto mit Abmelden.
 * Auf dem Smartphone gibt es stattdessen oben eine schmale Leiste mit
 * Menü-Knopf, die Seitenleiste fährt dann von links herein.
 */
import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { abmelden } from '@/app/login/aktionen';
import Logo from './Logo';

/** Seiten, nach Bereichen gruppiert. "symbolAktiv" ist die gefüllte Variante für die aktuelle Seite. */
const BEREICHE = [
  {
    titel: 'Überblick',
    seiten: [
      { pfad: '/', text: 'Übersicht', symbol: 'bi-grid-1x2', symbolAktiv: 'bi-grid-1x2-fill' },
      { pfad: '/karte', text: 'Störungskarte', symbol: 'bi-map', symbolAktiv: 'bi-map-fill' },
    ],
  },
  {
    titel: 'Instandhaltung',
    seiten: [
      { pfad: '/melden', text: 'Störung melden', symbol: 'bi-exclamation-triangle', symbolAktiv: 'bi-exclamation-triangle-fill' },
      { pfad: '/auftraege', text: 'Aufträge', symbol: 'bi-clipboard-check', symbolAktiv: 'bi-clipboard-check-fill', zaehler: true },
    ],
  },
  {
    titel: 'Auswertung',
    seiten: [
      { pfad: '/statistik', text: 'Statistik', symbol: 'bi-bar-chart', symbolAktiv: 'bi-bar-chart-fill' },
    ],
  },
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

/**
 * Kleiner drehender Ring um das Symbol, solange die angeklickte Seite lädt.
 * useLinkStatus funktioniert nur innerhalb eines <Link>.
 */
function LadeRing() {
  const { pending } = useLinkStatus();
  return <span className={`leiste-laden${pending ? ' aktiv' : ''}`} aria-hidden="true" />;
}

/** Initialen für das Konto-Symbol, z. B. "Jonas Lebherz" → "JL" */
function initialen(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((teil) => teil[0].toUpperCase()).join('') || '?';
}

export default function Seitenleiste({ benutzer }) {
  const pfad = usePathname();
  const [aufgeklappt, setAufgeklappt] = useState(false);
  const [mobilOffen, setMobilOffen] = useState(false);
  const [fenster, setFenster] = useState(null);           // 'darstellung' | 'konto' | null
  const [darstellung, setDarstellung] = useState('automatisch');
  const [offeneAuftraege, setOffeneAuftraege] = useState(null);   // Zahl neben "Aufträge"
  const leisteRef = useRef(null);

  // Beim Start: Zustand der Leiste (vom Skript im Layout gesetzt) und gespeicherte Darstellung übernehmen
  useEffect(() => {
    setAufgeklappt(document.documentElement.getAttribute('data-leiste') === 'auf');
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

  // Zahl offener Aufträge im Hintergrund holen – beim Start und nach jedem Seitenwechsel
  useEffect(() => {
    let aktuell = true;
    fetch('/api/offene-auftraege', { cache: 'no-store' })
      .then((antwort) => (antwort.ok ? antwort.json() : null))
      .then((daten) => { if (aktuell && daten) setOffeneAuftraege(daten.anzahl); })
      .catch(() => { /* ohne Zahl weiter */ });
    return () => { aktuell = false; };
  }, [pfad]);

  // Menüs schließen bei Seitenwechsel, Klick daneben oder Escape-Taste
  useEffect(() => { setMobilOffen(false); setFenster(null); }, [pfad]);
  useEffect(() => {
    const klick = (e) => { if (leisteRef.current && !leisteRef.current.contains(e.target)) setFenster(null); };
    const taste = (e) => { if (e.key === 'Escape') { setFenster(null); setMobilOffen(false); } };
    document.addEventListener('mousedown', klick);
    document.addEventListener('keydown', taste);
    return () => { document.removeEventListener('mousedown', klick); document.removeEventListener('keydown', taste); };
  }, []);

  function umschalten() {
    const neu = !aufgeklappt;
    setAufgeklappt(neu);
    setFenster(null);
    document.documentElement.setAttribute('data-leiste', neu ? 'auf' : 'zu');
    try { localStorage.setItem('seitenleiste', neu ? 'auf' : 'zu'); } catch { /* ignorieren */ }
  }

  function waehleDarstellung(wahl) {
    setDarstellung(wahl);
    try {
      if (wahl === 'automatisch') localStorage.removeItem('darstellung');
      else localStorage.setItem('darstellung', wahl);
    } catch { /* ignorieren */ }
    darstellungAnwenden(wahl);
    setFenster(null);
  }

  const aktuelleDarstellung = DARSTELLUNGEN.find((d) => d.wert === darstellung) ?? DARSTELLUNGEN[2];
  const istAktiv = (seite) => (seite.pfad === '/' ? pfad === '/' : pfad.startsWith(seite.pfad));

  return (
    <>
      {/* Nur auf dem Smartphone: schmale Leiste oben mit Menü-Knopf */}
      <header className="mobil-kopf">
        <Link href="/" className="leiste-marke"><Logo groesse={30} /> Instandhaltung</Link>
        <button type="button" className="rund-knopf" aria-controls="seitenleiste" aria-expanded={mobilOffen}
                aria-label="Menü öffnen" onClick={() => setMobilOffen(true)}>
          <i className="bi bi-list" />
        </button>
      </header>
      {mobilOffen && <div className="leiste-hintergrund" onClick={() => setMobilOffen(false)} aria-hidden="true" />}

      <aside id="seitenleiste" ref={leisteRef} className={`seitenleiste${mobilOffen ? ' mobil-offen' : ''}`}
             aria-label="Hauptnavigation">
        <div className="leiste-kopf">
          <Link href="/" className="leiste-marke" aria-label="Instandhaltung – zur Übersicht">
            <Logo groesse={36} />
            <span className="leiste-text">Instandhaltung</span>
          </Link>
          <button type="button" className="rund-knopf leiste-schliessen" aria-label="Menü schließen"
                  onClick={() => setMobilOffen(false)}>
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* Einklappen / Aufklappen – runder Knopf am rechten Rand */}
        <button type="button" className="leiste-umschalter" onClick={umschalten} aria-controls="seitenleiste"
                aria-expanded={aufgeklappt} aria-label={aufgeklappt ? 'Seitenleiste einklappen' : 'Seitenleiste aufklappen'}
                title={aufgeklappt ? 'Einklappen' : 'Aufklappen'}>
          <i className="bi bi-chevron-left" />
        </button>

        <nav className="leiste-nav">
          {BEREICHE.map((bereich) => (
            <div key={bereich.titel} className="leiste-bereich">
              <div className="leiste-titel"><span>{bereich.titel}</span></div>
              <ul>
                {bereich.seiten.map((seite) => {
                  const aktiv = istAktiv(seite);
                  const zahl = seite.zaehler && offeneAuftraege > 0 ? offeneAuftraege : null;
                  return (
                    <li key={seite.pfad}>
                      <Link href={seite.pfad} className={`leiste-link${aktiv ? ' aktiv' : ''}`}
                            onClick={() => setMobilOffen(false)}
                            aria-current={aktiv ? 'page' : undefined}
                            // Eingeklappt ist der Text unsichtbar – der Name für Screenreader steht deshalb hier
                            aria-label={zahl ? `${seite.text} (${zahl} offen)` : seite.text}>
                        <span className="leiste-symbol">
                          <i className={`bi ${aktiv ? seite.symbolAktiv : seite.symbol}`} aria-hidden="true" />
                          <LadeRing />
                          {zahl && <span className="leiste-punkt" aria-hidden="true">{zahl}</span>}
                        </span>
                        <span className="leiste-text">
                          {seite.text}
                          {zahl && <span className="leiste-zahl" aria-hidden="true">{zahl}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="leiste-fuss">
          {/* Darstellung: Hell / Dunkel / Automatisch */}
          <div className="aufklapp">
            <button type="button" className="leiste-link" aria-haspopup="menu" aria-expanded={fenster === 'darstellung'}
                    aria-label={`Darstellung: ${aktuelleDarstellung.text}`}
                    onClick={() => setFenster(fenster === 'darstellung' ? null : 'darstellung')}>
              <span className="leiste-symbol"><i className={`bi ${aktuelleDarstellung.symbol}`} aria-hidden="true" /></span>
              <span className="leiste-text">
                Darstellung
                <span className="leiste-wert">{aktuelleDarstellung.text}</span>
              </span>
            </button>
            {fenster === 'darstellung' && (
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

          {/* Konto & Abmelden */}
          <div className="aufklapp">
            <button type="button" className="leiste-link leiste-konto" aria-haspopup="menu" aria-expanded={fenster === 'konto'}
                    aria-label={`Konto: ${benutzer.anzeigename}`}
                    onClick={() => setFenster(fenster === 'konto' ? null : 'konto')}>
              <span className="leiste-symbol"><span className="leiste-avatar">{initialen(benutzer.anzeigename)}</span></span>
              <span className="leiste-text">
                <span className="konto-name">
                  {benutzer.anzeigename}
                  <small>{benutzer.email}</small>
                </span>
                <i className="bi bi-chevron-expand" aria-hidden="true" />
              </span>
            </button>
            {fenster === 'konto' && (
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
        </div>
      </aside>
    </>
  );
}
