/**
 * app/karte/[standort]/page.js – Störungskarte, Ebene 2: ein Werk
 *
 * Aufruf z. B. /karte/ham. Zeigt den Lageplan mit allen Gebäuden und der
 * Zahl offener Störungen je Gebäude, dazu die offenen Aufträge und die
 * Techniker vor Ort.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { standortNachKuerzel, gebaeudeMitZahlen, offeneAuftraege } from '@/lib/karten/daten';
import Lageplan from '@/components/karten/Lageplan';
import { Legende, stufe } from '@/components/karten/stufe';
import { StatusPill, PrioritaetPill } from '@/components/Pills';
import { datumZeit } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { standort } = await params;
  return { title: `Werk ${String(standort).toUpperCase()}` };
}

export default async function StandortSeite({ params }) {
  await benutzerPflicht();
  const { standort: kuerzel } = await params;
  const standort = await standortNachKuerzel(kuerzel);
  if (!standort) notFound();

  const [gebaeude, offene, techniker] = await Promise.all([
    gebaeudeMitZahlen(standort.id),
    offeneAuftraege({ standortId: standort.id }),
    sql`SELECT name, qualifikation, schicht FROM techniker WHERE standort_id = ${standort.id} ORDER BY name`,
  ]);
  const basis = `/karte/${standort.kuerzel.toLowerCase()}`;

  return (
    <>
      <nav className="brotkrumen" aria-label="Pfad">
        <Link href="/karte"><i className="bi bi-map" aria-hidden="true" /> Deutschland</Link>
        <i className="bi bi-chevron-right" aria-hidden="true" />
        <span aria-current="page">{standort.name}</span>
      </nav>
      <div className="seitenkopf">
        <h1>{standort.name}</h1>
        <p>{standort.schwerpunkt} · {standort.adresse}</p>
      </div>

      <div className="row g-4">
        <div className="col-xl-8">
          <section className="karte" style={{ '--i': 0 }}>
            <div className="karte-kopf">
              <h2 className="abschnitt-titel">Lageplan</h2>
              <span className="klein">Gebäude anklicken für den Grundriss</span>
            </div>
            <Lageplan standort={standort} gebaeude={gebaeude} />
            <Legende />
          </section>
        </div>

        <div className="col-xl-4">
          <section className="karte" style={{ '--i': 1 }}>
            <h2 className="abschnitt-titel">Gebäude</h2>
            <ul className="ort-liste">
              {gebaeude.map((g) => (
                <li key={g.id}>
                  <Link href={`${basis}/${g.kuerzel.toLowerCase()}`} className={`stufe-${stufe(g.offen, g.hoechste_prioritaet)}`}>
                    <span>
                      <span className="ort-titel">{g.bezeichnung}</span>
                      <span className="ort-unter">{g.maschinen} Maschinen · {g.breite_m} × {g.tiefe_m} m</span>
                    </span>
                    <span className="ort-zahl" aria-label={`${g.offen} offene Störungen`}>{g.offen}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="karte" style={{ '--i': 2 }}>
            <h2 className="abschnitt-titel">Techniker vor Ort</h2>
            <ul className="ort-liste">
              {techniker.map((t) => (
                <li key={t.name}>
                  <div className="d-flex align-items-center gap-3 p-3 rounded-4" style={{ background: 'var(--fuellung)' }}>
                    <i className="bi bi-person-gear fs-5 text-leise" aria-hidden="true" />
                    <span>
                      <span className="ort-titel">{t.name}</span>
                      <span className="ort-unter">{t.qualifikation} · {t.schicht}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <section className="karte" style={{ '--i': 3 }}>
        <div className="karte-kopf">
          <h2 className="abschnitt-titel">Offene Störungen am Standort</h2>
          <Link href={`/melden?standort=${standort.id}`}>Störung melden</Link>
        </div>
        {offene.length === 0 ? (
          <p className="leer"><i className="bi bi-check-circle" />Keine offenen Störungen – alle Anlagen laufen.</p>
        ) : (
          <div className="tabelle-rahmen">
            <table className="tabelle">
              <thead>
                <tr><th>Maschine</th><th>Priorität</th><th>Status</th><th className="d-none d-md-table-cell">Gemeldet</th></tr>
              </thead>
              <tbody>
                {offene.map((a) => (
                  <tr key={a.auftrag_id} className="klickbar">
                    <td>
                      <Link className="zeilen-link" href={`/auftraege/${a.auftrag_id}`}>{a.maschine}</Link>
                      <div className="klein">{a.anlagennummer} · {a.beschreibung}</div>
                    </td>
                    <td><PrioritaetPill prioritaet={a.prioritaet} /></td>
                    <td><StatusPill status={a.status} />{a.techniker && <div className="klein mt-1">{a.techniker}</div>}</td>
                    <td className="d-none d-md-table-cell klein">{datumZeit(a.zeitpunkt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
