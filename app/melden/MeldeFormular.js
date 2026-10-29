'use client';
/**
 * app/melden/MeldeFormular.js – Formular "Störung melden" (Schritt 4 des Assistenten)
 *
 * Die Maschine wurde vorher auf der Karte gewählt und wird als verstecktes
 * Feld mitgeschickt.
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
import { useT } from '@/components/SpracheKontext';
import { T } from '@/lib/sprache';

const PRIORITAETEN = [
  { wert: 'niedrig', text: T('Niedrig'), symbol: 'bi-arrow-down' },
  { wert: 'mittel', text: T('Mittel'), symbol: 'bi-dash' },
  { wert: 'hoch', text: T('Hoch – Maschine steht'), symbol: 'bi-lightning-charge' },
];

export default function MeldeFormular({ maschineId, startwerte, jetzt }) {
  const [zustand, aktion] = useActionState(meldungAnlegen, { fehler: {}, eingabe: startwerte });
  const { fehler, eingabe } = zustand;
  const hatFehler = Object.keys(fehler).length > 0;
  const t = useT();

  return (
    <>
      {hatFehler && (
        <div className="hinweis hinweis-fehler" role="alert">
          <i className="bi bi-x-circle-fill" aria-hidden="true" />
          <span className="hinweis-text">{fehler.allgemein ?? t('Bitte prüfen Sie die markierten Felder.')}</span>
        </div>
      )}

      {/* key: Nach einer Fehlermeldung werden die Felder mit den letzten Eingaben neu befüllt */}
      <form action={aktion} className="karte" noValidate key={JSON.stringify(eingabe)}>
        {/* Maschine: kommt aus der Auswahl auf der Karte */}
        <input type="hidden" name="maschine_id" value={maschineId} />
        <Feldfehler fehler={fehler} name="maschine_id" />

        <div className="row g-4 mb-4">
          {/* Gemeldet von */}
          <div className="col-md-6">
            <label htmlFor="gemeldet_von" className="form-label">{t('Gemeldet von')}</label>
            <input type="text" id="gemeldet_von" name="gemeldet_von" maxLength={100}
                   className={`form-control${fehlerklasse(fehler, 'gemeldet_von')}`}
                   defaultValue={eingabe.gemeldet_von} placeholder={t('Vor- und Nachname')} autoComplete="name" />
            <Feldfehler fehler={fehler} name="gemeldet_von" />
          </div>

          {/* Zeitpunkt */}
          <div className="col-md-6">
            <label htmlFor="zeitpunkt" className="form-label">{t('Zeitpunkt der Störung')}</label>
            <input type="datetime-local" id="zeitpunkt" name="zeitpunkt"
                   className={`form-control${fehlerklasse(fehler, 'zeitpunkt')}`}
                   defaultValue={eingabe.zeitpunkt} max={jetzt} />
            <Feldfehler fehler={fehler} name="zeitpunkt" />
          </div>
        </div>

        {/* Beschreibung */}
        <div className="mb-4">
          <label htmlFor="beschreibung" className="form-label">{t('Beschreibung')}</label>
          <textarea id="beschreibung" name="beschreibung" rows={4} maxLength={1000}
                    className={`form-control${fehlerklasse(fehler, 'beschreibung')}`}
                    placeholder={t('z. B. Spindel läuft unruhig, ungewöhnliches Geräusch beim Anfahren')}
                    defaultValue={eingabe.beschreibung} />
          <Feldfehler fehler={fehler} name="beschreibung" />
          <div className="form-text">{t('Mindestens 10, höchstens 1000 Zeichen.')}</div>
        </div>

        {/* Ursache */}
        <div className="mb-4">
          <label htmlFor="ursache_kategorie" className="form-label">{t('Vermutete Ursache')}</label>
          <select id="ursache_kategorie" name="ursache_kategorie"
                  className={`form-select${fehlerklasse(fehler, 'ursache_kategorie')}`}
                  defaultValue={eingabe.ursache_kategorie}>
            <option value="">{t('Bitte auswählen …')}</option>
            {URSACHEN_LISTE.map((u) => <option key={u} value={u}>{t(u)}</option>)}
          </select>
          <Feldfehler fehler={fehler} name="ursache_kategorie" />
        </div>

        {/* Priorität als große Auswahlfelder (gut mit dem Finger zu treffen) */}
        <fieldset className="mb-4">
          <legend className="form-label fs-6">{t('Priorität')}</legend>
          <div className={`segmente${fehlerklasse(fehler, 'prioritaet')}`}>
            {PRIORITAETEN.map((p) => (
              <span key={p.wert} className="d-contents">
                <input type="radio" name="prioritaet" id={`prio-${p.wert}`} value={p.wert}
                       defaultChecked={eingabe.prioritaet === p.wert} />
                <label htmlFor={`prio-${p.wert}`}><i className={`bi ${p.symbol}`} aria-hidden="true" />{t(p.text)}</label>
              </span>
            ))}
          </div>
          <Feldfehler fehler={fehler} name="prioritaet" />
        </fieldset>

        <div className="d-flex gap-2 justify-content-end flex-wrap">
          <Link href="/" className="btn btn-sekundaer">{t('Abbrechen')}</Link>
          <SpeichernKnopf ladeText={t('Wird gemeldet …')}><i className="bi bi-send" aria-hidden="true" /> {t('Störung melden')}</SpeichernKnopf>
        </div>
      </form>
    </>
  );
}
