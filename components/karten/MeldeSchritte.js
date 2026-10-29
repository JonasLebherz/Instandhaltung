'use client';
/**
 * components/karten/MeldeSchritte.js – Schritt-Leiste beim Störung melden
 *
 *   1 Land → 2 Werk → 3 Gebäude → 4 Maschine → 5 Beschreibung
 *
 * Erledigte Schritte zeigen die getroffene Wahl und lassen sich anklicken,
 * um dorthin zurückzugehen (onSchritt(nummer)). So sieht das Melden bewusst
 * anders aus als die Störungskarte, die nur zum Anschauen da ist.
 */
import { T } from '@/lib/sprache';
import { useT } from '@/components/SpracheKontext';

const SCHRITTE = [T('Land'), T('Werk'), T('Gebäude|Schritt'), T('Maschine'), T('Beschreibung')];

export default function MeldeSchritte({ schritt, werte = [], onSchritt }) {
  const t = useT();
  return (
    <ol className="melde-schritte" aria-label={t('Schritte zum Melden')}>
      {SCHRITTE.map((name, i) => {
        const nr = i + 1;
        const zustand = nr < schritt ? 'fertig' : nr === schritt ? 'aktiv' : 'offen';
        const inhalt = (
          <>
            <span className="schritt-nr" aria-hidden="true">{zustand === 'fertig' ? <i className="bi bi-check-lg" /> : nr}</span>
            <span className="schritt-text">
              <span className="schritt-name">{t(name)}</span>
              {zustand === 'fertig' && werte[i] && <span className="schritt-wert">{werte[i]}</span>}
            </span>
          </>
        );
        return (
          <li key={name} className={`schritt-${zustand}`} aria-current={zustand === 'aktiv' ? 'step' : undefined}>
            {zustand === 'fertig' && onSchritt
              ? <button type="button" onClick={() => onSchritt(nr)} title={t('Zurück zu: {schritt}', { schritt: t(name) })}>{inhalt}</button>
              : <div>{inhalt}</div>}
          </li>
        );
      })}
    </ol>
  );
}
