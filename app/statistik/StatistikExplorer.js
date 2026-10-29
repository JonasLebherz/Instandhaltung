'use client';
/**
 * app/statistik/StatistikExplorer.js – Statistik zum Hineinzoomen
 *
 * Ebenen wie bei der Störungskarte:
 *   alle Standorte → Werk → Gebäude → Maschine
 * Ein Klick auf eine Kachel ("im Vergleich") zoomt eine Ebene tiefer, der Pfad
 * oben zoomt wieder heraus. Alle Störmeldungen des Zeitraums liegen schon im
 * Browser; jede Ebene filtert sie nur auf ihre Maschinen und rechnet neu.
 *
 * Auf jeder Ebene:
 *  - Kennzahlen: MTTR, Ausfallzeit, Störungen, offene Aufträge
 *  - weitere Werte: Störungen je Maschine bzw. Ø Tage zwischen Störungen (MTBF),
 *    Ø Ausfall je Störung, Anteil Priorität hoch, Erledigungsquote
 *  - Vergleich der Unterebene (Kacheln) bzw. bei einer Maschine ihre Störungen
 *  - Störungen und MTTR pro Monat, Ursachen, Wochentag × Uhrzeit, Prioritäten,
 *    Schichten, Techniker, verbaute Ersatzteile
 *
 * Definitionen wie in den Views: MTTR = Ø (ende_zeit − start_zeit) erledigter
 * Aufträge, Ausfallzeit = Σ (ende_zeit − Meldezeitpunkt) erledigter Aufträge.
 */
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import Kennzahl from '@/components/Kennzahl';
import { StatusPill, PrioritaetPill } from '@/components/Pills';
import { useT } from '@/components/SpracheKontext';
import { gross, T } from '@/lib/sprache';
import { datum, datumZeit, zahl } from '@/lib/format';
import { URSACHEN_LISTE, MASCHINEN_SYMBOLE, PRIORITAET_LISTE } from '@/lib/konstanten';
import Diagramm from './Diagramm';

// Schichten nach Uhrzeit der Meldung (deutsche Zeit)
const SCHICHTEN = [
  { name: T('Frühschicht'), zeit: '6–14', passt: (h) => h >= 6 && h < 14 },
  { name: T('Spätschicht'), zeit: '14–22', passt: (h) => h >= 14 && h < 22 },
  { name: T('Nachtschicht'), zeit: '22–6', passt: (h) => h >= 22 || h < 6 },
];
const BLOECKE = [0, 3, 6, 9, 12, 15, 18, 21];   // Uhrzeit in 3-Stunden-Blöcken

/** Kennzahlen für eine Menge von Störmeldungen */
function auswerten(liste) {
  const erledigt = liste.filter((e) => e.status === 'erledigt');
  const mitReparatur = erledigt.filter((e) => e.reparatur_min !== null);
  const summe = (zeilen, wert) => zeilen.reduce((s, z) => s + wert(z), 0);
  return {
    anzahl: liste.length,
    offen: liste.length - erledigt.length,
    erledigt: erledigt.length,
    mttr_min: mitReparatur.length ? summe(mitReparatur, (e) => e.reparatur_min) / mitReparatur.length : null,
    ausfall_min: summe(erledigt, (e) => e.ausfall_min ?? 0),
    hoch: liste.filter((e) => e.prioritaet === 'hoch').length,
  };
}

/** Prozent mit Schutz vor Division durch 0 */
const anteil = (teil, ganz) => (ganz ? (teil / ganz) * 100 : 0);

export default function StatistikExplorer({ daten, zeitraum, start }) {
  const t = useT();
  const { orte, ereignisse, teile, techniker, monate } = daten;
  const buehneRef = useRef(null);
  const [ebene, setEbene] = useState({
    standortId: start.standortId ?? null, gebaeudeId: start.gebaeudeId ?? null, maschineId: start.maschineId ?? null,
  });
  const [zoom, setZoom] = useState(null);   // { richtung: 'rein'|'raus', ursprung: 'x y' }

  /* ---------- Nachschlagelisten aus den Maschinen ---------- */
  const { standorte, gebaeude, maschineVon } = useMemo(() => {
    const st = new Map();
    const ge = new Map();
    orte.forEach((o) => {
      if (!st.has(o.standort_id)) st.set(o.standort_id, { id: o.standort_id, kuerzel: o.standort_kuerzel, name: o.standort, stadt: o.stadt });
      if (!ge.has(o.gebaeude_id)) ge.set(o.gebaeude_id, { id: o.gebaeude_id, standort_id: o.standort_id, kuerzel: o.gebaeude_kuerzel, bezeichnung: o.gebaeude });
    });
    return { standorte: [...st.values()], gebaeude: [...ge.values()], maschineVon: Object.fromEntries(orte.map((o) => [o.id, o])) };
  }, [orte]);

  const stufe = ebene.maschineId ? 'maschine' : ebene.gebaeudeId ? 'gebaeude' : ebene.standortId ? 'werk' : 'alle';
  const standort = standorte.find((s) => s.id === ebene.standortId) ?? null;
  const halle = gebaeude.find((g) => g.id === ebene.gebaeudeId) ?? null;
  const maschine = maschineVon[ebene.maschineId] ?? null;

  /** Gehört eine Maschine zur aktuellen Ebene? */
  const imBlick = (o) => (stufe === 'maschine' ? o.id === ebene.maschineId
    : stufe === 'gebaeude' ? o.gebaeude_id === ebene.gebaeudeId
      : stufe === 'werk' ? o.standort_id === ebene.standortId : true);

  /* ---------- Auswertung der aktuellen Ebene ---------- */
  const a = useMemo(() => {
    const maschinenIds = new Set(orte.filter(imBlick).map((o) => o.id));
    const liste = ereignisse.filter((e) => maschinenIds.has(e.maschine_id));
    const kennzahlen = auswerten(liste);

    // Pro Monat: Anzahl und MTTR
    const proMonat = monate.map((m) => {
      const imMonat = liste.filter((e) => e.monat === m.schluessel);
      return { label: m.label, anzahl: imMonat.length, mttr: auswerten(imMonat).mttr_min };
    });

    // Ursachen (alle Kategorien, häufigste zuerst)
    const ursachen = URSACHEN_LISTE
      .map((u) => ({ ursache: u, anzahl: liste.filter((e) => e.ursache === u).length }))
      .sort((x, y) => y.anzahl - x.anzahl);

    // Wochentag (1 = Montag) × 3-Stunden-Block
    const heat = Array.from({ length: 7 }, (_, tag) => BLOECKE.map((b) => liste.filter((e) => e.wochentag === tag + 1 && e.stunde >= b && e.stunde < b + 3).length));

    // Prioritäten und Schichten
    const prioritaeten = Object.keys(PRIORITAET_LISTE).map((p) => ({ prioritaet: p, anzahl: liste.filter((e) => e.prioritaet === p).length }));
    const schichten = SCHICHTEN.map((s) => ({ ...s, anzahl: liste.filter((e) => s.passt(e.stunde)).length }));

    // Techniker: Aufträge, erledigt, MTTR
    const proTechniker = techniker
      .map((te) => ({ ...te, ...auswerten(liste.filter((e) => e.techniker_id === te.id)) }))
      .filter((te) => te.anzahl > 0)
      .sort((x, y) => y.anzahl - x.anzahl)
      .slice(0, 8);

    // Verbaute Ersatzteile
    const auftragIds = new Set(liste.map((e) => e.auftrag_id));
    const mengen = {};
    teile.filter((z) => auftragIds.has(z.auftrag_id)).forEach((z) => { mengen[z.bezeichnung] = (mengen[z.bezeichnung] ?? 0) + z.menge; });
    const ersatzteile = Object.entries(mengen).map(([bezeichnung, menge]) => ({ bezeichnung, menge }))
      .sort((x, y) => y.menge - x.menge).slice(0, 8);

    return { liste, maschinenAnzahl: maschinenIds.size, kennzahlen, proMonat, ursachen, heat, prioritaeten, schichten, proTechniker, ersatzteile };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ebene, orte, ereignisse, teile, techniker, monate]);

  /* ---------- Unterebene zum Vergleichen (Kacheln) ---------- */
  const kinder = useMemo(() => {
    let liste = [];
    if (stufe === 'alle') {
      liste = standorte.map((s) => ({ art: 'werk', id: s.id, name: s.name, unter: s.stadt, filter: (o) => o.standort_id === s.id }));
    } else if (stufe === 'werk') {
      liste = gebaeude.filter((g) => g.standort_id === ebene.standortId)
        .map((g) => ({ art: 'gebaeude', id: g.id, name: g.bezeichnung, unter: g.kuerzel, filter: (o) => o.gebaeude_id === g.id }));
    } else if (stufe === 'gebaeude') {
      liste = orte.filter((o) => o.gebaeude_id === ebene.gebaeudeId)
        .map((o) => ({ art: 'maschine', id: o.id, name: o.bezeichnung, unter: o.anlagennummer, typ: o.typ, filter: (x) => x.id === o.id }));
    }
    return liste.map((k) => {
      const ids = new Set(orte.filter(k.filter).map((o) => o.id));
      return { ...k, maschinen: ids.size, ...auswerten(ereignisse.filter((e) => ids.has(e.maschine_id))) };
    }).sort((x, y) => y.ausfall_min - x.ausfall_min || y.anzahl - x.anzahl);
  }, [stufe, ebene, standorte, gebaeude, orte, ereignisse]);

  /* ---------- Zoomen ---------- */
  function zoomen(neu, richtung, element = null) {
    const box = buehneRef.current?.getBoundingClientRect();
    let ursprung = '50% 0px';
    if (element && box) {
      const r = element.getBoundingClientRect();
      ursprung = `${r.left + r.width / 2 - box.left}px ${r.top + r.height / 2 - box.top}px`;
    }
    setZoom({ richtung, ursprung });
    setEbene(neu);
    // Liegt der Anfang der Statistik oberhalb des Bildschirms, sanft dorthin scrollen
    if (box && box.top < 0) window.scrollTo({ top: window.scrollY + box.top - 90, behavior: 'smooth' });
  }
  const zuAllen = () => zoomen({ standortId: null, gebaeudeId: null, maschineId: null }, 'raus');
  const zuWerk = () => zoomen({ standortId: ebene.standortId, gebaeudeId: null, maschineId: null }, 'raus');
  const zuHalle = () => zoomen({ ...ebene, maschineId: null }, 'raus');
  function kachelGeklickt(k, e) {
    const neu = k.art === 'werk' ? { standortId: k.id, gebaeudeId: null, maschineId: null }
      : k.art === 'gebaeude' ? { ...ebene, gebaeudeId: k.id, maschineId: null }
        : { ...ebene, maschineId: k.id };
    zoomen(neu, 'rein', e.currentTarget);
  }

  // Adresse mitführen (nach dem ersten Klick), damit man die Ansicht teilen kann
  const ersteAnzeige = useRef(true);
  useEffect(() => {
    if (ersteAnzeige.current) { ersteAnzeige.current = false; return; }
    const p = new URLSearchParams({ von: zeitraum.von, bis: zeitraum.bis });
    if (standort) p.set('werk', standort.kuerzel.toLowerCase());
    if (halle) p.set('halle', halle.kuerzel.toLowerCase());
    if (maschine) p.set('maschine', String(maschine.id));
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p}`);
  }, [ebene, standort, halle, maschine, zeitraum.von, zeitraum.bis]);

  /* ---------- Anzeige ---------- */
  const k = a.kennzahlen;
  const s = t.sprache;
  const stunden = (min) => (min === null ? null : min / 60);
  const zeitraumTage = (new Date(zeitraum.bisVor) - new Date(zeitraum.ab)) / 86400000;
  const titel = maschine?.bezeichnung ?? halle?.bezeichnung ?? standort?.name ?? t('Statistik');
  const karteLink = maschine ? `/karte?werk=${maschine.standort_kuerzel.toLowerCase()}&halle=${maschine.gebaeude_kuerzel.toLowerCase()}&maschine=${maschine.id}`
    : halle ? `/karte?werk=${standort.kuerzel.toLowerCase()}&halle=${halle.kuerzel.toLowerCase()}`
      : standort ? `/karte?werk=${standort.kuerzel.toLowerCase()}` : null;
  const ebenenParameter = { werk: standort?.kuerzel.toLowerCase(), halle: halle?.kuerzel.toLowerCase(), maschine: maschine?.id };
  const schnellLink = (von) => {
    const p = new URLSearchParams({ von, bis: zeitraum.standardBis });
    Object.entries(ebenenParameter).forEach(([n, w]) => w && p.set(n, String(w)));
    return `/statistik?${p}`;
  };
  const maxAusfallKind = Math.max(1, ...kinder.map((x) => x.ausfall_min));
  const kinderTitel = { alle: t('Standorte im Vergleich'), werk: t('Gebäude im Vergleich'), gebaeude: t('Maschinen im Vergleich') }[stufe];

  return (
    <>
      {/* Kopf: Pfad zum Herauszoomen, Titel, Zeitraum */}
      <div className="seitenkopf d-flex justify-content-between align-items-end flex-wrap gap-3">
        <div>
          <nav className="brotkrumen stat-pfad" aria-label={t('Pfad')}>
            <button type="button" onClick={zuAllen} disabled={stufe === 'alle'}>
              <i className="bi bi-buildings" aria-hidden="true" /> {t('Alle Standorte')}
            </button>
            {standort && <><i className="bi bi-chevron-right" aria-hidden="true" />
              <button type="button" onClick={zuWerk} disabled={stufe === 'werk'}>{standort.name}</button></>}
            {halle && <><i className="bi bi-chevron-right" aria-hidden="true" />
              <button type="button" onClick={zuHalle} disabled={stufe === 'gebaeude'}>{halle.bezeichnung}</button></>}
            {maschine && <><i className="bi bi-chevron-right" aria-hidden="true" /><span aria-current="page">{maschine.anlagennummer}</span></>}
          </nav>
          <h1>{titel}</h1>
          <p>
            {maschine ? `${maschine.anlagennummer} · ${t(maschine.typ)} · ${t('Baujahr {n}', { n: maschine.baujahr })} · ` : ''}
            {datum(zeitraum.ab, s)} – {datum(new Date(new Date(zeitraum.bisVor) - 1), s)}
          </p>
        </div>
        {karteLink && (
          <Link href={karteLink} className="btn btn-sekundaer"><i className="bi bi-map" aria-hidden="true" /> {t('Auf der Karte zeigen')}</Link>
        )}
      </div>

      {zeitraum.hinweis && (
        <div className="hinweis hinweis-hinweis">
          <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
          <span className="hinweis-text">{zeitraum.hinweis}</span>
        </div>
      )}

      {/* Zeitraum: ein normales GET-Formular; die aktuelle Ebene wird mitgeschickt */}
      <form method="get" className="karte stat-filter" style={{ '--i': 0 }}>
        <div className="filterleiste">
          <div>
            <label htmlFor="von" className="form-label">{t('Von')}</label>
            <input type="date" id="von" name="von" className="form-control" defaultValue={zeitraum.von} key={`von-${zeitraum.von}`} />
          </div>
          <div>
            <label htmlFor="bis" className="form-label">{t('Bis')}</label>
            <input type="date" id="bis" name="bis" className="form-control" defaultValue={zeitraum.bis} key={`bis-${zeitraum.bis}`} />
          </div>
          {Object.entries(ebenenParameter).map(([n, w]) => w && <input key={n} type="hidden" name={n} value={w} />)}
          <div className="aktionen">
            <button type="submit" className="btn btn-primary">{t('Anzeigen')}</button>
          </div>
        </div>
        <div className="schnellwahl">
          {zeitraum.schnellwahl.map((w) => (
            <Link key={w.text} href={schnellLink(w.von)}
                  className={`btn btn-sekundaer btn-klein${w.von === zeitraum.von && zeitraum.bis === zeitraum.standardBis ? ' aktiv' : ''}`}>
              {t(w.text)}
            </Link>
          ))}
        </div>
      </form>

      {/* Die Bühne: Inhalt der Ebene. Beim Zoomen wächst er aus der angeklickten Kachel. */}
      <div ref={buehneRef} className="stat-buehne">
        <div key={`${ebene.standortId}-${ebene.gebaeudeId}-${ebene.maschineId}`}
             className={`stat-ebene${zoom ? ` zoom-${zoom.richtung}` : ''}`} style={zoom ? { transformOrigin: zoom.ursprung } : undefined}>

          {/* Kennzahlen */}
          <div className="row g-4 mb-2">
            <div className="col-6 col-lg-3">
              <Kennzahl titel={t('MTTR')} wert={stunden(k.mttr_min)} nachkomma={1} einheit="h"
                        zusatz={t('Ø Reparaturdauer')} symbol="bi-stopwatch" i={1} />
            </div>
            <div className="col-6 col-lg-3">
              <Kennzahl titel={t('Ausfallzeit')} wert={Math.round(k.ausfall_min / 60)} einheit="h"
                        zusatz={t('Meldung bis Behebung')} symbol="bi-hourglass-split" art="warnung" i={2} />
            </div>
            <div className="col-6 col-lg-3">
              <Kennzahl titel={t('Störungen')} wert={k.anzahl} zusatz={t('im Zeitraum gemeldet')} symbol="bi-activity" i={3} />
            </div>
            <div className="col-6 col-lg-3">
              <Kennzahl titel={t('Davon offen')} wert={k.offen} zusatz={t('noch nicht erledigt')} symbol="bi-hourglass"
                        art={k.offen > 0 ? 'rot' : 'gruen'} i={4} />
            </div>
          </div>

          {/* Weitere Werte in einer Zeile */}
          <section className="karte stat-leiste" style={{ '--i': 5 }}>
            {stufe === 'maschine' ? (
              <div>
                <strong>{k.anzahl ? zahl(zeitraumTage / k.anzahl, 1, s) : '–'}</strong>
                <span>{t('Ø Tage zwischen Störungen (MTBF)')}</span>
              </div>
            ) : (
              <div>
                <strong>{zahl(a.maschinenAnzahl ? k.anzahl / a.maschinenAnzahl : 0, 1, s)}</strong>
                <span>{t('Störungen je Maschine ({n} Maschinen)', { n: a.maschinenAnzahl })}</span>
              </div>
            )}
            <div>
              <strong>{k.erledigt ? `${zahl(k.ausfall_min / k.erledigt / 60, 1, s)} h` : '–'}</strong>
              <span>{t('Ø Ausfall je Störung')}</span>
            </div>
            <div>
              <strong>{zahl(anteil(k.hoch, k.anzahl), 0, s)} %</strong>
              <span>{t('Anteil Priorität hoch')}</span>
            </div>
            <div>
              <strong>{zahl(anteil(k.erledigt, k.anzahl), 0, s)} %</strong>
              <span>{t('Erledigungsquote')}</span>
            </div>
          </section>

          {/* Vergleich der Unterebene – Klick zoomt hinein */}
          {stufe !== 'maschine' ? (
            <section className="karte" style={{ '--i': 6 }}>
              <div className="karte-kopf">
                <h2 className="abschnitt-titel">{kinderTitel}</h2>
                <span className="klein">{t('Anklicken zum Hineinzoomen · sortiert nach Ausfallzeit')}</span>
              </div>
              <div className="stat-kacheln">
                {kinder.map((kind) => (
                  <button key={kind.id} type="button" className="stat-kachel" onClick={(e) => kachelGeklickt(kind, e)}>
                    <span className="kachel-kopf">
                      {kind.typ && <i className={`bi ${MASCHINEN_SYMBOLE[kind.typ] ?? 'bi-gear'}`} aria-hidden="true" />}
                      <span>
                        <span className="kachel-name">{kind.name}</span>
                        <span className="kachel-unter">
                          {kind.unter}{kind.art !== 'maschine' ? ` · ${t('{n} Maschinen', { n: kind.maschinen })}` : ''}
                        </span>
                      </span>
                      <i className="bi bi-zoom-in kachel-lupe" aria-hidden="true" />
                    </span>
                    <span className="kachel-zahlen">
                      <span><strong>{kind.anzahl}</strong>{t('Störungen')}</span>
                      <span><strong>{kind.mttr_min === null ? '–' : `${zahl(kind.mttr_min / 60, 1, s)} h`}</strong>MTTR</span>
                      <span><strong>{zahl(kind.ausfall_min / 60, 0, s)} h</strong>{t('Ausfall')}</span>
                    </span>
                    <span className="mini-balken" aria-hidden="true">
                      <span style={{ width: `${Math.round((kind.ausfall_min / maxAusfallKind) * 100)}%` }} />
                    </span>
                    {kind.offen > 0 && <span className="kachel-offen">{t('{n} offen', { n: kind.offen })}</span>}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="karte" style={{ '--i': 6 }}>
              <div className="karte-kopf">
                <h2 className="abschnitt-titel">{t('Störungen dieser Maschine')}</h2>
                <Link href={`/melden?maschine=${maschine.id}`}>{t('Störung melden')}</Link>
              </div>
              {a.liste.length === 0 ? (
                <p className="leer"><i className="bi bi-check-circle" />{t('Keine Störungen im Zeitraum.')}</p>
              ) : (
                <ul className="ort-liste">
                  {a.liste.slice(0, 15).map((e) => (
                    <li key={e.meldung_id}>
                      <Link href={`/auftraege/${e.auftrag_id}`} prefetch={false}>
                        <span className="flex-grow-1">
                          <span className="ort-titel">{e.beschreibung}</span>
                          <span className="ort-unter">{datumZeit(e.zeitpunkt, s)} · {t(e.ursache)}</span>
                          <span className="d-flex gap-2 mt-1 flex-wrap"><PrioritaetPill prioritaet={e.prioritaet} /><StatusPill status={e.status} /></span>
                        </span>
                        <i className="bi bi-chevron-right text-leise" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Verlauf: Anzahl und MTTR je Monat – zwei Diagramme statt zwei Achsen in einem */}
          <div className="row g-4">
            <div className="col-lg-6">
              <section className="karte" style={{ '--i': 7 }}>
                <h2 className="abschnitt-titel">{t('Störungen pro Monat')}</h2>
                <Diagramm art="saeulen" labels={a.proMonat.map((m) => m.label)} werte={a.proMonat.map((m) => m.anzahl)}
                          einheit={t('Störungen')} spalte={t('Monat')} beschreibung={t('Säulendiagramm: Anzahl der Störungen pro Monat')} />
              </section>
            </div>
            <div className="col-lg-6">
              <section className="karte" style={{ '--i': 8 }}>
                <h2 className="abschnitt-titel">{t('MTTR pro Monat')}</h2>
                <Diagramm art="linie" labels={a.proMonat.map((m) => m.label)} werte={a.proMonat.map((m) => (m.mttr === null ? null : m.mttr / 60))}
                          einheit="h" nachkomma={1} spalte={t('Monat')} beschreibung={t('Liniendiagramm: durchschnittliche Reparaturdauer pro Monat in Stunden')} />
              </section>
            </div>
          </div>

          {/* Ursachen und Wochentag × Uhrzeit */}
          <div className="row g-4">
            <div className="col-lg-5">
              <section className="karte" style={{ '--i': 9 }}>
                <h2 className="abschnitt-titel">{t('Störursachen')}</h2>
                <Diagramm art="balken" labels={a.ursachen.map((u) => t(u.ursache))} werte={a.ursachen.map((u) => u.anzahl)} hoehe={300}
                          einheit={t('Störungen')} spalte={t('Ursache')} beschreibung={t('Balkendiagramm: Störungen nach Ursache')} />
              </section>
            </div>
            <div className="col-lg-7">
              <section className="karte" style={{ '--i': 10 }}>
                <h2 className="abschnitt-titel">{t('Wann treten Störungen auf?')}</h2>
                <Heatmap heat={a.heat} t={t} />
              </section>
            </div>
          </div>

          {/* Prioritäten und Schichten */}
          <div className="row g-4">
            <div className="col-lg-6">
              <section className="karte" style={{ '--i': 11 }}>
                <h2 className="abschnitt-titel">{t('Prioritäten')}</h2>
                <div className="stat-stapel" aria-hidden="true">
                  {a.prioritaeten.filter((p) => p.anzahl > 0).map((p) => (
                    <span key={p.prioritaet} className={`stapel-${PRIORITAET_LISTE[p.prioritaet]}`}
                          style={{ flexGrow: p.anzahl }} title={`${gross(t(p.prioritaet))}: ${p.anzahl}`} />
                  ))}
                </div>
                <ul className="stat-legende">
                  {a.prioritaeten.map((p) => (
                    <li key={p.prioritaet}>
                      <PrioritaetPill prioritaet={p.prioritaet} />
                      <strong>{p.anzahl}</strong>
                      <span className="klein">{zahl(anteil(p.anzahl, k.anzahl), 0, s)} %</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <div className="col-lg-6">
              <section className="karte" style={{ '--i': 12 }}>
                <h2 className="abschnitt-titel">{t('Störungen nach Schicht')}</h2>
                <BalkenListe zeilen={a.schichten.map((sch) => ({
                  name: t(sch.name), zusatz: t('{zeit} Uhr', { zeit: sch.zeit }), wert: sch.anzahl,
                  text: `${sch.anzahl} · ${zahl(anteil(sch.anzahl, k.anzahl), 0, s)} %`,
                }))} />
              </section>
            </div>
          </div>

          {/* Techniker und Ersatzteile */}
          <div className="row g-4">
            <div className="col-lg-6">
              <section className="karte" style={{ '--i': 13 }}>
                <h2 className="abschnitt-titel">{t('Techniker')}</h2>
                {a.proTechniker.length === 0 ? (
                  <p className="leer">{t('Keine zugewiesenen Aufträge im Zeitraum.')}</p>
                ) : (
                  <div className="tabelle-rahmen">
                    <table className="tabelle">
                      <thead>
                        <tr>
                          <th>{t('Techniker')}</th>
                          <th className="zahl">{t('Aufträge')}</th>
                          <th className="zahl">{t('Erledigt')}</th>
                          <th className="zahl">MTTR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.proTechniker.map((te) => (
                          <tr key={te.id}>
                            <td>{te.name}<div className="klein">{t(te.qualifikation)}</div></td>
                            <td className="zahl">{te.anzahl}</td>
                            <td className="zahl">{te.erledigt}</td>
                            <td className="zahl">{te.mttr_min === null ? '–' : `${zahl(te.mttr_min / 60, 1, s)} h`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
            <div className="col-lg-6">
              <section className="karte" style={{ '--i': 14 }}>
                <h2 className="abschnitt-titel">{t('Verbaute Ersatzteile')}</h2>
                {a.ersatzteile.length === 0 ? (
                  <p className="leer">{t('Keine Ersatzteile im Zeitraum gebucht.')}</p>
                ) : (
                  <BalkenListe zeilen={a.ersatzteile.map((e) => ({ name: e.bezeichnung, wert: e.menge, text: t('{n} Stk.', { n: e.menge }) }))} />
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Waagerechte Balken in HTML: Name, Balken, Wert */
function BalkenListe({ zeilen }) {
  const max = Math.max(1, ...zeilen.map((z) => z.wert));
  return (
    <ul className="balken-liste">
      {zeilen.map((z) => (
        <li key={z.name}>
          <span className="balken-name">{z.name}{z.zusatz && <small>{z.zusatz}</small>}</span>
          <span className="mini-balken" aria-hidden="true"><span style={{ width: `${(z.wert / max) * 100}%` }} /></span>
          <span className="balken-wert">{z.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Wochentag × Uhrzeit: je dunkler ein Feld, desto mehr Störungen wurden in
 * diesem 3-Stunden-Block gemeldet. Eine Farbe, fünf Stufen; Werte im Tooltip
 * und in der Tabelle darunter.
 */
function Heatmap({ heat, t }) {
  const max = Math.max(1, ...heat.flat());
  const tagFormat = new Intl.DateTimeFormat(t.locale, { weekday: 'short', timeZone: 'UTC' });
  const tage = Array.from({ length: 7 }, (_, i) => tagFormat.format(new Date(Date.UTC(2026, 0, 5 + i))));   // 05.01.2026 = Montag
  const stufeVon = (n) => (n === 0 ? 0 : Math.max(1, Math.ceil((n / max) * 4)));
  const block = (b) => `${b}–${b + 3}`;
  return (
    <>
      <div className="heatmap" role="img" aria-label={t('Wochentag und Uhrzeit der Störungen')}>
        <span />
        {BLOECKE.map((b) => <span key={b} className="heat-kopf">{b}</span>)}
        {heat.map((zeile, tag) => (
          <div key={tage[tag]} className="d-contents">
            <span className="heat-tag">{tage[tag]}</span>
            {zeile.map((n, i) => (
              <span key={BLOECKE[i]} className={`heat-zelle s${stufeVon(n)}`}
                    title={t('{tag}, {zeit} Uhr: {n} Störungen', { tag: tage[tag], zeit: block(BLOECKE[i]), n })} />
            ))}
          </div>
        ))}
      </div>
      <div className="heat-legende" aria-hidden="true">
        <span>{t('wenige')}</span>
        {[0, 1, 2, 3, 4].map((x) => <i key={x} className={`heat-zelle s${x}`} />)}
        <span>{t('viele Störungen')}</span>
        <span className="ms-auto">{t('Uhrzeit (deutsche Zeit)')}</span>
      </div>
      <details className="mt-2">
        <summary className="klein">{t('Als Tabelle anzeigen')}</summary>
        <div className="tabelle-rahmen">
          <table className="tabelle mt-2">
            <thead><tr><th>{t('Tag')}</th>{BLOECKE.map((b) => <th key={b} className="zahl">{block(b)}</th>)}</tr></thead>
            <tbody>
              {heat.map((zeile, tag) => (
                <tr key={tage[tag]}><td>{tage[tag]}</td>{zeile.map((n, i) => <td key={BLOECKE[i]} className="zahl">{n}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
