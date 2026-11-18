/**
 * app/not-found.js – Seite nicht gefunden (Fehler 404, z. B. unbekannte Auftragsnummer oder Tippfehler in der Adresse)
 *
 * Sachlich wie in Industrie-Software: Fehlercode, ein Satz, Wege zurück in die App (Übersicht, Aufträge, Suche).
 */
import Link from 'next/link';
import { uebersetzer } from '@/lib/sprache/server';
import SucheKnopf from '@/components/SucheKnopf';

export default async function NichtGefunden() {
  const t = await uebersetzer();
  return (
    <div className="fehlerseite">
      <div className="fehlerseite-code">404</div>
      <h1>{t('Seite nicht gefunden')}</h1>
      <p>{t('Die Adresse gibt es nicht, oder der Auftrag bzw. die Maschine wurde gelöscht.')}</p>
      <div className="fehlerseite-wege">
        <Link href="/" className="btn btn-primary">{t('Zur Übersicht')}</Link>
        <Link href="/auftraege" className="btn btn-sekundaer">{t('Aufträge')}</Link>
        <SucheKnopf className="btn btn-sekundaer" />
      </div>
    </div>
  );
}
