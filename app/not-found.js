/**
 * app/not-found.js – Seite nicht gefunden (z. B. unbekannte Auftragsnummer)
 */
import Link from 'next/link';
import { uebersetzer } from '@/lib/sprache/server';

export default async function NichtGefunden() {
  const t = await uebersetzer();
  return (
    <div className="row justify-content-center">
      <div className="col-lg-6">
        <div className="karte text-center" style={{ padding: 40 }}>
          <h1 className="h3 fw-bold">{t('Nicht gefunden')}</h1>
          <p className="text-leise">{t('Diese Seite oder dieser Auftrag existiert nicht.')}</p>
          <Link href="/auftraege" className="btn btn-primary">{t('Zur Auftragsübersicht')}</Link>
        </div>
      </div>
    </div>
  );
}
