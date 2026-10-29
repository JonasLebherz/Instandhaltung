'use client';
/**
 * app/melden/MeldeAssistent.js – Störung melden in zwei Teilen
 *
 *   1. Maschine auf der Zoom-Karte suchen: Werk → Gebäude → Maschine
 *      (components/karten/KartenExplorer.js im Modus "auswahl")
 *   2. Störung beschreiben (MeldeFormular.js)
 *
 * Über "Ändern" geht es zurück zur Karte – und zwar direkt in das Gebäude
 * der bisher gewählten Maschine.
 */
import { useState } from 'react';
import KartenExplorer from '@/components/karten/KartenExplorer';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import MeldeFormular from './MeldeFormular';

export default function MeldeAssistent({ daten, startwerte, vorauswahlMaschine, vorauswahlStandort }) {
  const { standorte, gebaeude, maschinen } = daten;
  const [maschineId, setMaschineId] = useState(vorauswahlMaschine);
  // Wo die Karte beginnt: beim vorgewählten Werk oder (nach "Ändern") im Gebäude der Maschine
  const [kartenStart, setKartenStart] = useState({ standortId: vorauswahlStandort });

  const maschine = maschinen.find((m) => m.id === maschineId) ?? null;
  const halle = maschine ? gebaeude.find((g) => g.id === maschine.gebaeude_id) : null;
  const werk = halle ? standorte.find((st) => st.id === halle.standort_id) : null;

  function waehleMaschine(m) {
    setMaschineId(m.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function aendern() {
    setKartenStart({ standortId: werk.id, gebaeudeId: halle.id });
    setMaschineId(null);
  }

  if (!maschine) {
    return <KartenExplorer daten={daten} modus="auswahl" start={kartenStart} onMaschine={waehleMaschine} />;
  }

  return (
    <div className="row justify-content-center">
      <div className="col-lg-9 col-xl-8">
        <div className="auswahl-chip">
          <i className={`bi ${MASCHINEN_SYMBOLE[maschine.typ] ?? 'bi-gear'}`} aria-hidden="true" />
          <span>
            <strong>{maschine.bezeichnung}</strong>
            <span className="text-leise"> · {maschine.anlagennummer} · {werk.name} · {halle.bezeichnung}</span>
          </span>
          <button type="button" className="btn btn-sekundaer btn-klein ms-auto" onClick={aendern}>
            <i className="bi bi-pencil" aria-hidden="true" /> Ändern
          </button>
        </div>
        <MeldeFormular maschineId={maschine.id} startwerte={startwerte} jetzt={startwerte.zeitpunkt} />
      </div>
    </div>
  );
}
