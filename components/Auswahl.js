'use client';
/**
 * components/Auswahl.js – Auswahlfeld im Design der Seite (statt <select>)
 *
 * Das aufgeklappte Menü eines normalen <select> zeichnet der Browser selbst –
 * es lässt sich kaum gestalten und sah im Dunkelmodus schlecht aus. Diese
 * Komponente sieht aus wie die übrigen Aufklappmenüs und passt sich hell/dunkel an.
 *
 * optionen: [{ wert, text }] oder Gruppen [{ gruppe: 'Am Standort', optionen: [...] }]
 * name:     sendet den Wert über ein verstecktes Feld mit – Formulare und
 *           Server-Aktionen bleiben unverändert
 * wert + onAendern: gesteuert (z. B. "Mir zuweisen");  standard: Startwert ohne Steuerung
 *
 * Tastatur wie beim <select>: Pfeile, Pos1/Ende, Enter/Leertaste, Esc, Buchstaben tippen springt.
 */
import { useEffect, useId, useRef, useState } from 'react';

export default function Auswahl({
  id, name, optionen, wert, standard = '', onAendern, ungueltig = false, klein = false,
  platzhalter = '', deaktiviert = false, ariaLabel,
}) {
  const eigeneId = useId();
  const feldId = id ?? eigeneId;
  const [eigenerWert, setEigenerWert] = useState(String(standard ?? ''));
  const [offen, setOffen] = useState(false);
  const [nachOben, setNachOben] = useState(false);
  const [rechts, setRechts] = useState(false);     // Liste rechtsbündig, wenn sie sonst aus dem Bild ragt
  const [aktiv, setAktiv] = useState(-1);          // hervorgehobene Option (Index in "flach")
  const rahmenRef = useRef(null);
  const knopfRef = useRef(null);
  const listeRef = useRef(null);
  const tippen = useRef({ text: '', zeit: 0 });

  const gesteuert = wert !== undefined;
  const aktuell = String(gesteuert ? wert ?? '' : eigenerWert);
  // Alle Optionen in einer Liste (Gruppen nur für die Anzeige)
  const flach = optionen.flatMap((o) => (o.gruppe ? o.optionen : [o])).map((o) => ({ ...o, wert: String(o.wert) }));
  const gewaehlt = flach.find((o) => o.wert === aktuell);

  function waehlen(o) {
    if (!gesteuert) setEigenerWert(o.wert);
    if (o.wert !== aktuell) onAendern?.(o.wert);
    setOffen(false);
    knopfRef.current?.focus();
  }

  function oeffnen() {
    // Nicht genug Platz nach unten (z. B. im Konto-Menü unten links)? Dann nach oben aufklappen.
    const r = knopfRef.current.getBoundingClientRect();
    setNachOben(window.innerHeight - r.bottom < 280 && r.top > window.innerHeight - r.bottom);
    setRechts(r.left + 420 > window.innerWidth);
    setAktiv(Math.max(0, flach.findIndex((o) => o.wert === aktuell)));
    setOffen(true);
  }

  // Klick daneben schließt die Liste
  useEffect(() => {
    if (!offen) return undefined;
    const klick = (e) => { if (!rahmenRef.current?.contains(e.target)) setOffen(false); };
    document.addEventListener('mousedown', klick);
    return () => document.removeEventListener('mousedown', klick);
  }, [offen]);

  // Hervorgehobene Option sichtbar halten
  useEffect(() => {
    if (offen && aktiv >= 0) listeRef.current?.querySelector(`[data-index="${aktiv}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [offen, aktiv]);

  function taste(e) {
    const letzte = flach.length - 1;
    const schritt = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (schritt) {
      e.preventDefault();
      if (!offen) oeffnen();
      else setAktiv((i) => Math.min(letzte, Math.max(0, i + schritt)));
    } else if (e.key === 'Home' || e.key === 'End') {
      if (!offen) return;
      e.preventDefault();
      setAktiv(e.key === 'Home' ? 0 : letzte);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (offen && flach[aktiv]) waehlen(flach[aktiv]); else oeffnen();
    } else if (e.key === 'Escape') {
      if (offen) { e.preventDefault(); e.stopPropagation(); setOffen(false); }
    } else if (e.key === 'Tab') {
      setOffen(false);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Tippen springt zur ersten passenden Option (mehrere Buchstaben schnell hintereinander)
      const jetzt = Date.now();
      tippen.current = { text: (jetzt - tippen.current.zeit < 700 ? tippen.current.text : '') + e.key.toLowerCase(), zeit: jetzt };
      const treffer = flach.findIndex((o) => o.text.toLowerCase().startsWith(tippen.current.text));
      if (treffer < 0) return;
      if (offen) setAktiv(treffer); else waehlen(flach[treffer]);
    }
  }

  let index = -1;
  const option = (roh) => {
    index += 1;
    const i = index;
    const o = { ...roh, wert: String(roh.wert) };
    return (
      <li key={`${o.wert}-${i}`} id={`${feldId}-o${i}`} data-index={i} data-wert={o.wert} role="option" aria-selected={o.wert === aktuell}
          className={i === aktiv ? 'aktiv' : ''} onMouseEnter={() => setAktiv(i)}
          onMouseDown={(e) => e.preventDefault()} onClick={() => waehlen(o)}>
        <span>{o.text}</span>
        {o.wert === aktuell && <i className="bi bi-check2 haken" aria-hidden="true" />}
      </li>
    );
  };

  return (
    <div className="auswahl" ref={rahmenRef}>
      {name && <input type="hidden" name={name} value={aktuell} />}
      <button ref={knopfRef} type="button" id={feldId} disabled={deaktiviert}
              className={`form-select auswahl-knopf${klein ? ' form-select-sm' : ''}${ungueltig ? ' is-invalid' : ''}`}
              aria-haspopup="listbox" aria-expanded={offen} aria-controls={`${feldId}-liste`} aria-label={ariaLabel}
              aria-activedescendant={offen && aktiv >= 0 ? `${feldId}-o${aktiv}` : undefined}
              data-wert={aktuell}
              onClick={() => (offen ? setOffen(false) : oeffnen())} onKeyDown={taste}>
        <span className={gewaehlt ? '' : 'text-leise'}>{gewaehlt?.text ?? platzhalter}</span>
      </button>
      {offen && (
        <ul ref={listeRef} id={`${feldId}-liste`} role="listbox" className={`auswahl-liste${nachOben ? ' nach-oben' : ''}${rechts ? ' rechts' : ''}`}
            aria-labelledby={feldId}>
          {optionen.map((o) => (o.gruppe ? (
            <li key={`g-${o.gruppe}`} role="presentation">
              <div className="auswahl-gruppe">{o.gruppe}</div>
              <ul role="group" aria-label={o.gruppe}>{o.optionen.map(option)}</ul>
            </li>
          ) : option(o)))}
        </ul>
      )}
    </div>
  );
}
