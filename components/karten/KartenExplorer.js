'use client';
/**
 * components/karten/KartenExplorer.js – Störungskarte mit Zoom
 *
 * Drei Ebenen in einer "Bühne": Deutschland → Werk (Lageplan) → Gebäude (Grundriss).
 * Ein Klick auf ein Werk oder Gebäude zoomt animiert genau an diese Stelle hinein,
 * der Pfad oben zoomt wieder heraus. Alle Daten werden einmal vom Server geladen
 * (lib/karten/daten.js → alleKartenDaten), danach läuft alles ohne Wartezeit
 * im Browser.
 *
 * modus="anzeige": rechts eine Spalte mit Infos zur jeweiligen Ebene
 *                  (offene Störungen, Techniker, Maschinen-Details)
 * modus="auswahl": zum Störung melden – ein Klick auf eine Maschine ruft
 *                  onMaschine(maschine) auf
 *
 * So funktioniert die Animation:
 *  Beim Ebenenwechsel bleibt die alte Ebene kurz sichtbar ("uebergang") und wird
 *  vergrößert ausgeblendet, während die neue aus demselben Punkt herauswächst.
 *  Der Punkt (transform-origin) ist die Mitte des angeklickten Werks/Gebäudes.
 */
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import DeutschlandKarte from './DeutschlandKarte';
import Lageplan from './Lageplan';
import Grundriss from './Grundriss';
import { Legende, stufe, offenText } from './stufe';
import { StatusPill, PrioritaetPill } from '@/components/Pills';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import { KARTE_BREITE, KARTE_HOEHE } from '@/lib/karten/deutschland';

const DAUER = 560;   // ms – so lange bleibt die alte Ebene während des Zooms sichtbar

/** Seitenverhältnis (Breite / Höhe) des Inhalts einer Ebene – damit er in die Bühne passt */
function seitenverhaeltnis(ebene, standort, gebaeude) {
  if (ebene.gebaeudeId && gebaeude) return gebaeude.breite_m / gebaeude.tiefe_m;
  if (ebene.standortId && standort) return standort.gelaende_breite_m / standort.gelaende_tiefe_m;
  return KARTE_BREITE / KARTE_HOEHE;
}

export default function KartenExplorer({
  daten, modus = 'anzeige', start = {}, onMaschine, groesse = 'gross', adresseMitfuehren = false,
}) {
  const { standorte, gebaeude, maschinen, offene, techniker } = daten;
  const buehneRef = useRef(null);
  const neuRef = useRef(null);
  const altRef = useRef(null);

  const [ebene, setEbene] = useState({ standortId: start.standortId ?? null, gebaeudeId: start.gebaeudeId ?? null });
  const [maschineId, setMaschineId] = useState(start.maschineId ?? null);
  const [uebergang, setUebergang] = useState(null);   // { von, richtung: 'rein'|'raus', ursprung: {x,y}|null }

  const standortVon = (e) => standorte.find((st) => st.id === e.standortId) ?? null;
  const gebaeudeVon = (e) => gebaeude.find((g) => g.id === e.gebaeudeId) ?? null;
  const standort = standortVon(ebene);
  const aktuellesGebaeude = gebaeudeVon(ebene);
  const stufeName = ebene.gebaeudeId ? 'gebaeude' : ebene.standortId ? 'werk' : 'land';

  /* ---------- Wechsel zwischen den Ebenen ---------- */

  /** Mitte eines Elements relativ zur Bühne (Ausgangspunkt der Zoom-Animation) */
  function mitteVon(element) {
    if (!element || !buehneRef.current) return null;
    const r = element.getBoundingClientRect();
    const b = buehneRef.current.getBoundingClientRect();
    return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
  }

  function wechsle(neueEbene, richtung, ursprungsElement = null) {
    setUebergang({ von: ebene, richtung, ursprung: mitteVon(ursprungsElement) });
    setEbene(neueEbene);
    setMaschineId(null);
  }

  const zuWerk = (st) => wechsle({ standortId: st.id, gebaeudeId: null }, 'rein',
    buehneRef.current?.querySelector(`[data-ort="st-${st.id}"]`));
  const zuGebaeude = (g) => wechsle({ standortId: g.standort_id, gebaeudeId: g.id }, 'rein',
    buehneRef.current?.querySelector(`[data-ort="g-${g.id}"]`));
  const zuDeutschland = () => wechsle({ standortId: null, gebaeudeId: null }, 'raus');
  const zuStandort = () => wechsle({ standortId: ebene.standortId, gebaeudeId: null }, 'raus');

  function maschineGeklickt(m) {
    if (modus === 'auswahl') onMaschine?.(m);
    else setMaschineId(maschineId === m.id ? null : m.id);
  }

  // Beim Herauszoomen liegt der Ausgangspunkt in der NEUEN (übergeordneten) Ebene:
  // dort, wo das Werk bzw. Gebäude sitzt, aus dem wir kommen. Vor dem Zeichnen messen.
  // Die Klasse "messen" hält die Animation kurz an, sonst würde die bereits
  // vergrößerte Ebene gemessen (sie startet danach ganz normal von vorn).
  useLayoutEffect(() => {
    if (!uebergang || uebergang.richtung !== 'raus' || !neuRef.current) return;
    const kennung = uebergang.von.gebaeudeId ? `g-${uebergang.von.gebaeudeId}` : `st-${uebergang.von.standortId}`;
    neuRef.current.classList.add('messen');
    const punkt = mitteVon(neuRef.current.querySelector(`[data-ort="${kennung}"]`));
    neuRef.current.classList.remove('messen');
    if (punkt) {
      const ursprung = `${punkt.x}px ${punkt.y}px`;
      neuRef.current.style.transformOrigin = ursprung;
      if (altRef.current) altRef.current.style.transformOrigin = ursprung;
    }
  }, [uebergang]);

  // Nach der Animation die alte Ebene entfernen
  useEffect(() => {
    if (!uebergang) return undefined;
    const timer = setTimeout(() => setUebergang(null), DAUER);
    return () => clearTimeout(timer);
  }, [uebergang]);

  // Adresse mitführen (z. B. /karte?werk=ham&halle=h2&maschine=12), ohne die Seite neu zu laden.
  // Beim ersten Anzeigen bleibt die Adresse, wie sie ist – geändert wird erst nach einem Klick.
  const ersteAnzeige = useRef(true);
  useEffect(() => {
    if (ersteAnzeige.current) { ersteAnzeige.current = false; return; }
    if (!adresseMitfuehren) return;
    const p = new URLSearchParams();
    if (standort) p.set('werk', standort.kuerzel.toLowerCase());
    if (aktuellesGebaeude) p.set('halle', aktuellesGebaeude.kuerzel.toLowerCase());
    if (maschineId) p.set('maschine', String(maschineId));
    const ziel = `${window.location.pathname}${p.toString() ? `?${p}` : ''}`;
    window.history.replaceState(window.history.state, '', ziel);
  }, [adresseMitfuehren, standort, aktuellesGebaeude, maschineId]);

  /* ---------- Darstellung einer Ebene ---------- */

  function ebeneZeichnen(e, aktiv) {
    const st = standortVon(e);
    const g = gebaeudeVon(e);
    const verhaeltnis = seitenverhaeltnis(e, st, g);
    let inhalt;
    let art = 'land';
    if (g) {
      art = 'gebaeude';
      inhalt = (
        <Grundriss gebaeude={g} maschinen={maschinen.filter((m) => m.gebaeude_id === g.id)}
                   auswahlId={aktiv ? maschineId : null} onWaehle={aktiv ? maschineGeklickt : undefined} />
      );
    } else if (st) {
      art = 'werk';
      inhalt = (
        <Lageplan standort={st} gebaeude={gebaeude.filter((x) => x.standort_id === st.id)}
                  onWaehle={aktiv ? zuGebaeude : undefined} />
      );
    } else {
      inhalt = <DeutschlandKarte standorte={standorte} onWaehle={aktiv ? zuWerk : undefined} />;
    }
    return <div className={`ebene-inhalt ebene-${art}`} style={{ '--verhaeltnis': verhaeltnis }}>{inhalt}</div>;
  }

  const schluessel = `${ebene.standortId ?? 'de'}-${ebene.gebaeudeId ?? 'x'}`;
  const ursprungStil = uebergang?.ursprung ? { transformOrigin: `${uebergang.ursprung.x}px ${uebergang.ursprung.y}px` } : undefined;
  const titel = aktuellesGebaeude?.bezeichnung ?? standort?.name ?? 'Deutschland';
  const hinweis = modus === 'auswahl'
    ? { land: 'In welchem Werk?', werk: 'In welchem Gebäude?', gebaeude: 'An welcher Maschine?' }[stufeName]
    : { land: 'Werk anklicken zum Hineinzoomen', werk: 'Gebäude anklicken für den Grundriss', gebaeude: 'Maschine anklicken für Details' }[stufeName];

  const buehne = (
    <div className="explorer-buehne-rahmen">
      {/* Pfad: Deutschland › Werk › Gebäude – zoomt beim Anklicken wieder heraus */}
      <nav className="brotkrumen explorer-pfad" aria-label="Pfad">
        <button type="button" onClick={zuDeutschland} disabled={stufeName === 'land'}>
          <i className="bi bi-globe-europe-africa" aria-hidden="true" /> Deutschland
        </button>
        {standort && (
          <>
            <i className="bi bi-chevron-right" aria-hidden="true" />
            <button type="button" onClick={zuStandort} disabled={stufeName === 'werk'}>{standort.name}</button>
          </>
        )}
        {aktuellesGebaeude && (
          <>
            <i className="bi bi-chevron-right" aria-hidden="true" />
            <span aria-current="page">{aktuellesGebaeude.bezeichnung}</span>
          </>
        )}
      </nav>

      <div className={`explorer-buehne buehne-${groesse}`} ref={buehneRef}>
        {/* Kopf über der Karte: Zurück und Titel */}
        <div className="buehne-kopf">
          {stufeName !== 'land' && (
            <button type="button" className="rund-knopf glas-knopf" onClick={stufeName === 'gebaeude' ? zuStandort : zuDeutschland}
                    aria-label="Herauszoomen">
              <i className="bi bi-arrow-left" />
            </button>
          )}
          <div>
            <div className="buehne-titel">{titel}</div>
            <div className="buehne-hinweis">{hinweis}</div>
          </div>
        </div>

        {uebergang && (
          <div ref={altRef} className={`explorer-ebene ebene-alt zoom-${uebergang.richtung}`} style={ursprungStil} aria-hidden="true">
            {ebeneZeichnen(uebergang.von, false)}
          </div>
        )}
        <div ref={neuRef} key={schluessel}
             className={`explorer-ebene ebene-neu${uebergang ? ` zoom-${uebergang.richtung}` : ''}`} style={ursprungStil}>
          {ebeneZeichnen(ebene, true)}
        </div>
      </div>
      <Legende />
    </div>
  );

  return (
    <div className="row g-4">
      <div className="col-xl-8">
        <section className="karte explorer-karte" style={{ '--i': 0 }}>{buehne}</section>
      </div>
      <div className="col-xl-4 explorer-info-spalte">
        <div className="explorer-info">
          <InfoSpalte key={`${schluessel}-${maschineId ?? ''}`} stufe={stufeName} modus={modus} daten={daten}
                      standort={standort} gebaeudeAktuell={aktuellesGebaeude} maschineId={maschineId}
                      onWerk={zuWerk} onGebaeude={zuGebaeude} onMaschine={maschineGeklickt}
                      onAuswahlAufheben={() => setMaschineId(null)} />
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
 * Info-Spalte rechts neben der Karte – Inhalt passend zur Ebene
 * ================================================================== */
function InfoSpalte({ stufe: ebeneName, modus, daten, standort, gebaeudeAktuell, maschineId, onWerk, onGebaeude, onMaschine, onAuswahlAufheben }) {
  const { standorte, gebaeude, maschinen, offene, techniker } = daten;

  /* ---------- Ebene Deutschland: alle Werke ---------- */
  if (ebeneName === 'land') {
    const sortiert = modus === 'auswahl'
      ? [...standorte].sort((a, b) => a.stadt.localeCompare(b.stadt))
      : [...standorte].sort((a, b) => b.offen - a.offen || b.hoch - a.hoch || a.stadt.localeCompare(b.stadt));
    return (
      <section className="karte explorer-seite" style={{ '--i': 1 }}>
        <h2 className="abschnitt-titel">{modus === 'auswahl' ? 'oder aus der Liste' : 'Standorte'}</h2>
        <ul className="ort-liste">
          {sortiert.map((st) => (
            <li key={st.id}>
              <button type="button" onClick={() => onWerk(st)} className={`stufe-${stufe(st.offen, st.hoechste_prioritaet)}`}>
                <span>
                  <span className="ort-titel">{st.name}</span>
                  <span className="ort-unter">{st.schwerpunkt} · {st.gebaeude} Gebäude · {st.maschinen} Maschinen</span>
                </span>
                <span className="ort-zahl" aria-label={offenText(st.offen)}>{st.offen}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  /* ---------- Ebene Werk: Gebäude, offene Störungen, Techniker ---------- */
  if (ebeneName === 'werk' && standort) {
    const hallen = gebaeude.filter((g) => g.standort_id === standort.id);
    const offeneHier = offene.filter((a) => a.standort_id === standort.id);
    const technikerHier = techniker.filter((t) => t.standort_id === standort.id);
    return (
      <>
        <section className="karte explorer-seite" style={{ '--i': 1 }}>
          {modus === 'anzeige' && <p className="klein mb-3"><i className="bi bi-geo-alt" aria-hidden="true" /> {standort.adresse}</p>}
          <h2 className="abschnitt-titel">{modus === 'auswahl' ? 'oder aus der Liste' : 'Gebäude'}</h2>
          <ul className="ort-liste">
            {hallen.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => onGebaeude(g)} className={`stufe-${stufe(g.offen, g.hoechste_prioritaet)}`}>
                  <span>
                    <span className="ort-titel">{g.bezeichnung}</span>
                    <span className="ort-unter">{g.maschinen} Maschinen · {g.breite_m} × {g.tiefe_m} m</span>
                  </span>
                  <span className="ort-zahl" aria-label={offenText(g.offen)}>{g.offen}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {modus === 'anzeige' && (
          <>
            <section className="karte explorer-seite" style={{ '--i': 2 }}>
              <h2 className="abschnitt-titel">Offene Störungen</h2>
              {offeneHier.length === 0
                ? <p className="text-leise mb-0"><i className="bi bi-check-circle me-1" style={{ color: 'var(--gruen)' }} />Alle Anlagen laufen.</p>
                : <OffeneListe auftraege={offeneHier} mitGebaeude />}
            </section>
            <section className="karte explorer-seite" style={{ '--i': 3 }}>
              <h2 className="abschnitt-titel">Techniker vor Ort</h2>
              <ul className="ort-liste">
                {technikerHier.map((t) => (
                  <li key={t.id}>
                    <div className="ort-zeile">
                      <i className="bi bi-person-gear fs-5 text-leise" aria-hidden="true" />
                      <span><span className="ort-titel">{t.name}</span><span className="ort-unter">{t.qualifikation} · {t.schicht}</span></span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </>
    );
  }

  /* ---------- Ebene Gebäude ---------- */
  if (!gebaeudeAktuell) return null;
  const maschinenHier = maschinen.filter((m) => m.gebaeude_id === gebaeudeAktuell.id);
  const auswahl = maschinenHier.find((m) => m.id === maschineId) ?? null;

  if (modus === 'auswahl') {
    return (
      <section className="karte explorer-seite" style={{ '--i': 1 }}>
        <h2 className="abschnitt-titel">oder aus der Liste</h2>
        <ul className="ort-liste">
          {maschinenHier.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onMaschine(m)} className={`stufe-${stufe(m.offen, m.hoechste_prioritaet)}`}>
                <i className={`bi ${MASCHINEN_SYMBOLE[m.typ] ?? 'bi-gear'} text-leise`} aria-hidden="true" />
                <span><span className="ort-titel">{m.bezeichnung}</span><span className="ort-unter">{m.anlagennummer}</span></span>
                <i className="bi bi-chevron-right ms-auto text-leise" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (auswahl) {
    const offeneDerMaschine = offene.filter((a) => a.maschine_id === auswahl.id);
    return (
      <section className={`karte explorer-seite stufe-${stufe(auswahl.offen, auswahl.hoechste_prioritaet)}`} style={{ '--i': 1 }}>
        <div className="detail-kopf">
          <span className="detail-symbol" aria-hidden="true"><i className={`bi ${MASCHINEN_SYMBOLE[auswahl.typ] ?? 'bi-gear'}`} /></span>
          <div className="flex-grow-1">
            <h2 className="abschnitt-titel mb-0">{auswahl.bezeichnung}</h2>
            <div className="klein">{auswahl.anlagennummer} · {auswahl.typ} · Baujahr {auswahl.baujahr}</div>
          </div>
          <button type="button" className="rund-knopf" onClick={onAuswahlAufheben} aria-label="Auswahl schließen">
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="mini-kennzahlen">
          <div><strong>{auswahl.offen}</strong><span>offen</span></div>
          <div><strong>{auswahl.stoerungen_12m}</strong><span>Störungen 12 Mon.</span></div>
          <div><strong>{new Date().getFullYear() - auswahl.baujahr}</strong><span>Jahre alt</span></div>
        </div>
        <h3 className="h6 fw-semibold mb-2">{offenText(auswahl.offen)}</h3>
        {offeneDerMaschine.length === 0
          ? <p className="text-leise"><i className="bi bi-check-circle me-1" style={{ color: 'var(--gruen)' }} />Die Maschine läuft störungsfrei.</p>
          : <OffeneListe auftraege={offeneDerMaschine} />}
        <Link href={`/melden?maschine=${auswahl.id}`} className="btn btn-primary w-100 mt-3">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" /> Störung an dieser Maschine melden
        </Link>
      </section>
    );
  }

  const gestoert = maschinenHier.filter((m) => m.offen > 0).sort((a, b) => b.offen - a.offen);
  return (
    <section className="karte explorer-seite" style={{ '--i': 1 }}>
      <h2 className="abschnitt-titel">Maschinen mit Störungen</h2>
      {gestoert.length === 0 ? (
        <p className="leer"><i className="bi bi-check-circle" />Alle Maschinen in diesem Gebäude laufen.</p>
      ) : (
        <ul className="ort-liste">
          {gestoert.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onMaschine(m)} className={`stufe-${stufe(m.offen, m.hoechste_prioritaet)}`}>
                <i className={`bi ${MASCHINEN_SYMBOLE[m.typ] ?? 'bi-gear'} text-leise`} aria-hidden="true" />
                <span><span className="ort-titel">{m.bezeichnung}</span><span className="ort-unter">{m.anlagennummer}</span></span>
                <span className="ort-zahl">{m.offen}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Kompakte Liste offener Aufträge mit Link zum Auftrag */
function OffeneListe({ auftraege, mitGebaeude = false }) {
  return (
    <ul className="ort-liste">
      {auftraege.map((a) => (
        <li key={a.auftrag_id}>
          <Link href={`/auftraege/${a.auftrag_id}`}>
            <span className="flex-grow-1">
              <span className="ort-titel">{mitGebaeude ? `${a.maschine} · ${a.gebaeude_kuerzel}` : a.beschreibung}</span>
              {mitGebaeude && <span className="ort-unter">{a.beschreibung}</span>}
              <span className="d-flex gap-2 mt-1 flex-wrap"><PrioritaetPill prioritaet={a.prioritaet} /><StatusPill status={a.status} /></span>
            </span>
            <i className="bi bi-chevron-right text-leise" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
