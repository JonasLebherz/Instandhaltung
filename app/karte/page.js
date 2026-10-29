/**
 * app/karte/page.js – Störungskarte, Ebene 1: Deutschland
 *
 * Zeigt alle Standorte des Unternehmens auf der Deutschlandkarte mit der Zahl
 * der offenen Störungen. Klick auf einen Standort öffnet dessen Lageplan.
 */
import Link from 'next/link';
import { benutzerPflicht } from '@/lib/auth';
import { standorteMitZahlen } from '@/lib/karten/daten';
import DeutschlandKarte from '@/components/karten/DeutschlandKarte';
import { Legende, stufe } from '@/components/karten/stufe';
import Kennzahl from '@/components/Kennzahl';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Störungskarte' };

export default async function KartenSeite() {
  await benutzerPflicht();
  const standorte = await standorteMitZahlen();

  const offenGesamt = standorte.reduce((summe, st) => summe + st.offen, 0);
  const hochGesamt = standorte.reduce((summe, st) => summe + st.hoch, 0);
  const betroffen = standorte.filter((st) => st.offen > 0).length;
  // Liste: Werke mit den meisten offenen Störungen zuerst
  const sortiert = [...standorte].sort((a, b) => b.offen - a.offen || b.hoch - a.hoch || a.stadt.localeCompare(b.stadt));

  return (
    <>
      <div className="seitenkopf">
        <h1>Störungskarte</h1>
        <p>{standorte.length} Standorte in Deutschland – Werk anklicken, um Gebäude und Maschinen zu sehen.</p>
      </div>

      <div className="row g-4 mb-2">
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Offene Störungen" wert={offenGesamt} zusatz="an allen Standorten" symbol="bi-exclamation-circle"
                    link="/auftraege?status=offen" i={0} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Priorität hoch" wert={hochGesamt} zusatz="sofort bearbeiten" symbol="bi-lightning-charge"
                    art={hochGesamt > 0 ? 'rot' : ''} link="/auftraege?status=offen&prioritaet=hoch" i={1} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Betroffene Werke" wert={betroffen} zusatz={`von ${standorte.length} Standorten`} symbol="bi-buildings" i={2} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel="Ohne Störung" wert={standorte.length - betroffen} zusatz="alles läuft" symbol="bi-check2-circle" art="gruen" i={3} />
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-7">
          <section className="karte" style={{ '--i': 4 }}>
            <DeutschlandKarte standorte={standorte} />
            <Legende />
          </section>
        </div>
        <div className="col-lg-5">
          <section className="karte" style={{ '--i': 5 }}>
            <h2 className="abschnitt-titel">Standorte</h2>
            <ul className="ort-liste">
              {sortiert.map((st) => (
                <li key={st.id}>
                  <Link href={`/karte/${st.kuerzel.toLowerCase()}`} className={`stufe-${stufe(st.offen, st.hoechste_prioritaet)}`}>
                    <span>
                      <span className="ort-titel">{st.name}</span>
                      <span className="ort-unter">{st.schwerpunkt} · {st.gebaeude} Gebäude · {st.maschinen} Maschinen</span>
                    </span>
                    <span className="ort-zahl" aria-label={`${st.offen} offene Störungen`}>{st.offen}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
