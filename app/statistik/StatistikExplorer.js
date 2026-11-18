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
 * Kreuzfilter wie in Power BI: Klick auf einen Monat, eine Ursache, Priorität, Schicht,
 * einen Maschinentyp oder Status filtert alle übrigen Auswertungen (Leiste mit Filtern oben).
 * Das angeklickte Diagramm zeigt weiter alle Werte und hebt die Auswahl hervor –
 * es wird mit allen Filtern außer seinem eigenen gerechnet (ohneFilter(dim)).
 *
 * Seiten: Die Auswertungen sind Bausteine (BAUSTEINE); feste Seiten (SEITEN) zeigen je Thema eine
 * Auswahl, dazu eigene Seiten mit Name und frei gewählten Bausteinen (localStorage „statistikSeiten“).
 * Die gewählte Seite steht in localStorage „statistikSeite“. Kennzahlen und Filter gelten für alle Seiten.
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
import { datum, datumZeit, zahl, euro } from '@/lib/format';
import { URSACHEN_LISTE, MASCHINEN_SYMBOLE, PRIORITAET_LISTE, STATUS_LISTE } from '@/lib/konstanten';
import Diagramm from './Diagramm';
import Streuung from './Streuung';
import ExportKnopf from '@/components/ExportKnopf';
import InfoKnopf from '@/components/InfoKnopf';
import { STATISTIK_INFO, STATISTIK_GRUNDLAGE } from '@/lib/statistikInfo';

// Schichten nach Uhrzeit der Meldung (deutsche Zeit)
const SCHICHTEN = [
  { name: T('Frühschicht'), zeit: '6–14', passt: (h) => h >= 6 && h < 14 },
  { name: T('Spätschicht'), zeit: '14–22', passt: (h) => h >= 14 && h < 22 },
  { name: T('Nachtschicht'), zeit: '22–6', passt: (h) => h >= 22 || h < 6 },
];
// Alter offener Aufträge in Tagen
const ALTERSSTUFEN = [
  { name: T('unter 1 Tag'), ab: 0, bis: 1 }, { name: T('1–3 Tage'), ab: 1, bis: 3 }, { name: T('3–7 Tage'), ab: 3, bis: 7 },
  { name: T('1–4 Wochen'), ab: 7, bis: 28 }, { name: T('älter als 4 Wochen'), ab: 28, bis: Infinity },
];
// Maschinenalter in Jahren (aus dem Baujahr)
const MASCHINENALTER = [
  { name: T('jünger als 5 Jahre'), ab: 0, bis: 5 }, { name: T('5–9 Jahre'), ab: 5, bis: 10 },
  { name: T('10–19 Jahre'), ab: 10, bis: 20 }, { name: T('20 Jahre und älter'), ab: 20, bis: Infinity },
];

// Kreuzfilter: Name der Dimension und wie man den Wert einer Störmeldung liest
const FILTER = {
  monat: { name: T('Monat') },
  ursache: { name: T('Ursache') },
  prioritaet: { name: T('Priorität') },
  schicht: { name: T('Schicht') },
  typ: { name: T('Maschinentyp') },
  status: { name: T('Status') },
};
// Farben je Priorität bzw. Status (CSS-Variablen) für gestapelte Säulen und Ring
const PRIO_FARBE = { hoch: '--rot', mittel: '--orange', niedrig: '--blau' };
const STATUS_FARBE = { gemeldet: '--grau', zugewiesen: '--blau', 'in Arbeit': '--lila', 'wartet auf Teil': '--orange', erledigt: '--gruen' };

/**
 * Treemap: Rechtecke (x, y, b, h in %) für Werte – rekursiv halbiert entlang der längeren Seite.
 * Einfacher als „squarified“, für bis zu ~10 Kacheln gut lesbar.
 */
function treemap(eintraege, x = 0, y = 0, b = 100, h = 100) {
  if (eintraege.length === 0) return [];
  if (eintraege.length === 1) return [{ ...eintraege[0], x, y, b, h }];
  const gesamt = eintraege.reduce((sum, e) => sum + e.wert, 0) || 1;
  let links = 0, i = 0;
  while (i < eintraege.length - 1 && links + eintraege[i].wert <= gesamt / 2) { links += eintraege[i].wert; i += 1; }
  if (i === 0) { links = eintraege[0].wert; i = 1; }
  const teil = links / gesamt;
  return b >= h
    ? [...treemap(eintraege.slice(0, i), x, y, b * teil, h), ...treemap(eintraege.slice(i), x + b * teil, y, b * (1 - teil), h)]
    : [...treemap(eintraege.slice(0, i), x, y, b, h * teil), ...treemap(eintraege.slice(i), x, y + h * teil, b, h * (1 - teil))];
}

// Alle Bausteine mit Namen (für eigene Seiten) – breit: über die ganze Breite
const BAUSTEINE = {
  leiste: { name: T('Weitere Kennzahlen'), breit: true },
  vergleich: { name: T('Vergleich der Unterebene'), breit: true },
  streuung: { name: T('Maschinen: Häufigkeit × Reparaturdauer'), breit: true },
  proMonat: { name: T('Störungen pro Monat') },
  mttrMonat: { name: T('MTTR pro Monat') },
  ursachen: { name: T('Störursachen') },
  treemap: { name: T('Ausfallzeit nach Ursache') },
  status: { name: T('Bearbeitungsstand') },
  prioritaeten: { name: T('Prioritäten') },
  schichten: { name: T('Störungen nach Schicht') },
  verfuegbarkeit: { name: T('Verfügbarkeit pro Monat') },
  reaktion: { name: T('Reaktionszeit nach Priorität') },
  pareto: { name: T('Größte Zeitfresser (Pareto)') },
  typ: { name: T('Ausfallzeit nach Maschinentyp') },
  alter: { name: T('Offene Aufträge nach Alter') },
  maschinenalter: { name: T('Störungen nach Maschinenalter') },
  techniker: { name: T('Techniker') },
  ersatzteile: { name: T('Verbaute Ersatzteile') },
};
// Feste Seiten nach Thema
const SEITEN = [
  { id: 'ueberblick', name: T('Überblick'), bausteine: ['leiste', 'vergleich', 'proMonat', 'status'] },
  { id: 'stoerungen', name: T('Störungen'), bausteine: ['proMonat', 'ursachen', 'treemap', 'prioritaeten', 'schichten'] },
  { id: 'instandhaltung', name: T('Instandhaltung'), bausteine: ['mttrMonat', 'reaktion', 'status', 'alter', 'techniker', 'ersatzteile'] },
  { id: 'anlagen', name: T('Anlagen'), bausteine: ['streuung', 'verfuegbarkeit', 'pareto', 'typ', 'maschinenalter'] },
];

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
    land: start.land ?? null, standortId: start.standortId ?? null, gebaeudeId: start.gebaeudeId ?? null, maschineId: start.maschineId ?? null,
  });
  const [zoom, setZoom] = useState(null);   // { richtung: 'rein'|'raus', ursprung: 'x y' }
  const [filter, setFilter] = useState({}); // Kreuzfilter, z. B. { prioritaet: 'hoch', monat: '2026-03' }
  // Seiten: gewählte Seite und eigene Seiten (erst im Browser lesen, sonst passt das Server-HTML nicht)
  const [seiteId, setSeiteId] = useState('ueberblick');
  const [eigeneSeiten, setEigeneSeiten] = useState([]);
  useEffect(() => {
    try {
      const gespeichert = JSON.parse(localStorage.getItem('statistikSeiten') ?? '[]');
      if (Array.isArray(gespeichert)) setEigeneSeiten(gespeichert.filter((x) => x?.id && Array.isArray(x.bausteine)));
      const zuletzt = localStorage.getItem('statistikSeite');
      if (zuletzt) setSeiteId(zuletzt);
    } catch { /* kein Speicher: feste Seiten */ }
  }, []);
  const seiteWaehlen = (id) => { setSeiteId(id); try { localStorage.setItem('statistikSeite', id); } catch { /* egal */ } };
  /** Eigene Seiten speichern (neue Liste); wahl = Seite, die danach offen ist */
  const eigeneSpeichern = (liste, wahl) => {
    setEigeneSeiten(liste);
    try { localStorage.setItem('statistikSeiten', JSON.stringify(liste)); } catch { /* egal */ }
    seiteWaehlen(wahl);
  };
  /** Filter setzen bzw. wieder entfernen (zweiter Klick auf dieselbe Auswahl) */
  const umschalten = (dim, wert) => setFilter((f) => {
    const neu = { ...f };
    if (wert === undefined || wert === null || f[dim] === wert) delete neu[dim]; else neu[dim] = wert;
    return neu;
  });

  /* ---------- Nachschlagelisten aus den Maschinen ---------- */
  const { laender, standorte, gebaeude, maschineVon } = useMemo(() => {
    const la = new Map();
    const st = new Map();
    const ge = new Map();
    orte.forEach((o) => {
      if (!la.has(o.land)) la.set(o.land, { id: o.land, name: o.land_name, hauptsitz: o.hauptsitz, werke: new Set() });
      la.get(o.land).werke.add(o.standort_id);
      if (!st.has(o.standort_id)) st.set(o.standort_id, { id: o.standort_id, kuerzel: o.standort_kuerzel, name: o.standort, stadt: o.stadt, land: o.land });
      if (!ge.has(o.gebaeude_id)) ge.set(o.gebaeude_id, { id: o.gebaeude_id, standort_id: o.standort_id, kuerzel: o.gebaeude_kuerzel, bezeichnung: o.gebaeude });
    });
    return {
      laender: [...la.values()], standorte: [...st.values()], gebaeude: [...ge.values()],
      maschineVon: Object.fromEntries(orte.map((o) => [o.id, o])),
    };
  }, [orte]);

  /** Wert einer Störmeldung in einer Filter-Dimension */
  const wertVon = (dim, e) => (dim === 'schicht' ? SCHICHTEN.find((sch) => sch.passt(e.stunde))?.name
    : dim === 'typ' ? maschineVon[e.maschine_id]?.typ : e[dim]);
  /** Passt die Meldung zu allen Filtern (außer „ohne“)? */
  const passt = (e, ohne = null) => Object.entries(filter).every(([dim, wert]) => dim === ohne || wertVon(dim, e) === wert);

  const stufe = ebene.maschineId ? 'maschine' : ebene.gebaeudeId ? 'gebaeude' : ebene.standortId ? 'werk' : ebene.land ? 'land' : 'alle';
  const land = laender.find((l) => l.id === ebene.land) ?? null;
  const standort = standorte.find((s) => s.id === ebene.standortId) ?? null;
  const halle = gebaeude.find((g) => g.id === ebene.gebaeudeId) ?? null;
  const maschine = maschineVon[ebene.maschineId] ?? null;

  /** Gehört eine Maschine zur aktuellen Ebene? */
  const imBlick = (o) => (stufe === 'maschine' ? o.id === ebene.maschineId
    : stufe === 'gebaeude' ? o.gebaeude_id === ebene.gebaeudeId
      : stufe === 'werk' ? o.standort_id === ebene.standortId
        : stufe === 'land' ? o.land === ebene.land : true);

  /* ---------- Auswertung der aktuellen Ebene ---------- */
  const a = useMemo(() => {
    const maschinenIds = new Set(orte.filter(imBlick).map((o) => o.id));
    const basis = ereignisse.filter((e) => maschinenIds.has(e.maschine_id));
    const liste = basis.filter((e) => passt(e));
    // Für das Diagramm einer Dimension: alle Filter außer ihrem eigenen (Auswahl bleibt sichtbar)
    const ohneFilter = (dim) => basis.filter((e) => passt(e, dim));
    const kennzahlen = auswerten(liste);
    // Ausfallkosten = Σ Ausfallzeit (h) × Kosten einer Stillstandsstunde der Maschine
    const ausfallkosten = liste.reduce((sum, e) => sum + ((e.ausfall_min ?? 0) / 60) * (maschineVon[e.maschine_id]?.kosten_pro_stunde ?? 0), 0);

    // Pro Monat: Anzahl und MTTR
    const fuerMonate = ohneFilter('monat');
    const proMonat = monate.map((m) => {
      const imMonat = fuerMonate.filter((e) => e.monat === m.schluessel);
      return { schluessel: m.schluessel, label: m.label, anzahl: imMonat.length, mttr: auswerten(imMonat).mttr_min };
    });
    // Je Monat nach Priorität (gestapelte Säulen) – ohne Monats- und Prioritätsfilter
    const fuerStapel = basis.filter((e) => passt(e, 'monat') && passt(e, 'prioritaet'));
    const monatPrio = Object.keys(PRIORITAET_LISTE).map((p) => ({
      prioritaet: p, werte: monate.map((m) => fuerStapel.filter((e) => e.monat === m.schluessel && e.prioritaet === p).length),
    }));

    // Ursachen (alle Kategorien, häufigste zuerst)
    const fuerUrsachen = ohneFilter('ursache');
    const ursachen = URSACHEN_LISTE
      .map((u) => {
        const zeilen = fuerUrsachen.filter((e) => e.ursache === u);
        return { ursache: u, anzahl: zeilen.length, ausfall_h: zeilen.reduce((sum, e) => sum + (e.ausfall_min ?? 0), 0) / 60 };
      })
      .sort((x, y) => y.anzahl - x.anzahl);
    // Bearbeitungsstand (Status) – ohne Statusfilter
    const fuerStatus = ohneFilter('status');
    const status = Object.keys(STATUS_LISTE).map((st) => ({ status: st, anzahl: fuerStatus.filter((e) => e.status === st).length }));

    // Wochentag (1 = Montag) × 3-Stunden-Block

    // Prioritäten und Schichten
    const fuerPrio = ohneFilter('prioritaet');
    const prioritaeten = Object.keys(PRIORITAET_LISTE).map((p) => ({ prioritaet: p, anzahl: fuerPrio.filter((e) => e.prioritaet === p).length }));
    const fuerSchicht = ohneFilter('schicht');
    const schichten = SCHICHTEN.map((s) => ({ ...s, anzahl: fuerSchicht.filter((e) => s.passt(e.stunde)).length }));

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

    // Verfügbarkeit je Monat: 1 − Ausfallzeit / (Maschinen × Zeit im Monat)
    const verfuegbarkeit = monate.map((mo) => {
      const ausfall = fuerMonate.filter((e) => e.monat === mo.schluessel).reduce((sum, e) => sum + (e.ausfall_min ?? 0), 0);
      const moeglich = maschinenIds.size * mo.tage * 1440;
      return moeglich ? Math.max(0, 100 * (1 - ausfall / moeglich)) : null;
    });

    // Reaktionszeit (Meldung → Arbeitsbeginn) je Priorität, dringendste zuerst
    const mittel = (zeilen, wert) => (zeilen.length ? zeilen.reduce((sum, z) => sum + wert(z), 0) / zeilen.length : null);
    const mitReaktion = liste.filter((e) => e.reaktion_min !== null && e.reaktion_min >= 0);
    const reaktion = Object.keys(PRIORITAET_LISTE).map((p) => {
      const zeilen = mitReaktion.filter((e) => e.prioritaet === p);
      return { prioritaet: p, anzahl: zeilen.length, min: mittel(zeilen, (e) => e.reaktion_min) };
    });
    const reaktionGesamt = mittel(mitReaktion, (e) => e.reaktion_min);

    // Pareto: Maschinen mit der meisten Ausfallzeit, dazu der kumulierte Anteil an der gesamten Ausfallzeit
    const ausfallJeMaschine = new Map();
    liste.forEach((e) => { if (e.ausfall_min) ausfallJeMaschine.set(e.maschine_id, (ausfallJeMaschine.get(e.maschine_id) ?? 0) + e.ausfall_min); });
    const ausfallGesamt = [...ausfallJeMaschine.values()].reduce((sum, w) => sum + w, 0);
    let kumuliert = 0;
    const pareto = [...ausfallJeMaschine.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([id, min]) => {
      kumuliert += min;
      return { maschine: maschineVon[id], min, anteil: anteil(kumuliert, ausfallGesamt) };
    });

    // Ausfallzeit nach Maschinentyp (Stunden)
    const jeTyp = {};
    ohneFilter('typ').forEach((e) => { const typ = maschineVon[e.maschine_id]?.typ; if (typ && e.ausfall_min) jeTyp[typ] = (jeTyp[typ] ?? 0) + e.ausfall_min / 60; });
    const ausfallTyp = Object.entries(jeTyp).map(([typ, h]) => ({ typ, h })).sort((x, y) => y.h - x.h);

    // Offene Aufträge nach Alter (seit der Meldung)
    const jetzt = Date.now();
    const offen = liste.filter((e) => e.status !== 'erledigt').map((e) => (jetzt - new Date(e.zeitpunkt).getTime()) / 86400000);
    const alter = ALTERSSTUFEN.map((st) => ({ ...st, anzahl: offen.filter((tage) => tage >= st.ab && tage < st.bis).length }));

    // Wiederholte Störungen: innerhalb von 7 Tagen nach einer vorherigen Störung an derselben Maschine
    const jeMaschine = new Map();
    [...liste].sort((x, y) => new Date(x.zeitpunkt) - new Date(y.zeitpunkt)).forEach((e) => {
      jeMaschine.set(e.maschine_id, [...(jeMaschine.get(e.maschine_id) ?? []), new Date(e.zeitpunkt).getTime()]);
    });
    let wiederholt = 0;
    jeMaschine.forEach((zeiten) => zeiten.forEach((z, i) => { if (i > 0 && z - zeiten[i - 1] < 7 * 86400000) wiederholt += 1; }));

    // Störungen je Maschine nach Maschinenalter (Baujahr)
    const jahrJetzt = new Date().getFullYear();
    const maschinenImBlick = orte.filter(imBlick);
    const nachAlter = MASCHINENALTER.map((st) => {
      const ids = new Set(maschinenImBlick.filter((o) => o.baujahr && jahrJetzt - o.baujahr >= st.ab && jahrJetzt - o.baujahr < st.bis).map((o) => o.id));
      const stoerungen = liste.filter((e) => ids.has(e.maschine_id)).length;
      return { ...st, maschinen: ids.size, jeMaschine: ids.size ? stoerungen / ids.size : 0 };
    }).filter((st) => st.maschinen > 0);

    // Streudiagramm: je Maschine Anzahl, MTTR und Ausfallzeit (nur Maschinen mit erledigter Reparatur)
    const streuung = [...maschinenIds].map((id) => {
      const zeilen = liste.filter((e) => e.maschine_id === id);
      const w = auswerten(zeilen);
      return { id, name: `${maschineVon[id]?.anlagennummer} · ${maschineVon[id]?.bezeichnung}`, anzahl: w.anzahl, mttr_h: (w.mttr_min ?? 0) / 60, ausfall_h: w.ausfall_min / 60 };
    }).filter((x) => x.anzahl > 0 && x.mttr_h > 0);

    return {
      liste, status, monatPrio, streuung, maschinenAnzahl: maschinenIds.size, kennzahlen, ausfallkosten, proMonat, ursachen, prioritaeten, schichten, proTechniker, ersatzteile,
      verfuegbarkeit, reaktion, reaktionGesamt, pareto, ausfallTyp, alter, wiederholt, nachAlter,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ebene, filter, orte, ereignisse, teile, techniker, monate]);

  /* ---------- Unterebene zum Vergleichen (Kacheln) ---------- */
  const kinder = useMemo(() => {
    let liste = [];
    if (stufe === 'alle') {
      liste = laender.map((l) => ({
        art: 'land', id: l.id, name: t(l.name), unter: l.werke.size === 1 ? t('1 Werk') : t('{n} Werke', { n: l.werke.size }),
        filter: (o) => o.land === l.id,
      }));
    } else if (stufe === 'land') {
      liste = standorte.filter((s) => s.land === ebene.land)
        .map((s) => ({ art: 'werk', id: s.id, name: s.name, unter: s.stadt, filter: (o) => o.standort_id === s.id }));
    } else if (stufe === 'werk') {
      liste = gebaeude.filter((g) => g.standort_id === ebene.standortId)
        .map((g) => ({ art: 'gebaeude', id: g.id, name: g.bezeichnung, unter: g.kuerzel, filter: (o) => o.gebaeude_id === g.id }));
    } else if (stufe === 'gebaeude') {
      liste = orte.filter((o) => o.gebaeude_id === ebene.gebaeudeId)
        .map((o) => ({ art: 'maschine', id: o.id, name: o.bezeichnung, unter: o.anlagennummer, typ: o.typ, filter: (x) => x.id === o.id }));
    }
    return liste.map((k) => {
      const ids = new Set(orte.filter(k.filter).map((o) => o.id));
      return { ...k, maschinen: ids.size, ...auswerten(ereignisse.filter((e) => ids.has(e.maschine_id) && passt(e))) };
    }).sort((x, y) => y.ausfall_min - x.ausfall_min || y.anzahl - x.anzahl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stufe, ebene, filter, laender, standorte, gebaeude, orte, ereignisse]);

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
  const zuAllen = () => zoomen({ land: null, standortId: null, gebaeudeId: null, maschineId: null }, 'raus');
  const zuLand = () => zoomen({ land: ebene.land, standortId: null, gebaeudeId: null, maschineId: null }, 'raus');
  const zuWerk = () => zoomen({ land: ebene.land, standortId: ebene.standortId, gebaeudeId: null, maschineId: null }, 'raus');
  const zuHalle = () => zoomen({ ...ebene, maschineId: null }, 'raus');
  function kachelGeklickt(k, e) {
    const neu = k.art === 'land' ? { land: k.id, standortId: null, gebaeudeId: null, maschineId: null }
      : k.art === 'werk' ? { land: ebene.land, standortId: k.id, gebaeudeId: null, maschineId: null }
      : k.art === 'gebaeude' ? { ...ebene, gebaeudeId: k.id, maschineId: null }
        : { ...ebene, maschineId: k.id };
    zoomen(neu, 'rein', e.currentTarget);
  }

  // Adresse mitführen (nach dem ersten Klick), damit man die Ansicht teilen kann
  const ersteAnzeige = useRef(true);
  useEffect(() => {
    if (ersteAnzeige.current) { ersteAnzeige.current = false; return; }
    const p = new URLSearchParams({ von: zeitraum.von, bis: zeitraum.bis });
    if (land && !standort) p.set('land', land.id.toLowerCase());
    if (standort) p.set('werk', standort.kuerzel.toLowerCase());
    if (halle) p.set('halle', halle.kuerzel.toLowerCase());
    if (maschine) p.set('maschine', String(maschine.id));
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p}`);
  }, [ebene, land, standort, halle, maschine, zeitraum.von, zeitraum.bis]);

  /* ---------- Anzeige ---------- */
  const k = a.kennzahlen;
  const s = t.sprache;
  // „i“-Knopf: Quelle (Tabellen) und Berechnung des Werts (Texte in lib/statistikInfo.js)
  const info = (schluessel, titel) => <InfoKnopf titel={titel} info={STATISTIK_INFO[schluessel]} grundlage={STATISTIK_GRUNDLAGE} />;
  const stunden = (min) => (min === null ? null : min / 60);
  const zeitraumTage = (new Date(zeitraum.bisVor) - new Date(zeitraum.ab)) / 86400000;
  const titel = maschine?.bezeichnung ?? halle?.bezeichnung ?? standort?.name ?? (land ? t(land.name) : t('Statistik'));
  const karteLink = maschine ? `/karte?werk=${maschine.standort_kuerzel.toLowerCase()}&halle=${maschine.gebaeude_kuerzel.toLowerCase()}&maschine=${maschine.id}`
    : halle ? `/karte?werk=${standort.kuerzel.toLowerCase()}&halle=${halle.kuerzel.toLowerCase()}`
      : standort ? `/karte?werk=${standort.kuerzel.toLowerCase()}`
        : land ? `/karte?land=${land.id.toLowerCase()}` : null;
  const ebenenParameter = { land: standort ? undefined : land?.id.toLowerCase(), werk: standort?.kuerzel.toLowerCase(), halle: halle?.kuerzel.toLowerCase(), maschine: maschine?.id };
  const schnellLink = (von) => {
    const p = new URLSearchParams({ von, bis: zeitraum.standardBis });
    Object.entries(ebenenParameter).forEach(([n, w]) => w && p.set(n, String(w)));
    return `/statistik?${p}`;
  };
  const maxAusfallKind = Math.max(1, ...kinder.map((x) => x.ausfall_min));
  const kinderTitel = {
    alle: t('Länder im Vergleich'), land: t('Standorte im Vergleich'), werk: t('Gebäude im Vergleich'), gebaeude: t('Maschinen im Vergleich'),
  }[stufe];

  /* ---------- Bausteine: je Auswertung eine Karte; die Seiten setzen sie zusammen ---------- */
  const bausteine = {
    leiste: (
      <section className="karte stat-leiste" style={{ '--i': 5 }}>
        {stufe === 'maschine' ? (
          <div>
            <strong>{k.anzahl ? zahl(zeitraumTage / k.anzahl, 1, s) : '–'}</strong>
            <span>{t('Ø Tage zwischen Störungen (MTBF)')}{info('mtbf', t('Ø Tage zwischen Störungen (MTBF)'))}</span>
          </div>
        ) : (
          <div>
            <strong>{zahl(a.maschinenAnzahl ? k.anzahl / a.maschinenAnzahl : 0, 1, s)}</strong>
            <span>{t('Störungen je Maschine ({n} Maschinen)', { n: a.maschinenAnzahl })}{info('jeMaschine', t('Störungen je Maschine ({n} Maschinen)', { n: a.maschinenAnzahl }))}</span>
          </div>
        )}
        <div>
          <strong>{k.erledigt ? `${zahl(k.ausfall_min / k.erledigt / 60, 1, s)} h` : '–'}</strong>
          <span>{t('Ø Ausfall je Störung')}{info('ausfallJeStoerung', t('Ø Ausfall je Störung'))}</span>
        </div>
        <div>
          <strong>{zahl(anteil(k.hoch, k.anzahl), 0, s)} %</strong>
          <span>{t('Anteil Priorität hoch')}{info('anteilHoch', t('Anteil Priorität hoch'))}</span>
        </div>
        <div>
          <strong>{zahl(anteil(k.erledigt, k.anzahl), 0, s)} %</strong>
          <span>{t('Erledigungsquote')}{info('erledigungsquote', t('Erledigungsquote'))}</span>
        </div>
        <div>
          <strong>{a.maschinenAnzahl ? `${zahl(Math.max(0, 100 - anteil(k.ausfall_min, a.maschinenAnzahl * zeitraumTage * 1440)), 2, s)} %` : '–'}</strong>
          <span>{t('Verfügbarkeit (ohne Ausfall)')}{info('verfuegbarkeit', t('Verfügbarkeit (ohne Ausfall)'))}</span>
        </div>
        <div>
          <strong>{a.reaktionGesamt === null ? '–' : `${zahl(a.reaktionGesamt / 60, 1, s)} h`}</strong>
          <span>{t('Ø Reaktionszeit bis Arbeitsbeginn')}{info('reaktion', t('Ø Reaktionszeit bis Arbeitsbeginn'))}</span>
        </div>
        <div>
          <strong>{zahl(anteil(a.wiederholt, k.anzahl), 0, s)} %</strong>
          <span>{t('Wiederholungen (≤ 7 Tage an derselben Maschine)')}{info('wiederholung', t('Wiederholungen (≤ 7 Tage an derselben Maschine)'))}</span>
        </div>
        <div>
          <strong>{zahl(k.anzahl / Math.max(1, zeitraumTage / 7), 1, s)}</strong>
          <span>{t('Störungen pro Woche')}{info('proWoche', t('Störungen pro Woche'))}</span>
        </div>
      </section>
    ),
    vergleich: stufe !== 'maschine' ? (
      <section className="karte" style={{ '--i': 6 }}>
        <div className="karte-kopf">
          <h2 className="abschnitt-titel">{kinderTitel}{info('vergleich', kinderTitel)}</h2>
          <span className="klein">{t('sortiert nach Ausfallzeit')}</span>
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
          <h2 className="abschnitt-titel">{t('Störungen dieser Maschine')}{info('maschinenListe', t('Störungen dieser Maschine'))}</h2>
          <span className="d-flex gap-3">
            <Link href={`/maschinen/${maschine.id}`}>{t('Maschinenhistorie')}</Link>
            <Link href={`/melden?maschine=${maschine.id}`}>{t('Störung melden')}</Link>
          </span>
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
    ),
    streuung: stufe !== 'maschine' && a.streuung.length > 1 ? (
      <section className="karte" style={{ '--i': 7 }}>
        <h2 className="abschnitt-titel">{t('Maschinen: Häufigkeit × Reparaturdauer')}{info('streuung', t('Maschinen: Häufigkeit × Reparaturdauer'))}</h2>
        <Streuung punkte={a.streuung} onKlick={(id) => {
          const o = maschineVon[id];
          zoomen({ land: o.land, standortId: o.standort_id, gebaeudeId: o.gebaeude_id, maschineId: id }, 'rein');
        }} />
      </section>
    ) : null,
    proMonat: (
      <section className="karte" style={{ '--i': 7 }}>
        <h2 className="abschnitt-titel">{t('Störungen pro Monat')}{info('proMonat', t('Störungen pro Monat'))}</h2>
        <Diagramm titel={t('Störungen pro Monat')} art="saeulen" labels={a.proMonat.map((m) => m.label)} werte={a.proMonat.map((m) => m.anzahl)}
                  reihen={a.monatPrio.map((r) => ({ name: gross(t(r.prioritaet)), werte: r.werte, farbe: PRIO_FARBE[r.prioritaet] }))}
                  onKlick={(i) => umschalten('monat', a.proMonat[i].schluessel)} auswahl={a.proMonat.findIndex((m) => m.schluessel === filter.monat)}
                  einheit={t('Störungen')} spalte={t('Monat')} beschreibung={t('Säulendiagramm: Anzahl der Störungen pro Monat nach Priorität')} />
      </section>
    ),
    mttrMonat: (
      <section className="karte" style={{ '--i': 8 }}>
        <h2 className="abschnitt-titel">{t('MTTR pro Monat')}{info('mttrMonat', t('MTTR pro Monat'))}</h2>
        <Diagramm titel={t('MTTR pro Monat')} art="linie" labels={a.proMonat.map((m) => m.label)} werte={a.proMonat.map((m) => (m.mttr === null ? null : m.mttr / 60))}
                  onKlick={(i) => umschalten('monat', a.proMonat[i].schluessel)}
                  einheit="h" nachkomma={1} spalte={t('Monat')} beschreibung={t('Liniendiagramm: durchschnittliche Reparaturdauer pro Monat in Stunden')} />
      </section>
    ),
    ursachen: (
      <section className="karte" style={{ '--i': 9 }}>
        <h2 className="abschnitt-titel">{t('Störursachen')}{info('ursachen', t('Störursachen'))}</h2>
        <Diagramm titel={t('Störursachen')} art="balken" labels={a.ursachen.map((u) => t(u.ursache))} werte={a.ursachen.map((u) => u.anzahl)} hoehe={260}
                  onKlick={(i) => umschalten('ursache', a.ursachen[i].ursache)} auswahl={a.ursachen.findIndex((u) => u.ursache === filter.ursache)}
                  einheit={t('Störungen')} spalte={t('Ursache')} beschreibung={t('Balkendiagramm: Störungen nach Ursache')} />
      </section>
    ),
    status: (
      <section className="karte" style={{ '--i': 10 }}>
        <h2 className="abschnitt-titel">{t('Bearbeitungsstand')}{info('status', t('Bearbeitungsstand'))}</h2>
        <Diagramm titel={t('Bearbeitungsstand')} art="ring" labels={a.status.map((x) => gross(t(x.status)))} werte={a.status.map((x) => x.anzahl)}
                  farben={a.status.map((x) => STATUS_FARBE[x.status])} hoehe={240}
                  onKlick={(i) => umschalten('status', a.status[i].status)} auswahl={a.status.findIndex((x) => x.status === filter.status)}
                  einheit={t('Aufträge')} spalte={t('Status')} beschreibung={t('Ringdiagramm: Aufträge nach Status')} />
      </section>
    ),
    treemap: (
      <section className="karte" style={{ '--i': 10 }}>
        <h2 className="abschnitt-titel">{t('Ausfallzeit nach Ursache')}{info('ausfallUrsache', t('Ausfallzeit nach Ursache'))}</h2>
        <Kachelflaeche eintraege={a.ursachen.filter((u) => u.ausfall_h > 0).sort((x, y) => y.ausfall_h - x.ausfall_h)
          .map((u) => ({ schluessel: u.ursache, name: t(u.ursache), wert: u.ausfall_h, text: `${zahl(u.ausfall_h, 0, s)} h` }))}
                       auswahl={filter.ursache} onKlick={(w) => umschalten('ursache', w)} />
      </section>
    ),
    prioritaeten: (
      <section className="karte" style={{ '--i': 11 }}>
        <h2 className="abschnitt-titel">{t('Prioritäten')}{info('prioritaeten', t('Prioritäten'))}</h2>
        <div className="karte-export">
          <ExportKnopf titel={t('Prioritäten')} daten={() => ({
            spalten: [t('Priorität'), t('Anzahl'), t('Anteil (%)')],
            zeilen: a.prioritaeten.map((p) => [gross(t(p.prioritaet)), p.anzahl, Math.round(anteil(p.anzahl, k.anzahl))]),
          })} />
        </div>
        <div className="stat-stapel" aria-hidden="true">
          {a.prioritaeten.filter((p) => p.anzahl > 0).map((p) => (
            <span key={p.prioritaet} className={`stapel-${PRIORITAET_LISTE[p.prioritaet]}${filter.prioritaet && filter.prioritaet !== p.prioritaet ? ' blass' : ''}`}
                  style={{ flexGrow: p.anzahl }} title={`${gross(t(p.prioritaet))}: ${p.anzahl}`} />
          ))}
        </div>
        <ul className="stat-legende">
          {a.prioritaeten.map((p) => (
            <li key={p.prioritaet}>
              <button type="button" className={`stat-legende-knopf${filter.prioritaet === p.prioritaet ? ' gewaehlt' : filter.prioritaet ? ' blass' : ''}`}
                      aria-pressed={filter.prioritaet === p.prioritaet} onClick={() => umschalten('prioritaet', p.prioritaet)}>
                <PrioritaetPill prioritaet={p.prioritaet} />
                <strong>{p.anzahl}</strong>
                <span className="klein">{zahl(anteil(p.anzahl, a.prioritaeten.reduce((sum, x) => sum + x.anzahl, 0)), 0, s)} %</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    ),
    schichten: (
      <section className="karte" style={{ '--i': 12 }}>
        <h2 className="abschnitt-titel">{t('Störungen nach Schicht')}{info('schichten', t('Störungen nach Schicht'))}</h2>
        <BalkenListe titel={t('Störungen nach Schicht')} auswahl={filter.schicht} onKlick={(w) => umschalten('schicht', w)} zeilen={a.schichten.map((sch) => ({
          schluessel: sch.name, name: t(sch.name), zusatz: t('{zeit} Uhr', { zeit: sch.zeit }), wert: sch.anzahl,
          text: `${sch.anzahl} · ${zahl(anteil(sch.anzahl, k.anzahl), 0, s)} %`,
        }))} />
      </section>
    ),
    verfuegbarkeit: (
      <section className="karte" style={{ '--i': 13 }}>
        <h2 className="abschnitt-titel">{t('Verfügbarkeit pro Monat')}{info('verfuegbarkeitMonat', t('Verfügbarkeit pro Monat'))}</h2>
        <Diagramm titel={t('Verfügbarkeit pro Monat')} art="linie" labels={a.proMonat.map((m) => m.label)} werte={a.verfuegbarkeit} einheit="%" nachkomma={2} abNull={false} max={100}
                  spalte={t('Monat')} beschreibung={t('Liniendiagramm: Anteil der Zeit ohne Ausfall pro Monat in Prozent')} />
      </section>
    ),
    reaktion: (
      <section className="karte" style={{ '--i': 14 }}>
        <h2 className="abschnitt-titel">{t('Reaktionszeit nach Priorität')}{info('reaktionPrio', t('Reaktionszeit nach Priorität'))}</h2>
        <p className="klein text-leise">{t('Ø Zeit von der Meldung bis zum Arbeitsbeginn')}</p>
        <BalkenListe titel={t('Reaktionszeit nach Priorität')} zeilen={a.reaktion.filter((r) => r.anzahl > 0).map((r) => ({
          name: gross(t(r.prioritaet)), zusatz: t('{n} Aufträge', { n: r.anzahl }), wert: r.min ?? 0,
          text: r.min === null ? '–' : `${zahl(r.min / 60, 1, s)} h`,
        }))} />
      </section>
    ),
    pareto: stufe !== 'maschine' ? (
      <section className="karte" style={{ '--i': 15 }}>
        <h2 className="abschnitt-titel">{t('Größte Zeitfresser (Pareto)')}{info('pareto', t('Größte Zeitfresser (Pareto)'))}</h2>
        <p className="klein text-leise">{t('Maschinen mit der meisten Ausfallzeit – rechts der Anteil an der gesamten Ausfallzeit (kumuliert)')}</p>
        {a.pareto.length === 0 ? <p className="leer">{t('Keine Ausfallzeit im Zeitraum.')}</p> : (
          <BalkenListe titel={t('Größte Zeitfresser (Pareto)')} zeilen={a.pareto.map((z) => ({
            name: z.maschine?.bezeichnung ?? '–', zusatz: z.maschine?.anlagennummer, wert: z.min,
            text: `${zahl(z.min / 60, 0, s)} h · ${zahl(z.anteil, 0, s)} %`,
          }))} />
        )}
      </section>
    ) : null,
    typ: stufe !== 'maschine' ? (
      <section className="karte" style={{ '--i': 16 }}>
        <h2 className="abschnitt-titel">{t('Ausfallzeit nach Maschinentyp')}{info('ausfallTyp', t('Ausfallzeit nach Maschinentyp'))}</h2>
        {a.ausfallTyp.length === 0 ? <p className="leer">{t('Keine Ausfallzeit im Zeitraum.')}</p> : (
          <BalkenListe titel={t('Ausfallzeit nach Maschinentyp')} auswahl={filter.typ} onKlick={(w) => umschalten('typ', w)}
                       zeilen={a.ausfallTyp.map((x) => ({ schluessel: x.typ, name: t(x.typ), wert: x.h, text: `${zahl(x.h, 0, s)} h` }))} />
        )}
      </section>
    ) : null,
    alter: (
      <section className="karte" style={{ '--i': 17 }}>
        <h2 className="abschnitt-titel">{t('Offene Aufträge nach Alter')}{info('alter', t('Offene Aufträge nach Alter'))}</h2>
        <p className="klein text-leise">{t('Wie lange warten die noch offenen Störungen schon?')}</p>
        {k.offen === 0 ? <p className="leer"><i className="bi bi-check-circle" />{t('Keine offenen Aufträge.')}</p> : (
          <BalkenListe titel={t('Offene Aufträge nach Alter')} zeilen={a.alter.map((st) => ({ name: t(st.name), wert: st.anzahl, text: String(st.anzahl) }))} />
        )}
      </section>
    ),
    maschinenalter: stufe !== 'maschine' ? (
      <section className="karte" style={{ '--i': 18 }}>
        <h2 className="abschnitt-titel">{t('Störungen nach Maschinenalter')}{info('maschinenalter', t('Störungen nach Maschinenalter'))}</h2>
        <p className="klein text-leise">{t('Ø Störungen je Maschine im Zeitraum, nach Baujahr gruppiert')}</p>
        <BalkenListe titel={t('Störungen nach Maschinenalter')} zeilen={a.nachAlter.map((st) => ({
          name: t(st.name), zusatz: t('{n} Maschinen', { n: st.maschinen }), wert: st.jeMaschine, text: zahl(st.jeMaschine, 1, s),
        }))} />
      </section>
    ) : null,
    techniker: (
      <section className="karte" style={{ '--i': 19 }}>
        <h2 className="abschnitt-titel">{t('Techniker')}{info('techniker', t('Techniker'))}</h2>
        <div className="karte-export">
          <ExportKnopf titel={t('Techniker')} daten={() => ({
            spalten: [t('Techniker'), t('Qualifikation'), t('Aufträge'), t('Erledigt'), 'MTTR (h)'],
            zeilen: a.proTechniker.map((te) => [te.name, t(te.qualifikation), te.anzahl, te.erledigt, te.mttr_min === null ? null : Math.round(te.mttr_min / 6) / 10]),
          })} />
        </div>
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
    ),
    ersatzteile: (
      <section className="karte" style={{ '--i': 20 }}>
        <h2 className="abschnitt-titel">{t('Verbaute Ersatzteile')}{info('ersatzteile', t('Verbaute Ersatzteile'))}</h2>
        {a.ersatzteile.length === 0 ? (
          <p className="leer">{t('Keine Ersatzteile im Zeitraum gebucht.')}</p>
        ) : (
          <BalkenListe titel={t('Verbaute Ersatzteile')} zeilen={a.ersatzteile.map((e) => ({ name: e.bezeichnung, wert: e.menge, text: t('{n} Stk.', { n: e.menge }) }))} />
        )}
      </section>
    ),
  };
  const seite = [...SEITEN, ...eigeneSeiten].find((x) => x.id === seiteId) ?? SEITEN[0];

  return (
    <>
      {/* Kopf: Pfad zum Herauszoomen, Titel, Zeitraum */}
      <div className="seitenkopf d-flex justify-content-between align-items-end flex-wrap gap-3">
        <div>
          <nav className="brotkrumen stat-pfad" aria-label={t('Pfad')}>
            <button type="button" onClick={zuAllen} disabled={stufe === 'alle'}>
              <i className="bi bi-globe2" aria-hidden="true" /> {t('Weltweit')}
            </button>
            {land && <><i className="bi bi-chevron-right" aria-hidden="true" />
              <button type="button" onClick={zuLand} disabled={stufe === 'land'}>{t(land.name)}</button></>}
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

      {/* Aktive Kreuzfilter als Chips (× entfernt), dazu „Alle Filter löschen“ */}
      {Object.keys(filter).length > 0 && (
        <div className="stat-filterleiste" role="status">
          <i className="bi bi-funnel-fill" aria-hidden="true" />
          {Object.entries(filter).map(([dim, wert]) => (
            <button key={dim} type="button" className="stat-chip" onClick={() => umschalten(dim)} aria-label={t('Filter entfernen')}>
              <span>{t(FILTER[dim].name)}:</span> <b>{dim === 'monat' ? monate.find((m) => m.schluessel === wert)?.label : gross(t(wert))}</b>
              <i className="bi bi-x" aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="stat-chip-alle" onClick={() => setFilter({})}>{t('Alle Filter löschen')}</button>
        </div>
      )}

      {/* Die Bühne: Inhalt der Ebene. Beim Zoomen wächst er aus der angeklickten Kachel. */}
      <div ref={buehneRef} className="stat-buehne">
        <div key={`${ebene.standortId}-${ebene.gebaeudeId}-${ebene.maschineId}`}
             className={`stat-ebene${zoom ? ` zoom-${zoom.richtung}` : ''}`} style={zoom ? { transformOrigin: zoom.ursprung } : undefined}>

          {/* Kennzahlen */}
          <div className="row g-4 mb-2">
            <div className="col-6 col-lg-3">
              <Kennzahl titel={t('MTTR')} wert={stunden(k.mttr_min)} nachkomma={1} einheit="h"
                        zusatz={t('Ø Reparaturdauer')} symbol="bi-stopwatch" i={1} info={info('mttr', t('MTTR'))} />
            </div>
            <div className="col-6 col-lg-3">
              <Kennzahl titel={t('Ausfallzeit')} wert={Math.round(k.ausfall_min / 60)} einheit="h"
                        zusatz={t('≈ {betrag} Ausfallkosten', { betrag: euro(a.ausfallkosten, s) })} symbol="bi-hourglass-split" art="warnung" i={2} info={info('ausfallzeit', t('Ausfallzeit'))} />
            </div>
            <div className="col-6 col-lg-3">
              <Kennzahl titel={t('Störungen')} wert={k.anzahl} zusatz={t('im Zeitraum gemeldet')} symbol="bi-activity" i={3} info={info('stoerungen', t('Störungen'))} />
            </div>
            <div className="col-6 col-lg-3">
              <Kennzahl titel={t('Davon offen')} wert={k.offen} zusatz={t('noch nicht erledigt')} symbol="bi-hourglass"
                        art={k.offen > 0 ? 'rot' : 'gruen'} i={4} info={info('offen', t('Davon offen'))} />
            </div>
          </div>


          {/* Seiten der Statistik: feste Themen und eigene Seiten (im Browser gespeichert) */}
          <StatistikSeiten seiten={SEITEN} eigene={eigeneSeiten} aktiv={seite.id} onWaehlen={seiteWaehlen}
                           bausteinNamen={BAUSTEINE} onSpeichern={eigeneSpeichern} />
          <div className="stat-raster">
            {seite.bausteine.filter((id) => bausteine[id]).map((id) => (
              <div key={`${seite.id}-${id}`} className={`stat-zelle${BAUSTEINE[id]?.breit ? ' breit' : ''}`}>{bausteine[id]}</div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Waagerechte Balken in HTML: Name, Balken, Wert. Mit titel: Export-Knopf oben rechts in der Karte */
function BalkenListe({ zeilen, titel, onKlick = null, auswahl = null }) {
  const t = useT();
  const max = Math.max(1, ...zeilen.map((z) => z.wert));
  return (
    <>
    {titel && (
      <div className="karte-export">
        <ExportKnopf titel={titel} daten={() => ({
          spalten: [t('Bezeichnung'), t('Zusatz'), t('Wert'), t('Anzeige')],
          zeilen: zeilen.map((z) => [z.name, z.zusatz ?? '', Math.round(z.wert * 100) / 100, z.text]),
        })} />
      </div>
    )}
    <ul className="balken-liste">
      {zeilen.map((z) => {
        const inhalt = (
          <>
            <span className="balken-name">{z.name}{z.zusatz && <small>{z.zusatz}</small>}</span>
            <span className="mini-balken" aria-hidden="true"><span style={{ width: `${(z.wert / max) * 100}%` }} /></span>
            <span className="balken-wert">{z.text}</span>
          </>
        );
        // Mit onKlick: Zeile ist ein Knopf für den Kreuzfilter, die Auswahl bleibt kräftig
        return (
          <li key={z.name} className={onKlick ? `klickbar${auswahl === z.schluessel ? ' gewaehlt' : auswahl ? ' blass' : ''}` : undefined}>
            {onKlick ? <button type="button" aria-pressed={auswahl === z.schluessel} onClick={() => onKlick(z.schluessel)}>{inhalt}</button> : inhalt}
          </li>
        );
      })}
    </ul>
    </>
  );
}

/** Treemap: Fläche je Eintrag proportional zum Wert, Klick setzt den Kreuzfilter */
function Kachelflaeche({ eintraege, auswahl, onKlick }) {
  const t = useT();
  if (eintraege.length === 0) return <p className="leer">{t('Keine Ausfallzeit im Zeitraum.')}</p>;
  return (
    <div className="kachelflaeche" role="list">
      {treemap(eintraege).map((e, i) => (
        <button key={e.schluessel} type="button" role="listitem" aria-pressed={auswahl === e.schluessel}
                className={`kachelflaeche-feld${i >= 2 ? ' hell' : ''}${auswahl === e.schluessel ? ' gewaehlt' : auswahl ? ' blass' : ''}`}
                style={{ left: `${e.x}%`, top: `${e.y}%`, width: `${e.b}%`, height: `${e.h}%`, '--stufe': `${Math.max(22, 92 - i * 14)}%` }}
                onClick={() => onKlick(e.schluessel)} title={`${e.name}: ${e.text}`}>
          <span>{e.name}</span><b>{e.text}</b>
        </button>
      ))}
    </div>
  );
}

/**
 * Reiter der Statistik-Seiten und Editor für eigene Seiten (Name + angehakte Bausteine).
 * Eigene Seiten liegen nur in diesem Browser (localStorage).
 */
function StatistikSeiten({ seiten, eigene, aktiv, onWaehlen, bausteinNamen, onSpeichern }) {
  const t = useT();
  const [bearbeiten, setBearbeiten] = useState(null);   // null | { id, name, bausteine }
  const aktiveEigene = eigene.find((x) => x.id === aktiv);
  function speichern(e) {
    e.preventDefault();
    const name = bearbeiten.name.trim() || t('Eigene Seite');
    if (bearbeiten.bausteine.length === 0) return;
    const seite = { ...bearbeiten, name };
    const liste = eigene.some((x) => x.id === seite.id) ? eigene.map((x) => (x.id === seite.id ? seite : x)) : [...eigene, seite];
    onSpeichern(liste, seite.id);
    setBearbeiten(null);
  }
  const umschalten = (id) => setBearbeiten((b) => ({ ...b, bausteine: b.bausteine.includes(id) ? b.bausteine.filter((x) => x !== id) : [...b.bausteine, id] }));
  return (
    <div className="stat-seiten-rahmen">
      <nav className="stat-seiten" aria-label={t('Seiten')}>
        {seiten.map((x) => (
          <button key={x.id} type="button" className={aktiv === x.id ? 'aktiv' : ''} aria-current={aktiv === x.id ? 'page' : undefined} onClick={() => onWaehlen(x.id)} data-seite={x.id}>
            {t(x.name)}
          </button>
        ))}
        {eigene.map((x) => (
          <button key={x.id} type="button" className={`eigen${aktiv === x.id ? ' aktiv' : ''}`} aria-current={aktiv === x.id ? 'page' : undefined} onClick={() => onWaehlen(x.id)} data-seite={x.id}>
            {x.name}
          </button>
        ))}
        <button type="button" className="stat-seite-neu" onClick={() => setBearbeiten({ id: `eigen-${Date.now()}`, name: '', bausteine: [] })}>
          <i className="bi bi-plus-lg" aria-hidden="true" /> {t('Eigene Seite')}
        </button>
      </nav>
      {aktiveEigene && !bearbeiten && (
        <div className="stat-seite-werkzeug">
          <button type="button" onClick={() => setBearbeiten({ ...aktiveEigene })}><i className="bi bi-pencil" aria-hidden="true" /> {t('Bearbeiten')}</button>
          <button type="button" onClick={() => onSpeichern(eigene.filter((x) => x.id !== aktiveEigene.id), seiten[0].id)}><i className="bi bi-trash" aria-hidden="true" /> {t('Löschen')}</button>
        </div>
      )}
      {bearbeiten && (
        <form className="karte stat-seite-editor" onSubmit={speichern}>
          <div className="d-flex gap-3 flex-wrap align-items-end">
            <div className="flex-grow-1">
              <label className="form-label" htmlFor="seiten-name">{t('Name der Seite')}</label>
              <input id="seiten-name" className="form-control" maxLength={40} value={bearbeiten.name} onChange={(e) => setBearbeiten({ ...bearbeiten, name: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={bearbeiten.bausteine.length === 0}>{t('Speichern')}</button>
            <button type="button" className="btn btn-sekundaer" onClick={() => setBearbeiten(null)}>{t('Abbrechen')}</button>
          </div>
          <div className="stat-baustein-wahl">
            {Object.entries(bausteinNamen).map(([id, b]) => (
              <label key={id} className={bearbeiten.bausteine.includes(id) ? 'gewaehlt' : ''}>
                <input type="checkbox" checked={bearbeiten.bausteine.includes(id)} onChange={() => umschalten(id)} data-baustein={id} />
                {t(b.name)}
              </label>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}
