'use client';
/**
 * app/error.js – Fehlerseite (Fehler 500), wenn beim Laden einer Seite etwas schiefgeht –
 * meistens, weil die Datenbank nicht oder zu langsam antwortet.
 *
 * "Erneut versuchen" lädt die Daten neu vom Server (router.refresh) und zeigt die Seite dann wieder
 * an (reset). Nur reset() allein würde die Seite ohne neue Daten erneut zeichnen – und denselben Fehler zeigen.
 * Die Fehler-Kennung (digest) steht dabei, damit man den Fehler in den Vercel-Logs findet.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { useT } from '@/components/SpracheKontext';

export default function Fehler({ error, reset }) {
  const router = useRouter();
  const t = useT();

  function erneutVersuchen() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div className="fehlerseite">
      <div className="fehlerseite-code">500</div>
      <h1>{t('Daten konnten nicht geladen werden')}</h1>
      <p>{t('Die Datenbank hat nicht rechtzeitig geantwortet. Meist hilft ein zweiter Versuch. Bleibt der Fehler: im Supabase-Dashboard prüfen, ob das Projekt pausiert ist, und bei Vercel unter „Logs“ nachsehen.')}</p>
      <div className="fehlerseite-wege">
        <button type="button" className="btn btn-primary" onClick={erneutVersuchen}>
          <i className="bi bi-arrow-clockwise" aria-hidden="true" /> {t('Erneut versuchen')}
        </button>
        <Link href="/" className="btn btn-sekundaer">{t('Zur Übersicht')}</Link>
      </div>
      {error?.digest && <p className="fehlerseite-kennung">{t('Fehler-Kennung')}: <code>{error.digest}</code></p>}
    </div>
  );
}
