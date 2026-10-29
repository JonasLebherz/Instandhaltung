'use client';
/**
 * app/error.js – freundliche Fehlerseite
 *
 * Erscheint, wenn beim Laden einer Seite etwas schiefgeht – meistens, weil
 * die Datenbank nicht erreichbar ist (z. B. Supabase-Projekt pausiert).
 */
export default function Fehler({ reset }) {
  return (
    <div className="row justify-content-center">
      <div className="col-lg-7">
        <div className="karte text-center" style={{ padding: 40 }}>
          <div className="kennzahl-symbol mx-auto mb-3" style={{ background: 'var(--rot-bg)', color: 'var(--rot)', width: 52, height: 52 }}>
            <i className="bi bi-database-exclamation" style={{ fontSize: '1.4rem' }} />
          </div>
          <h1 className="h3 fw-bold">Daten konnten nicht geladen werden</h1>
          <p className="text-leise">
            Meist ist die Datenbank kurz nicht erreichbar. Kostenlose Supabase-Projekte werden nach einer
            Woche ohne Nutzung pausiert – dann im Supabase-Dashboard auf „Restore project“ klicken.
          </p>
          <button type="button" className="btn btn-primary mt-2" onClick={() => reset()}>
            <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Erneut versuchen
          </button>
        </div>
      </div>
    </div>
  );
}
