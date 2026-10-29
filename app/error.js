'use client';
/**
 * app/error.js – freundliche Fehlerseite
 *
 * Erscheint, wenn beim Laden einer Seite etwas schiefgeht – meistens, weil
 * die Datenbank nicht oder zu langsam antwortet.
 *
 * "Erneut versuchen" lädt die Daten neu vom Server (router.refresh) und
 * zeigt die Seite dann wieder an (reset). Nur reset() allein würde die
 * Seite ohne neue Daten erneut zeichnen – und denselben Fehler zeigen.
 */
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
    <div className="row justify-content-center">
      <div className="col-lg-7">
        <div className="karte text-center" style={{ padding: 40 }}>
          <div className="kennzahl-symbol mx-auto mb-3" style={{ background: 'var(--rot-bg)', color: 'var(--rot)', width: 52, height: 52 }}>
            <i className="bi bi-database-exclamation" style={{ fontSize: '1.4rem' }} />
          </div>
          <h1 className="h3 fw-bold">{t('Daten konnten nicht geladen werden')}</h1>
          <p className="text-leise">
            {t('Die Datenbank hat nicht rechtzeitig geantwortet. Meist hilft es, es gleich noch einmal zu versuchen. Tritt der Fehler dauerhaft auf: Im Supabase-Dashboard prüfen, ob das Projekt pausiert ist (kostenlose Projekte pausieren nach einer Woche ohne Nutzung), und bei Vercel unter „Logs“ nachsehen.')}
          </p>
          <button type="button" className="btn btn-primary mt-2" onClick={erneutVersuchen}>
            <i className="bi bi-arrow-clockwise" aria-hidden="true" /> {t('Erneut versuchen')}
          </button>
          {/* Kennung des Fehlers – damit lässt er sich in den Vercel-Logs finden */}
          {error?.digest && <p className="klein mt-3 mb-0">{t('Fehler-Kennung')}: {error.digest}</p>}
        </div>
      </div>
    </div>
  );
}
