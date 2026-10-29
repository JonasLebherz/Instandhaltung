'use client';
/**
 * components/SprachSchalter.js – kleiner Umschalter DE | EN (z. B. auf der Login-Seite)
 * In der App selbst steht die Sprachwahl unten in der Seitenleiste.
 */
import { SPRACHEN } from '@/lib/sprache';
import { useSprache, useSpracheWechseln, useT } from './SpracheKontext';

export default function SprachSchalter() {
  const sprache = useSprache();
  const wechseln = useSpracheWechseln();
  const t = useT();
  return (
    <div className="sprach-schalter" role="group" aria-label={t('Sprache')}>
      {Object.entries(SPRACHEN).map(([kuerzel, s]) => (
        <button key={kuerzel} type="button" lang={kuerzel} aria-pressed={sprache === kuerzel} title={s.name}
                onClick={() => sprache !== kuerzel && wechseln(kuerzel)}>
          {s.kurz}
        </button>
      ))}
    </div>
  );
}
