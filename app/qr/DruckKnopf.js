'use client';
/** app/qr/DruckKnopf.js – öffnet den Druckdialog des Browsers (dort auch „Als PDF speichern“) */
import { useT } from '@/components/SpracheKontext';

export default function DruckKnopf({ className = 'btn btn-primary' }) {
  const t = useT();
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <i className="bi bi-printer" aria-hidden="true" /> {t('Drucken / PDF')}
    </button>
  );
}
