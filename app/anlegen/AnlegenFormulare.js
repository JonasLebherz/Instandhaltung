'use client';
/**
 * app/anlegen/AnlegenFormulare.js – die vier Formulare der Seite /anlegen
 *
 * Oben ein Umschalter (Werk · Halle · Maschine · Mitarbeiter), darunter das passende Formular.
 * Jedes Formular nutzt useActionState mit der Aktion aus app/aktionen.js und wird mit
 * key={JSON.stringify(eingabe)} neu aufgebaut, damit die Eingaben nach einem Fehler stehen bleiben.
 * Lage auf dem Gelände bzw. in der Halle bestimmt der Server automatisch (lib/stammdaten.js).
 */
import { useActionState, useState } from 'react';
import { werkAnlegen, halleAnlegen, maschineAnlegen, personAnlegen } from '@/app/aktionen';
import Auswahl from '@/components/Auswahl';
import Feldfehler, { fehlerklasse } from '@/components/Feldfehler';
import SpeichernKnopf from '@/components/SpeichernKnopf';
import { useT } from '@/components/SpracheKontext';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import { QUALIFIKATIONEN, SCHICHTEN } from '@/lib/stammdaten';

const ARTEN = [
  { art: 'werk', text: 'Werk', symbol: 'bi-buildings' },
  { art: 'halle', text: 'Halle', symbol: 'bi-house' },
  { art: 'maschine', text: 'Maschine', symbol: 'bi-cpu' },
  { art: 'person', text: 'Mitarbeiter', symbol: 'bi-person' },
];

export default function AnlegenFormulare({ art: start, laender, werke, hallen, vorwahl, gesperrt }) {
  const t = useT();
  const [art, setArt] = useState(start);
  const waehlen = (neu) => {
    setArt(neu);
    window.history.replaceState(window.history.state, '', `/anlegen?art=${neu}`);
  };
  // Werke nach Land gruppiert (für die Auswahlfelder)
  const werkOptionen = [...new Set(werke.map((w) => w.land))].map((land) => ({
    gruppe: t(land), optionen: werke.filter((w) => w.land === land).map((w) => ({ wert: String(w.id), text: `${w.name} (${w.kuerzel})` })),
  }));

  return (
    <section className="karte anlegen" style={{ '--i': 1 }}>
      <div className="sprach-schalter anlegen-arten" role="tablist" aria-label={t('Neu anlegen')}>
        {ARTEN.map((a) => (
          <button key={a.art} type="button" role="tab" aria-selected={art === a.art} aria-pressed={art === a.art} data-art={a.art} onClick={() => waehlen(a.art)}>
            <i className={`bi ${a.symbol}`} aria-hidden="true" /> {t(a.text)}
          </button>
        ))}
      </div>
      {gesperrt && <div className="hinweis hinweis-hinweis mt-3"><span className="hinweis-text">{t('Die Rolle Produktion kann nichts anlegen.')}</span></div>}
      <fieldset disabled={gesperrt} className="mt-3">
        {art === 'werk' && <WerkFormular laender={laender} />}
        {art === 'halle' && <HalleFormular werkOptionen={werkOptionen} vorwahl={vorwahl.werk} />}
        {art === 'maschine' && <MaschineFormular hallen={hallen} vorwahl={vorwahl.halle} />}
        {art === 'person' && <PersonFormular werkOptionen={werkOptionen} vorwahl={vorwahl.werk} />}
      </fieldset>
    </section>
  );
}

/** Textfeld mit Beschriftung und Fehler */
function Feld({ name, label, eingabe, fehler, typ = 'text', breit = false, ...rest }) {
  return (
    <div className={breit ? 'col-12' : 'col-md-6'}>
      <label className="form-label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={typ} className={`form-control${fehlerklasse(fehler, name)}`} defaultValue={eingabe[name] ?? ''} {...rest} />
      <Feldfehler fehler={fehler} name={name} />
    </div>
  );
}

/** Auswahlfeld mit Beschriftung und Fehler */
function Wahl({ name, label, optionen, eingabe, fehler, onAendern }) {
  const t = useT();
  return (
    <div className="col-md-6">
      <label className="form-label" htmlFor={name}>{label}</label>
      <Auswahl id={name} name={name} standard={eingabe[name] ?? ''} optionen={optionen} onAendern={onAendern}
               platzhalter={t('Bitte auswählen …')} ungueltig={Boolean(fehler[name])} />
      <Feldfehler fehler={fehler} name={name} />
    </div>
  );
}

/** Rahmen eines Formulars: Fehler oben, Felder, Knopf */
function Formular({ aktion, zustand, knopf, children }) {
  const { fehler, eingabe } = zustand;
  return (
    <form action={aktion} noValidate key={JSON.stringify(eingabe)} className="anlegen-formular">
      {fehler.allgemein && <div className="hinweis hinweis-fehler" role="alert"><span className="hinweis-text">{fehler.allgemein}</span></div>}
      <div className="row g-3">{children}</div>
      <div className="mt-4"><SpeichernKnopf>{knopf}</SpeichernKnopf></div>
    </form>
  );
}

function WerkFormular({ laender }) {
  const t = useT();
  const [zustand, aktion] = useActionState(werkAnlegen, { fehler: {}, eingabe: { land_kuerzel: 'DE', gelaende_breite_m: '250', gelaende_tiefe_m: '160' } });
  const p = { eingabe: zustand.eingabe, fehler: zustand.fehler };
  return (
    <Formular aktion={aktion} zustand={zustand} knopf={<><i className="bi bi-plus-lg" aria-hidden="true" /> {t('Werk anlegen')}</>}>
      <Feld name="name" label={t('Name')} placeholder={t('z. B. Werk Ulm')} maxLength={100} {...p} />
      <Feld name="kuerzel" label={t('Kürzel')} placeholder="ULM" maxLength={5} {...p} />
      <Feld name="stadt" label={t('Stadt')} maxLength={100} {...p} />
      <Feld name="adresse" label={t('Adresse')} maxLength={150} {...p} />
      <Wahl name="land_kuerzel" label={t('Land')} optionen={laender.map((l) => ({ wert: l.kuerzel, text: t(l.name) }))} {...p} />
      <Feld name="schwerpunkt" label={t('Schwerpunkt')} placeholder={t('z. B. Getriebefertigung')} maxLength={100} {...p} />
      <Feld name="breitengrad" label={t('Breitengrad')} placeholder="48,40" inputMode="decimal" {...p} />
      <Feld name="laengengrad" label={t('Längengrad')} placeholder="9,99" inputMode="decimal" {...p} />
      <Feld name="gelaende_breite_m" label={t('Gelände Breite (m)')} inputMode="decimal" {...p} />
      <Feld name="gelaende_tiefe_m" label={t('Gelände Tiefe (m)')} inputMode="decimal" {...p} />
    </Formular>
  );
}

function HalleFormular({ werkOptionen, vorwahl }) {
  const t = useT();
  const [zustand, aktion] = useActionState(halleAnlegen, { fehler: {}, eingabe: { standort_id: vorwahl ? String(vorwahl) : '', breite_m: '50', tiefe_m: '30', nutzung: t('Fertigung') } });
  const p = { eingabe: zustand.eingabe, fehler: zustand.fehler };
  return (
    <Formular aktion={aktion} zustand={zustand} knopf={<><i className="bi bi-plus-lg" aria-hidden="true" /> {t('Halle anlegen')}</>}>
      <Wahl name="standort_id" label={t('Werk')} optionen={werkOptionen} {...p} />
      <Feld name="kuerzel" label={t('Kürzel')} placeholder="H5" maxLength={10} {...p} />
      <Feld name="bezeichnung" label={t('Bezeichnung')} placeholder={t('z. B. Halle 5 – Montage')} maxLength={100} {...p} />
      <Feld name="nutzung" label={t('Bereich')} maxLength={40} {...p} />
      <Feld name="breite_m" label={t('Breite (m)')} inputMode="decimal" {...p} />
      <Feld name="tiefe_m" label={t('Tiefe (m)')} inputMode="decimal" {...p} />
    </Formular>
  );
}

function MaschineFormular({ hallen, vorwahl }) {
  const t = useT();
  const [zustand, aktion] = useActionState(maschineAnlegen, { fehler: {}, eingabe: { gebaeude_id: vorwahl ? String(vorwahl) : '', baujahr: String(new Date().getFullYear()) } });
  const p = { eingabe: zustand.eingabe, fehler: zustand.fehler };
  const optionen = [...new Set(hallen.map((h) => h.werk))].map((werk) => ({
    gruppe: werk, optionen: hallen.filter((h) => h.werk === werk).map((h) => ({ wert: String(h.id), text: `${h.kuerzel} – ${h.bezeichnung} (${h.maschinen})` })),
  }));
  return (
    <Formular aktion={aktion} zustand={zustand} knopf={<><i className="bi bi-plus-lg" aria-hidden="true" /> {t('Maschine anlegen')}</>}>
      <Wahl name="gebaeude_id" label={t('Halle')} optionen={optionen} {...p} />
      <Wahl name="typ" label={t('Maschinentyp')} optionen={Object.keys(MASCHINEN_SYMBOLE).map((typ) => ({ wert: typ, text: t(typ) }))} {...p} />
      <Feld name="bezeichnung" label={t('Bezeichnung')} placeholder={t('z. B. CNC-Fräszentrum FZ-500')} maxLength={100} {...p} />
      <Feld name="baujahr" label={t('Baujahr')} inputMode="numeric" maxLength={4} {...p} />
      <Feld name="anlagennummer" label={t('Anlagennummer (leer = automatisch)')} maxLength={20} {...p} />
    </Formular>
  );
}

function PersonFormular({ werkOptionen, vorwahl }) {
  const t = useT();
  const [zustand, aktion] = useActionState(personAnlegen, { fehler: {}, eingabe: { standort_id: vorwahl ? String(vorwahl) : '', rolle: 'Instandhaltung', schicht: 'Frühschicht' } });
  const [rolle, setRolle] = useState(zustand.eingabe.rolle);
  const p = { eingabe: zustand.eingabe, fehler: zustand.fehler };
  return (
    <Formular aktion={aktion} zustand={zustand} knopf={<><i className="bi bi-plus-lg" aria-hidden="true" /> {t('Mitarbeiter anlegen')}</>}>
      <Feld name="name" label={t('Name')} placeholder={t('Vor- und Nachname')} maxLength={100} {...p} />
      <Wahl name="rolle" label={t('Rolle')} optionen={['Produktion', 'Schichtleitung', 'Instandhaltung'].map((r) => ({ wert: r, text: t(r) }))} onAendern={setRolle} {...p} />
      <Wahl name="standort_id" label={t('Werk')} optionen={werkOptionen} {...p} />
      {rolle === 'Instandhaltung' && (
        <>
          <Wahl name="qualifikation" label={t('Qualifikation')} optionen={QUALIFIKATIONEN.map((q) => ({ wert: q, text: t(q) }))} {...p} />
          <Wahl name="schicht" label={t('Schicht')} optionen={SCHICHTEN.map((s) => ({ wert: s, text: t(s) }))} {...p} />
        </>
      )}
    </Formular>
  );
}
