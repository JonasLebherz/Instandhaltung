'use client';
/**
 * app/wartung/WartungKalender.js – Monatskalender der vorbeugenden Wartung
 *
 * Termine im Kalender:
 *   rot    = überfällig (Fälligkeit liegt in der Vergangenheit, noch nicht erledigt)
 *   orange = geplant (nächste Fälligkeit und – vorausberechnet – die folgenden im Intervall)
 *   grün   = erledigt (aus wartung_durchfuehrung)
 * Rechts: ohne gewählten Tag „Anstehend“ (überfällig + nächste 7 Tage), sonst die Termine des Tages.
 * „Erledigt“ trägt die Wartung heute ein (Server-Aktion wartungErledigen), danach lädt die Seite neu.
 * Datumswerte sind Text 'JJJJ-MM-TT'; gerechnet wird in UTC, damit keine Zeitzone stört.
 */
import Link from 'next/link';
import { useActionState, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/SpracheKontext';
import Auswahl from '@/components/Auswahl';
import Feldfehler, { fehlerklasse } from '@/components/Feldfehler';
import SpeichernKnopf from '@/components/SpeichernKnopf';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import { wartungErledigen, wartungPlanen } from '@/app/aktionen';

const TAG = 86400000;
const zuDatum = (text) => new Date(`${text}T00:00:00Z`);
const zuText = (datum) => datum.toISOString().slice(0, 10);
const plusTage = (text, n) => zuText(new Date(zuDatum(text).getTime() + n * TAG));
// Dauer einer Wartung: Ein Arbeitstag hat 8 h (480 Min.). Längere Wartungen (z. B. Generalüberholung über
// drei Arbeitstage = 1440 Min.) belegen in der Zeitachse mehrere Tage.
const ARBEITSTAG_MIN = 480;
const arbeitsTage = (min) => Math.max(1, Math.ceil(min / ARBEITSTAG_MIN));
/** „45 Min.“, „4 h“, „3 Arbeitstage“ */
function dauerText(min, t) {
  if (min < 60) return t('{n} Min.', { n: min });
  if (min <= ARBEITSTAG_MIN) return t('{n} h', { n: Math.round((min / 60) * 10) / 10 });
  const tage = arbeitsTage(min);
  return tage === 1 ? t('1 Arbeitstag') : t('{n} Arbeitstage', { n: tage });
}
function heuteText() {
  // heutiges Datum in deutscher Zeit
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

export default function WartungKalender({ plaene, erledigt, maschinen, darf }) {
  const t = useT();
  const router = useRouter();
  const heute = heuteText();
  const [monat, setMonat] = useState(heute.slice(0, 7));     // 'JJJJ-MM'
  const [tag, setTag] = useState(null);                       // gewählter Tag oder null = „Anstehend“
  const [werk, setWerk] = useState('');
  const [planen, setPlanen] = useState(false);
  const [meldung, setMeldung] = useState(null);
  const [laeuft, starte] = useTransition();
  const [aktivId, setAktivId] = useState(null);

  const sichtbarePlaene = plaene.filter((p) => !werk || String(p.standort_id) === werk);
  const planVon = useMemo(() => new Map(plaene.map((p) => [p.id, p])), [plaene]);

  // Ansicht: Monatskalender oder Zeitachse (gemerkt im Browser)
  const [ansicht, setAnsicht] = useState('kalender');
  useEffect(() => { try { if (localStorage.getItem('wartungansicht') === 'zeitachse') setAnsicht('zeitachse'); } catch { /* privat */ } }, []);
  function ansichtWaehlen(a) { setAnsicht(a); try { localStorage.setItem('wartungansicht', a); } catch { /* privat */ } }
  const [achseStart, setAchseStart] = useState(() => plusTage(heute, -7));   // Zeitachse: 5 Wochen ab hier

  // Termine eines Zeitraums je Tag: { 'JJJJ-MM-TT': [{ plan, art }] } – für Kalender, Zeitachse und Tagesliste
  const termineZwischen = useCallback((anfang, ende) => {
    const liste = {};
    const dazu = (datum, eintrag) => { (liste[datum] ??= []).push(eintrag); };
    for (const p of sichtbarePlaene) {
      // nächste Fälligkeit (überfällig oder geplant), danach im Intervall vorausberechnet
      let datum = p.faellig;
      if (datum < heute) {
        if (datum >= anfang && datum <= ende) dazu(datum, { plan: p, art: 'ueberfaellig' });
        datum = plusTage(heute, p.intervall_tage);   // nach dem Nachholen geht es ab heute weiter
      }
      if (datum < anfang) datum = plusTage(datum, Math.ceil((zuDatum(anfang) - zuDatum(datum)) / TAG / p.intervall_tage) * p.intervall_tage);
      for (; datum <= ende; datum = plusTage(datum, p.intervall_tage)) dazu(datum, { plan: p, art: datum === p.faellig ? 'faellig' : 'geplant' });
    }
    for (const d of erledigt) {
      const p = planVon.get(d.plan_id);
      if (p && d.datum >= anfang && d.datum <= ende && (!werk || String(p.standort_id) === werk)) dazu(d.datum, { plan: p, art: 'erledigt', person: d.person });
    }
    return liste;
  }, [sichtbarePlaene, erledigt, planVon, heute, werk]);
  const termine = useMemo(() => termineZwischen(`${monat}-01`,
    plusTage(zuText(new Date(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5)), 1))), -1)), [termineZwischen, monat]);

  // Raster: Wochen ab Montag
  const tage = useMemo(() => {
    const erster = zuDatum(`${monat}-01`);
    const versatz = (erster.getUTCDay() + 6) % 7;
    const start = new Date(erster.getTime() - versatz * TAG);
    return Array.from({ length: 42 }, (_, i) => zuText(new Date(start.getTime() + i * TAG)));
  }, [monat]);
  const wochentage = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(t.locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 5 + i))));
  const monatsName = new Intl.DateTimeFormat(t.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(zuDatum(`${monat}-01`));
  const datumLang = (text) => new Intl.DateTimeFormat(t.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(zuDatum(text));
  const blaettern = (n) => {
    const d = zuDatum(`${monat}-01`);
    setMonat(zuText(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))).slice(0, 7));
  };

  // Liste rechts
  const anstehend = sichtbarePlaene.filter((p) => p.tage_bis <= 7);
  const eintraege = tag
    ? (termineZwischen(tag, tag)[tag] ?? []).sort((a, b) => ['ueberfaellig', 'faellig', 'geplant', 'erledigt'].indexOf(a.art) - ['ueberfaellig', 'faellig', 'geplant', 'erledigt'].indexOf(b.art))
    : anstehend.map((p) => ({ plan: p, art: p.tage_bis < 0 ? 'ueberfaellig' : 'faellig' }));

  function erledigen(plan) {
    setAktivId(plan.id);
    setMeldung(null);
    starte(async () => {
      const antwort = await wartungErledigen(plan.id);
      setMeldung(antwort?.fehler ? { art: 'fehler', text: antwort.fehler } : { art: 'erfolg', text: t('Erledigt: {aufgabe} an {maschine}.', { aufgabe: plan.aufgabe, maschine: plan.anlagennummer }) });
      router.refresh();
    });
  }

  const werke = [{ wert: '', text: t('Alle Werke') }, ...[...new Map(plaene.map((p) => [p.standort_id, p.standort])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ wert: String(id), text: name }))];
  const faelligText = (p) => (p.tage_bis < 0 ? t('seit {n} Tagen überfällig', { n: -p.tage_bis })
    : p.tage_bis === 0 ? t('heute fällig') : t('in {n} Tagen', { n: p.tage_bis }));

  return (
    <div className="row g-4">
      {/* Zeitachse braucht die volle Breite, die Liste steht dann darunter */}
      <div className={ansicht === 'zeitachse' ? 'col-12' : 'col-xl-8'}>
        <section className="karte wartung-kalender" style={{ '--i': 4 }}>
          <div className="kalender-kopf">
            {ansicht === 'kalender' ? (
              <div className="d-flex align-items-center gap-2">
                <button type="button" className="rund-knopf" onClick={() => blaettern(-1)} aria-label={t('Vorheriger Monat')}><i className="bi bi-chevron-left" /></button>
                <h2 className="abschnitt-titel mb-0 kalender-monat">{monatsName}</h2>
                <button type="button" className="rund-knopf" onClick={() => blaettern(1)} aria-label={t('Nächster Monat')}><i className="bi bi-chevron-right" /></button>
                {monat !== heute.slice(0, 7) && (
                  <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => { setMonat(heute.slice(0, 7)); setTag(null); }}>{t('Heute')}</button>
                )}
              </div>
            ) : (
              <div className="d-flex align-items-center gap-2">
                <button type="button" className="rund-knopf" onClick={() => setAchseStart(plusTage(achseStart, -7))} aria-label={t('Eine Woche zurück')}><i className="bi bi-chevron-left" /></button>
                <h2 className="abschnitt-titel mb-0 kalender-monat">{t('Zeitachse')}</h2>
                <button type="button" className="rund-knopf" onClick={() => setAchseStart(plusTage(achseStart, 7))} aria-label={t('Eine Woche vor')}><i className="bi bi-chevron-right" /></button>
                {achseStart !== plusTage(heute, -7) && (
                  <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => setAchseStart(plusTage(heute, -7))}>{t('Heute')}</button>
                )}
              </div>
            )}
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <div className="sprach-schalter wartung-schalter" role="group" aria-label={t('Ansicht')}>
                <button type="button" aria-pressed={ansicht === 'kalender'} onClick={() => ansichtWaehlen('kalender')}><i className="bi bi-calendar3" aria-hidden="true" /> {t('Kalender')}</button>
                <button type="button" aria-pressed={ansicht === 'zeitachse'} onClick={() => ansichtWaehlen('zeitachse')}><i className="bi bi-bar-chart-steps" aria-hidden="true" /> {t('Zeitachse')}</button>
              </div>
              <div className="kalender-werk"><Auswahl id="wartung-werk" optionen={werke} wert={werk} onAendern={setWerk} klein ariaLabel={t('Werk')} /></div>
              {darf && (
                <button type="button" className="btn btn-primary btn-klein" onClick={() => setPlanen(true)}>
                  <i className="bi bi-plus-lg" aria-hidden="true" /> {t('Wartung planen')}
                </button>
              )}
            </div>
          </div>

          <div className="kalender-legende klein">
            <span><i className="kal-punkt ueberfaellig" />{t('überfällig')}</span>
            <span><i className="kal-punkt faellig" />{t('fällig bzw. geplant')}</span>
            <span><i className="kal-punkt erledigt" />{t('erledigt')}</span>
            {ansicht === 'zeitachse' && <span><i className="kal-punkt mehrtaegig" />{t('schraffiert = mehrere Tage (z. B. Generalüberholung)')}</span>}
          </div>

          {ansicht === 'zeitachse' ? (
            <Zeitachse start={achseStart} heute={heute} termineZwischen={termineZwischen} gewaehlt={tag} onTag={setTag} />
          ) : (
          <div className="kalender" role="grid" aria-label={monatsName}>
            {wochentage.map((w) => <div key={w} className="kalender-wochentag" role="columnheader">{w}</div>)}
            {tage.map((d) => {
              const liste = termine[d] ?? [];
              const zahl = (art) => liste.filter((e) => (art === 'faellig' ? e.art === 'faellig' || e.art === 'geplant' : e.art === art)).length;
              const [rot, orange, gruen] = [zahl('ueberfaellig'), zahl('faellig'), zahl('erledigt')];
              return (
                <button key={d} type="button" role="gridcell" data-tag={d}
                        className={`kalender-tag${d.slice(0, 7) !== monat ? ' anderer-monat' : ''}${d === heute ? ' heute' : ''}${d === tag ? ' gewaehlt' : ''}`}
                        onClick={() => setTag(d === tag ? null : d)} aria-pressed={d === tag}
                        aria-label={`${datumLang(d)}: ${t('{n} Termine', { n: liste.length })}`}>
                  <span className="kalender-zahl">{Number(d.slice(8))}</span>
                  <span className="kalender-marken" aria-hidden="true">
                    {rot > 0 && <span className="kal-marke ueberfaellig">{rot}</span>}
                    {orange > 0 && <span className="kal-marke faellig">{orange}</span>}
                    {gruen > 0 && <span className="kal-marke erledigt">{gruen}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          )}
        </section>
      </div>

      <div className={ansicht === 'zeitachse' ? 'col-12' : 'col-xl-4'}>
        <section className={`karte wartung-liste${ansicht === 'zeitachse' ? ' liste-breit' : ''}`} style={{ '--i': 5 }}>
          <div className="karte-kopf">
            <h2 className="abschnitt-titel mb-0">{tag ? datumLang(tag) : t('Anstehend')}</h2>
            {tag && <button type="button" className="link-knopf" onClick={() => setTag(null)}>{t('Anstehend zeigen')}</button>}
          </div>
          {!tag && <p className="klein">{t('Überfällig und in den nächsten 7 Tagen fällig.')}</p>}
          {meldung && <div className={`hinweis hinweis-${meldung.art} mb-3`} role="status"><span className="hinweis-text">{meldung.text}</span></div>}
          {eintraege.length === 0 ? (
            <p className="leer"><i className="bi bi-calendar-check" aria-hidden="true" />{t('Keine Wartungen an diesem Tag.')}</p>
          ) : (
            <ul className="wartung-eintraege">
              {eintraege.map(({ plan: p, art, person }) => (
                <li key={`${p.id}-${art}`} className={`wartung-eintrag art-${art}`}>
                  <span className="wartung-symbol" aria-hidden="true"><i className={`bi ${MASCHINEN_SYMBOLE[p.typ] ?? 'bi-gear'}`} /></span>
                  <span className="wartung-text">
                    <strong>{p.aufgabe}</strong>
                    <Link href={`/maschinen/${p.maschine_id}`} className="klein wartung-maschine">{p.anlagennummer} · {p.maschine}</Link>
                    <span className="klein">{p.standort} · {t('alle {n} Tage', { n: p.intervall_tage })} · {t('Dauer {d}', { d: dauerText(p.dauer_min, t) })}</span>
                    <span className={`wartung-status ${art}`}>
                      {art === 'erledigt' ? `${t('erledigt')}${person ? ` · ${person}` : ''}` : art === 'geplant' ? t('geplant') : faelligText(p)}
                    </span>
                  </span>
                  {darf && (art === 'ueberfaellig' || (art === 'faellig' && p.tage_bis <= 7)) && (
                    <button type="button" className="rund-knopf wartung-erledigen" disabled={laeuft && aktivId === p.id}
                            onClick={() => erledigen(p)} title={t('Als erledigt eintragen')}
                            aria-label={t('{aufgabe} an {maschine} als erledigt eintragen', { aufgabe: p.aufgabe, maschine: p.anlagennummer })}>
                      <i className="bi bi-check2" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {planen && (
        <PlanenDialog maschinen={maschinen} heute={heute} onSchliessen={() => setPlanen(false)}
                      onGeplant={(text) => { setPlanen(false); setMeldung({ art: 'erfolg', text }); setTag(null); router.refresh(); }} />
      )}
    </div>
  );
}

/**
 * Zeitachse: 5 Wochen nebeneinander (Spalte je Tag), Zeile je Maschine mit Terminen im Zeitraum.
 * Heute ist hervorgehoben. Mehrere Termine einer Maschine am selben Tag stehen übereinander
 * (Überschneidung sichtbar); Wartungen länger als ein Arbeitstag (8 h) reichen über mehrere Tage.
 * Klick auf einen Termin zeigt rechts die Termine dieses Tages.
 */
const ACHSE_TAGE = 35;
const MAX_ZEILEN = 60;
function Zeitachse({ start, heute, termineZwischen, gewaehlt, onTag }) {
  const t = useT();
  const tage = Array.from({ length: ACHSE_TAGE }, (_, i) => plusTage(start, i));
  const ende = tage[tage.length - 1];
  // Etwas früher anfangen: Eine mehrtägige Wartung (z. B. Generalüberholung), die vor dem sichtbaren Zeitraum
  // begonnen hat, ragt noch hinein und muss angezeigt werden (Balken beginnt dann am linken Rand)
  const termine = Object.fromEntries(Object.entries(termineZwischen(plusTage(start, -14), ende))
    .map(([datum, liste]) => [datum, datum >= start ? liste : liste.filter((e) => plusTage(datum, arbeitsTage(e.plan.dauer_min) - 1) >= start)])
    .filter(([, liste]) => liste.length > 0));
  // Zeilen: je Maschine alle Termine, sortiert nach dem ersten Termin
  const zeilen = new Map();
  for (const [datum, liste] of Object.entries(termine)) {
    for (const e of liste) {
      const z = zeilen.get(e.plan.maschine_id) ?? { plan: e.plan, termine: [] };
      z.termine.push({ ...e, datum });
      zeilen.set(e.plan.maschine_id, z);
    }
  }
  // Maschinen mit mehrtägiger Wartung (Generalüberholung …) zuerst – sie sind für die Planung am wichtigsten
  // und sollen nicht hinter der Zeilengrenze verschwinden; sonst nach dem ersten Termin
  const gross = (z) => (z.termine.some((e) => arbeitsTage(e.plan.dauer_min) > 1) ? 0 : 1);
  const sortiert = [...zeilen.values()].map((z) => ({ ...z, termine: z.termine.sort((a, b) => a.datum.localeCompare(b.datum)) }))
    .sort((a, b) => gross(a) - gross(b) || a.termine[0].datum.localeCompare(b.termine[0].datum) || a.plan.anlagennummer.localeCompare(b.plan.anlagennummer));
  const tagFormat = new Intl.DateTimeFormat(t.locale, { weekday: 'narrow', timeZone: 'UTC' });
  const monatFormat = new Intl.DateTimeFormat(t.locale, { month: 'short', timeZone: 'UTC' });
  const spalte = (datum) => Math.round((zuDatum(datum) - zuDatum(start)) / TAG) + 2;   // Spalte 1 = Beschriftung
  const heuteSpalte = heute >= start && heute <= ende ? spalte(heute) : null;

  return (
    <div className="zeitachse-rahmen">
      <div className="zeitachse" style={{ '--tage': ACHSE_TAGE }}>
        {/* Kopf: Monat/Tag/Wochentag */}
        <div className="achse-zeile achse-kopf">
          <span className="achse-name" />
          {tage.map((d) => (
            <span key={d} className={`achse-tag${d === heute ? ' heute' : ''}${[0, 6].includes(zuDatum(d).getUTCDay()) ? ' wochenende' : ''}`}
                  style={{ gridColumn: spalte(d) }}>
              {(d.slice(8) === '01' || d === start) && <small className="achse-monat">{monatFormat.format(zuDatum(d))}</small>}
              <b>{Number(d.slice(8))}</b>
              <small>{tagFormat.format(zuDatum(d))}</small>
            </span>
          ))}
        </div>
        {sortiert.slice(0, MAX_ZEILEN).map(({ plan, termine: liste }) => {
          // Stapel je Tag: zweiter Termin am selben Tag eine Ebene tiefer
          const belegt = {};
          const balken = liste.map((e) => {
            const tageDauer = arbeitsTage(e.plan.dauer_min);
            let ebene = 0;
            while (Array.from({ length: tageDauer }, (_, k) => belegt[`${plusTage(e.datum, k)}-${ebene}`]).some(Boolean)) ebene += 1;
            for (let k = 0; k < tageDauer; k += 1) belegt[`${plusTage(e.datum, k)}-${ebene}`] = true;
            const von = Math.max(2, spalte(e.datum));
            const bis = Math.min(ACHSE_TAGE + 2, spalte(e.datum) + tageDauer);
            return { ...e, von, bis, ebene };
          });
          const ebenen = Math.max(1, ...balken.map((b) => b.ebene + 1));
          return (
            <div key={plan.maschine_id} className="achse-zeile" style={{ gridTemplateRows: `repeat(${ebenen}, 26px)` }}>
              <Link href={`/maschinen/${plan.maschine_id}`} className="achse-name" style={{ gridRow: `1 / span ${ebenen}` }}>
                <strong>{plan.anlagennummer}</strong><small>{plan.maschine}</small>
              </Link>
              {heuteSpalte && <span className="achse-heute" style={{ gridColumn: heuteSpalte, gridRow: `1 / span ${ebenen}` }} aria-hidden="true" />}
              {balken.map((b) => (
                <button key={`${b.plan.id}-${b.datum}-${b.art}`} type="button"
                        className={`achse-balken art-${b.art}${b.datum === gewaehlt ? ' gewaehlt' : ''}${arbeitsTage(b.plan.dauer_min) > 1 ? ' mehrtaegig' : ''}`}
                        style={{ gridColumn: `${b.von} / ${b.bis}`, gridRow: b.ebene + 1 }} onClick={() => onTag(b.datum)}
                        title={`${b.plan.aufgabe} · ${b.datum} · ${dauerText(b.plan.dauer_min, t)}`}
                        aria-label={`${b.plan.anlagennummer}: ${b.plan.aufgabe}, ${b.datum}, ${dauerText(b.plan.dauer_min, t)}`}>
                  <span>{b.plan.aufgabe}{arbeitsTage(b.plan.dauer_min) > 1 && <small> · {dauerText(b.plan.dauer_min, t)}</small>}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {sortiert.length === 0 && <p className="leer">{t('Keine Wartungen in diesem Zeitraum.')}</p>}
      {sortiert.length > MAX_ZEILEN && <p className="klein mt-2 mb-0">{t('{n} weitere Maschinen – oben ein Werk wählen, um alle zu sehen.', { n: sortiert.length - MAX_ZEILEN })}</p>}
    </div>
  );
}

/** Fenster „Wartung planen“: Maschine, Aufgabe, Intervall, Dauer, erste Fälligkeit */
function PlanenDialog({ maschinen, heute, onSchliessen, onGeplant }) {
  const t = useT();
  const [zustand, aktion] = useActionState(wartungPlanen, {
    fehler: {}, eingabe: { maschine_id: '', aufgabe: '', intervall_tage: '30', dauer_min: '60', start_datum: heute },
  });
  const { fehler, eingabe } = zustand;
  useEffect(() => { if (zustand.ok) onGeplant(zustand.ok); }, [zustand]);   // eslint-disable-line react-hooks/exhaustive-deps
  const optionen = [...new Map(maschinen.map((m) => [m.standort, null])).keys()].map((standort) => ({
    gruppe: standort,
    optionen: maschinen.filter((m) => m.standort === standort).map((m) => ({ wert: String(m.id), text: `${m.anlagennummer} – ${m.bezeichnung}` })),
  }));
  return createPortal(
    <div className="dialog-hintergrund" onMouseDown={(e) => { if (e.target === e.currentTarget) onSchliessen(); }}>
      <div className="dialog wartung-dialog" role="dialog" aria-modal="true" aria-label={t('Wartung planen')}>
        <div className="dialog-kopf">
          <h2 className="abschnitt-titel mb-0">{t('Wartung planen')}</h2>
          <button type="button" className="rund-knopf" onClick={onSchliessen} aria-label={t('Schließen')}><i className="bi bi-x-lg" /></button>
        </div>
        {fehler.allgemein && <div className="hinweis hinweis-fehler" role="alert"><span className="hinweis-text">{fehler.allgemein}</span></div>}
        <form action={aktion} noValidate key={JSON.stringify(eingabe)}>
          <div className="mb-3">
            <label className="form-label" htmlFor="maschine_id">{t('Maschine')}</label>
            <Auswahl id="maschine_id" name="maschine_id" standard={eingabe.maschine_id} optionen={optionen}
                     platzhalter={t('Bitte auswählen …')} ungueltig={Boolean(fehler.maschine_id)} />
            <Feldfehler fehler={fehler} name="maschine_id" />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="aufgabe">{t('Aufgabe')}</label>
            <input id="aufgabe" name="aufgabe" className={`form-control${fehlerklasse(fehler, 'aufgabe')}`} maxLength={150}
                   defaultValue={eingabe.aufgabe} placeholder={t('z. B. Hydrauliköl wechseln')} />
            <Feldfehler fehler={fehler} name="aufgabe" />
          </div>
          <div className="row g-3 mb-4">
            <div className="col-sm-4">
              <label className="form-label" htmlFor="intervall_tage">{t('Alle … Tage')}</label>
              <input id="intervall_tage" name="intervall_tage" type="number" min={1} max={1095} inputMode="numeric"
                     className={`form-control${fehlerklasse(fehler, 'intervall_tage')}`} defaultValue={eingabe.intervall_tage} />
              <Feldfehler fehler={fehler} name="intervall_tage" />
            </div>
            <div className="col-sm-4">
              <label className="form-label" htmlFor="dauer_min">{t('Dauer (Min.)')}</label>
              <input id="dauer_min" name="dauer_min" type="number" min={5} max={4800} inputMode="numeric"
                     className={`form-control${fehlerklasse(fehler, 'dauer_min')}`} defaultValue={eingabe.dauer_min} />
              <small className="form-text">{t('1 Arbeitstag = 480 Min. – längere Wartungen gehen über mehrere Tage')}</small>
              <Feldfehler fehler={fehler} name="dauer_min" />
            </div>
            <div className="col-sm-4">
              <label className="form-label" htmlFor="start_datum">{t('Erstmals fällig')}</label>
              <input id="start_datum" name="start_datum" type="date"
                     className={`form-control${fehlerklasse(fehler, 'start_datum')}`} defaultValue={eingabe.start_datum} />
              <Feldfehler fehler={fehler} name="start_datum" />
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-sekundaer" onClick={onSchliessen}>{t('Abbrechen')}</button>
            <SpeichernKnopf><i className="bi bi-calendar-plus" aria-hidden="true" /> {t('Planen')}</SpeichernKnopf>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
