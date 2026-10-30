'use client';
/**
 * app/auftraege/[id]/Formulare.js – die beiden Formulare der Auftragsseite
 *
 *  BearbeitungsFormular – Techniker, Status, Arbeitsbeginn, Endzeit, Maßnahme
 *  TeilBuchenFormular   – verwendetes Ersatzteil buchen
 *
 * Geprüft und gespeichert wird auf dem Server (app/aktionen.js).
 * ".bind(null, auftragId)" gibt der Server-Aktion die Auftrags-ID mit.
 *
 * Arbeitet man als Techniker (Rolle Instandhaltung), gibt es den Knopf
 * „Mir zuweisen“. Als Person aus der Produktion ist das Formular gesperrt
 * (die Server-Aktion prüft das zusätzlich).
 */
import { useActionState, useRef, useState } from 'react';
import { auftragSpeichern, teilBuchen } from '@/app/aktionen';
import { STATUS_WERTE } from '@/lib/konstanten';
import Feldfehler, { fehlerklasse } from '@/components/Feldfehler';
import SpeichernKnopf from '@/components/SpeichernKnopf';
import Auswahl from '@/components/Auswahl';
import { useT } from '@/components/SpracheKontext';
import { gross } from '@/lib/sprache';

/** Aktuelle Uhrzeit im Format für <input type="datetime-local"> (Ortszeit des Geräts) */
function jetztFuerInput() {
  const jetzt = new Date();
  jetzt.setMinutes(jetzt.getMinutes() - jetzt.getTimezoneOffset());
  return jetzt.toISOString().slice(0, 16);
}

export function BearbeitungsFormular({ auftragId, techniker, startwerte, person = null, gesperrt = false }) {
  const [zustand, aktion] = useActionState(auftragSpeichern.bind(null, auftragId), { fehler: {}, eingabe: startwerte });
  const { fehler, eingabe } = zustand;
  const endeRef = useRef(null);
  const massnahmeRef = useRef(null);
  // Techniker und Status gesteuert, damit "Mir zuweisen" beide setzen kann
  const [technikerId, setTechnikerId] = useState(eingabe.techniker_id);
  const [status, setStatus] = useState(eingabe.status);
  const hatFehler = Object.keys(fehler).length > 0;
  const t = useT();

  // Komfort: Beim Wechsel auf "erledigt" die Endzeit mit jetzt vorbelegen und zur Maßnahme springen
  function statusGeaendert(neu) {
    setStatus(neu);
    if (neu !== 'erledigt') return;
    if (endeRef.current && endeRef.current.value === '') endeRef.current.value = jetztFuerInput();
    massnahmeRef.current?.focus();
  }

  // "Mir zuweisen": eigenen Techniker auswählen; ein nur gemeldeter Auftrag wird dabei "zugewiesen"
  const eigeneId = person?.rolle === 'Instandhaltung' && person.techniker_id ? String(person.techniker_id) : null;
  function mirZuweisen() {
    setTechnikerId(eigeneId);
    if (status === 'gemeldet') setStatus('zugewiesen');
    document.getElementById('techniker_id')?.focus();
  }

  return (
    <form action={aktion} className="karte" noValidate style={{ '--i': 1 }} key={JSON.stringify(eingabe)}>
      <h2 className="abschnitt-titel">{t('Bearbeitung')}</h2>

      {hatFehler && (
        <div className="hinweis hinweis-fehler" role="alert">
          <i className="bi bi-x-circle-fill" aria-hidden="true" />
          <span className="hinweis-text">{fehler.allgemein ?? t('Bitte prüfen Sie die markierten Felder.')}</span>
        </div>
      )}
      {gesperrt && (
        <div className="hinweis hinweis-hinweis">
          <i className="bi bi-lock-fill" aria-hidden="true" />
          <span className="hinweis-text">{t('Als Person aus der Produktion kannst du Störungen melden, aber keine Aufträge bearbeiten.')}</span>
        </div>
      )}

      {/* Gesperrt: alle Felder auf einmal über das fieldset deaktivieren */}
      <fieldset disabled={gesperrt}>
      <div className="row g-4 mb-4">
        <div className="col-md-6">
          <div className="d-flex justify-content-between align-items-baseline gap-2">
            <label htmlFor="techniker_id" className="form-label">{t('Techniker|Feld')}</label>
            {eigeneId && !gesperrt && (
              <button type="button" className="text-knopf" onClick={mirZuweisen}>
                <i className="bi bi-person-check" aria-hidden="true" /> {t('Mir zuweisen')}
              </button>
            )}
          </div>
          {/* Zuerst die Techniker vor Ort, darunter alle anderen Standorte */}
          <Auswahl id="techniker_id" name="techniker_id" wert={technikerId} onAendern={setTechnikerId}
                   ungueltig={Boolean(fehler.techniker_id)}
                   optionen={[
                     { wert: '', text: t('Noch nicht zugewiesen') },
                     { gruppe: t('Am Standort'), optionen: techniker.filter((x) => x.vor_ort)
                       .map((x) => ({ wert: x.id, text: `${x.name} (${t(x.qualifikation)}, ${t(x.schicht)})` })) },
                     { gruppe: t('Andere Standorte'), optionen: techniker.filter((x) => !x.vor_ort)
                       .map((x) => ({ wert: x.id, text: `${x.name} – ${x.standort}` })) },
                   ]} />
          <Feldfehler fehler={fehler} name="techniker_id" />
        </div>

        <div className="col-md-6">
          <label htmlFor="status" className="form-label">{t('Status')}</label>
          <Auswahl id="status" name="status" wert={status} onAendern={statusGeaendert} ungueltig={Boolean(fehler.status)}
                   optionen={STATUS_WERTE.map((s) => ({ wert: s, text: gross(t(s)) }))} />
          <Feldfehler fehler={fehler} name="status" />
        </div>

        <div className="col-md-6">
          <label htmlFor="start_zeit" className="form-label">{t('Arbeitsbeginn')}</label>
          <input type="datetime-local" id="start_zeit" name="start_zeit"
                 className={`form-control${fehlerklasse(fehler, 'start_zeit')}`} defaultValue={eingabe.start_zeit} />
          <Feldfehler fehler={fehler} name="start_zeit" />
          <div className="form-text">{t('Wird bei „in Arbeit“ automatisch gesetzt.')}</div>
        </div>

        <div className="col-md-6">
          <label htmlFor="ende_zeit" className="form-label">{t('Endzeit')}</label>
          <input type="datetime-local" id="ende_zeit" name="ende_zeit" ref={endeRef}
                 className={`form-control${fehlerklasse(fehler, 'ende_zeit')}`} defaultValue={eingabe.ende_zeit} />
          <Feldfehler fehler={fehler} name="ende_zeit" />
          <div className="form-text">{t('Pflicht beim Abschluss.')}</div>
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="massnahme" className="form-label">{t('Durchgeführte Maßnahme')}</label>
        <textarea id="massnahme" name="massnahme" rows={4} maxLength={2000} ref={massnahmeRef}
                  className={`form-control${fehlerklasse(fehler, 'massnahme')}`}
                  placeholder={t('z. B. Lager getauscht, Spindel neu ausgerichtet, Probelauf ok')}
                  defaultValue={eingabe.massnahme} />
        <Feldfehler fehler={fehler} name="massnahme" />
        <div className="form-text">{t('Pflicht beim Abschluss.')}</div>
      </div>

      {!gesperrt && (
        <div className="d-flex justify-content-end">
          <SpeichernKnopf><i className="bi bi-check2" aria-hidden="true" /> {t('Speichern')}</SpeichernKnopf>
        </div>
      )}
      </fieldset>
    </form>
  );
}

export function TeilBuchenFormular({ auftragId, ersatzteile }) {
  const leer = { ersatzteil_id: '', menge: '1' };
  const [zustand, aktion] = useActionState(teilBuchen.bind(null, auftragId), { fehler: {}, eingabe: leer });
  const { fehler, eingabe } = zustand;
  const t = useT();

  return (
    <form action={aktion} noValidate key={JSON.stringify(eingabe)}>
      {fehler.allgemein && (
        <div className="hinweis hinweis-fehler" role="alert">
          <i className="bi bi-x-circle-fill" aria-hidden="true" />
          <span className="hinweis-text">{fehler.allgemein}</span>
        </div>
      )}

      <div className="mb-3">
        <label htmlFor="ersatzteil_id" className="form-label">{t('Ersatzteil buchen')}</label>
        <Auswahl id="ersatzteil_id" name="ersatzteil_id" standard={eingabe.ersatzteil_id}
                 ungueltig={Boolean(fehler.ersatzteil_id)} platzhalter={t('Bitte auswählen …')}
                 optionen={ersatzteile.map((e) => ({ wert: e.id, text: `${e.bezeichnung} – ${t('Bestand')}: ${e.bestand}` }))} />
        <Feldfehler fehler={fehler} name="ersatzteil_id" />
      </div>

      <div className="d-flex gap-2 align-items-start">
        <div style={{ width: 110 }}>
          <input type="number" id="menge" name="menge" min={1} max={999} inputMode="numeric" aria-label={t('Menge')}
                 className={`form-control${fehlerklasse(fehler, 'menge')}`} defaultValue={eingabe.menge} />
        </div>
        <SpeichernKnopf className="btn btn-primary flex-grow-1" ladeText={t('Buche …')}>
          <i className="bi bi-box-arrow-in-down" aria-hidden="true" /> {t('Buchen')}
        </SpeichernKnopf>
      </div>
      <Feldfehler fehler={fehler} name="menge" />
      <p className="form-text mt-3 mb-0">
        {t('Ist ein Teil nicht ausreichend auf Lager, wird automatisch eine Bestellung angelegt und der Auftrag auf „wartet auf Teil“ gesetzt.')}
      </p>
    </form>
  );
}
