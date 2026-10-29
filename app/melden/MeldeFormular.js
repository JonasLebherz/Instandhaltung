'use client';
/**
 * app/melden/MeldeFormular.js – Formular "Störung melden"
 *
 * Die Prüfung der Eingaben passiert auf dem Server (app/aktionen.js →
 * meldungAnlegen). Bei Fehlern kommen die Meldungen zurück und erscheinen
 * direkt unter dem jeweiligen Feld; die bisherigen Eingaben bleiben erhalten.
 * noValidate: Der Browser prüft nicht selbst, damit alle Meldungen einheitlich
 * auf Deutsch vom Server kommen.
 */
import Link from 'next/link';
import { useActionState } from 'react';
import { meldungAnlegen } from '@/app/aktionen';
import { URSACHEN_LISTE } from '@/lib/konstanten';
import Feldfehler, { fehlerklasse } from '@/components/Feldfehler';
import SpeichernKnopf from '@/components/SpeichernKnopf';

const PRIORITAETEN = [
  { wert: 'niedrig', text: 'Niedrig', symbol: 'bi-arrow-down' },
  { wert: 'mittel', text: 'Mittel', symbol: 'bi-dash' },
  { wert: 'hoch', text: 'Hoch – Maschine steht', symbol: 'bi-lightning-charge' },
];

export default function MeldeFormular({ maschinen, startwerte, jetzt }) {
  const [zustand, aktion] = useActionState(meldungAnlegen, { fehler: {}, eingabe: startwerte });
  const { fehler, eingabe } = zustand;
  const hatFehler = Object.keys(fehler).length > 0;

  return (
    <>
      {hatFehler && (
        <div className="hinweis hinweis-fehler" role="alert">
          <i className="bi bi-x-circle-fill" aria-hidden="true" />
          <span className="hinweis-text">{fehler.allgemein ?? 'Bitte prüfen Sie die markierten Felder.'}</span>
        </div>
      )}

      {/* key: Nach einer Fehlermeldung werden die Felder mit den letzten Eingaben neu befüllt */}
      <form action={aktion} className="karte" noValidate key={JSON.stringify(eingabe)}>
        {/* Maschine */}
        <div className="mb-4">
          <label htmlFor="maschine_id" className="form-label">Maschine</label>
          <select id="maschine_id" name="maschine_id" className={`form-select${fehlerklasse(fehler, 'maschine_id')}`}
                  defaultValue={eingabe.maschine_id} aria-describedby="fehler-maschine_id">
            <option value="">Bitte auswählen …</option>
            {maschinen.map((m) => (
              <option key={m.id} value={m.id}>{m.bezeichnung} – {m.standort}</option>
            ))}
          </select>
          <Feldfehler fehler={fehler} name="maschine_id" />
        </div>

        <div className="row g-4 mb-4">
          {/* Gemeldet von */}
          <div className="col-md-6">
            <label htmlFor="gemeldet_von" className="form-label">Gemeldet von</label>
            <input type="text" id="gemeldet_von" name="gemeldet_von" maxLength={100}
                   className={`form-control${fehlerklasse(fehler, 'gemeldet_von')}`}
                   defaultValue={eingabe.gemeldet_von} placeholder="Vor- und Nachname" autoComplete="name" />
            <Feldfehler fehler={fehler} name="gemeldet_von" />
          </div>

          {/* Zeitpunkt */}
          <div className="col-md-6">
            <label htmlFor="zeitpunkt" className="form-label">Zeitpunkt der Störung</label>
            <input type="datetime-local" id="zeitpunkt" name="zeitpunkt"
                   className={`form-control${fehlerklasse(fehler, 'zeitpunkt')}`}
                   defaultValue={eingabe.zeitpunkt} max={jetzt} />
            <Feldfehler fehler={fehler} name="zeitpunkt" />
          </div>
        </div>

        {/* Beschreibung */}
        <div className="mb-4">
          <label htmlFor="beschreibung" className="form-label">Beschreibung</label>
          <textarea id="beschreibung" name="beschreibung" rows={4} maxLength={1000}
                    className={`form-control${fehlerklasse(fehler, 'beschreibung')}`}
                    placeholder="z. B. Spindel läuft unruhig, ungewöhnliches Geräusch beim Anfahren"
                    defaultValue={eingabe.beschreibung} />
          <Feldfehler fehler={fehler} name="beschreibung" />
          <div className="form-text">Mindestens 10, höchstens 1000 Zeichen.</div>
        </div>

        {/* Ursache */}
        <div className="mb-4">
          <label htmlFor="ursache_kategorie" className="form-label">Vermutete Ursache</label>
          <select id="ursache_kategorie" name="ursache_kategorie"
                  className={`form-select${fehlerklasse(fehler, 'ursache_kategorie')}`}
                  defaultValue={eingabe.ursache_kategorie}>
            <option value="">Bitte auswählen …</option>
            {URSACHEN_LISTE.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <Feldfehler fehler={fehler} name="ursache_kategorie" />
        </div>

        {/* Priorität als große Auswahlfelder (gut mit dem Finger zu treffen) */}
        <fieldset className="mb-4">
          <legend className="form-label fs-6">Priorität</legend>
          <div className={`segmente${fehlerklasse(fehler, 'prioritaet')}`}>
            {PRIORITAETEN.map((p) => (
              <span key={p.wert} className="d-contents">
                <input type="radio" name="prioritaet" id={`prio-${p.wert}`} value={p.wert}
                       defaultChecked={eingabe.prioritaet === p.wert} />
                <label htmlFor={`prio-${p.wert}`}><i className={`bi ${p.symbol}`} aria-hidden="true" />{p.text}</label>
              </span>
            ))}
          </div>
          <Feldfehler fehler={fehler} name="prioritaet" />
        </fieldset>

        <div className="d-flex gap-2 justify-content-end flex-wrap">
          <Link href="/" className="btn btn-sekundaer">Abbrechen</Link>
          <SpeichernKnopf ladeText="Wird gemeldet …"><i className="bi bi-send" aria-hidden="true" /> Störung melden</SpeichernKnopf>
        </div>
      </form>
    </>
  );
}
