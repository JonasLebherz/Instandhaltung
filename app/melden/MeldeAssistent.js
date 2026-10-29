'use client';
/**
 * app/melden/MeldeAssistent.js – Störung melden in vier Schritten
 *
 *   1. Werk auf der Deutschlandkarte wählen
 *   2. Gebäude im Lageplan wählen
 *   3. Maschine im Grundriss wählen
 *   4. Störung beschreiben (MeldeFormular.js)
 *
 * Jeder Schritt bietet neben der Karte auch eine Liste zum Antippen. Über die
 * Leiste oben kann man jederzeit zu einem früheren Schritt zurückspringen.
 */
import { useState } from 'react';
import DeutschlandKarte from '@/components/karten/DeutschlandKarte';
import Lageplan from '@/components/karten/Lageplan';
import Grundriss from '@/components/karten/Grundriss';
import { Legende, stufe } from '@/components/karten/stufe';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import MeldeFormular from './MeldeFormular';

const SCHRITTE = ['Werk', 'Gebäude', 'Maschine', 'Beschreibung'];

export default function MeldeAssistent({ standorte, gebaeude, maschinen, startwerte, vorauswahlMaschine, vorauswahlStandort }) {
  // Startzustand aus der Vorauswahl ableiten
  const startMaschine = maschinen.find((m) => m.id === vorauswahlMaschine) ?? null;
  const startGebaeude = startMaschine ? gebaeude.find((g) => g.id === startMaschine.gebaeude_id) : null;
  const [standortId, setStandortId] = useState(startGebaeude?.standort_id ?? vorauswahlStandort ?? null);
  const [gebaeudeId, setGebaeudeId] = useState(startGebaeude?.id ?? null);
  const [maschineId, setMaschineId] = useState(startMaschine?.id ?? null);
  const [schritt, setSchritt] = useState(startMaschine ? 4 : vorauswahlStandort ? 2 : 1);

  const standort = standorte.find((st) => st.id === standortId) ?? null;
  const gebaeudeDesWerks = gebaeude.filter((g) => g.standort_id === standortId);
  const aktuellesGebaeude = gebaeude.find((g) => g.id === gebaeudeId) ?? null;
  const maschinenDesGebaeudes = maschinen.filter((m) => m.gebaeude_id === gebaeudeId);
  const maschine = maschinen.find((m) => m.id === maschineId) ?? null;

  function waehleStandort(st) { setStandortId(st.id); setGebaeudeId(null); setMaschineId(null); setSchritt(2); oben(); }
  function waehleGebaeude(g) { setGebaeudeId(g.id); setMaschineId(null); setSchritt(3); oben(); }
  function waehleMaschine(m) { setMaschineId(m.id); setSchritt(4); oben(); }
  function oben() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

  // Ein Schritt ist erreichbar, wenn alle vorherigen ausgewählt sind
  const erreichbar = [true, standortId !== null, gebaeudeId !== null, maschineId !== null];

  return (
    <>
      {/* Fortschritt / Navigation zwischen den Schritten */}
      <div className="schritte-leiste" role="tablist" aria-label="Schritte">
        {SCHRITTE.map((name, i) => {
          const nr = i + 1;
          const klasse = nr === schritt ? 'aktiv' : nr < schritt ? 'fertig' : '';
          return (
            <button key={name} type="button" role="tab" aria-selected={nr === schritt} className={klasse}
                    disabled={!erreichbar[i]} onClick={() => setSchritt(nr)}>
              <span className="nr">{nr < schritt ? <i className="bi bi-check-lg" /> : nr}</span> {name}
            </button>
          );
        })}
      </div>

      {schritt === 1 && (
        <div className="row g-4">
          <div className="col-lg-7">
            <section className="karte" style={{ '--i': 0 }}>
              <h2 className="abschnitt-titel">In welchem Werk?</h2>
              <DeutschlandKarte standorte={standorte} modus="auswahl" auswahlId={standortId} onWaehle={waehleStandort} />
              <Legende />
            </section>
          </div>
          <div className="col-lg-5">
            <section className="karte" style={{ '--i': 1 }}>
              <h2 className="abschnitt-titel">oder aus der Liste</h2>
              <ul className="ort-liste">
                {[...standorte].sort((a, b) => a.stadt.localeCompare(b.stadt)).map((st) => (
                  <li key={st.id}>
                    <button type="button" onClick={() => waehleStandort(st)}
                            className={`stufe-${stufe(st.offen, st.hoechste_prioritaet)}${st.id === standortId ? ' gewaehlt' : ''}`}>
                      <span><span className="ort-titel">{st.name}</span><span className="ort-unter">{st.schwerpunkt}</span></span>
                      <i className="bi bi-chevron-right ms-auto text-leise" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}

      {schritt === 2 && standort && (
        <div className="row g-4">
          <div className="col-xl-8">
            <section className="karte" style={{ '--i': 0 }}>
              <h2 className="abschnitt-titel">In welchem Gebäude? <span className="text-leise fw-normal">· {standort.name}</span></h2>
              <Lageplan standort={standort} gebaeude={gebaeudeDesWerks} modus="auswahl" auswahlId={gebaeudeId} onWaehle={waehleGebaeude} />
            </section>
          </div>
          <div className="col-xl-4">
            <section className="karte" style={{ '--i': 1 }}>
              <h2 className="abschnitt-titel">oder aus der Liste</h2>
              <ul className="ort-liste">
                {gebaeudeDesWerks.map((g) => (
                  <li key={g.id}>
                    <button type="button" onClick={() => waehleGebaeude(g)} className={g.id === gebaeudeId ? 'gewaehlt' : ''}>
                      <span><span className="ort-titel">{g.bezeichnung}</span><span className="ort-unter">{g.maschinen} Maschinen</span></span>
                      <i className="bi bi-chevron-right ms-auto text-leise" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}

      {schritt === 3 && aktuellesGebaeude && (
        <div className="row g-4">
          <div className="col-xl-8">
            <section className="karte" style={{ '--i': 0 }}>
              <h2 className="abschnitt-titel">An welcher Maschine? <span className="text-leise fw-normal">· {standort?.stadt} · {aktuellesGebaeude.bezeichnung}</span></h2>
              <Grundriss gebaeude={aktuellesGebaeude} maschinen={maschinenDesGebaeudes} auswahlId={maschineId} onWaehle={waehleMaschine} />
            </section>
          </div>
          <div className="col-xl-4">
            <section className="karte" style={{ '--i': 1 }}>
              <h2 className="abschnitt-titel">oder aus der Liste</h2>
              <ul className="ort-liste">
                {maschinenDesGebaeudes.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => waehleMaschine(m)} className={m.id === maschineId ? 'gewaehlt' : ''}>
                      <i className={`bi ${MASCHINEN_SYMBOLE[m.typ] ?? 'bi-gear'} text-leise`} aria-hidden="true" />
                      <span><span className="ort-titel">{m.bezeichnung}</span><span className="ort-unter">{m.anlagennummer}</span></span>
                      <i className="bi bi-chevron-right ms-auto text-leise" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}

      {schritt === 4 && maschine && (
        <div className="row justify-content-center">
          <div className="col-lg-9 col-xl-8">
            <div className="auswahl-chip">
              <i className={`bi ${MASCHINEN_SYMBOLE[maschine.typ] ?? 'bi-gear'}`} aria-hidden="true" />
              <span>
                <strong>{maschine.bezeichnung}</strong>
                <span className="text-leise"> · {maschine.anlagennummer} · {standort?.name} · {aktuellesGebaeude?.bezeichnung}</span>
              </span>
              <button type="button" className="btn btn-sekundaer btn-klein ms-auto" onClick={() => setSchritt(3)}>
                <i className="bi bi-pencil" aria-hidden="true" /> Ändern
              </button>
            </div>
            <MeldeFormular maschineId={maschine.id} startwerte={startwerte} jetzt={startwerte.zeitpunkt} />
          </div>
        </div>
      )}
    </>
  );
}
