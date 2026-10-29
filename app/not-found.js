/**
 * app/not-found.js – Seite nicht gefunden (z. B. unbekannte Auftragsnummer)
 */
import Link from 'next/link';

export default function NichtGefunden() {
  return (
    <div className="row justify-content-center">
      <div className="col-lg-6">
        <div className="karte text-center" style={{ padding: 40 }}>
          <h1 className="h3 fw-bold">Nicht gefunden</h1>
          <p className="text-leise">Diese Seite oder dieser Auftrag existiert nicht.</p>
          <Link href="/auftraege" className="btn btn-primary">Zur Auftragsübersicht</Link>
        </div>
      </div>
    </div>
  );
}
