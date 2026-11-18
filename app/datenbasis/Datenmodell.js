'use client';
/**
 * app/datenbasis/Datenmodell.js – das Datenmodell als Liniennetzplan
 *
 * Jede Tabelle ist eine Station, jeder Fremdschlüssel eine Strecke zur Tabelle, auf die er verweist
 * (z. B. maschine → gebaeude). Die Strecken verlaufen wie auf einem U-Bahn-Plan nur waagerecht,
 * senkrecht und im 45°-Winkel; zwischen den Stationsreihen liegen „Fahrspuren“, damit keine Strecke
 * durch eine fremde Station läuft. Farbe = Thema der verweisenden Tabelle, Größe der Station =
 * Zahl der Datensätze. Darüberfahren hebt die Strecken der Station hervor, Klick öffnet darunter
 * Spalten und Datensätze (über /api/datenbasis/<tabelle>).
 */
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import { T } from '@/lib/sprache';
import { datumZeit } from '@/lib/format';

// Lage jeder Tabelle im Plan (x, y in Rastereinheiten, immer gerade Zahlen; ungerade = Fahrspuren).
// Neue Tabellen, die hier fehlen, kommen in eine weitere Reihe unten.
const PLATZ = {
  land: [0, 0], standort: [2, 0], gebaeude: [4, 0], maschine: [6, 0], wartungsplan: [8, 0], wartung_durchfuehrung: [10, 0],
  bestellung: [0, 2], techniker: [2, 2], person: [4, 2], stoermeldung: [6, 2], stoermeldung_foto: [8, 2], nachricht: [10, 2],
  lagerbestand: [0, 4], ersatzteil: [2, 4], auftrag_ersatzteil: [4, 4], wartungsauftrag: [6, 4], auftrag_verlauf: [8, 4],
};
const RX = 104, RY = 78, RAND = 60, RAND_X = 100;   // Pixel je Rastereinheit, Rand (seitlich breiter für lange Namen)
const px = ([x, y]) => [RAND_X + x * RX, RAND + 20 + y * RY];

// Thema jeder Tabelle (Farbe der Karte und Legende)
const GRUPPEN = [
  { id: 'orte', name: T('Werke & Maschinen'), tabellen: ['land', 'standort', 'gebaeude', 'maschine'] },
  { id: 'stoerung', name: T('Störungen & Aufträge'), tabellen: ['stoermeldung', 'wartungsauftrag', 'auftrag_verlauf', 'stoermeldung_foto'] },
  { id: 'wartung', name: T('Wartung'), tabellen: ['wartungsplan', 'wartung_durchfuehrung'] },
  { id: 'personen', name: T('Personen'), tabellen: ['techniker', 'person', 'nachricht'] },
  { id: 'material', name: T('Ersatzteile'), tabellen: ['ersatzteil', 'auftrag_ersatzteil', 'bestellung', 'lagerbestand'] },
];
const gruppeVon = (name) => GRUPPEN.find((g) => g.tabellen.includes(name))?.id ?? 'sonst';

// Kurzbeschreibung der Views (in der Datenbank gibt es dafür keinen Kommentar)
const VIEW_TEXTE = {
  v_mttr_maschine: T('MTTR (Ø Reparaturdauer) je Maschine'),
  v_ausfallzeit_maschine: T('Ausfallzeit je Maschine'),
  v_kennzahlen_standort: T('Kennzahlen je Standort mit GPS-Position'),
  v_stoerungen_monat: T('Störungen je Monat'),
  v_stoerung_details: T('Alle Störungen mit Auftrag, Maschine und Ort'),
};

/**
 * Verlauf einer Strecke von a nach b (Rasterpunkte) im U-Bahn-Stil. versatz (px) schiebt die Strecke
 * auf der Fahrspur etwas zur Seite, damit parallele Strecken nebeneinander liegen statt übereinander.
 */
function strecke(a, b, versatz) {
  const [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1, sx = Math.sign(dx) || 1, sy = Math.sign(dy) || -1;
  let punkte;
  if ((dy === 0 && Math.abs(dx) === 2) || (dx === 0 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 2)) {
    punkte = [a, b];                                           // Nachbarn: gerade bzw. diagonal
  } else if (dy === 0) {
    punkte = [a, [x1 + sx, y1 - 1, 'h'], [x2 - sx, y1 - 1, 'h'], b];   // gleiche Reihe: über die Spur darüber
  } else if (Math.abs(dy) === 2) {
    punkte = [a, [x1 + sx, y1 + sy, 'h'], [x2 - sx, y1 + sy, 'h'], b];
  } else {
    const xs = dx === 0 ? x1 + 1 : x2 - sx;                    // senkrecht auf einer Spur zwischen zwei Spalten
    punkte = [a, [x1 + (dx === 0 ? 1 : sx), y1 + sy, 'h'], [xs, y1 + sy, 'hv'], [xs, y2 - sy, 'v'], b];
  }
  return punkte.map(([x, y, art], i) => {
    const [X, Y] = px([x, y]);
    const o = art?.includes('h') ? [0, versatz] : art === 'v' ? [versatz, 0] : [0, 0];
    return `${i === 0 ? 'M' : 'L'} ${X + (art === 'hv' ? versatz : o[0])} ${Y + o[1]}`;
  }).join(' ');
}

export default function Datenmodell({ tabellen, wertelisten }) {
  const t = useT();
  const detailRef = useRef(null);
  const [hervor, setHervor] = useState(null);     // Station unter der Maus
  const [gewaehlt, setGewaehlt] = useState(null); // angeklickte Tabelle/View

  const nurTabellen = tabellen.filter((x) => x.art === 'tabelle');
  const views = tabellen.filter((x) => x.art === 'view');

  // Lage vergeben: bekannte aus PLATZ, unbekannte in eine neue Reihe unten
  let frei = 0;
  const lage = Object.fromEntries(nurTabellen.map((tab) => {
    if (PLATZ[tab.name]) return [tab.name, PLATZ[tab.name]];
    const l = [(frei % 6) * 2, 6 + Math.floor(frei / 6) * 2];
    frei += 1;
    return [tab.name, l];
  }));
  const maxX = Math.max(...Object.values(lage).map((l) => l[0]));
  const maxY = Math.max(...Object.values(lage).map((l) => l[1]));
  const breite = RAND_X * 2 + maxX * RX, hoehe = RAND * 2 + 40 + maxY * RY;

  // Strecken = Fremdschlüssel (Selbstverweise und Ziele außerhalb des Plans weglassen)
  const strecken = nurTabellen.flatMap((tab) => tab.spalten.filter((s) => s.fk && lage[s.fk.tabelle] && s.fk.tabelle !== tab.name)
    .map((s) => ({ von: tab.name, spalte: s.name, nach: s.fk.tabelle })));
  // Strecken mit gleicher Fahrspur bekommen einen kleinen seitlichen Versatz
  const zaehler = {};
  const mitVersatz = strecken.map((s) => {
    const schl = `${Math.min(lage[s.von][1], lage[s.nach][1])}`;
    const n = (zaehler[schl] = (zaehler[schl] ?? 0) + 1);
    return { ...s, d: strecke(lage[s.von], lage[s.nach], ((n % 5) - 2) * 4) };
  });

  const aktiv = hervor ?? gewaehlt;
  const betroffen = (s) => aktiv && (s.von === aktiv || s.nach === aktiv);
  const nachbar = (name) => !aktiv || name === aktiv || strecken.some((s) => (s.von === aktiv && s.nach === name) || (s.nach === aktiv && s.von === name));
  const groesse = (anzahl) => 9 + Math.min(11, Math.log10((anzahl ?? 0) + 1) * 3.2);

  function waehlen(name) { setGewaehlt(gewaehlt === name ? null : name); }
  useEffect(() => {
    if (gewaehlt) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [gewaehlt]);

  return (
    <>
      <section className="karte netzplan-karte" style={{ '--i': 5 }}>
        <div className="karte-kopf">
          <h2 className="abschnitt-titel">{t('Datenmodell')}</h2>
          <div className="netz-legende klein">
            {GRUPPEN.map((g) => <span key={g.id} className={`gruppe-${g.id}`}><i aria-hidden="true" />{t(g.name)}</span>)}
          </div>
        </div>

        <div className="netzplan-rahmen">
          <svg className="netzplan" viewBox={`0 0 ${breite} ${hoehe}`} style={{ minWidth: breite * 0.72 }} role="img" aria-label={t('Datenmodell')}>
            <g className="netz-strecken">
              {mitVersatz.map((s) => (
                <path key={`${s.von}.${s.spalte}`} d={s.d}
                      className={`netz-strecke gruppe-${gruppeVon(s.von)}${betroffen(s) ? ' aktiv' : aktiv ? ' gedimmt' : ''}`}>
                  <title>{`${s.von}.${s.spalte} → ${s.nach}`}</title>
                </path>
              ))}
            </g>
            {nurTabellen.map((tab) => {
              const [X, Y] = px(lage[tab.name]);
              const r = groesse(tab.anzahl);
              return (
                <g key={tab.name} className={`netz-station gruppe-${gruppeVon(tab.name)}${gewaehlt === tab.name ? ' gewaehlt' : ''}${nachbar(tab.name) ? '' : ' gedimmt'}`}
                   data-tabelle={tab.name} transform={`translate(${X} ${Y})`} tabIndex={0} role="button" aria-pressed={gewaehlt === tab.name}
                   aria-label={`${tab.name}, ${tab.anzahl ?? 0} ${t('Datensätze')}`}
                   onClick={() => waehlen(tab.name)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); waehlen(tab.name); } }}
                   onMouseEnter={() => setHervor(tab.name)} onMouseLeave={() => setHervor(null)}
                   onFocus={() => setHervor(tab.name)} onBlur={() => setHervor(null)}>
                  <circle r={r + 10} className="netz-flaeche" />
                  <circle r={r} className="netz-ring" />
                  <text y={r + 18} className="netz-name">{tab.name}</text>
                  <text y={r + 33} className="netz-anzahl">{(tab.anzahl ?? 0).toLocaleString(t.sprache === 'en' ? 'en-US' : 'de-DE')}</text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="netz-unten">
          <div>
            <h3 className="er-zwischentitel">{t('Views')}</h3>
            <ul className="netz-liste">
              {views.map((v) => (
                <li key={v.name}>
                  <button type="button" className={gewaehlt === v.name ? 'gewaehlt' : ''} onClick={() => waehlen(v.name)} aria-pressed={gewaehlt === v.name}>
                    <code>{v.name}</code><span>{VIEW_TEXTE[v.name] ? t(VIEW_TEXTE[v.name]) : t('{n} Spalten', { n: v.spalten.length })}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="er-zwischentitel">{t('Wertelisten')}</h3>
            <ul className="netz-liste netz-werte">
              {wertelisten.map((w) => (
                <li key={w.typ}><code>{w.typ}</code><span>{w.werte.map((wert) => t(wert)).join(' · ')}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div ref={detailRef}>
        {gewaehlt && <TabellenDetail key={gewaehlt} tabelle={tabellen.find((x) => x.name === gewaehlt)} onSchliessen={() => setGewaehlt(null)} />}
      </div>
    </>
  );
}

/** Details einer Tabelle: Spalten und Datensätze (seitenweise) */
function TabellenDetail({ tabelle, onSchliessen }) {
  const t = useT();
  const [seite, setSeite] = useState(1);
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let aktuell = true;
    setFehler(false);
    fetch(`/api/datenbasis/${encodeURIComponent(tabelle.name)}?seite=${seite}`, { cache: 'no-store' })
      .then((antwort) => (antwort.ok ? antwort.json() : Promise.reject(new Error(String(antwort.status)))))
      .then((d) => { if (aktuell) setDaten(d); })
      .catch(() => { if (aktuell) setFehler(true); });
    return () => { aktuell = false; };
  }, [tabelle.name, seite]);

  const seiten = daten ? Math.max(1, Math.ceil(daten.anzahl / daten.proSeite)) : 1;
  // Zeitpunkte (ISO-Text) lesbar anzeigen
  const anzeigen = (wert) => (wert === null ? <span className="text-leise">NULL</span>
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(wert) ? datumZeit(wert, t.sprache) : wert);

  return (
    <section className="karte er-detail" style={{ '--i': 0 }}>
      <div className="karte-kopf">
        <h2 className="abschnitt-titel">
          <i className={`bi ${tabelle.art === 'view' ? 'bi-eye' : 'bi-table'} me-2`} aria-hidden="true" />{tabelle.name}
        </h2>
        <button type="button" className="rund-knopf" onClick={onSchliessen} aria-label={t('Schließen')}><i className="bi bi-x-lg" /></button>
      </div>
      {tabelle.beschreibung && <p className="text-leise">{t(tabelle.beschreibung)}</p>}

      <div className="row g-4">
        <div className="col-xl-4">
          <h3 className="h6 fw-semibold">{t('Spalten')}</h3>
          <ul className="er-spaltenliste">
            {tabelle.spalten.map((s) => (
              <li key={s.name}>
                <span className="er-symbol" aria-hidden="true">
                  {s.pk ? <i className="bi bi-key-fill er-pk" /> : s.fk ? <i className="bi bi-link-45deg er-fk" /> : null}
                </span>
                <span>
                  <strong>{s.name}</strong>
                  <span className="klein d-block">
                    {s.typ}{s.optional ? ` · ${t('optional')}` : ` · ${t('Pflicht')}`}{s.eindeutig ? ` · ${t('eindeutig')}` : ''}
                    {s.fk ? ` · → ${s.fk.tabelle}.${s.fk.spalte}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="col-xl-8">
          <div className="d-flex justify-content-between align-items-center mb-2 gap-2 flex-wrap">
            <h3 className="h6 fw-semibold mb-0">{t('Datensätze')}{daten ? ` (${daten.anzahl})` : ''}</h3>
            {daten && seiten > 1 && (
              <div className="d-flex align-items-center gap-2">
                <button type="button" className="btn btn-sekundaer btn-klein" disabled={seite <= 1} onClick={() => setSeite(seite - 1)}
                        aria-label={t('Vorherige Seite')}><i className="bi bi-chevron-left" /></button>
                <span className="klein">{t('Seite {a} von {b}', { a: seite, b: seiten })}</span>
                <button type="button" className="btn btn-sekundaer btn-klein" disabled={seite >= seiten} onClick={() => setSeite(seite + 1)}
                        aria-label={t('Nächste Seite')}><i className="bi bi-chevron-right" /></button>
              </div>
            )}
          </div>
          {fehler && <p className="text-leise">{t('Die Datensätze konnten nicht geladen werden.')}</p>}
          {!daten && !fehler && <p className="text-leise"><span className="lade-kreis d-inline-block me-2" aria-hidden="true" />{t('Wird geladen …')}</p>}
          {daten && (
            <div className="tabelle-rahmen er-vorschau">
              <table className="tabelle">
                <thead><tr>{daten.spalten.map((s) => <th key={s}>{s}</th>)}</tr></thead>
                <tbody>
                  {daten.zeilen.map((zeile, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={i}>{zeile.map((wert, j) => <td key={daten.spalten[j]} className="klein">{anzeigen(wert)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {daten.zeilen.length === 0 && <p className="leer">{t('Keine Datensätze.')}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
