'use client';
/**
 * components/PersonWahl.js – Fenster zum Wählen der Person, als die man arbeitet
 *
 * Zeigt alle Personen aus der Tabelle "person" (über /api/personen), gruppiert
 * nach Werk, mit Filter nach Rolle und Suche. Die Wahl landet im Cookie
 * "person" (JSON mit id, Name, Rolle, Stadt); danach lädt die Seite ihre Daten
 * neu (router.refresh), z. B. "Dir zugewiesene Aufgaben" auf der Übersicht.
 *
 * Das Fenster wird per Portal direkt in <body> gezeichnet: Innerhalb der
 * Seitenleiste (Glas mit backdrop-filter) wäre "position: fixed" sonst auf die
 * Leiste beschränkt.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { T } from '@/lib/sprache';
import { useT } from './SpracheKontext';

export const ROLLEN = [
  { wert: 'Produktion', symbol: 'bi-person-workspace', text: T('Produktion'), beschreibung: T('meldet Störungen') },
  { wert: 'Schichtleitung', symbol: 'bi-people', text: T('Schichtleitung'), beschreibung: T('weist Techniker zu, behält das Werk im Blick') },
  { wert: 'Instandhaltung', symbol: 'bi-wrench-adjustable', text: T('Instandhaltung|Rolle'), beschreibung: T('bearbeitet die eigenen Aufträge') },
];

/** Name des Ereignisses, mit dem andere Stellen die Auswahl öffnen (die Seitenleiste hört darauf) */
export const PERSON_WAEHLEN = 'person-waehlen';

/** Knopf, der die Personenwahl öffnet – z. B. auf der Übersicht, wenn noch keine Person gewählt ist */
export function PersonWaehlenKnopf({ children, className = 'btn btn-primary' }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(PERSON_WAEHLEN))}>
      {children}
    </button>
  );
}

/** Person im Cookie speichern (oder löschen) – ein Jahr gültig */
export function personSpeichern(person) {
  const wert = person ? encodeURIComponent(JSON.stringify({ id: person.id, name: person.name, rolle: person.rolle, stadt: person.stadt ?? null })) : '';
  document.cookie = `person=${wert}; path=/; max-age=${person ? 31536000 : 0}; samesite=lax`;
}

/** Kleines Abzeichen für die Rolle */
export function RollenAbzeichen({ rolle }) {
  const t = useT();
  const r = ROLLEN.find((x) => x.wert === rolle);
  if (!r) return null;
  return <span className={`rollen-abzeichen rolle-${rolle.toLowerCase()}`}><i className={`bi ${r.symbol}`} aria-hidden="true" /> {t(r.text)}</span>;
}

export default function PersonWahl({ aktuelleId, onSchliessen }) {
  const t = useT();
  const router = useRouter();
  const [personen, setPersonen] = useState(null);
  const [ladeFehler, setLadeFehler] = useState(null);   // 'migration' | 'datenbank' | null
  const [rolle, setRolle] = useState('');
  const [suche, setSuche] = useState('');
  const sucheRef = useRef(null);
  // Immer die aktuelle Schließen-Funktion verwenden, ohne die Liste bei jedem Neuzeichnen neu zu laden
  const schliessenRef = useRef(onSchliessen);
  schliessenRef.current = onSchliessen;

  useEffect(() => {
    fetch('/api/personen', { cache: 'no-store' })
      .then((a) => a.json())
      .then((d) => { setPersonen(d.personen ?? []); if (d.fehler) setLadeFehler(d.fehler); })
      .catch(() => { setPersonen([]); setLadeFehler('datenbank'); });
    sucheRef.current?.focus();
    const taste = (e) => { if (e.key === 'Escape') schliessenRef.current(); };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, []);

  function waehlen(person) {
    personSpeichern(person);
    onSchliessen();
    router.refresh();
  }

  const gefiltert = (personen ?? []).filter((p) => (!rolle || p.rolle === rolle)
    && (!suche || `${p.name} ${p.stadt ?? ''} ${p.land ? t(p.land) : ''}`.toLowerCase().includes(suche.toLowerCase())));
  // Nach Werk gruppieren
  const gruppen = {};
  // Überschrift je Werk mit Land, z. B. "Werk Detroit · USA"
  gefiltert.forEach((p) => {
    const werk = p.standort ? `${p.standort}${p.land ? ` · ${t(p.land)}` : ''}` : t('ohne Standort');
    (gruppen[werk] ??= []).push(p);
  });

  return createPortal(
    <div className="dialog-hintergrund" onMouseDown={(e) => { if (e.target === e.currentTarget) onSchliessen(); }}>
      <div className="dialog person-dialog" role="dialog" aria-modal="true" aria-labelledby="person-titel">
        <div className="dialog-kopf">
          <div>
            <h2 id="person-titel" className="abschnitt-titel mb-1">{t('Als welche Person arbeitest du?')}</h2>
            <p className="klein mb-0">{t('Fiktive Personen des Unternehmens – so lassen sich die Abläufe aus jeder Rolle ausprobieren.')}</p>
          </div>
          <button type="button" className="rund-knopf" onClick={onSchliessen} aria-label={t('Schließen')}><i className="bi bi-x-lg" /></button>
        </div>

        <div className="person-filter">
          <input ref={sucheRef} type="search" className="form-control" placeholder={t('Name, Stadt oder Land suchen …')}
                 value={suche} onChange={(e) => setSuche(e.target.value)} aria-label={t('Suche')} />
          <div className="sprach-schalter rollen-filter" role="group" aria-label={t('Rolle')}>
            <button type="button" aria-pressed={rolle === ''} onClick={() => setRolle('')}>{t('Alle')}</button>
            {ROLLEN.map((r) => (
              <button key={r.wert} type="button" aria-pressed={rolle === r.wert} onClick={() => setRolle(r.wert)}>{t(r.text)}</button>
            ))}
          </div>
        </div>

        <div className="person-liste">
          {personen === null && <p className="text-leise">{t('Wird geladen …')}</p>}
          {ladeFehler && (
            <div className="hinweis hinweis-fehler" role="alert">
              <i className="bi bi-x-circle-fill" aria-hidden="true" />
              <span className="hinweis-text">
                {ladeFehler === 'migration'
                  ? t('Die Personen fehlen in der Datenbank. Bitte die Migrationsdateien aus supabase/migrationen im Supabase SQL Editor ausführen.')
                  : t('Die Personen konnten nicht geladen werden.')}
              </span>
            </div>
          )}
          {personen !== null && gefiltert.length === 0 && !ladeFehler && <p className="text-leise">{t('Keine Personen gefunden.')}</p>}
          {Object.entries(gruppen).map(([werk, liste]) => (
            <section key={werk}>
              <h3 className="person-werk">{werk}</h3>
              <div className="person-raster">
                {liste.map((p) => (
                  <button key={p.id} type="button" className={`person-knopf${p.id === aktuelleId ? ' gewaehlt' : ''}`} onClick={() => waehlen(p)}>
                    <span className={`person-avatar rolle-${p.rolle.toLowerCase()}`}>{p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                    <span className="min-w-0">
                      <span className="person-name">{p.name}</span>
                      <RollenAbzeichen rolle={p.rolle} />
                      {p.qualifikation && <span className="person-unter">{t(p.qualifikation)}</span>}
                      {p.rolle === 'Instandhaltung' && (
                        <span className={`person-auftraege${p.offene_auftraege > 0 ? ' hat' : ''}`}>
                          <i className="bi bi-clipboard-check" aria-hidden="true" />{' '}
                          {p.offene_auftraege === 1 ? t('1 offener Auftrag') : t('{n} offene Aufträge', { n: p.offene_auftraege })}
                        </span>
                      )}
                    </span>
                    {p.id === aktuelleId && <i className="bi bi-check2 ms-auto text-primary" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="dialog-fuss">
          <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => waehlen(null)}>
            {t('Ohne Person arbeiten')}
          </button>
          <span className="klein">{ROLLEN.map((r) => `${t(r.text)}: ${t(r.beschreibung)}`).join(' · ')}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
