'use client';
/**
 * components/FlashMeldungen.js – zeigt Hinweise nach einer Weiterleitung an
 *
 * Das Layout (Server) liest das Cookie "flash" (gesetzt von lib/flash.js) und
 * übergibt die Meldungen hier als "neu". Die Komponente zeigt sie an und
 * löscht das Cookie sofort, damit jede Meldung nur einmal erscheint.
 * Erfolgsmeldungen verschwinden nach einigen Sekunden von selbst, Warnungen
 * bleiben stehen, bis man sie schließt.
 */
import { useEffect, useState } from 'react';
import { useT } from './SpracheKontext';

const SYMBOLE = { erfolg: 'bi-check-circle-fill', hinweis: 'bi-exclamation-triangle-fill', fehler: 'bi-x-circle-fill' };

export default function FlashMeldungen({ neu = [] }) {
  const t = useT();
  const [meldungen, setMeldungen] = useState([]);
  const schluessel = JSON.stringify(neu);

  // Neue Meldungen übernehmen und das Cookie löschen
  useEffect(() => {
    if (neu.length === 0) return;
    document.cookie = 'flash=; Max-Age=0; path=/';
    setMeldungen(neu.map((m) => ({ ...m, weg: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel]);

  // Erfolgsmeldungen nach 6 Sekunden ausblenden
  useEffect(() => {
    const timer = meldungen
      .filter((m) => m.typ === 'erfolg' && !m.weg)
      .map((m) => setTimeout(() => schliessen(m.id), 6000));
    return () => timer.forEach(clearTimeout);
  }, [meldungen]);

  function schliessen(id) {
    setMeldungen((liste) => liste.map((m) => (m.id === id ? { ...m, weg: true } : m)));
    setTimeout(() => setMeldungen((liste) => liste.filter((m) => m.id !== id)), 350);
  }

  return meldungen.map((m) => (
    <div key={m.id} className={`hinweis hinweis-${m.typ}${m.weg ? ' verschwindet' : ''}`} role="status">
      <i className={`bi ${SYMBOLE[m.typ] ?? SYMBOLE.hinweis}`} aria-hidden="true" />
      <span className="hinweis-text">{m.text}</span>
      <button type="button" className="schliessen" aria-label={t('Hinweis schließen')} onClick={() => schliessen(m.id)}>
        <i className="bi bi-x" />
      </button>
    </div>
  ));
}
