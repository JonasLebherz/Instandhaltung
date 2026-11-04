'use client';
/**
 * app/auftraege/[id]/Checkliste.js – Prüfpunkte je Maschinentyp abhaken
 *
 * Jeder Haken wird sofort gespeichert (Server-Aktion checklistePunkt). Der Haken erscheint
 * gleich (optimistisch); schlägt das Speichern fehl, wird er zurückgesetzt.
 * Gesperrt bei erledigten Aufträgen und für Personen aus der Produktion.
 */
import { useState, useTransition } from 'react';
import { useT } from '@/components/SpracheKontext';
import { checklistePunkt } from '@/app/aktionen';

export default function Checkliste({ auftragId, punkte, erledigt, gesperrt }) {
  const t = useT();
  const [haken, setHaken] = useState(() => new Set(erledigt));
  const [fehler, setFehler] = useState(null);
  const [, starte] = useTransition();

  function umschalten(nr) {
    const an = !haken.has(nr);
    const neu = new Set(haken);
    if (an) neu.add(nr); else neu.delete(nr);
    setHaken(neu);
    starte(async () => {
      const antwort = await checklistePunkt(auftragId, nr, an).catch(() => ({ fehler: t('Nicht gespeichert.') }));
      if (antwort?.fehler) { setFehler(antwort.fehler); setHaken(new Set(haken)); }
      else setFehler(null);
    });
  }

  return (
    <section className="karte" style={{ '--i': 1 }}>
      <div className="karte-kopf">
        <h2 className="abschnitt-titel mb-0">{t('Checkliste')}</h2>
        <span className={`checkliste-stand${haken.size === punkte.length ? ' fertig' : ''}`}>{haken.size}/{punkte.length}</span>
      </div>
      <div className="checkliste-balken" aria-hidden="true"><span style={{ width: `${(haken.size / punkte.length) * 100}%` }} /></div>
      {fehler && <div className="hinweis hinweis-fehler my-2" role="alert"><span className="hinweis-text">{fehler}</span></div>}
      <ul className="checkliste">
        {punkte.map((text, nr) => (
          <li key={text}>
            <label className={haken.has(nr) ? 'erledigt' : ''}>
              <input type="checkbox" className="form-check-input" checked={haken.has(nr)} disabled={gesperrt} onChange={() => umschalten(nr)} />
              <span>{t(text)}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
