'use client';
/**
 * app/datenbasis/Datenmodell.js – Tabellen und Beziehungen als Diagramm
 *
 * Jede Tabelle ist eine Karte mit ihren Spalten:
 *   Schlüssel-Symbol = Primärschlüssel, Ketten-Symbol = Fremdschlüssel (Verweis)
 * Die Linien zeigen die Fremdschlüssel: von der Spalte (z. B. maschine.gebaeude_id)
 * zur Spalte, auf die sie verweist (gebaeude.id). Fährt man über eine Tabelle,
 * werden ihre Beziehungen hervorgehoben.
 *
 * Klick auf eine Tabelle (oder View) öffnet darunter die Details mit allen
 * Spalten und einer Vorschau der Datensätze (25 je Seite, über
 * /api/datenbasis/<tabelle>).
 *
 * Die Linien werden nach dem Anzeigen aus den echten Positionen der Karten
 * berechnet – und neu, wenn sich die Fenstergröße ändert.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import { T } from '@/lib/sprache';
import { datumZeit } from '@/lib/format';

// Platz jeder Tabelle im Diagramm (Spalte, Zeile) – so laufen die Linien ohne Kreuzungen.
// Neue Tabellen, die hier fehlen, werden automatisch hinten angefügt.
const PLATZ = {
  standort: [0, 0], gebaeude: [1, 0], maschine: [2, 0], stoermeldung: [3, 0],
  techniker: [0, 1], person: [1, 1], wartungsauftrag: [3, 1],
  bestellung: [0, 2], ersatzteil: [1, 2], auftrag_ersatzteil: [2, 2], auftrag_verlauf: [3, 2],
};

// Kurzbeschreibung der Views (in der Datenbank gibt es dafür keinen Kommentar)
const VIEW_TEXTE = {
  v_mttr_maschine: T('MTTR (Ø Reparaturdauer) je Maschine'),
  v_ausfallzeit_maschine: T('Ausfallzeit je Maschine'),
  v_kennzahlen_standort: T('Kennzahlen je Standort mit GPS-Position'),
  v_stoerungen_monat: T('Störungen je Monat'),
  v_stoerung_details: T('Alle Störungen mit Auftrag, Maschine und Ort – Grundlage für Power BI'),
};

export default function Datenmodell({ tabellen, wertelisten }) {
  const t = useT();
  const rahmenRef = useRef(null);
  const detailRef = useRef(null);
  const [linien, setLinien] = useState([]);
  const [hervor, setHervor] = useState(null);     // Tabelle unter der Maus
  const [gewaehlt, setGewaehlt] = useState(null); // angeklickte Tabelle/View

  const nurTabellen = tabellen.filter((x) => x.art === 'tabelle');
  const views = tabellen.filter((x) => x.art === 'view');

  // Plätze vergeben: bekannte aus PLATZ, unbekannte in weitere Zeilen
  let frei = 0;
  const platzVon = Object.fromEntries(nurTabellen.map((tab) => {
    if (PLATZ[tab.name]) return [tab.name, PLATZ[tab.name]];
    const platz = [frei % 4, 3 + Math.floor(frei / 4)];
    frei += 1;
    return [tab.name, platz];
  }));

  // Alle Fremdschlüssel: { von: tabelle, spalte, nach: tabelle, zielSpalte }
  const beziehungen = nurTabellen.flatMap((tab) => tab.spalten.filter((s) => s.fk)
    .map((s) => ({ von: tab.name, spalte: s.name, nach: s.fk.tabelle, zielSpalte: s.fk.spalte })));

  /* ---------- Linien aus den Positionen der Spalten berechnen ---------- */
  useLayoutEffect(() => {
    const rahmen = rahmenRef.current;
    if (!rahmen) return undefined;

    function berechnen() {
      const box = rahmen.getBoundingClientRect();
      // Auf schmalen Bildschirmen stehen die Tabellen untereinander – dann keine Linien
      if (window.matchMedia('(max-width: 991.98px)').matches) { setLinien([]); return; }
      const stelle = (tabelle, spalte) => rahmen.querySelector(`[data-spalte="${tabelle}.${spalte}"]`)?.getBoundingClientRect();
      setLinien(beziehungen.map((b) => {
        const a = stelle(b.von, b.spalte);
        const z = stelle(b.nach, b.zielSpalte);
        if (!a || !z) return null;
        const y1 = a.top + a.height / 2 - box.top;
        const y2 = z.top + z.height / 2 - box.top;
        let d;
        if (Math.abs(a.left - z.left) < 20) {
          // gleiche Spalte im Diagramm: Bogen links außen herum
          const x = a.left - box.left;
          d = `M ${x} ${y1} C ${x - 34} ${y1}, ${x - 34} ${y2}, ${x} ${y2}`;
        } else if (z.left > a.left) {
          const x1 = a.right - box.left; const x2 = z.left - box.left; const dx = Math.max(30, (x2 - x1) / 2);
          d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        } else {
          const x1 = a.left - box.left; const x2 = z.right - box.left; const dx = Math.max(30, (x1 - x2) / 2);
          d = `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
        }
        return { ...b, d };
      }).filter(Boolean));
    }

    berechnen();
    // Die Karten gleiten beim Öffnen ein – danach noch einmal genau messen
    const spaeter = setTimeout(berechnen, 900);
    const beobachter = new ResizeObserver(berechnen);
    beobachter.observe(rahmen);
    return () => { clearTimeout(spaeter); beobachter.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabellen]);

  function waehlen(name) {
    setGewaehlt(gewaehlt === name ? null : name);
  }
  // Details sichtbar machen, sobald eine Tabelle gewählt wurde
  useEffect(() => {
    if (gewaehlt) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [gewaehlt]);

  const aktiv = hervor ?? gewaehlt;
  const verbunden = (name) => !aktiv || name === aktiv || beziehungen.some((b) => (b.von === aktiv && b.nach === name) || (b.nach === aktiv && b.von === name));

  return (
    <>
      <section className="karte" style={{ '--i': 5 }}>
        <div className="karte-kopf">
          <h2 className="abschnitt-titel">{t('Datenmodell')}</h2>
          <span className="klein">{t('Tabelle anklicken für Spalten und Daten')}</span>
        </div>
        <div className="er-legende klein">
          <span><i className="bi bi-key-fill er-pk" aria-hidden="true" /> {t('Primärschlüssel')}</span>
          <span><i className="bi bi-link-45deg er-fk" aria-hidden="true" /> {t('Fremdschlüssel (Verweis auf andere Tabelle)')}</span>
          <span><i className="bi bi-shield-lock" aria-hidden="true" /> {t('Zeilensicherheit (RLS) aktiv')}</span>
        </div>

        <div className="er-diagramm" ref={rahmenRef}>
          <svg className="er-linien" aria-hidden="true">
            {linien.map((l) => {
              const an = aktiv && (l.von === aktiv || l.nach === aktiv);
              return <path key={`${l.von}.${l.spalte}`} d={l.d} className={`er-linie${an ? ' aktiv' : aktiv ? ' gedimmt' : ''}`} />;
            })}
          </svg>
          {nurTabellen.map((tab, i) => {
            const [spalte, zeile] = platzVon[tab.name];
            return (
              <button key={tab.name} type="button"
                      className={`er-tabelle${gewaehlt === tab.name ? ' gewaehlt' : ''}${verbunden(tab.name) ? '' : ' gedimmt'}`}
                      style={{ gridColumn: spalte + 1, gridRow: zeile + 1, '--i': i }}
                      onClick={() => waehlen(tab.name)}
                      onMouseEnter={() => setHervor(tab.name)} onMouseLeave={() => setHervor(null)}
                      onFocus={() => setHervor(tab.name)} onBlur={() => setHervor(null)}
                      aria-pressed={gewaehlt === tab.name}>
                <span className="er-kopf">
                  <i className="bi bi-table" aria-hidden="true" />
                  <span className="er-name">{tab.name}</span>
                  {tab.rls && <i className="bi bi-shield-lock er-rls" title={t('Zeilensicherheit (RLS) aktiv')} />}
                  <span className="er-anzahl" title={t('Datensätze')}>{tab.anzahl ?? '–'}</span>
                </span>
                <span className="er-spalten">
                  {tab.spalten.map((s) => (
                    <span key={s.name} className="er-spalte" data-spalte={`${tab.name}.${s.name}`}>
                      <span className="er-symbol" aria-hidden="true">
                        {s.pk ? <i className="bi bi-key-fill er-pk" /> : s.fk ? <i className="bi bi-link-45deg er-fk" /> : null}
                      </span>
                      <span className="er-spaltenname">{s.name}</span>
                      {s.fk && <span className="er-ziel">→ {s.fk.tabelle}</span>}
                      <span className="er-typ">{s.typ}</span>
                    </span>
                  ))}
                </span>
                {tab.beschreibung && <span className="er-text">{t(tab.beschreibung)}</span>}
              </button>
            );
          })}
        </div>

        {/* Views (für Power BI) */}
        <h3 className="er-zwischentitel">{t('Views für Power BI')}</h3>
        <div className="er-views">
          {views.map((v) => (
            <button key={v.name} type="button" className={`er-view${gewaehlt === v.name ? ' gewaehlt' : ''}`} onClick={() => waehlen(v.name)}
                    aria-pressed={gewaehlt === v.name}>
              <span className="er-kopf"><i className="bi bi-eye" aria-hidden="true" /><span className="er-name">{v.name}</span></span>
              <span className="er-text">{VIEW_TEXTE[v.name] ? t(VIEW_TEXTE[v.name]) : t('{n} Spalten', { n: v.spalten.length })}</span>
            </button>
          ))}
        </div>

        {/* Wertelisten (ENUM-Typen) */}
        <h3 className="er-zwischentitel">{t('Wertelisten')}</h3>
        <div className="er-wertelisten">
          {wertelisten.map((w) => (
            <div key={w.typ} className="er-werteliste">
              <span className="er-name">{w.typ}</span>
              <span className="d-flex flex-wrap gap-1">
                {w.werte.map((wert) => <span key={wert} className="er-wert" title={wert}>{t(wert)}</span>)}
              </span>
            </div>
          ))}
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
