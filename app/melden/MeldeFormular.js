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
import { useActionState, useState } from 'react';
import { meldungAnlegen } from '@/app/aktionen';
import { URSACHEN_LISTE } from '@/lib/konstanten';
import Feldfehler, { fehlerklasse } from '@/components/Feldfehler';
import SpeichernKnopf from '@/components/SpeichernKnopf';
import Auswahl from '@/components/Auswahl';
import FotoAuswahl from '@/components/FotoAuswahl';
import { useT } from '@/components/SpracheKontext';
import { T } from '@/lib/sprache';

// Priorität = Leuchte der Signalampel an der Maschine (lib/karten/ampel.js), von oben nach unten:
// rot = hoch (Maschine steht), orange = mittel, blau = niedrig. Grün (läuft) ist unten nur angedeutet.
const PRIORITAETEN = [
  { wert: 'hoch', farbe: 'rot', text: T('Hoch – Maschine steht'), hinweis: T('Ampel rot: Stillstand, sofort reagieren') },
  { wert: 'mittel', farbe: 'orange', text: T('Mittel'), hinweis: T('Ampel orange: Maschine läuft eingeschränkt') },
  { wert: 'niedrig', farbe: 'blau', text: T('Niedrig'), hinweis: T('Ampel blau: kleiner Mangel, Maschine läuft weiter') },
];

export default function MeldeFormular({ maschineId, startwerte, jetzt }) {
  const [zustand, aktion] = useActionState(meldungAnlegen, { fehler: {}, eingabe: startwerte });
  const { fehler, eingabe } = zustand;
  const hatFehler = Object.keys(fehler).length > 0;
  const [fotos, setFotos] = useState([]);
  const t = useT();

  return (
    <>
      {hatFehler && (
        <div className="hinweis hinweis-fehler" role="alert">
          <i className="bi bi-x-circle-fill" aria-hidden="true" />
          <span className="hinweis-text">{fehler.allgemein ?? t('Bitte prüfe die markierten Felder.')}</span>
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
          <Auswahl id="ursache_kategorie" name="ursache_kategorie" standard={eingabe.ursache_kategorie}
                   ungueltig={Boolean(fehler.ursache_kategorie)} platzhalter={t('Bitte auswählen …')}
                   optionen={URSACHEN_LISTE.map((u) => ({ wert: u, text: t(u) }))} />
          <Feldfehler fehler={fehler} name="ursache_kategorie" />
        </div>

        {/* Fotos: Die Auswahl liegt hier oben im Zustand (fotos), damit sie erhalten bleibt,
            wenn das Formular nach einer Fehlermeldung neu aufgebaut wird */}
        <div className="mb-4">
          <span className="form-label d-block">{t('Fotos (optional)')}</span>
          <FotoAuswahl fotos={fotos} setFotos={setFotos} />
          <Feldfehler fehler={fehler} name="fotos" />
        </div>

        {/* Priorität über die Ampel: Man klickt die Leuchte an, die an der Maschine leuchten soll. Jede Zeile ist
            ein großes Auswahlfeld (gut mit dem Finger zu treffen); links steht die Signalsäule mit den Leuchten. */}
        <fieldset className="mb-4">
          <legend className="form-label fs-6">{t('Priorität – welche Ampel soll an der Maschine leuchten?')}</legend>
          <div className={`prio-ampel${fehlerklasse(fehler, 'prioritaet')}`}>
            <span className="prio-saeule" aria-hidden="true" />
            {PRIORITAETEN.map((p) => (
              <span key={p.wert} className="d-contents">
                <input type="radio" name="prioritaet" id={`prio-${p.wert}`} value={p.wert}
                       defaultChecked={eingabe.prioritaet === p.wert} />
                <label htmlFor={`prio-${p.wert}`} className={`ampel-${p.farbe}`}>
                  <span className="prio-lampe" aria-hidden="true" />
                  <span className="prio-text"><strong>{t(p.text)}</strong><small>{t(p.hinweis)}</small></span>
                </label>
              </span>
            ))}
            {/* Grün nur angedeutet: so sieht die Ampel aus, wenn alles läuft (nicht wählbar) */}
            <span className="prio-zeile-gruen ampel-gruen" aria-hidden="true">
              <span className="prio-lampe" />
              <span className="prio-text"><small>{t('Grün = Maschine läuft (nach der Reparatur)')}</small></span>
            </span>
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
