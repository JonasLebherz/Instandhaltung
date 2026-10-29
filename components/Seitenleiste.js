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
 * Unten: Sprache (Deutsch/Englisch), Darstellung (Hell/Dunkel/Automatisch)
 * und das Konto. Das Konto zeigt die echte Anmeldung (E-Mail) und die
 * gewählte fiktive Person mit Rolle und Werk (siehe lib/person.js). Über
 * „Person wechseln …“ öffnet sich die Auswahl (components/PersonWahl.js).
 * Auf dem Smartphone gibt es stattdessen oben eine schmale Leiste mit
 * Menü-Knopf, die Seitenleiste fährt dann von links herein.
 */
import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { abmelden } from '@/app/login/aktionen';
import { SPRACHEN, T } from '@/lib/sprache';
import { useSprache, useSpracheWechseln, useT } from './SpracheKontext';
import Logo from './Logo';
import PersonWahl, { RollenAbzeichen, PERSON_WAEHLEN } from './PersonWahl';
import AnsichtWahl from './AnsichtWahl';

/** Seiten, nach Bereichen gruppiert. "symbolAktiv" ist die gefüllte Variante für die aktuelle Seite. */
// Texte mit T() markiert – übersetzt werden sie beim Anzeigen mit t()
const BEREICHE = [
  {
    titel: T('Überblick'),
    seiten: [
      { pfad: '/', text: T('Übersicht'), symbol: 'bi-grid-1x2', symbolAktiv: 'bi-grid-1x2-fill' },
      { pfad: '/karte', text: T('Störungskarte'), symbol: 'bi-map', symbolAktiv: 'bi-map-fill' },
    ],
  },
  {
    titel: T('Instandhaltung'),
    seiten: [
      { pfad: '/melden', text: T('Störung melden'), symbol: 'bi-exclamation-triangle', symbolAktiv: 'bi-exclamation-triangle-fill' },
      { pfad: '/auftraege', text: T('Aufträge'), symbol: 'bi-clipboard-check', symbolAktiv: 'bi-clipboard-check-fill', zaehler: true },
    ],
  },
  {
    titel: T('Auswertung'),
    seiten: [
      { pfad: '/statistik', text: T('Statistik'), symbol: 'bi-bar-chart', symbolAktiv: 'bi-bar-chart-fill' },
    ],
  },
  {
    titel: T('System'),
    seiten: [
      { pfad: '/datenbasis', text: T('Datenbasis'), symbol: 'bi-database', symbolAktiv: 'bi-database-fill' },
    ],
  },
];

const DARSTELLUNGEN = [
  { wert: 'hell', text: T('Hell'), symbol: 'bi-sun' },
  { wert: 'dunkel', text: T('Dunkel'), symbol: 'bi-moon-stars' },
  { wert: 'automatisch', text: T('Automatisch'), symbol: 'bi-circle-half' },
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

export default function Seitenleiste({ benutzer, person, ansicht }) {
  const pfad = usePathname();
  const t = useT();
  const sprache = useSprache();
  const spracheWechseln = useSpracheWechseln();
  const [aufgeklappt, setAufgeklappt] = useState(false);
  const [mobilOffen, setMobilOffen] = useState(false);
  const [fenster, setFenster] = useState(null);           // 'sprache' | 'darstellung' | 'konto' | null
  const [darstellung, setDarstellung] = useState('automatisch');
  const [offeneAuftraege, setOffeneAuftraege] = useState(null);   // Zahl neben "Aufträge"
  const [personWahl, setPersonWahl] = useState(false);            // Fenster "Person wechseln"
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

  // Andere Stellen (z. B. die Übersicht) können die Personenwahl über ein Ereignis öffnen
  useEffect(() => {
    const oeffnen = () => setPersonWahl(true);
    window.addEventListener(PERSON_WAEHLEN, oeffnen);
    return () => window.removeEventListener(PERSON_WAEHLEN, oeffnen);
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
        <Link href="/" className="leiste-marke"><Logo groesse={30} /> {t('Instandhaltung')}</Link>
        <button type="button" className="rund-knopf" aria-controls="seitenleiste" aria-expanded={mobilOffen}
                aria-label={t('Menü öffnen')} onClick={() => setMobilOffen(true)}>
          <i className="bi bi-list" />
        </button>
      </header>
      {mobilOffen && <div className="leiste-hintergrund" onClick={() => setMobilOffen(false)} aria-hidden="true" />}

      <aside id="seitenleiste" ref={leisteRef} className={`seitenleiste${mobilOffen ? ' mobil-offen' : ''}`}
             aria-label={t('Hauptnavigation')}>
        <div className="leiste-kopf">
          <Link href="/" className="leiste-marke" aria-label={t('Instandhaltung – zur Übersicht')}>
            <Logo groesse={36} />
            <span className="leiste-text">{t('Instandhaltung')}</span>
          </Link>
          <button type="button" className="rund-knopf leiste-schliessen" aria-label={t('Menü schließen')}
                  onClick={() => setMobilOffen(false)}>
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* Einklappen / Aufklappen – runder Knopf am rechten Rand */}
        <button type="button" className="leiste-umschalter" onClick={umschalten} aria-controls="seitenleiste"
                aria-expanded={aufgeklappt} aria-label={aufgeklappt ? t('Seitenleiste einklappen') : t('Seitenleiste aufklappen')}
                title={aufgeklappt ? t('Einklappen') : t('Aufklappen')}>
          <i className="bi bi-chevron-left" />
        </button>

        <nav className="leiste-nav">
          {BEREICHE.map((bereich) => (
            <div key={bereich.titel} className="leiste-bereich">
              <div className="leiste-titel"><span>{t(bereich.titel)}</span></div>
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
                            aria-label={zahl ? t('{seite} ({n} offen)', { seite: t(seite.text), n: zahl }) : t(seite.text)}>
                        <span className="leiste-symbol">
                          <i className={`bi ${aktiv ? seite.symbolAktiv : seite.symbol}`} aria-hidden="true" />
                          <LadeRing />
                          {zahl && <span className="leiste-punkt" aria-hidden="true">{zahl}</span>}
                        </span>
                        <span className="leiste-text">
                          {t(seite.text)}
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
          {/* Sprache: Deutsch / Englisch */}
          <div className="aufklapp">
            <button type="button" className="leiste-link" aria-haspopup="menu" aria-expanded={fenster === 'sprache'}
                    aria-label={`${t('Sprache')}: ${SPRACHEN[sprache].name}`}
                    onClick={() => setFenster(fenster === 'sprache' ? null : 'sprache')}>
              <span className="leiste-symbol"><i className="bi bi-translate" aria-hidden="true" /></span>
              <span className="leiste-text">
                {t('Sprache')}
                <span className="leiste-wert">{SPRACHEN[sprache].name}</span>
              </span>
            </button>
            {fenster === 'sprache' && (
              <div className="aufklapp-menue" role="menu">
                <div className="menue-titel">{t('Sprache')}</div>
                {Object.entries(SPRACHEN).map(([kuerzel, s]) => (
                  <button key={kuerzel} type="button" role="menuitemradio" aria-checked={sprache === kuerzel} lang={kuerzel}
                          onClick={() => { setFenster(null); if (kuerzel !== sprache) spracheWechseln(kuerzel); }}>
                    <span className="sprach-kuerzel">{s.kurz}</span> {s.name}
                    {sprache === kuerzel && <i className="bi bi-check2 haken" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Darstellung: Hell / Dunkel / Automatisch */}
          <div className="aufklapp">
            <button type="button" className="leiste-link" aria-haspopup="menu" aria-expanded={fenster === 'darstellung'}
                    aria-label={`${t('Darstellung')}: ${t(aktuelleDarstellung.text)}`}
                    onClick={() => setFenster(fenster === 'darstellung' ? null : 'darstellung')}>
              <span className="leiste-symbol"><i className={`bi ${aktuelleDarstellung.symbol}`} aria-hidden="true" /></span>
              <span className="leiste-text">
                {t('Darstellung')}
                <span className="leiste-wert">{t(aktuelleDarstellung.text)}</span>
              </span>
            </button>
            {fenster === 'darstellung' && (
              <div className="aufklapp-menue" role="menu">
                <div className="menue-titel">{t('Darstellung')}</div>
                {DARSTELLUNGEN.map((d) => (
                  <button key={d.wert} type="button" role="menuitemradio" aria-checked={darstellung === d.wert}
                          onClick={() => waehleDarstellung(d.wert)}>
                    <i className={`bi ${d.symbol}`} /> {t(d.text)}
                    {darstellung === d.wert && <i className="bi bi-check2 haken" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Konto: echte Anmeldung + gewählte Person, Person wechseln, Abmelden */}
          <div className="aufklapp">
            <button type="button" className="leiste-link leiste-konto" aria-haspopup="menu" aria-expanded={fenster === 'konto'}
                    aria-label={`${t('Konto')}: ${person ? `${person.name}, ${benutzer.email}` : benutzer.anzeigename}`}
                    onClick={() => setFenster(fenster === 'konto' ? null : 'konto')}>
              <span className="leiste-symbol">
                <span className={`leiste-avatar${person ? ` rolle-${person.rolle.toLowerCase()}` : ''}`}>
                  {initialen(person?.name ?? benutzer.anzeigename)}
                </span>
              </span>
              <span className="leiste-text">
                <span className="konto-name">
                  {person?.name ?? benutzer.anzeigename}
                  <small>{person ? `${t(person.rolle === 'Instandhaltung' ? 'Instandhaltung|Rolle' : person.rolle)}${person.stadt ? ` · ${person.stadt}` : ''}` : benutzer.email}</small>
                </span>
                <i className="bi bi-chevron-expand" aria-hidden="true" />
              </span>
            </button>
            {fenster === 'konto' && (
              <div className="aufklapp-menue konto-menue" role="menu">
                <div className="menue-titel">{t('Angemeldet als')}</div>
                <div className="menue-info">
                  {benutzer.anzeigename}
                  <small>{benutzer.email}</small>
                </div>
                <div className="menue-titel">{t('Du arbeitest als')}</div>
                <div className="menue-info">
                  {person ? (
                    <>
                      {person.name}
                      <span className="d-flex align-items-center gap-2 mt-1">
                        <RollenAbzeichen rolle={person.rolle} />
                        {person.stadt && <small className="d-inline">{person.stadt}</small>}
                      </span>
                    </>
                  ) : (
                    <small>{t('Keine Person gewählt')}</small>
                  )}
                </div>
                <button type="button" role="menuitem" onClick={() => { setFenster(null); setPersonWahl(true); }}>
                  <i className="bi bi-person-badge" /> {person ? t('Person wechseln …') : t('Person wählen …')}
                </button>
                <div className="menue-trenner" />
                {/* Ansicht: nur ein Land bzw. Werk anzeigen (Standard: alles) */}
                <div className="menue-titel">{t('Ansicht')}</div>
                <AnsichtWahl ansicht={ansicht} />
                <div className="menue-trenner" />
                <form action={abmelden}>
                  <button type="submit" role="menuitem"><i className="bi bi-box-arrow-right" /> {t('Abmelden')}</button>
                </form>
              </div>
            )}
          </div>
        </div>
      </aside>

      {personWahl && <PersonWahl aktuelleId={person?.id ?? null} onSchliessen={() => setPersonWahl(false)} />}
    </>
  );
}
