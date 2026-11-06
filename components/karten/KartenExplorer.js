'use client';
/**
 * components/karten/KartenExplorer.js – Störungskarte mit Zoom
 *
 * Vier Ebenen in einer "Bühne": Welt → Land → Werk (Lageplan) → Gebäude (Grundriss).
 * Ein Klick auf ein Land, Werk oder Gebäude zoomt animiert genau an diese Stelle hinein,
 * der Pfad oben zoomt wieder heraus. Alle Daten werden einmal vom Server geladen
 * (lib/karten/daten.js → alleKartenDaten), danach läuft alles ohne Wartezeit
 * im Browser.
 *
 * modus="anzeige": rechts eine Spalte mit Infos zur jeweiligen Ebene
 *                  (offene Störungen, Techniker, Maschinen-Details)
 * modus="auswahl": zum Störung melden – ein Klick auf eine Maschine ruft
 *                  onMaschine(maschine) auf. Eigenes Aussehen: Schritt-Leiste
 *                  statt Pfad, warmer Hintergrund, keine Störungszahlen.
 *
 * So funktioniert die Animation:
 *  Beim Ebenenwechsel bleibt die alte Ebene kurz sichtbar ("uebergang"). Beide Ebenen
 *  werden wie von einer Kamera bewegt (kamerafahrt): Die neue Karte wächst genau aus
 *  der angeklickten Fläche (Land, Werkspunkt, Halle), die alte vergrößert sich mit und blendet aus.
 *
 * Ebene im Zustand: { land: 'DE' | null, standortId, gebaeudeId }.
 */
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import WeltKarte from './WeltKarte';
import LandKarte from './LandKarte';
import Lageplan from './Lageplan';
import Grundriss from './Grundriss';
import { Legende, stufe, offenText, PrioZahlen, geteiltKlasse, prioText } from './stufe';
import { StatusPill, PrioritaetPill } from '@/components/Pills';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import MeldeSchritte from './MeldeSchritte';
import { useT } from '@/components/SpracheKontext';
import { T } from '@/lib/sprache';
import { startAusAdresse } from '@/lib/karten/adresse';
import { laenderAus, landKarte, weltVerhaeltnis } from '@/lib/karten/laender';
import { ampelZustand, AMPEL_TEXT, AMPEL_REIHENFOLGE, AMPEL_PRIORITAET, AmpelSymbol } from '@/lib/karten/ampel';
import { ton } from '@/lib/ton';
import {
  favoritenLesen, favoritHinzufuegen, favoritEntfernen, personFavorit, personAusBrowser,
  FAVORITEN_WECHSEL, FAVORIT_OEFFNEN, FAVORIT_SYMBOLE, MAX_FAVORITEN, KARTEN_ADRESSE,
} from '@/lib/favoriten';

// 3D-Ansicht für Werk und Halle: three.js wird nur im Browser und nur bei Bedarf geladen
const Werk3D = dynamic(() => import('./raum/Werk3D'), { ssr: false, loading: () => <div className="raum-laden" /> });
// Drehendes 3D-Modell der gewählten Maschine im Infofenster
const MaschineDetail3D = dynamic(() => import('./raum/MaschineDetail3D'), { ssr: false, loading: () => <div className="maschine-detail-3d" /> });

/** 3D-Teil schon im Hintergrund laden, damit der Wechsel ins Werk nicht auf das Nachladen warten muss */
function dreiDVorladen() {
  const laden = () => { import('./raum/Werk3D'); import('./raum/MaschineDetail3D'); };
  if ('requestIdleCallback' in window) window.requestIdleCallback(laden, { timeout: 3000 }); else setTimeout(laden, 1500);
}

/**
 * Pin-Animation: Ein kleines Schild mit Symbol und Namen fliegt im Bogen vom Pin-Knopf zum neuen
 * Eintrag in der Seitenleiste (auf dem Handy, wo die Leiste zu ist, zum Menü-Knopf oben).
 * Der Eintrag selbst blendet kurz danach ein (Klasse favorit-neu in components/Favoriten.js).
 */
function favoritFliegt(knopf, favorit) {
  if (!knopf || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  let versuche = 0;
  const los = () => {
    const eintrag = document.querySelector(`[data-favorit-id="${favorit.id}"] .favorit-symbol`);
    if (!eintrag && versuche++ < 6) { requestAnimationFrame(los); return; }   // Leiste zeichnet den Eintrag noch
    let ziel = eintrag?.getBoundingClientRect();
    if (!ziel || ziel.width === 0 || ziel.right <= 0) ziel = document.querySelector('.mobil-kopf .rund-knopf')?.getBoundingClientRect();
    if (!ziel || ziel.width === 0) return;
    const start = knopf.getBoundingClientRect();
    const schild = document.createElement('div');
    schild.className = 'favorit-flug';
    schild.setAttribute('aria-hidden', 'true');
    const symbol = document.createElement('i');
    symbol.className = `bi ${FAVORIT_SYMBOLE[favorit.art] ?? 'bi-pin-angle'}`;
    const text = document.createElement('span');
    text.textContent = favorit.name;
    schild.append(symbol, text);
    document.body.appendChild(schild);
    const s = schild.getBoundingClientRect();
    // Position so, dass die Mitte des Symbols (links im Schild) auf dem Punkt liegt
    const lage = (x, y, k) => `translate(${x - (s.height / 2) * k}px, ${y - (s.height / 2) * k}px) scale(${k})`;
    const sx = start.left + start.width / 2;
    const sy = start.top + start.height / 2;
    const zx = ziel.left + ziel.width / 2;
    const zy = ziel.top + ziel.height / 2;
    const flug = schild.animate([
      { offset: 0, transform: lage(sx, sy, 0.6), opacity: 0 },
      { offset: 0.15, transform: lage(sx, sy + 26, 1), opacity: 1 },
      { offset: 0.55, transform: lage((sx + zx) / 2, Math.min(sy, zy) - 40, 0.95), opacity: 1 },   // Bogen nach oben
      { offset: 0.9, transform: lage(zx, zy, 0.55), opacity: 1 },
      { offset: 1, transform: lage(zx, zy, 0.4), opacity: 0 },
    ], { duration: 1000, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'both' });
    flug.onfinish = () => schild.remove();
    flug.oncancel = () => schild.remove();
  };
  requestAnimationFrame(los);
}

/** Kann der Browser WebGL (3D)? */
function webglVorhanden() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Dauer der Kamerafahrt in ms: in Land und Werk etwas länger (großer Maßstabssprung) */
const dauerFuer = (kindEbene) => (kindEbene.gebaeudeId ? 700 : 1000);
const weich = (x) => (x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2);
const stufe01 = (x, von, bis) => Math.min(1, Math.max(0, (x - von) / (bis - von)));

/**
 * Bilder einer Kamerafahrt zwischen übergeordneter Ebene (Eltern) und Unterebene (Kind).
 * A = angeklickte Fläche in der Elternebene, B = Inhalt der Kindebene (Mitte x/y, Breite w, Höhe h).
 *
 * Wie ein Flug über einem Globus: Zuerst schwenkt die Kamera, bis die angeklickte Fläche in der
 * Mitte liegt (schwenk), danach taucht sie senkrecht hinein (zoom) – nichts rutscht mehr schräg weg.
 * Der Maßstab ändert sich gleichmäßig (logarithmisch).
 */
function kamerafahrt(A, B, rein, schritte = 32) {
  const s = Math.min(A.w / B.w, A.h / B.h);      // so klein beginnt die Kindebene (passt genau in A)
  const kind = [];
  const eltern = [];
  // Hineinzoomen mit weichem, rundem Rand: Die Kindebene liegt in einer Hülle mit fester Maske. Die Hülle wächst
  // gegen Ende um den Faktor m (Maske öffnet sich), die Ebene darin schrumpft genau um 1/m – zusammen ergibt das
  // dieselbe Fahrt. Nur Verschieben und Skalieren: Das erledigt die Grafikkarte, ohne die Ebene neu zu zeichnen
  // (eine animierte mask-size würde jedes Bild neu zeichnen und ruckeln).
  const huelle = [];
  const gegen = [];
  for (let i = 0; i <= schritte; i += 1) {
    const zeit = i / schritte;
    const p = rein ? zeit : 1 - zeit;
    const schwenk = weich(stufe01(p, 0, 0.4));       // Fläche wandert in die Mitte
    const zoom = weich(stufe01(p, 0.18, 1));        // danach senkrecht hinein
    const k = s ** (1 - zoom);                       // Maßstab der Kindebene
    const cx = A.x + (B.x - A.x) * schwenk;          // dort erscheint die Mitte der Kindebene
    const cy = A.y + (B.y - A.y) * schwenk;
    kind.push({ offset: zeit, transform: `translate(${cx - k * B.x}px, ${cy - k * B.y}px) scale(${k})` });
    eltern.push({ offset: zeit, transform: `translate(${cx - (k / s) * A.x}px, ${cy - (k / s) * A.y}px) scale(${k / s})` });
    const m = 1 + 4 * stufe01(zeit, 0.55, 1) ** 2;   // Maske öffnet sich erst, wenn die Ebene groß genug ist
    huelle.push({ offset: zeit, transform: `translate(${cx - k * m * B.x}px, ${cy - k * m * B.y}px) scale(${k * m})` });
    gegen.push({ offset: zeit, transform: `translate(${B.x * (1 - 1 / m)}px, ${B.y * (1 - 1 / m)}px) scale(${1 / m})` });
  }
  return { kind, eltern, huelle, gegen };
}

/** Seitenverhältnis (Breite / Höhe) des Inhalts einer Ebene – damit er in die Bühne passt */
function seitenverhaeltnis(ebene, standort, gebaeude, karte, laender) {
  if (ebene.gebaeudeId && gebaeude) return gebaeude.breite_m / gebaeude.tiefe_m;
  if (ebene.standortId && standort) return standort.gelaende_breite_m / standort.gelaende_tiefe_m;
  if (karte) return karte.breite / karte.hoehe;
  return weltVerhaeltnis(laender);   // Weltkarte und Europakarte untereinander
}

export default function KartenExplorer({
  daten, modus = 'anzeige', start = {}, onMaschine, groesse = 'gross', adresseMitfuehren = false,
  eigenesWerk = null,   // Werk der gewählten Person (beim Melden: Hinweis, in den Listen zuerst)
  kompakt = false,      // kleines Kartenfenster (Übersicht): ohne Info-Spalte, Pfad, Legende und Werkzeuge
  // Von außen gesteuerte Darstellung '2d' | '3d' (Hallen-Monitor: eigener Umschalter im Kopf). Ein Wechsel
  // läuft über dieselben Übergänge wie der Umschalter der Karte (Gebäude sinken/wachsen, Überblenden)
  // und wird nicht als Wahl der Karte gemerkt.
  ansicht = null,
}) {
  const { standorte, gebaeude, maschinen, offene, techniker } = daten;
  const melden = modus === 'auswahl';   // Störung melden: eigenes Aussehen, keine Störungszahlen
  const t = useT();
  const buehneRef = useRef(null);
  const neuRef = useRef(null);
  const altRef = useRef(null);

  // Länder und Länderkarten nur einmal berechnen (nicht bei jedem Neuzeichnen während einer Kamerafahrt)
  const laender = useMemo(() => laenderAus(standorte), [standorte]);
  const landKarten = useMemo(() => new Map(), [standorte]);
  const landKarteVon = (kuerzel) => {
    if (!landKarten.has(kuerzel)) landKarten.set(kuerzel, landKarte(kuerzel, standorte));
    return landKarten.get(kuerzel);
  };
  // Start: ein Werk legt das Land mit fest
  const startLand = standorte.find((st) => st.id === start.standortId)?.land ?? start.land ?? null;
  const [ebene, setEbene] = useState({ land: startLand, standortId: start.standortId ?? null, gebaeudeId: start.gebaeudeId ?? null });
  const [maschineId, setMaschineId] = useState(start.maschineId ?? null);
  const [uebergang, setUebergang] = useState(null);   // { von, richtung: 'rein'|'raus', dauer }
  // 2D oder 3D für Werk und Halle (gemerkt im Browser; ohne Wahl ab Tablet-Breite 3D) – auch beim Melden
  const [webgl, setWebgl] = useState(false);
  const [dreiD, setDreiD] = useState(false);
  useEffect(() => {
    const kann = webglVorhanden();
    setWebgl(kann);
    // Vorrang hat die Adresse (?ansicht=3d, z. B. aus einem Favoriten), dann die gemerkte Wahl
    let wahl = start.ansicht === '2d' || start.ansicht === '3d' ? start.ansicht : null;
    try { wahl ??= localStorage.getItem('kartenansicht'); } catch { /* z. B. privater Modus */ }
    const drei = kann && (wahl ? wahl === '3d' : window.innerWidth >= 768);
    if (drei) dreiDVorladen();
    // Werk bzw. Halle in 3D (z. B. ein Favorit): direkt die 3D-Szene, ohne erst den 2D-Plan zu zeigen.
    // Bis sie fertig ist, dreht sich in der Bühne ein kleiner Ring (.raum:not(.fertig)), dann blendet sie ein.
    setDreiD(drei);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ruhig = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Favoriten: Adressen der angepinnten Ansichten (für den Zustand des Pin-Knopfs)
  const [favoriten, setFavoriten] = useState([]);
  const [pinHinweis, setPinHinweis] = useState(null);
  useEffect(() => {
    // Das Werk der gewählten Person zählt als Favorit („Mein Werk“, siehe lib/favoriten.js)
    const lesen = () => setFavoriten([...[personFavorit(personAusBrowser())].filter(Boolean), ...favoritenLesen()]);
    lesen();
    window.addEventListener(FAVORITEN_WECHSEL, lesen);
    return () => window.removeEventListener(FAVORITEN_WECHSEL, lesen);
  }, []);
  useEffect(() => {
    if (!pinHinweis) return undefined;
    const weg = setTimeout(() => setPinHinweis(null), 3000);
    return () => clearTimeout(weg);
  }, [pinHinweis]);
  function ansichtWaehlen(drei, merken = true) {
    if (merken) { try { localStorage.setItem('kartenansicht', drei ? '3d' : '2d'); } catch { /* ignorieren */ } }
    // 3D → 2D: Kamera fährt senkrecht nach oben, die Gebäude werden flach (wie gezeichnet),
    // dann blendet die Zeichnung darüber ein
    if (!drei && istRaum(ebene) && !ruhig()) {
      // Weiter geht es, sobald die Szene flach ist (onFlach von Werk3D) – Sicherheitsnetz nach 6 s
      setVerlassen('flach');
      ton('sanft');
      zuZeichnung.current = { ebene, notfall: setTimeout(() => zeichnungUeberblenden(), 6000) };
      return;
    }
    abbrechenZuZeichnung();
    setVerlassen(null);
    if (!drei) setAufbau(null);   // 2D gewählt, während 3D noch vorbereitet wurde: abbrechen
    // 2D → 3D: wie 3D → 2D rückwärts. Szene unsichtbar und flach von oben vorbereiten (deckungsgleich mit der
    // Zeichnung), dann überblenden; danach wachsen die Gebäude, während die Kamera in die Schrägansicht kippt
    if (drei && !dreiD && raumMoeglich && ebene.standortId && !ruhig()) {
      dreiDVorladen();
      ton('sanft');
      // Schon im Hintergrund vorbereitet (siehe „Vorwärmen“ unten)? Dann sofort überblenden – kein Warten
      // (auch eine nach 3D → 2D behaltene Szene desselben Werks zählt – sie springt dann zur richtigen Halle)
      const fertigVorbereitet = bereit.current.has(raumSchluessel(ebene))
        && [vorbereitung, ...behalten].some((e) => e?.standortId === ebene.standortId);
      if (fertigVorbereitet) { setVorbereitung(ebene); aufbauFertig(ebene); return; }
      setAufbau(ebene);
      setVorbereitung(ebene);
      return;
    }
    setDreiD(drei);
    setUebergang(null);
  }
  // 2D → 3D: Ebene, deren Szene gerade (flach) vorbereitet wird; Sicherheitsnetz nach 5 s
  const [aufbau, setAufbau] = useState(null);
  // Behaltene 3D-Szenen: Nach dem Verlassen (3D → 2D, Herauszoomen, Favorit) wird eine Szene nicht abgebaut,
  // sondern bleibt unsichtbar und angehalten erhalten. Das Abbauen einer Szene friert den Browser spürbar ein
  // (Aufräumen aller Formen und Texturen) – und beim Zurückwechseln müsste sie neu aufgebaut werden.
  // Höchstens zwei bleiben; ältere werden erst abgebaut, wenn Ruhe ist.
  const [behalten, setBehalten] = useState([]);
  const behalte = (e) => setBehalten((alt) => [e, ...alt.filter((x) => x.standortId !== e.standortId)]);
  const raumSchluessel = (e) => `raum-${e.standortId}`;
  function aufbauFertig(ziel = aufbau) {
    if (!ziel) return;
    setUebergang({ von: ziel, vonSchluessel: schluesselVon(ziel), vonRaum: false, richtung: 'blende', dauer: 700 });
    setDreiD(true);
    setAufbau(null);
    setVorbereitung(null);
  }
  const aufbauRef = useRef(aufbauFertig);
  aufbauRef.current = () => aufbauFertig();
  useEffect(() => {
    if (!aufbau) return undefined;
    const notfall = setTimeout(() => aufbauRef.current(), 5000);
    return () => clearTimeout(notfall);
  }, [aufbau]);
  useEffect(() => {
    if (uebergang || behalten.length <= 2) return undefined;
    const spaeter = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
    const abbrechen = window.cancelIdleCallback ?? clearTimeout;
    const id = spaeter(() => setBehalten((alt) => alt.slice(0, 2)), { timeout: 4000 });
    return () => abbrechen(id);
  }, [uebergang, behalten]);
  function abbrechenZuZeichnung() {
    if (!zuZeichnung.current) return;
    clearTimeout(zuZeichnung.current.notfall);
    zuZeichnung.current = null;
  }
  // 'flach': 3D → 2D läuft (Kamera hoch, Gebäude flach); 'hoch': Kamera steigt beim Herauszoomen ins Land
  const [verlassen, setVerlassen] = useState(null);
  // 3D → 2D, letzter Schritt: Szene ist flach von oben → Zeichnung blendet darüber ein (deckungsgleich)
  const zuZeichnung = useRef(null);
  function zeichnungUeberblenden() {
    const laufend = zuZeichnung.current;
    if (!laufend) return;
    clearTimeout(laufend.notfall);
    zuZeichnung.current = null;
    // Die Zeichnung kommt ohne Einblend-Animation der Kacheln (sie liegt deckungsgleich unter der flachen Szene)
    setOhneEinblenden(`${laufend.ebene.land ?? 'welt'}-${laufend.ebene.standortId ?? 'x'}-${laufend.ebene.gebaeudeId ?? 'x'}`);
    setUebergang({ von: laufend.ebene, vonSchluessel: schluesselVon(laufend.ebene), vonRaum: true, richtung: 'blende', dauer: 700 });
    setDreiD(false);
    setVerlassen(null);
    behalte(laufend.ebene);
  }
  // Schlüssel der 2D-Ebene, die aus 3D heraus entstanden ist: Ihre Kacheln fliegen nicht noch einmal herein
  // (bleibt so, solange die Ebene besteht – ein Entfernen der Klasse würde die Animation neu starten)
  const [ohneEinblenden, setOhneEinblenden] = useState(null);

  // 3D-Werk unsichtbar vorbereiten (beim Darüberfahren über einen Standort bzw. nach dem Klick): Erst wenn
  // die Szene fertig ist, startet die Kamerafahrt – sie landet dann direkt auf dem 3D-Bild von oben
  const [vorbereitung, setVorbereitung] = useState(null);   // Ebene des vorbereiteten Werks
  const [wartet, setWartet] = useState(null);               // angeklicktes Werk, das noch vorbereitet wird
  const bereit = useRef(new Set());                         // Schlüssel fertiger 3D-Szenen
  const vorschauTimer = useRef(null);
  function vorschau(st) {
    if (!istRaum({ standortId: st.id }) || ruhig()) return;
    clearTimeout(vorschauTimer.current);
    vorschauTimer.current = setTimeout(() => {
      setVorbereitung((alt) => (alt?.standortId === st.id ? alt : { land: st.land, standortId: st.id, gebaeudeId: null }));
    }, 180);
  }
  function szeneBereit(schluessel) {
    bereit.current.add(schluessel);
    if (aufbau && raumSchluessel(aufbau) === schluessel) { aufbauFertig(aufbau); return; }
    if (wartet && schluesselVon(wartet) === schluessel) {
      const ziel = wartet;
      setWartet(null);
      wechsle(ziel, 'rein');
    }
  }
  // Gesteuerte Darstellung (Prop „ansicht“): Änderungen von außen wie ein Klick auf den eigenen Umschalter
  const ansichtVorher = useRef(ansicht);
  useEffect(() => {
    if (!ansicht || ansicht === ansichtVorher.current) return;
    ansichtVorher.current = ansicht;
    ansichtWaehlen(ansicht === '3d', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ansicht]);
  // Vorwärmen: Steht man in 2D in einem Werk bzw. einer Halle, wird die 3D-Szene nach kurzer Ruhe unsichtbar
  // (flach, Kamera von oben, danach angehalten) vorbereitet. Der Wechsel auf 3D beginnt dann sofort.
  // Nicht in kleinen Kartenfenstern (Favorit-Kachel) – wohl aber im Hallen-Monitor (gesteuerte Ansicht).
  useEffect(() => {
    if (!webgl || dreiD || !ebene.standortId || uebergang || aufbau || (kompakt && !ansicht) || ruhig() || window.innerWidth < 768) return undefined;
    let abbruch = null;
    const warten = setTimeout(() => {
      const los = () => { dreiDVorladen(); setVorbereitung({ ...ebene }); };
      if ('requestIdleCallback' in window) { const id = window.requestIdleCallback(los, { timeout: 2000 }); abbruch = () => window.cancelIdleCallback(id); } else los();
    }, 1200);
    return () => { clearTimeout(warten); abbruch?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl, dreiD, ebene.standortId, ebene.gebaeudeId, uebergang, aufbau, kompakt, ansicht]);

  // Sicherheitsnetz: nach 2,5 s ohne fertige Szene trotzdem losfliegen
  useEffect(() => {
    if (!wartet) return undefined;
    const punkt = buehneRef.current?.querySelector(`[data-ort="st-${wartet.standortId}"]`);
    punkt?.classList.add('wird-vorbereitet');
    const notfall = setTimeout(() => { const ziel = wartet; setWartet(null); wechsle(ziel, 'rein'); }, 2500);
    return () => { clearTimeout(notfall); punkt?.classList.remove('wird-vorbereitet'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wartet]);

  const standortVon = (e) => standorte.find((st) => st.id === e.standortId) ?? null;
  const gebaeudeVon = (e) => gebaeude.find((g) => g.id === e.gebaeudeId) ?? null;
  const landVon = (e) => laender.find((l) => l.kuerzel === e.land) ?? null;
  const standort = standortVon(ebene);
  const aktuellesGebaeude = gebaeudeVon(ebene);
  const land = landVon(ebene);
  const stufeName = ebene.gebaeudeId ? 'gebaeude' : ebene.standortId ? 'werk' : ebene.land ? 'land' : 'welt';
  const raumMoeglich = webgl;
  // Gebäude und Maschinen je Werk (für die 3D-Ansicht) – zwischengespeichert, damit die Szene
  // beim Neuzeichnen dieselben Listen bekommt und nichts neu berechnet
  const werkDaten = useMemo(() => {
    const cache = new Map();
    return (id) => {
      if (!cache.has(id)) {
        const g = gebaeude.filter((x) => x.standort_id === id);
        const ids = new Set(g.map((x) => x.id));
        cache.set(id, { gebaeude: g, maschinen: maschinen.filter((m) => ids.has(m.gebaeude_id)) });
      }
      return cache.get(id);
    };
  }, [gebaeude, maschinen]);

  /* ---------- Wechsel zwischen den Ebenen ---------- */

  function wechsle(neueEbene, richtung) {
    // 3D: Zwischen Werk und Halle fliegt die Kamera – die Ebene selbst bleibt, keine Zoom-Animation
    if (raumMoeglich && dreiD && ebene.standortId && neueEbene.standortId === ebene.standortId) {
      abbrechenZuZeichnung();
      setVerlassen(null);
      ton('sanft');
      setEbene(neueEbene);
      setMaschineId(null);
      return;
    }
    abbrechenZuZeichnung();   // laufendes 3D → 2D abbrechen
    setAufbau(null);
    if (schluesselVon(neueEbene) === ohneEinblenden) setOhneEinblenden(null);   // neu hinein: wieder mit Einblenden
    const vonRaum = istRaum(ebene);
    if (vonRaum) behalte(ebene);
    // Aus 3D heraus ins Land: Kamera steigt in die Vogelperspektive, gleichzeitig zoomt die Karte heraus
    if (vonRaum && richtung === 'raus' && !ruhig()) setVerlassen('hoch');
    ton(richtung);
    setUebergang({ von: ebene, vonSchluessel: schluesselVon(ebene), vonRaum, richtung, dauer: dauerFuer(richtung === 'rein' ? neueEbene : ebene) * (vonRaum ? 1.2 : 1) });
    setEbene(neueEbene);
    setMaschineId(null);
    setVorbereitung(null);
  }

  const zuLand = (l) => wechsle({ land: l.kuerzel, standortId: null, gebaeudeId: null }, 'rein');
  const zuWerk = (st) => {
    const ziel = { land: st.land, standortId: st.id, gebaeudeId: null };
    // 3D: erst vorbereiten (falls noch nicht fertig), dann zoomen
    if (istRaum(ziel) && !ruhig() && !bereit.current.has(schluesselVon(ziel))) {
      setVorbereitung(ziel);
      setWartet(ziel);
      return;
    }
    wechsle(ziel, 'rein');
  };
  const zuGebaeude = (g) => wechsle({ land: ebene.land, standortId: g.standort_id, gebaeudeId: g.id }, 'rein');
  const zuWelt = () => wechsle({ land: null, standortId: null, gebaeudeId: null }, 'raus');
  const zuLandRaus = () => wechsle({ land: ebene.land, standortId: null, gebaeudeId: null }, 'raus');
  const zuStandort = () => wechsle({ land: ebene.land, standortId: ebene.standortId, gebaeudeId: null }, 'raus');
  // Eine Ebene höher (Zurück-Knopf)
  const zurueck = { gebaeude: zuStandort, werk: zuLandRaus, land: zuWelt }[stufeName];

  // Pin-Knopf: genau diese Ansicht (Ebene + 2D/3D) als Favorit in die Seitenleiste – nochmal klicken entfernt sie
  const ansichtJetzt = raumMoeglich && dreiD ? '3d' : '2d';
  const favoritAdresse = (() => {
    const p = new URLSearchParams();
    if (land && !standort) p.set('land', land.kuerzel.toLowerCase());
    if (standort) p.set('werk', standort.kuerzel.toLowerCase());
    if (aktuellesGebaeude) p.set('halle', aktuellesGebaeude.kuerzel.toLowerCase());
    p.set('ansicht', ansichtJetzt);
    return `/karte?${p}`;
  })();
  const angepinnt = favoriten.find((f) => f.adresse === favoritAdresse) ?? null;
  const pinRef = useRef(null);
  // Aktuelle Ansicht melden – die Seitenleiste markiert den passenden Favoriten
  useEffect(() => {
    if (!adresseMitfuehren) return undefined;
    window.kartenAdresse = favoritAdresse;
    window.dispatchEvent(new CustomEvent(KARTEN_ADRESSE, { detail: favoritAdresse }));
    return undefined;
  }, [adresseMitfuehren, favoritAdresse]);
  useEffect(() => () => {
    if (!adresseMitfuehren) return;
    window.kartenAdresse = null;
    window.dispatchEvent(new CustomEvent(KARTEN_ADRESSE, { detail: null }));
  }, [adresseMitfuehren]);
  function pinnen() {
    if (angepinnt?.person) {
      setPinHinweis(t('Dein Werk steht immer in den Favoriten'));
      return;
    }
    if (angepinnt) {
      favoritEntfernen(angepinnt.id);
      setPinHinweis(t('Aus den Favoriten entfernt'));
      return;
    }
    const art = { welt: 'welt', land: 'land', werk: 'werk', gebaeude: 'halle' }[stufeName];
    const name = aktuellesGebaeude ? `${standort.name} · ${aktuellesGebaeude.bezeichnung}` : standort?.name ?? (land ? t(land.name) : t('Weltweit'));
    const ergebnis = favoritHinzufuegen({ name, art, ansicht: ansichtJetzt, adresse: favoritAdresse });
    if (!ergebnis.ok) {
      setPinHinweis(t('Höchstens {n} Favoriten – bitte zuerst einen in der Seitenleiste entfernen.', { n: MAX_FAVORITEN }));
      return;
    }
    setPinHinweis(null);
    favoritFliegt(pinRef.current, ergebnis.favorit);
  }

  function maschineGeklickt(m) {
    if (modus === 'auswahl') onMaschine?.(m);
    else setMaschineId(maschineId === m.id ? null : m.id);
  }

  // Kamerafahrt: Vor dem ersten Zeichnen messen, wo die angeklickte Fläche in der Elternebene liegt (A)
  // und wie groß der Inhalt der Kindebene ist (B). Dann beide Ebenen gemeinsam bewegen:
  // Hinein wächst die Kindebene aus A heraus, die Elternebene vergrößert sich mit; heraus umgekehrt.
  // Die neue Ebene blendet ein, die alte aus. Web-Animationen statt CSS-Klassen, damit ein
  // Neuzeichnen durch React die Fahrt nicht unterbricht.
  useLayoutEffect(() => {
    const neu = neuRef.current;
    const alt = altRef.current;
    const buehne = buehneRef.current;
    if (!uebergang || !neu || !alt || !buehne) return undefined;
    // 3D → 2D: nur überblenden (die Szene ist schon flach von oben und deckt sich mit der Zeichnung)
    // Favorit öffnen (Sprung): ebenso nur überblenden
    if (uebergang.richtung === 'blende' || uebergang.richtung === 'sprung') {
      const ein = neu.animate([{ opacity: 0 }, { opacity: 1 }], { duration: uebergang.dauer, easing: 'ease-in-out', fill: 'both' });
      const aus = alt.animate([{ opacity: 1 }, { opacity: 0 }], { duration: uebergang.dauer, easing: 'ease-in-out', fill: 'both' });
      return () => { ein.cancel(); aus.cancel(); };
    }
    const rein = uebergang.richtung === 'rein';
    const [eltern, kind] = rein ? [alt, neu] : [neu, alt];
    const kindEbene = rein ? ebene : uebergang.von;
    const kennung = kindEbene.gebaeudeId ? `g-${kindEbene.gebaeudeId}` : kindEbene.standortId ? `st-${kindEbene.standortId}` : `land-${kindEbene.land}`;
    const b = buehne.getBoundingClientRect();
    const rechteck = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2, w: r.width, h: r.height };
    };
    // Fokus: Umriss des Landes, Punkt des Werks bzw. Fläche der Halle
    const fokus = eltern.querySelector(`[data-flaeche="${kennung}"]`)
      ?? eltern.querySelector(`[data-ort="${kennung}"] .punkt-blase`) ?? eltern.querySelector(`[data-ort="${kennung}"]`);
    const ziel = kind.querySelector('.raum-platzhalter, .dkarte-land, .lageplan, .grundriss, .raum, .raum-laden') ?? kind.firstElementChild;
    const animationen = [];
    const dauer = uebergang.dauer;
    const blende = (el, ein) => el.animate(
      Array.from({ length: 11 }, (_, i) => ({ offset: i / 10, opacity: ein ? stufe01(i / 10, 0.3, 0.65) : 1 - stufe01(i / 10, 0.45, 0.8) })),
      { duration: dauer, fill: 'both' },
    );
    const A = fokus ? rechteck(fokus) : null;
    const B = ziel ? rechteck(ziel) : null;
    const huelle = rein ? kind.parentElement : null;
    if (A && B && A.w > 0 && B.w > 0 && A.h > 0 && B.h > 0) {
      const fahrt = kamerafahrt(A, B, rein);
      if (huelle) {
        // Hineinzoomen: Hülle mit fester, runder Maske um die Mitte des Inhalts (siehe kamerafahrt)
        const maske = `radial-gradient(closest-side at ${B.x}px ${B.y}px, #000 62%, transparent 100%)`;
        huelle.style.maskImage = maske;
        huelle.style.webkitMaskImage = maske;
        huelle.style.transformOrigin = '0 0';
        animationen.push(huelle.animate(fahrt.huelle, { duration: dauer, fill: 'both' }));
        animationen.push(kind.animate(fahrt.gegen, { duration: dauer, fill: 'both' }));
      } else {
        animationen.push(kind.animate(fahrt.kind, { duration: dauer, fill: 'both' }));
      }
      animationen.push(eltern.animate(fahrt.eltern, { duration: dauer, fill: 'both' }));
    }
    animationen.push(blende(neu, true), blende(alt, false));
    neu.style.transformOrigin = '0 0';
    alt.style.transformOrigin = '0 0';
    return () => {
      animationen.forEach((a) => a.cancel());
      if (huelle) { huelle.style.maskImage = ''; huelle.style.webkitMaskImage = ''; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uebergang]);

  // Nach der Animation die alte Ebene entfernen
  useEffect(() => {
    if (!uebergang) return undefined;
    const timer = setTimeout(() => { setUebergang(null); setVerlassen(null); }, uebergang.dauer);
    return () => clearTimeout(timer);
  }, [uebergang]);

  // Adresse mitführen (z. B. /karte?werk=ham&halle=h2&maschine=12), ohne die Seite neu zu laden.
  // Beim ersten Anzeigen bleibt die Adresse, wie sie ist – geändert wird erst nach einem Klick.
  const ersteAnzeige = useRef(true);
  useEffect(() => {
    if (ersteAnzeige.current) { ersteAnzeige.current = false; return; }
    if (!adresseMitfuehren) return;
    const p = new URLSearchParams();
    if (land && !standort) p.set('land', land.kuerzel.toLowerCase());
    if (standort) p.set('werk', standort.kuerzel.toLowerCase());
    if (aktuellesGebaeude) p.set('halle', aktuellesGebaeude.kuerzel.toLowerCase());
    if (maschineId) p.set('maschine', String(maschineId));
    const ziel = `${window.location.pathname}${p.toString() ? `?${p}` : ''}`;
    window.history.replaceState(window.history.state, '', ziel);
  }, [adresseMitfuehren, land, standort, aktuellesGebaeude, maschineId]);

  // Favorit aus der Seitenleiste, während die Karte offen ist: kurz überblenden und genau dort weitermachen
  const favoritRef = useRef(null);
  favoritRef.current = (adresse) => {
    const ziel = startAusAdresse(Object.fromEntries(new URL(adresse, window.location.origin).searchParams), daten);
    const zielLand = standorte.find((st) => st.id === ziel.standortId)?.land ?? ziel.land ?? null;
    const zielEbene = { land: zielLand, standortId: ziel.standortId ?? null, gebaeudeId: ziel.gebaeudeId ?? null };
    const drei = ziel.ansicht ? webgl && ziel.ansicht === '3d' : dreiD;
    if (drei) dreiDVorladen();
    ton('sanft');
    setVerlassen(null);
    setVorbereitung(null);
    setWartet(null);
    if (istRaum(ebene)) behalte(ebene);
    setUebergang({ von: ebene, vonSchluessel: schluesselVon(ebene), vonRaum: istRaum(ebene), richtung: 'sprung', dauer: 500 });
    setDreiD(drei);
    setEbene(zielEbene);
    setMaschineId(null);
  };
  useEffect(() => {
    if (!adresseMitfuehren) return undefined;
    const oeffnen = (e) => favoritRef.current?.(e.detail);
    window.addEventListener(FAVORIT_OEFFNEN, oeffnen);
    return () => window.removeEventListener(FAVORIT_OEFFNEN, oeffnen);
  }, [adresseMitfuehren]);

  /* ---------- Darstellung einer Ebene ---------- */

  function ebeneZeichnen(e, aktiv) {
    const st = standortVon(e);
    const g = gebaeudeVon(e);
    const karte = e.land ? landKarteVon(e.land) : null;
    const verhaeltnis = seitenverhaeltnis(e, st, g, karte, laender);
    let inhalt;
    let art = 'welt';
    if (g) {
      art = 'gebaeude';
      inhalt = (
        <Grundriss gebaeude={g} maschinen={maschinen.filter((m) => m.gebaeude_id === g.id)} neutral={melden}
                   auswahlId={aktiv ? maschineId : null} onWaehle={aktiv ? maschineGeklickt : undefined} />
      );
    } else if (st) {
      art = 'werk';
      inhalt = (
        <Lageplan standort={st} gebaeude={gebaeude.filter((x) => x.standort_id === st.id)} neutral={melden}
                  onWaehle={aktiv ? zuGebaeude : undefined} />
      );
    } else if (karte) {
      art = 'land';
      inhalt = <LandKarte karte={karte} standorte={standorte.filter((x) => x.land === e.land)} neutral={melden}
                          onWaehle={aktiv ? zuWerk : undefined} onVorschau={aktiv ? vorschau : undefined} />;
    } else {
      inhalt = <WeltKarte laender={laender} neutral={melden} onWaehle={aktiv ? zuLand : undefined} />;
    }
    // Hochkant-Karten (z. B. Deutschland) dürfen bis unter den Titel reichen
    const hochkant = art === 'land' && verhaeltnis < 1 ? ' ebene-hochkant' : '';
    return <div className={`ebene-inhalt ebene-${art}${hochkant}`} style={{ '--verhaeltnis': verhaeltnis }}>{inhalt}</div>;
  }

  // 3D-Ebene? Schlüssel einer Ebene: Eine 3D-Szene behält ihren Schlüssel für Werk und Halle –
  // und beim Herauszoomen wird dieselbe Szene zur "alten" Ebene (kein kurzes Aufblitzen von 2D).
  const istRaum = (e) => raumMoeglich && dreiD && Boolean(e.standortId);
  const schluesselVon = (e) => (istRaum(e) ? `raum-${e.standortId}` : `${e.land ?? 'welt'}-${e.standortId ?? 'x'}-${e.gebaeudeId ?? 'x'}`);
  const raum = istRaum(ebene);
  const schluessel = schluesselVon(ebene);
  const schrittNr = { welt: 1, land: 2, werk: 3, gebaeude: 4 }[stufeName];
  const titel = aktuellesGebaeude?.bezeichnung ?? standort?.name ?? (land ? t(land.name) : t('Weltweit'));
  const hinweis = t(modus === 'auswahl'
    ? { welt: T('In welchem Land?'), land: T('In welchem Werk?'), werk: T('In welchem Gebäude?'), gebaeude: T('An welcher Maschine?') }[stufeName]
    : {
      welt: T('Land anklicken zum Hineinzoomen'), land: T('Werk anklicken zum Hineinzoomen'),
      werk: raum ? T('Halle anklicken · Mausrad zum Zoomen') : T('Gebäude anklicken für den Grundriss'),
      gebaeude: raum ? T('Maschine anklicken · Mausrad zum Zoomen') : T('Maschine anklicken für Details'),
    }[stufeName]);

  const buehne = (
    <div className="explorer-buehne-rahmen">
      {/* Beim Melden: Schritt-Leiste. Sonst: Pfad Welt › Land › Werk › Gebäude (zoomt beim Anklicken heraus) */}
      {melden ? (
        <MeldeSchritte schritt={schrittNr} werte={[land && t(land.name), standort?.name, aktuellesGebaeude?.bezeichnung]}
                       onSchritt={(nr) => [zuWelt, zuLandRaus, zuStandort][nr - 1]?.()} />
      ) : kompakt ? null : (
      <nav className="brotkrumen explorer-pfad" aria-label={t('Pfad')}>
        <button type="button" onClick={zuWelt} disabled={stufeName === 'welt'}>
          <i className="bi bi-globe2" aria-hidden="true" /> {t('Weltweit')}
        </button>
        {land && (
          <>
            <i className="bi bi-chevron-right" aria-hidden="true" />
            <button type="button" onClick={zuLandRaus} disabled={stufeName === 'land'}>{t(land.name)}</button>
          </>
        )}
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
      )}

      {/* Beim Melden im eigenen Werk: kurzer Hinweis, andere Werke bleiben über die Schritt-Leiste wählbar */}
      {melden && eigenesWerk && standort?.id === eigenesWerk && (
        <div className="eigenes-werk-hinweis">
          <i className="bi bi-house-door-fill" aria-hidden="true" />
          <span>{t('Dein Werk: {name}', { name: standort.name })}</span>
          <button type="button" className="link-knopf" onClick={zuLandRaus}>{t('anderes Werk wählen')}</button>
        </div>
      )}

      {/* Weltebene: Bühne so hoch wie die (breite) Weltkarte, damit oben und unten nichts leer bleibt.
          Während eines Zooms behält die Bühne die volle Höhe – die Weltkarte ist oben verankert und bewegt sich nicht. */}
      <div className={`explorer-buehne buehne-${groesse}${stufeName === 'welt' && !uebergang ? ' buehne-welt' : ''}${uebergang || verlassen || aufbau ? ' im-flug' : ''}${raum ? ' buehne-raum' : ''}`} ref={buehneRef}
           style={{ '--welt-verhaeltnis': weltVerhaeltnis() }}>
        {/* Kopf über der Karte: Zurück und Titel */}
        <div className="buehne-kopf">
          {zurueck && (
            <button type="button" className="rund-knopf glas-knopf" onClick={zurueck} aria-label={t('Herauszoomen')}>
              <i className="bi bi-arrow-left" />
            </button>
          )}
          {melden && <span className="buehne-schritt" aria-hidden="true">{schrittNr}</span>}
          <div>
            <div className="buehne-titel">{titel}</div>
            <div className="buehne-hinweis">{hinweis}</div>
          </div>
        </div>

        {/* Alte Ebene (nur während des Zooms) und neue Ebene – mit Schlüssel, damit React eine
            bestehende Ebene (z. B. die 3D-Szene) beim Rollentausch weiterverwendet statt neu aufzubauen */}
        {[
          ...(uebergang && uebergang.vonSchluessel !== schluessel
            ? [{ e: uebergang.von, schl: uebergang.vonSchluessel, raum3d: uebergang.vonRaum, rolle: 'alt' }] : []),
          // unsichtbar vorbereitetes 3D-Werk (wird beim Wechsel zur neuen Ebene – gleicher Schlüssel, kein Neuaufbau)
          // sowie behaltene Szenen (siehe „behalten“) – alle unsichtbar und angehalten
          ...(raumMoeglich ? [vorbereitung, ...behalten].filter(Boolean)
            .filter((e, i, liste) => liste.findIndex((x) => x.standortId === e.standortId) === i)
            .filter((e) => raumSchluessel(e) !== schluessel && raumSchluessel(e) !== uebergang?.vonSchluessel)
            .map((e) => ({ e, schl: raumSchluessel(e), raum3d: true, rolle: 'vorschau' })) : []),
          { e: ebene, schl: schluessel, raum3d: raum, rolle: 'neu' },
        ].map(({ e, schl, raum3d, rolle }) => {
          const aktiv = rolle === 'neu';
          return (
            // Hülle: trägt beim Hineinzoomen die weiche Maske (siehe kamerafahrt); sonst unsichtbar ohne Wirkung
            <div key={schl} className={`ebene-huelle huelle-${rolle}`}>
            <div ref={aktiv ? neuRef : rolle === 'alt' ? altRef : undefined} aria-hidden={aktiv ? undefined : true}
                 // Beim Herauszoomen sind die Beschriftungen der neuen (zunächst stark vergrößerten) Ebene kurz verborgen
                 className={`explorer-ebene ebene-${rolle}${raum3d ? ' ebene-raum' : ''}`
                   + `${aktiv && uebergang?.richtung === 'raus' ? ' ohne-marken' : ''}`
                   + `${rolle === 'alt' && uebergang?.richtung === 'raus' ? ' ebene-weich' : ''}`
                   + `${rolle === 'alt' && (uebergang?.richtung === 'blende' || uebergang?.richtung === 'sprung') ? ' ebene-blende' : ''}`
                   + `${schl === ohneEinblenden ? ' ohne-einblenden' : ''}`}
>
              {raum3d ? (
                <>
                  {/* Platzhalter in Größe und Lage des 2D-Plans (ohne Inhalt): Darauf zielt die Kamerafahrt */}
                  <div className="raum-unterlage" aria-hidden="true">
                    <div className="ebene-inhalt" style={{ '--verhaeltnis': seitenverhaeltnis(e, standortVon(e), gebaeudeVon(e), null, laender) }}>
                      <div className="raum-platzhalter" style={{ aspectRatio: seitenverhaeltnis(e, standortVon(e), gebaeudeVon(e), null, laender) }} />
                    </div>
                  </div>
                  <Werk3D standort={standortVon(e)} {...werkDaten(e.standortId)} gebaeudeId={e.gebaeudeId}
                          verlassen={rolle === 'alt' ? { blende: 'flach', sprung: null }[uebergang?.richtung] ?? 'hoch' : aktiv ? verlassen : null}
                          vorschau={rolle === 'vorschau'} aufbauen={rolle === 'vorschau' && !dreiD}
                          onWeg={() => bereit.current.delete(schl)}
                          ruhen={aktiv && uebergang?.richtung === 'rein'} onFlach={aktiv ? zeichnungUeberblenden : undefined} starten={aktiv && !uebergang} onBereit={() => szeneBereit(schl)}
                          maschineId={aktiv ? maschineId : null} onGebaeude={zuGebaeude} onMaschine={maschineGeklickt} neutral={melden} />
                </>
              ) : ebeneZeichnen(e, aktiv)}
            </div>
            </div>
          );
        })}

        {/* Oben rechts: Ansicht anpinnen (ab Land, nicht beim Melden) und Umschalter 2D / 3D (nur Werk und Halle); Ton im Konto-Menü */}
        {!kompakt && <div className="karten-werkzeuge">
          {/* Pin erst ab Land – die Weltkarte ist ohnehin der Start */}
          {!melden && stufeName !== 'welt' && (
            <button type="button" ref={pinRef} className={`rund-knopf karten-knopf karten-pin${angepinnt ? ' angepinnt' : ''}`}
                    aria-pressed={Boolean(angepinnt)} onClick={pinnen}
                    aria-label={angepinnt ? t('Aus den Favoriten entfernen') : t('Diese Ansicht anpinnen')}
                    title={angepinnt ? t('Aus den Favoriten entfernen') : t('Diese Ansicht anpinnen')}>
              {/* Angepinnt: Pin durchgestrichen (Strich per CSS) – Klick entfernt den Favoriten */}
              <span className="pin-symbol" aria-hidden="true"><i className="bi bi-pin-angle" /></span>
            </button>
          )}
          {raumMoeglich && (stufeName === 'werk' || stufeName === 'gebaeude') && (
            <div className="sprach-schalter raum-schalter" role="group" aria-label={t('Darstellung der Karte')}>
              {/* Sofortige Rückmeldung: „3D“ ist gleich gewählt, solange die Szene noch vorbereitet wird (pulsiert) */}
              <button type="button" aria-pressed={!dreiD && !aufbau} onClick={() => ansichtWaehlen(false)}>2D</button>
              <button type="button" aria-pressed={dreiD || Boolean(aufbau)} className={aufbau ? 'wird-geladen' : undefined} onClick={() => ansichtWaehlen(true)}>3D</button>
            </div>
          )}
        </div>}
        {pinHinweis && <div className="karten-hinweis" role="status">{pinHinweis}</div>}
        {/* 3D: Legende der Ampelfarben unten rechts (nicht im kleinen Kartenfenster der Übersicht) */}
        {raum && (!kompakt || groesse === 'monitor') && (
          <div className="raum-legende" aria-label={t('Bedeutung der Ampelfarben')}>
            {AMPEL_REIHENFOLGE.map((z) => (
              <span key={z} className={`ampel-${z}`}>
                <i className={`ampel-punkt ampel-${z}`} aria-hidden="true" />
                <b>{t(AMPEL_TEXT[z])}</b>{AMPEL_PRIORITAET[z] && <small> · {t('Priorität {p}', { p: t(AMPEL_PRIORITAET[z]) })}</small>}
              </span>
            ))}
          </div>
        )}
      </div>
      {!melden && !kompakt && <Legende />}
    </div>
  );

  // Kleines Kartenfenster (Übersicht): nur die Bühne
  if (kompakt) return <div className="explorer-kompakt">{buehne}</div>;

  return (
    <div className={`row g-4${melden ? ' explorer-melden' : ''}`}>
      <div className="col-xl-8">
        <section className="karte explorer-karte" style={{ '--i': 0 }}>{buehne}</section>
      </div>
      <div className="col-xl-4 explorer-info-spalte">
        <div className="explorer-info">
          <InfoSpalte key={`${schluessel}-${maschineId ?? ''}`} stufe={stufeName} modus={modus} daten={daten}
                      laender={laender} land={land} webgl={webgl}
                      standort={standort} gebaeudeAktuell={aktuellesGebaeude} maschineId={maschineId}
                      onLand={zuLand} onWerk={zuWerk} onGebaeude={zuGebaeude} onMaschine={maschineGeklickt}
                      onAuswahlAufheben={() => setMaschineId(null)} eigenesWerk={eigenesWerk} />
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
 * Info-Spalte rechts neben der Karte – Inhalt passend zur Ebene
 * ================================================================== */
function InfoSpalte({
  stufe: ebeneName, modus, daten, laender, land, standort, gebaeudeAktuell, maschineId, webgl,
  onLand, onWerk, onGebaeude, onMaschine, onAuswahlAufheben, eigenesWerk = null,
}) {
  const { standorte, gebaeude, maschinen, offene, techniker } = daten;
  const t = useT();

  /* ---------- Ebene Welt: alle Länder ---------- */
  if (ebeneName === 'welt') {
    const eigenesLand = standorte.find((st) => st.id === eigenesWerk)?.land ?? null;
    const sortiert = (modus === 'auswahl'
      ? [...laender]
      : [...laender].sort((a, b) => b.offen - a.offen || b.hoch - a.hoch || Number(b.hauptsitz) - Number(a.hauptsitz)))
      // Land der gewählten Person zuerst
      .sort((a, b) => Number(b.kuerzel === eigenesLand) - Number(a.kuerzel === eigenesLand));
    return (
      <section className="karte explorer-seite" style={{ '--i': 1 }}>
        <h2 className="abschnitt-titel">{modus === 'auswahl' ? t('Land aus der Liste wählen') : t('Länder')}</h2>
        <ul className="ort-liste">
          {sortiert.map((l) => (
            <li key={l.kuerzel}>
              <button type="button" onClick={() => onLand(l)} className={modus === 'auswahl' ? '' : `stufe-${stufe(l.offen, l.hoechste_prioritaet)}`}>
                <span>
                  <span className="ort-titel">
                    {t(l.name)}
                    {l.hauptsitz && <span className="hauptsitz-abzeichen"><i className="bi bi-star-fill" aria-hidden="true" /> {t('Hauptsitz')}</span>}
                    {l.kuerzel === eigenesLand && <span className="hauptsitz-abzeichen eigenes-abzeichen"><i className="bi bi-house-door-fill" aria-hidden="true" /> {t('Dein Land')}</span>}
                  </span>
                  <span className="ort-unter">
                    {l.werke === 1 ? t('1 Werk') : t('{n} Werke', { n: l.werke })} · {t('{n} Maschinen', { n: l.maschinen })}
                  </span>
                </span>
                {modus === 'auswahl'
                  ? <i className="bi bi-chevron-right ms-auto text-leise" aria-hidden="true" />
                  : <span className={`ort-zahl${geteiltKlasse(l)}`} aria-label={prioText(l, t)}><PrioZahlen o={l} /></span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  /* ---------- Ebene Land: Werke des Landes ---------- */
  if (ebeneName === 'land' && land) {
    const werkeHier = standorte.filter((st) => st.land === land.kuerzel);
    const sortiert = (modus === 'auswahl'
      ? [...werkeHier].sort((a, b) => a.stadt.localeCompare(b.stadt))
      : [...werkeHier].sort((a, b) => b.offen - a.offen || b.hoch - a.hoch || a.stadt.localeCompare(b.stadt)))
      // Werk der gewählten Person zuerst
      .sort((a, b) => Number(b.id === eigenesWerk) - Number(a.id === eigenesWerk));
    return (
      <section className="karte explorer-seite" style={{ '--i': 1 }}>
        <h2 className="abschnitt-titel">{modus === 'auswahl' ? t('Werk aus der Liste wählen') : t('Standorte')}</h2>
        <ul className="ort-liste">
          {sortiert.map((st) => (
            <li key={st.id}>
              <button type="button" onClick={() => onWerk(st)} className={modus === 'auswahl' ? '' : `stufe-${stufe(st.offen, st.hoechste_prioritaet)}`}>
                <span>
                  <span className="ort-titel">
                    {st.name}
                    {st.id === eigenesWerk && <span className="hauptsitz-abzeichen eigenes-abzeichen"><i className="bi bi-house-door-fill" aria-hidden="true" /> {t('Dein Werk')}</span>}
                  </span>
                  <span className="ort-unter">{t(st.schwerpunkt)} · {t('{n} Gebäude', { n: st.gebaeude })} · {t('{n} Maschinen', { n: st.maschinen })}</span>
                </span>
                {modus === 'auswahl'
                  ? <i className="bi bi-chevron-right ms-auto text-leise" aria-hidden="true" />
                  : <span className={`ort-zahl${geteiltKlasse(st)}`} aria-label={prioText(st, t)}><PrioZahlen o={st} /></span>}
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
    const technikerHier = techniker.filter((x) => x.standort_id === standort.id);
    return (
      <>
        <section className="karte explorer-seite" style={{ '--i': 1 }}>
          {modus === 'anzeige' && <p className="klein mb-3"><i className="bi bi-geo-alt" aria-hidden="true" /> {standort.adresse}</p>}
          <h2 className="abschnitt-titel">{modus === 'auswahl' ? t('Gebäude aus der Liste wählen') : t('Gebäude')}</h2>
          <ul className="ort-liste">
            {hallen.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => onGebaeude(g)} className={modus === 'auswahl' ? '' : `stufe-${stufe(g.offen, g.hoechste_prioritaet)}`}>
                  <span>
                    <span className="ort-titel">{g.bezeichnung}</span>
                    <span className="ort-unter">{t('{n} Maschinen', { n: g.maschinen })} · {g.breite_m} × {g.tiefe_m} m</span>
                  </span>
                  {modus === 'auswahl'
                    ? <i className="bi bi-chevron-right ms-auto text-leise" aria-hidden="true" />
                    : <span className={`ort-zahl${geteiltKlasse(g)}`} aria-label={prioText(g, t)}><PrioZahlen o={g} /></span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
        {modus === 'anzeige' && (
          <>
            <section className="karte explorer-seite" style={{ '--i': 2 }}>
              <h2 className="abschnitt-titel">{t('Offene Störungen')}</h2>
              {offeneHier.length === 0
                ? <p className="text-leise mb-0"><i className="bi bi-check-circle me-1" style={{ color: 'var(--gruen)' }} />{t('Alle Anlagen laufen.')}</p>
                : <OffeneListe auftraege={offeneHier} mitGebaeude />}
            </section>
            <section className="karte explorer-seite" style={{ '--i': 3 }}>
              <h2 className="abschnitt-titel">{t('Techniker vor Ort')}</h2>
              <ul className="ort-liste">
                {technikerHier.map((tech) => (
                  <li key={tech.id}>
                    <div className="ort-zeile">
                      <i className="bi bi-person-gear fs-5 text-leise" aria-hidden="true" />
                      <span><span className="ort-titel">{tech.name}</span><span className="ort-unter">{t(tech.qualifikation)} · {t(tech.schicht)}</span></span>
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
        <h2 className="abschnitt-titel">{t('Maschine aus der Liste wählen')}</h2>
        <ul className="ort-liste">
          {maschinenHier.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onMaschine(m)}>
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
            <div className="klein">{auswahl.anlagennummer} · {t(auswahl.typ)} · {t('Baujahr {n}', { n: auswahl.baujahr })}</div>
          </div>
          <button type="button" className="rund-knopf" onClick={onAuswahlAufheben} aria-label={t('Auswahl schließen')}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
        {/* Signalampel der Maschine und – wenn der Browser 3D kann – das animierte Modell */}
        <div className={`ampel-zeile ampel-${ampelZustand(auswahl)}`}>
          <AmpelSymbol />
          {t(AMPEL_TEXT[ampelZustand(auswahl)])}
        </div>
        {webgl && <MaschineDetail3D key={auswahl.id} maschine={auswahl} />}
        <div className="mini-kennzahlen">
          <div><strong>{auswahl.offen}</strong><span>{t('offen')}</span></div>
          <div><strong>{auswahl.stoerungen_12m}</strong><span>{t('Störungen 12 Mon.')}</span></div>
          <div><strong>{new Date().getFullYear() - auswahl.baujahr}</strong><span>{t('Jahre alt')}</span></div>
        </div>
        <h3 className="h6 fw-semibold mb-2">{offenText(auswahl.offen, t)}</h3>
        {offeneDerMaschine.length === 0
          ? <p className="text-leise"><i className="bi bi-check-circle me-1" style={{ color: 'var(--gruen)' }} />{t('Die Maschine läuft störungsfrei.')}</p>
          : <OffeneListe auftraege={offeneDerMaschine} />}
        <Link href={`/maschinen/${auswahl.id}`} className="btn btn-outline-secondary w-100 mt-3 maschinenhistorie-link">
          <i className="bi bi-clock-history" aria-hidden="true" /> {t('Maschinenhistorie')}
        </Link>
        <Link href={`/melden?maschine=${auswahl.id}`} className="btn btn-primary w-100 mt-2">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" /> {t('Störung an dieser Maschine melden')}
        </Link>
      </section>
    );
  }

  const gestoert = maschinenHier.filter((m) => m.offen > 0).sort((a, b) => b.offen - a.offen);
  return (
    <section className="karte explorer-seite" style={{ '--i': 1 }}>
      <h2 className="abschnitt-titel">{t('Maschinen mit Störungen')}</h2>
      {gestoert.length === 0 ? (
        <p className="leer"><i className="bi bi-check-circle" />{t('Alle Maschinen in diesem Gebäude laufen.')}</p>
      ) : (
        <ul className="ort-liste">
          {gestoert.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onMaschine(m)} className={`stufe-${stufe(m.offen, m.hoechste_prioritaet)}`}>
                <i className={`bi ${MASCHINEN_SYMBOLE[m.typ] ?? 'bi-gear'} text-leise`} aria-hidden="true" />
                <span><span className="ort-titel">{m.bezeichnung}</span><span className="ort-unter">{m.anlagennummer}</span></span>
                <span className={`ort-zahl${geteiltKlasse(m)}`} aria-label={prioText(m, t)}><PrioZahlen o={m} /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Hallen-Monitor (Vollbild für einen Bildschirm in der Halle) und QR-Etiketten aller Maschinen */}
      {standort && (
        <div className="d-flex gap-2 flex-wrap mt-3">
          <Link href={`/monitor?werk=${standort.kuerzel.toLowerCase()}&halle=${gebaeudeAktuell.kuerzel.toLowerCase()}`} className="btn btn-sekundaer btn-klein hallen-monitor-link" prefetch={false}>
            <i className="bi bi-display" aria-hidden="true" /> {t('Hallen-Monitor')}
          </Link>
          <Link href={`/qr?werk=${standort.kuerzel.toLowerCase()}&halle=${gebaeudeAktuell.kuerzel.toLowerCase()}`} className="btn btn-sekundaer btn-klein" prefetch={false}>
            <i className="bi bi-qr-code" aria-hidden="true" /> {t('QR-Etiketten')}
          </Link>
        </div>
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
          <Link href={`/auftraege/${a.auftrag_id}`} prefetch={false}>
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
