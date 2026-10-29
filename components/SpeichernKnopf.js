'use client';
/**
 * components/SpeichernKnopf.js – Absende-Knopf mit Lade-Anzeige
 *
 * Während das Formular gespeichert wird, zeigt der Knopf einen drehenden
 * Kreis und lässt sich nicht erneut drücken (kein doppeltes Speichern).
 */
import { useFormStatus } from 'react-dom';
import { useT } from './SpracheKontext';

export default function SpeichernKnopf({ children, ladeText, className = 'btn btn-primary' }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? <><span className="lade-kreis" aria-hidden="true" /> {ladeText ?? t('Speichern …')}</> : children}
    </button>
  );
}
