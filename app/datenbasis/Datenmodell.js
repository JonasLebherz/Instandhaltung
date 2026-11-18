'use client';
/**
 * app/datenbasis/Datenmodell.js – das Datenmodell im Stil eines U-Bahn-Plans
 *
 * Jede Tabelle ist eine Station, jeder Fremdschlüssel eine Strecke zur Tabelle, auf die er verweist
 * (z. B. maschine → gebaeude). Wie auf einem Netzplan verlaufen die Strecken nur waagerecht,
 * senkrecht und im 45°-Winkel, mit runden Kurven. Die Lage der Stationen (PLATZ) und der Verlauf
 * jeder Strecke (ROUTEN) sind von Hand so gelegt, dass sich keine Strecken kreuzen.
 * Laufen zwei Strecken ein Stück gemeinsam (z. B. von standort nach unten), liegen sie als
 * echte Parallelen nebeneinander (gleicher Abstand auch in den Kurven, `parallel()`).
 * Farbe = Thema der verweisenden Tabelle. Darüberfahren hebt die Strecken der Station hervor,
 * Klick öffnet darunter Spalten und Datensätze (über /api/datenbasis/<tabelle>).
 */
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import { T } from '@/lib/sprache';
import { datumZeit } from '@/lib/format';

// Lage jeder Tabelle im Plan (x, y in Rastereinheiten) und wo der Name steht
// (u = unten, o = oben, l = links, r = rechts, lo = links oben).
const PLATZ = {
  land: [0, 0, 'u'], standort: [2, 0, 'lo'], gebaeude: [4.5, 0, 'u'], maschine: [7, 0, 'o'], stoermeldung: [14, 0, 'o'],
  lagerbestand: [2, -3, 'l'], bestellung: [3.5, -1.5, 'r'], ersatzteil: [5, -3, 'o'], auftrag_ersatzteil: [11, -3, 'o'],
  wartungsplan: [7, 1.2, 'l'], wartung_durchfuehrung: [7, 2.4, 'l'], stoermeldung_foto: [10.5, 1, 'o'],
  person: [8, 4, 'uu'], wartungsauftrag: [14, 4, 'r'], auftrag_verlauf: [11, 2, 'u'], nachricht: [11, 6, 'o'], techniker: [5, 7, 'u'],
};
// Verlauf jeder Strecke: Zwischenpunkte von der verweisenden Tabelle zum Ziel (ohne Anfang und Ende)
// und seitlicher Versatz in Pixeln für Strecken, die ein Stück gemeinsam fahren.
const ROUTEN = {
  'person.standort_id': { ueber: [[4, 4], [2, 2]], versatz: -5 },
  'techniker.standort_id': { ueber: [[2, 4]], versatz: 5 },
  'person.techniker_id': {},
  'wartungsauftrag.techniker_id': { ueber: [[14, 7]] },
  'wartungsauftrag.zugewiesen_von': {},
  'wartungsauftrag.stoermeldung_id': {},
  'auftrag_verlauf.person_id': { ueber: [[10, 2]] },
  'auftrag_verlauf.auftrag_id': { ueber: [[12, 2]] },
  'nachricht.von_id': { ueber: [[10, 6]], versatz: -5 },
  'nachricht.an_id': { ueber: [[10, 6]], versatz: 5 },
  'nachricht.auftrag_id': { ueber: [[12, 6]] },
  'stoermeldung_foto.person_id': { ueber: [[8, 1]] },
  'stoermeldung_foto.stoermeldung_id': { ueber: [[13, 1]] },
  'wartung_durchfuehrung.person_id': { ueber: [[7, 3]] },
  'auftrag_ersatzteil.auftrag_id': { ueber: [[16, -3], [16, 2]] },
};
const RASTER = 56, RAND = 70;   // Pixel je Rastereinheit, Rand um den Plan (Platz für Namen)

// Thema jeder Tabelle (Farbe der Strecken und Legende)
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
 * Strecke für Tabellen ohne festen Verlauf (neue Tabellen): erst waagerecht, dann im 45°-Winkel,
 * dann senkrecht – so bleibt auch sie im Stil des Plans.
 */
function automatisch(a, b) {
  const [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  const d = Math.min(Math.abs(dx), Math.abs(dy));
  const mitte = [x1 + Math.sign(dx) * (Math.abs(dx) - d), y1];
  return [a, mitte, [mitte[0] + Math.sign(dx) * d, y1 + Math.sign(dy) * d], b];
}

/**
 * Linienzug um `abstand` Pixel seitlich verschieben – an jeder Ecke über den Schnittpunkt der
 * beiden verschobenen Teilstücke, damit die Strecke überall denselben Abstand hat (echte Parallele).
 */
function parallel(p, abstand) {
  if (!abstand) return p;
  const normale = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]; };
  return p.map((punkt, i) => {
    const n1 = i > 0 ? normale(p[i - 1], punkt) : null;
    const n2 = i < p.length - 1 ? normale(punkt, p[i + 1]) : null;
    if (!n1 || !n2) { const n = n1 ?? n2; return [punkt[0] + n[0] * abstand, punkt[1] + n[1] * abstand]; }
    const m = [n1[0] + n2[0], n1[1] + n2[1]];
    const faktor = abstand / (1 + n1[0] * n2[0] + n1[1] * n2[1]);   // Gehrung: Länge so, dass beide Seiten passen
    return [punkt[0] + m[0] * faktor, punkt[1] + m[1] * faktor];
  });
}

/** Linienzug mit abgerundeten Ecken (Radius r) – Kurven wie auf einem gedruckten Netzplan */
function rundePfad(p, r) {
  let d = `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 1; i += 1) {
    const [a, b, c] = [p[i - 1], p[i], p[i + 1]];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k = Math.min(r, l1 / 2, l2 / 2);
    const vor = [b[0] - ((b[0] - a[0]) / l1) * k, b[1] - ((b[1] - a[1]) / l1) * k];
    const nach = [b[0] + ((c[0] - b[0]) / l2) * k, b[1] + ((c[1] - b[1]) / l2) * k];
    d += ` L ${vor[0].toFixed(1)} ${vor[1].toFixed(1)} Q ${b[0].toFixed(1)} ${b[1].toFixed(1)} ${nach[0].toFixed(1)} ${nach[1].toFixed(1)}`;
  }
  return `${d} L ${p[p.length - 1][0].toFixed(1)} ${p[p.length - 1][1].toFixed(1)}`;
}

// Lage des Namens relativ zur Station: [dx, dy, Ausrichtung]
const BESCHRIFTUNG = { u: [0, 28, 'middle'], uu: [0, 50, 'middle'], o: [0, -16, 'middle'], l: [-16, 5, 'end'], r: [16, 5, 'start'], lo: [-12, -14, 'end'] };

export default function Datenmodell({ tabellen, wertelisten }) {
  const t = useT();
  const detailRef = useRef(null);
  const [hervor, setHervor] = useState(null);     // Station unter der Maus
  const [gewaehlt, setGewaehlt] = useState(null); // angeklickte Tabelle/View

  const nurTabellen = tabellen.filter((x) => x.art === 'tabelle');
  const views = tabellen.filter((x) => x.art === 'view');

  // Lage vergeben: bekannte aus PLATZ, unbekannte in eine weitere Reihe unten
  let frei = 0;
  const lage = Object.fromEntries(nurTabellen.map((tab) => {
    if (PLATZ[tab.name]) return [tab.name, PLATZ[tab.name]];
    const l = [(frei % 6) * 3, 10 + Math.floor(frei / 6) * 2, 'u'];
    frei += 1;
    return [tab.name, l];
  }));
  const xe = Object.values(lage).map((l) => l[0]), ye = Object.values(lage).map((l) => l[1]);
  const minX = Math.min(...xe, 0), minY = Math.min(...ye, 0);
  const maxX = Math.max(...xe, 16), maxY = Math.max(...ye);
  const px = ([x, y]) => [RAND + 30 + (x - minX) * RASTER, RAND + (y - minY) * RASTER];
  const breite = RAND * 2 + 60 + (maxX - minX) * RASTER, hoehe = RAND * 2 + (maxY - minY) * RASTER;

  // Strecken = Fremdschlüssel (Selbstverweise und Ziele außerhalb des Plans weglassen)
  const strecken = nurTabellen.flatMap((tab) => tab.spalten.filter((sp) => sp.fk && lage[sp.fk.tabelle] && sp.fk.tabelle !== tab.name)
    .map((sp) => {
      const schluessel = `${tab.name}.${sp.name}`;
      const route = ROUTEN[schluessel];
      const a = lage[tab.name], z = lage[sp.fk.tabelle];
      const punkte = route ? [a, ...(route.ueber ?? []), z] : PLATZ[tab.name] && PLATZ[sp.fk.tabelle] ? [a, z] : automatisch(a, z);
      return { von: tab.name, spalte: sp.name, nach: sp.fk.tabelle, d: rundePfad(parallel(punkte.map(px), route?.versatz ?? 0), 18) };
    }));

  const aktiv = hervor ?? gewaehlt;
  const betroffen = (st) => aktiv && (st.von === aktiv || st.nach === aktiv);
  const nachbar = (name) => !aktiv || name === aktiv || strecken.some((st) => (st.von === aktiv && st.nach === name) || (st.nach === aktiv && st.von === name));
  // Knotenpunkte (viele Strecken) bekommen wie Umsteigebahnhöfe einen größeren Ring
  const grad = (name) => strecken.filter((st) => st.von === name || st.nach === name).length;

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
              {strecken.map((st) => (
                <path key={`${st.von}.${st.spalte}`} d={st.d}
                      className={`netz-strecke gruppe-${gruppeVon(st.von)}${betroffen(st) ? ' aktiv' : aktiv ? ' gedimmt' : ''}`}>
                  <title>{`${st.von}.${st.spalte} → ${st.nach}`}</title>
                </path>
              ))}
            </g>
            {nurTabellen.map((tab) => {
              const [X, Y] = px(lage[tab.name]);
              const [dx, dy, anker] = BESCHRIFTUNG[lage[tab.name][2]] ?? BESCHRIFTUNG.u;
              const knoten = grad(tab.name) >= 4;
              return (
                <g key={tab.name} className={`netz-station gruppe-${gruppeVon(tab.name)}${knoten ? ' knoten' : ''}${gewaehlt === tab.name ? ' gewaehlt' : ''}${nachbar(tab.name) ? '' : ' gedimmt'}`}
                   data-tabelle={tab.name} transform={`translate(${X} ${Y})`} tabIndex={0} role="button" aria-pressed={gewaehlt === tab.name}
                   aria-label={`${tab.name}, ${tab.anzahl ?? 0} ${t('Datensätze')}`}
                   onClick={() => waehlen(tab.name)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); waehlen(tab.name); } }}
                   onMouseEnter={() => setHervor(tab.name)} onMouseLeave={() => setHervor(null)}
                   onFocus={() => setHervor(tab.name)} onBlur={() => setHervor(null)}>
                  <circle r={20} className="netz-flaeche" />
                  <circle r={knoten ? 11 : 7.5} className="netz-ring" />
                  <text x={dx} y={dy} textAnchor={anker} className="netz-name">
                    {tab.name}
                    <tspan className="netz-anzahl" dx={6}>{(tab.anzahl ?? 0).toLocaleString(t.sprache === 'en' ? 'en-US' : 'de-DE')}</tspan>
                  </text>
                  <title>{`${tab.name} · ${(tab.anzahl ?? 0)} ${t('Datensätze')}`}</title>
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
