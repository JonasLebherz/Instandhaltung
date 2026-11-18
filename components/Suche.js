'use client';
/**
 * components/Suche.js – Suchfenster über die ganze App (Strg+K bzw. ⌘K, oder Knopf „Suchen“ in der Seitenleiste)
 *
 * Ohne Eingabe stehen dort die Seiten und häufige Aktionen. Mit Eingabe sucht /api/suche (kurz verzögert,
 * ältere Anfragen werden abgebrochen) nach Maschinen, Aufträgen, Werken, Hallen, Personen und Ersatzteilen;
 * passende Seiten kommen aus der Liste unten dazu. Bedienung wie bei Profi-Programmen:
 * Pfeiltasten wählen, Enter öffnet, Esc schließt. Andere Stellen öffnen das Fenster mit dem Ereignis
 * `suche-oeffnen` (z. B. components/SucheKnopf.js).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { useT } from './SpracheKontext';
import { T } from '@/lib/sprache';

// Seiten und Aktionen, die ohne Datenbank gefunden werden
const SEITEN = [
  { titel: T('Übersicht'), href: '/', symbol: 'bi-grid-1x2' },
  { titel: T('Störungskarte'), href: '/karte', symbol: 'bi-map' },
  { titel: T('Störung melden'), href: '/melden', symbol: 'bi-exclamation-triangle' },
  { titel: T('Aufträge'), href: '/auftraege', symbol: 'bi-clipboard-check' },
  { titel: T('Offene Aufträge'), href: '/auftraege?status=offen', symbol: 'bi-clipboard' },
  { titel: T('Maschinen'), href: '/maschinen', symbol: 'bi-cpu' },
  { titel: T('Wartungsplan'), href: '/wartung', symbol: 'bi-calendar-check' },
  { titel: T('Lager'), href: '/lager', symbol: 'bi-box-seam' },
  { titel: T('Mitarbeiter'), href: '/mitarbeiter', symbol: 'bi-people' },
  { titel: T('Statistik'), href: '/statistik', symbol: 'bi-bar-chart' },
  { titel: T('Datenbasis'), href: '/datenbasis', symbol: 'bi-database' },
  { titel: T('Neu anlegen'), href: '/anlegen', symbol: 'bi-plus-lg' },
  { titel: T('Vollbildmodus'), href: '/vollbild', symbol: 'bi-arrows-fullscreen' },
  { titel: T('QR-Etiketten'), href: '/qr', symbol: 'bi-qr-code' },
];
// Gruppen der Treffer in dieser Reihenfolge, mit Symbol
const ARTEN = {
  seite: { name: T('Seiten'), symbol: 'bi-arrow-return-right' },
  maschine: { name: T('Maschinen'), symbol: 'bi-cpu' },
  auftrag: { name: T('Aufträge'), symbol: 'bi-clipboard-check' },
  werk: { name: T('Werke'), symbol: 'bi-buildings' },
  halle: { name: T('Hallen'), symbol: 'bi-building' },
  person: { name: T('Personen'), symbol: 'bi-person' },
  teil: { name: T('Ersatzteile'), symbol: 'bi-gear' },
};

export default function Suche() {
  const t = useT();
  const router = useRouter();
  const pfad = usePathname();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState('');
  const [treffer, setTreffer] = useState([]);
  const [laedt, setLaedt] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const feldRef = useRef(null);
  const listeRef = useRef(null);

  // Öffnen: Strg+K / ⌘K überall, Ereignis „suche-oeffnen“; Esc schließt
  useEffect(() => {
    const taste = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOffen((o) => !o); }
    };
    const oeffnen = () => setOffen(true);
    window.addEventListener('keydown', taste);
    window.addEventListener('suche-oeffnen', oeffnen);
    return () => { window.removeEventListener('keydown', taste); window.removeEventListener('suche-oeffnen', oeffnen); };
  }, []);
  useEffect(() => { setOffen(false); }, [pfad]);
  useEffect(() => {
    if (offen) { setText(''); setTreffer([]); setAktiv(0); setTimeout(() => feldRef.current?.focus(), 0); }
  }, [offen]);

  // Suche in der Datenbank: 150 ms nach der letzten Taste, alte Anfrage abbrechen
  useEffect(() => {
    const q = text.trim();
    if (!q) { setTreffer([]); setLaedt(false); return undefined; }
    const abbruch = new AbortController();
    setLaedt(true);
    const zeit = setTimeout(() => {
      fetch(`/api/suche?q=${encodeURIComponent(q)}`, { signal: abbruch.signal, cache: 'no-store' })
        .then((a) => (a.ok ? a.json() : { treffer: [] }))
        .then((d) => { setTreffer(d.treffer ?? []); setAktiv(0); setLaedt(false); })
        .catch(() => {});
    }, 150);
    return () => { clearTimeout(zeit); abbruch.abort(); };
  }, [text]);

  // Liste: passende Seiten zuerst (ohne Eingabe alle), dann die Treffer aus der Datenbank
  const eintraege = useMemo(() => {
    const q = text.trim().toLowerCase();
    const seiten = SEITEN.filter((s) => !q || t(s.titel).toLowerCase().includes(q))
      .slice(0, q ? 4 : SEITEN.length)
      .map((s) => ({ art: 'seite', id: s.href, titel: t(s.titel), href: s.href, symbol: s.symbol }));
    return [...seiten, ...treffer];
  }, [text, treffer, t]);

  function oeffnen(eintrag) {
    if (!eintrag?.href) return;
    setOffen(false);
    router.push(eintrag.href);
  }
  function tasten(e) {
    if (e.key === 'Escape') { e.preventDefault(); setOffen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAktiv((a) => Math.min(eintraege.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAktiv((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); oeffnen(eintraege[aktiv]); }
  }
  // Gewählten Eintrag sichtbar halten
  useEffect(() => {
    listeRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [aktiv]);

  if (!offen) return null;
  let index = -1;
  const gruppen = Object.keys(ARTEN).map((art) => ({ art, liste: eintraege.filter((x) => x.art === art) })).filter((g) => g.liste.length);

  return createPortal(
    <div className="suche-hintergrund" onMouseDown={(e) => { if (e.target === e.currentTarget) setOffen(false); }}>
      <div className="suche-fenster" role="dialog" aria-modal="true" aria-label={t('Suchen')}>
        <div className="suche-kopf">
          <i className={`bi ${laedt ? 'bi-arrow-repeat drehen' : 'bi-search'}`} aria-hidden="true" />
          <input ref={feldRef} className="suche-feld" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={tasten}
                 placeholder={t('Maschine, Auftragsnummer, Werk, Person …')} aria-label={t('Suchen')}
                 role="combobox" aria-expanded="true" aria-controls="suche-liste" aria-activedescendant={eintraege[aktiv] ? `suche-${aktiv}` : undefined} />
          <kbd>Esc</kbd>
        </div>
        <div className="suche-liste" id="suche-liste" role="listbox" ref={listeRef}>
          {gruppen.map((g) => (
            <div key={g.art} className="suche-gruppe" role="group" aria-label={t(ARTEN[g.art].name)}>
              <div className="suche-gruppe-titel">{t(ARTEN[g.art].name)}</div>
              {g.liste.map((x) => {
                index += 1;
                const i = index;
                return (
                  <div key={`${x.art}-${x.id}`} id={`suche-${i}`} role="option" aria-selected={i === aktiv} data-art={x.art}
                       className="suche-treffer" onMouseMove={() => setAktiv(i)} onClick={() => oeffnen(x)}>
                    <i className={`bi ${x.symbol ?? ARTEN[x.art].symbol}`} aria-hidden="true" />
                    <span className="suche-titel">{x.titel}</span>
                    {(x.zusatz || x.wert) && (
                      <span className="suche-zusatz">{[x.zusatz, x.wert ? t(x.wert) : null].filter(Boolean).join(' · ')}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {text.trim() && !laedt && eintraege.length === 0 && <p className="suche-leer">{t('Keine Treffer.')}</p>}
        </div>
        <div className="suche-fuss" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('wählen')}</span>
          <span><kbd>Enter</kbd> {t('öffnen')}</span>
          <span><kbd>Strg</kbd><kbd>K</kbd> {t('Suche')}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
