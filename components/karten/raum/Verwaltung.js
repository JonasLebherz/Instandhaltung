'use client';
/**
 * components/karten/raum/Verwaltung.js – Easter Egg: das Verwaltungsgebäude von innen + Versteckspiel
 *
 * Klickt man in der 3D-Werksansicht auf das Verwaltungsgebäude (Fachwerkhaus, Glasturm, Pagode …),
 * fliegt die Kamera heran und das Gebäude öffnet sich wie ein Puppenhaus: Dach weg, Wände
 * auf Brusthöhe abgeschnitten. Innen: Flur, zwei Büros, Chefbüro, Besprechungsraum, Empfang
 * und Küche – mit Möbeln, Bildschirmen, Pflanzen und Kolleginnen und Kollegen auf dem Flur.
 *
 * Versteckspiel: Fünf Dinge sind irgendwo versteckt (Gummiente, Katze, Fußball, Pizza,
 * Teddybär, Kaktus – bei jeder Runde andere Verstecke). Anklicken = gefunden. „Tipp“ lässt
 * ein Ding kurz leuchten. Bestzeit im Browser (localStorage). Nichts geht in die Datenbank.
 *
 *  - VerwaltungInnen: die 3D-Einrichtung samt Verstecken (im Canvas)
 *  - VersteckLeiste:  Anzeige über der 3D-Ansicht (Start, Zeit, Liste, Tipp, Ergebnis)
 * Möbel als Instanzen (Viele) – wenige Zeichenaufrufe, damit es flüssig bleibt.
 */
import { useEffect, useMemo, useState } from 'react';
import { Viele, useCanvasTextur } from './Bausteine';
import Figur from './Figur';
import { useT } from '@/components/SpracheKontext';
import { T } from '@/lib/sprache';

/** Die versteckbaren Dinge (Name als Schlüssel für die Übersetzung, Zeichen für die Liste) */
export const DINGE = [
  { art: 'ente', name: T('Gummiente'), zeichen: '🦆' },
  { art: 'katze', name: T('Katze'), zeichen: '🐈' },
  { art: 'ball', name: T('Fußball'), zeichen: '⚽' },
  { art: 'pizza', name: T('Pizza'), zeichen: '🍕' },
  { art: 'teddy', name: T('Teddybär'), zeichen: '🧸' },
  { art: 'kaktus', name: T('Kaktus'), zeichen: '🌵' },
];
const REKORD = 'versteckspiel-rekord';

/** Fünf zufällige Dinge für eine Runde */
export function dingeFuerRunde() {
  return [...DINGE].sort(() => Math.random() - 0.5).slice(0, 5).map((d) => d.art);
}

/** Wandfarbe innen passend zum Baustil des Gebäudes */
const WANDFARBE = {
  fachwerk: '#f6f1e6', glas: '#e3e8ee', pagode: '#f2ebe0', hacienda: '#ecc08c',
  zwiebel: '#efe6d4', mansarde: '#efe3cc', kuppel: '#f4f1ea', backstein: '#c8826b',
};

/* ---------------------------------------------------------------------------
 * Grundriss: Wände, Räume, Möbel und mögliche Verstecke (lokal, Mitte = 0)
 * ------------------------------------------------------------------------- */
function grundriss(b, t, f) {
  const H = 2.4;                      // Wände auf diese Höhe "abgeschnitten"
  const flur = -t * 0.05;             // Mitte des Flurs (z)
  const hinten = flur - 0.9;          // Wand Flur ↔ hintere Räume
  const vorn = flur + 0.9;            // Wand Flur ↔ vordere Räume
  const w = b / 3;                    // Breite eines Raums
  const wand = [];
  const segment = (x1, z1, x2, z2, tueren = []) => {
    // Wand von (x1,z1) nach (x2,z2) mit Türöffnungen (Mitte entlang der Wand, 1 m breit)
    const laenge = Math.hypot(x2 - x1, z2 - z1);
    const quer = x1 === x2;
    let von = 0;
    [...tueren, laenge + 0.5].sort((a, c) => a - c).forEach((tuer) => {
      const bis = Math.min(laenge, tuer - 0.5);
      if (bis - von > 0.05) {
        const m = (von + bis) / 2;
        wand.push({ p: quer ? [x1, H / 2, z1 + m] : [x1 + m, H / 2, z1], g: quer ? [0.2, H, bis - von] : [bis - von, H, 0.2] });
      }
      von = tuer + 0.5;
    });
  };
  const xl = -b / 2;
  const zl = -t / 2;
  segment(xl, zl, xl + b, zl);                                   // Rückwand
  segment(xl, zl + t, xl + b, zl + t, [b / 2]);                  // Vorderwand mit Eingang
  segment(xl, zl, xl, zl + t);
  segment(xl + b, zl, xl + b, zl + t);
  segment(xl, hinten, xl + b, hinten, [w / 2, w * 1.5, w * 2.5]); // Flurwand hinten mit drei Türen
  segment(xl, vorn, xl + w, vorn, [w / 2]);                      // Besprechung
  segment(xl + 2 * w, vorn, xl + b, vorn, [w / 2]);              // Küche
  [xl + w, xl + 2 * w].forEach((x) => { segment(x, zl, x, hinten); segment(x, vorn, x, zl + t); });

  const holz = '#b8956a';
  const weiss = '#f2f3f5';
  const dunkel = f['maschine-dunkel'];
  const m = [];   // Möbel (Quader mit Farbe)
  const k = [];   // Kugeln (Pflanzen)
  const verstecke = [];
  const tisch = (x, z, breite, tiefe, farbe = weiss, hoehe = 0.75) => {
    m.push({ p: [x, hoehe, z], g: [breite, 0.05, tiefe], farbe });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => m.push({ p: [x + a * (breite / 2 - 0.06), hoehe / 2, z + c * (tiefe / 2 - 0.06)], g: [0.05, hoehe, 0.05], farbe: dunkel }));
  };
  const stuhl = (x, z, richtung = 1, farbe = dunkel) => {
    m.push({ p: [x, 0.46, z], g: [0.46, 0.06, 0.46], farbe });
    m.push({ p: [x, 0.78, z + richtung * 0.22], g: [0.44, 0.6, 0.06], farbe });
    m.push({ p: [x, 0.22, z], g: [0.06, 0.44, 0.06], farbe: dunkel });
  };
  const bildschirm = (x, z, richtung = 1) => {
    m.push({ p: [x, 1.02, z], g: [0.56, 0.34, 0.03], farbe: '#22262c' });
    m.push({ p: [x, 1.02, z + richtung * 0.017], g: [0.5, 0.28, 0.005], farbe: f.akzent });
  };
  const pflanze = (x, z, gross = 1) => {
    m.push({ p: [x, 0.22 * gross, z], g: [0.4 * gross, 0.44 * gross, 0.4 * gross], farbe: '#8b6b4e' });
    k.push({ p: [x, 0.8 * gross, z], g: [0.75 * gross, 0.9 * gross, 0.75 * gross] });
  };
  const regal = (x, z, breite, quer = false) => {
    // Aktenregal mit bunten Ordnern
    m.push({ p: [x, 0.9, z], g: quer ? [0.4, 1.8, breite] : [breite, 1.8, 0.4], farbe: holz });
    const farben = [f.blau, f['ampel-rot'], f.signal, '#3f8f3a', weiss];
    for (let r = 0; r < 3; r += 1) {
      for (let i = 0; i < Math.floor(breite / 0.25); i += 1) {
        const d = -breite / 2 + 0.15 + i * 0.25;
        m.push({ p: quer ? [x + 0.21, 0.4 + r * 0.55, z + d] : [x + d, 0.4 + r * 0.55, z + 0.21], g: quer ? [0.02, 0.36, 0.18] : [0.18, 0.36, 0.02], farbe: farben[(i + r) % farben.length] });
      }
    }
  };

  // Büro 1 und Büro 2 (hinten links/Mitte): je zwei Schreibtische an der Rückwand, Regal, Pflanze
  [0, 1].forEach((r) => {
    const mx = xl + w * (r + 0.5);
    [-0.22, 0.22].forEach((a) => {
      const x = mx + a * w;
      tisch(x, zl + 0.65, 1.4, 0.75);
      bildschirm(x, zl + 0.45, 1);
      stuhl(x, zl + 1.35, 1);
      verstecke.push([x, 0, zl + 0.65], [x, 0.5, zl + 1.35]);
    });
    regal(xl + w * r + 0.35, (zl + hinten) / 2, Math.min(2.2, hinten - zl - 0.8), true);
    verstecke.push([xl + w * r + 0.35, 1.8, (zl + hinten) / 2]);
    pflanze(xl + w * (r + 1) - 0.45, hinten - 0.45);
    verstecke.push([xl + w * (r + 1) - 0.85, 0, hinten - 0.45]);
  });
  // Chefbüro (hinten rechts): großer Schreibtisch, Ledersessel, Besucherstühle, Bücherwand, Sofa
  {
    const mx = xl + w * 2.5;
    const mz = (zl + hinten) / 2;
    m.push({ p: [mx, 0.01, mz], g: [w * 0.7, 0.02, (hinten - zl) * 0.6], farbe: '#8a3b33' });
    tisch(mx, mz - 0.3, 1.9, 0.9, holz);
    bildschirm(mx, mz - 0.55, 1);
    stuhl(mx, mz - 1.05, -1, '#5a3a2a');
    stuhl(mx - 0.5, mz + 0.5, 1);
    stuhl(mx + 0.5, mz + 0.5, 1);
    regal(mx, zl + 0.25, Math.min(3, w - 1.2));
    m.push({ p: [xl + b - 0.5, 0.35, mz], g: [0.8, 0.5, 1.8], farbe: '#5a3a2a' });
    m.push({ p: [xl + b - 0.2, 0.7, mz], g: [0.25, 0.7, 1.8], farbe: '#5a3a2a' });
    pflanze(xl + 2 * w + 0.45, zl + 0.45, 1.2);
    verstecke.push([mx, 0, mz - 0.3], [mx, 1.8, zl + 0.25], [xl + b - 0.5, 0.6, mz], [mx, 0.78, mz - 0.1]);
  }
  // Besprechung (vorn links): langer Tisch mit sechs Stühlen, Bildschirm an der Wand
  {
    const mx = xl + w / 2;
    const mz = (vorn + zl + t) / 2;
    tisch(mx, mz, Math.min(3, w - 1.4), 1.1, holz);
    [-0.33, 0, 0.33].forEach((a) => [-1, 1].forEach((s) => stuhl(mx + a * Math.min(3, w - 1.4), mz + s * 0.85, s)));
    m.push({ p: [xl + 0.14, 1.4, mz], g: [0.06, 0.8, 1.4], farbe: '#22262c' });
    pflanze(xl + 0.45, zl + t - 0.45);
    verstecke.push([mx, 0, mz], [mx + 0.6, 0.78, mz], [xl + 0.45, 0, vorn + 0.5]);
  }
  // Empfang (vorn Mitte): Theke, Sofa, Fußmatte, Pflanze
  {
    const mx = xl + w * 1.5;
    m.push({ p: [mx - w * 0.2, 0.55, vorn + 0.9], g: [1.8, 1.1, 0.6], farbe: weiss });
    m.push({ p: [mx - w * 0.2, 1.12, vorn + 0.9], g: [1.9, 0.05, 0.7], farbe: holz });
    m.push({ p: [mx + w * 0.25, 0.25, zl + t - 0.6], g: [1.8, 0.45, 0.75], farbe: f.blau });
    m.push({ p: [mx + w * 0.25, 0.6, zl + t - 0.3], g: [1.8, 0.6, 0.2], farbe: f.blau });
    m.push({ p: [mx, 0.01, zl + t - 0.5], g: [1.4, 0.02, 0.8], farbe: dunkel });
    pflanze(mx - w * 0.4, zl + t - 0.45, 1.3);
    verstecke.push([mx - w * 0.2, 1.15, vorn + 0.9], [mx + w * 0.25, 0.48, zl + t - 0.6], [mx - w * 0.2, 0, vorn + 1.4]);
  }
  // Küche (vorn rechts): Zeile mit Spüle und Kaffeemaschine, Kühlschrank, Tisch mit vier Stühlen
  {
    const mx = xl + w * 2.5;
    const zeile = Math.min(w - 1.6, 3.2);
    m.push({ p: [mx - 0.3, 0.45, zl + t - 0.35], g: [zeile, 0.9, 0.6], farbe: weiss });
    m.push({ p: [mx - 0.3, 0.92, zl + t - 0.35], g: [zeile + 0.04, 0.04, 0.64], farbe: '#6b7078' });
    m.push({ p: [mx - 0.3 - zeile * 0.25, 0.93, zl + t - 0.35], g: [0.5, 0.03, 0.4], farbe: '#c3c8cf' });
    m.push({ p: [mx - 0.3 + zeile * 0.3, 1.12, zl + t - 0.45], g: [0.3, 0.4, 0.3], farbe: '#22262c' });
    m.push({ p: [mx - 0.3 + zeile * 0.3, 1.2, zl + t - 0.29], g: [0.06, 0.04, 0.01], farbe: f['ampel-rot'] });
    m.push({ p: [xl + b - 0.45, 0.95, zl + t - 0.45], g: [0.65, 1.9, 0.65], farbe: '#dfe3e8' });
    tisch(mx - 0.2, (vorn + zl + t) / 2 - 0.2, 1.0, 1.0, weiss);
    [[-0.75, 0, 1], [0.75, 0, 1], [0, -0.75, 1], [0, 0.75, -1]].forEach(([dx, dz, s]) => stuhl(mx - 0.2 + dx, (vorn + zl + t) / 2 - 0.2 + dz, s));
    verstecke.push([xl + b - 0.45, 1.9, zl + t - 0.45], [mx - 0.3 - zeile * 0.4, 0.94, zl + t - 0.35], [mx - 0.2, 0, (vorn + zl + t) / 2 - 0.2]);
  }
  // Flurenden
  verstecke.push([xl + 0.5, 0, flur], [xl + b - 0.5, 0, flur]);
  return { wand, H, m, k, verstecke, flur };
}

/* ---------------------------------------------------------------------------
 * Die versteckten Dinge (aus einfachen Formen, etwas größer als in echt)
 * ------------------------------------------------------------------------- */
function Ding({ art, ball }) {
  const teil = (p, form, g, farbe, extra = {}) => (
    <mesh position={p} rotation={extra.r ?? [0, 0, 0]} scale={extra.s ?? 1} castShadow>
      {form === 'kugel' && <sphereGeometry args={[g, 16, 12]} />}
      {form === 'box' && <boxGeometry args={g} />}
      {form === 'zyl' && <cylinderGeometry args={g} />}
      {form === 'kegel' && <coneGeometry args={g} />}
      <meshStandardMaterial color={farbe} roughness={0.5} map={extra.map ?? null} />
    </mesh>
  );
  switch (art) {
    case 'ente':
      return (
        <>
          {teil([0, 0.13, 0], 'kugel', 0.15, '#ffd23f', { s: [1.3, 0.9, 1] })}
          {teil([0.13, 0.3, 0], 'kugel', 0.1, '#ffd23f')}
          {teil([0.25, 0.3, 0], 'kegel', [0.04, 0.1, 10], '#ff8c1a', { r: [0, 0, -Math.PI / 2] })}
          {teil([0.17, 0.34, 0.07], 'kugel', 0.018, '#111111')}
        </>
      );
    case 'katze':
      return (
        <>
          {teil([0, 0.16, 0], 'kugel', 0.18, '#d9822b', { s: [1.5, 0.85, 0.9] })}
          {teil([0.27, 0.27, 0], 'kugel', 0.11, '#d9822b')}
          {[-0.05, 0.05].map((z) => <group key={z}>{teil([0.29, 0.38, z], 'kegel', [0.035, 0.08, 8], '#c26f1f')}</group>)}
          {teil([-0.3, 0.2, 0], 'zyl', [0.03, 0.03, 0.35, 8], '#c26f1f', { r: [0, 0, 0.9] })}
          {teil([0.37, 0.28, 0], 'kugel', 0.016, '#ff8fa3')}
        </>
      );
    case 'ball':
      return teil([0, 0.16, 0], 'kugel', 0.16, '#ffffff', { map: ball });
    case 'pizza':
      return (
        <>
          {teil([0, 0.03, 0], 'box', [0.48, 0.06, 0.48], '#e2c99f')}
          {teil([0, 0.061, 0], 'zyl', [0.12, 0.12, 0.004, 20], '#c8102e')}
        </>
      );
    case 'teddy':
      return (
        <>
          {teil([0, 0.15, 0], 'kugel', 0.15, '#9c6b3f', { s: [1, 1.1, 0.9] })}
          {teil([0, 0.37, 0], 'kugel', 0.11, '#9c6b3f')}
          {[-0.08, 0.08].map((x) => <group key={x}>{teil([x, 0.46, 0], 'kugel', 0.04, '#7a5230')}</group>)}
          {teil([0, 0.35, 0.09], 'kugel', 0.04, '#d8b48a')}
          {[-0.14, 0.14].map((x) => <group key={`a${x}`}>{teil([x, 0.18, 0.03], 'kugel', 0.055, '#9c6b3f')}</group>)}
        </>
      );
    default:          // kaktus im Topf
      return (
        <>
          {teil([0, 0.08, 0], 'zyl', [0.11, 0.09, 0.16, 12], '#c96f3b')}
          {teil([0, 0.32, 0], 'zyl', [0.07, 0.07, 0.36, 10], '#4f8a3c')}
          {teil([0.1, 0.34, 0], 'zyl', [0.035, 0.035, 0.16, 8], '#4f8a3c')}
          {teil([-0.09, 0.4, 0], 'zyl', [0.03, 0.03, 0.14, 8], '#4f8a3c')}
        </>
      );
  }
}

/** Verwaltung von innen mit Verstecken. d = Bürogebäude aus werkGestaltung (b, t). */
export function VerwaltungInnen({ d, f, stil, bewegt, arten, gefunden, tipp, onFund }) {
  const plan = useMemo(() => grundriss(d.b, d.t, f), [d.b, d.t, f]);
  // Verstecke dieser Runde: je Ding eine andere, zufällige Stelle
  const plaetze = useMemo(() => {
    const frei = [...plan.verstecke].sort(() => Math.random() - 0.5);
    return arten.map((art, i) => ({ art, p: frei[i % frei.length], drehung: Math.random() * Math.PI * 2 }));
  }, [arten, plan]);
  const ball = useCanvasTextur(64, 32, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111111';
    [[8, 8], [24, 22], [40, 8], [56, 22], [16, 28], [48, 28], [32, 4]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); });
  });
  const boden = useCanvasTextur(64, 64, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(90,60,30,0.18)';
    for (let i = 0; i < 4; i += 1) g.fillRect(0, i * 16, w, 1);
    for (let i = 0; i < 4; i += 1) g.fillRect(((i * 23) % w), i * 16, 1, 16);
  }, [d.b / 3, d.t / 3]);
  const wandFarbe = WANDFARBE[stil] ?? f.buero;
  return (
    <group>
      {/* Boden (Parkett) und Bodenplatte */}
      <mesh position={[0, -0.15, 0]} receiveShadow>
        <boxGeometry args={[d.b + 0.4, 0.3, d.t + 0.4]} />
        <meshStandardMaterial color={f.beton} roughness={1} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[d.b, d.t]} />
        <meshStandardMaterial color="#c9a77a" map={boden} roughness={0.7} />
      </mesh>
      {/* Wände auf Brusthöhe abgeschnitten, Schnittkante dunkel */}
      <Viele teile={plan.wand} farbe={wandFarbe} />
      <Viele teile={plan.wand.map((w) => ({ p: [w.p[0], plan.H + 0.02, w.p[2]], g: [w.g[0] + 0.01, 0.04, w.g[2] + 0.01] }))} farbe={f['maschine-dunkel']} schatten={false} />
      <Viele teile={plan.m} schatten={false} />
      <Viele teile={plan.k} form="kugel" farbe={f.baum} schatten={false} />
      {/* Kolleginnen und Kollegen auf dem Flur */}
      <Figur a={[-d.b / 2 + 1, plan.flur]} b={[d.b / 2 - 1, plan.flur]} farbe={f.blau} f={f} bewegt={bewegt} phase={0.2} tempo={0.9} art={2} />
      <Figur a={[d.b / 2 - 1.5, plan.flur + 0.3]} b={[-d.b / 2 + 1.5, plan.flur + 0.3]} farbe={f['person-1']} f={f} bewegt={bewegt} phase={0.65} tempo={0.8} art={1} />
      {/* Versteckte Dinge: anklicken = gefunden. Unsichtbare Kugel macht das Treffen leichter. */}
      {plaetze.filter((v) => !gefunden.includes(v.art)).map((v) => (
        <group key={v.art} position={v.p} rotation-y={v.drehung}
               onClick={(e) => { e.stopPropagation(); if (e.delta > 5) return; onFund(v.art); }}>
          <Ding art={v.art} ball={ball} />
          <mesh position={[0, 0.25, 0]}>
            <sphereGeometry args={[0.42, 10, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          {tipp === v.art && (
            <mesh position={[0, 2.2, 0]}>
              <cylinderGeometry args={[0.18, 0.35, 4, 16, 1, true]} />
              <meshBasicMaterial color={f.signal} transparent opacity={0.45} depthWrite={false} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------------------
 * Anzeige über der 3D-Ansicht
 * ------------------------------------------------------------------------- */
const zeit = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function VersteckLeiste({ spiel, ort, onStart, onTipp, onNochmal, onSchliessen }) {
  const t = useT();
  const [jetzt, setJetzt] = useState(() => Date.now());
  const [rekord, setRekord] = useState(null);
  useEffect(() => {
    if (spiel.phase !== 'laeuft') return undefined;
    const takt = setInterval(() => setJetzt(Date.now()), 250);
    return () => clearInterval(takt);
  }, [spiel.phase]);
  // Bestzeit lesen bzw. nach einer Runde speichern
  useEffect(() => {
    try {
      const alt = Number(localStorage.getItem(REKORD)) || null;
      if (spiel.phase === 'fertig') {
        const dauer = spiel.ende - spiel.start;
        if (!alt || dauer < alt) localStorage.setItem(REKORD, String(dauer));
        setRekord(alt && alt < dauer ? alt : dauer);
      } else setRekord(alt);
    } catch { /* privat: kein Speicher */ }
  }, [spiel.phase, spiel.start, spiel.ende]);
  useEffect(() => {
    const taste = (e) => { if (e.key === 'Escape') onSchliessen(); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [onSchliessen]);

  const liste = spiel.arten.map((art) => DINGE.find((x) => x.art === art));
  if (spiel.phase === 'flug') return null;
  return (
    <div className={`versteck versteck-${spiel.phase}`} role="dialog" aria-label={t('Versteckspiel')}>
      {spiel.phase === 'intro' && (
        <>
          <strong><i className="bi bi-search" aria-hidden="true" /> {t('Versteckspiel in der Verwaltung {ort}', { ort })}</strong>
          <p>{t('Hier hat jemand fünf Dinge versteckt. Findest du sie? Einfach anklicken – drehen und zoomen hilft.')}</p>
          <div className="versteck-dinge">{liste.map((x) => <span key={x.art} title={t(x.name)}>{x.zeichen}</span>)}</div>
          <div className="versteck-knoepfe">
            <button type="button" className="btn btn-primary btn-sm" onClick={onStart} autoFocus>{t("Los geht's")}</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onSchliessen}>{t('Zurück zum Werk')}</button>
          </div>
        </>
      )}
      {spiel.phase === 'laeuft' && (
        <>
          <div className="versteck-dinge" aria-live="polite">
            {liste.map((x) => (
              <span key={x.art} className={spiel.gefunden.includes(x.art) ? 'gefunden' : ''} title={t(x.name)}>
                {x.zeichen}{spiel.gefunden.includes(x.art) && <i className="bi bi-check-circle-fill" aria-hidden="true" />}
              </span>
            ))}
          </div>
          <span className="versteck-zeit"><i className="bi bi-stopwatch" aria-hidden="true" /> {zeit(jetzt - spiel.start)}</span>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onTipp} disabled={Boolean(spiel.tipp)}>
            <i className="bi bi-lightbulb" aria-hidden="true" /> {t('Tipp')}
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onSchliessen} aria-label={t('Zurück zum Werk')}>
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </>
      )}
      {spiel.phase === 'fertig' && (
        <>
          <strong>🎉 {t('Alle gefunden in {zeit}!', { zeit: zeit(spiel.ende - spiel.start) })}</strong>
          <p>
            {spiel.tipps ? t('Mit {n} Tipps.', { n: spiel.tipps }) : t('Ganz ohne Tipp!')}
            {rekord && ` ${t('Bestzeit: {zeit}', { zeit: zeit(rekord) })}`}
          </p>
          <div className="versteck-knoepfe">
            <button type="button" className="btn btn-primary btn-sm" onClick={onNochmal}><i className="bi bi-arrow-repeat" aria-hidden="true" /> {t('Nochmal verstecken')}</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onSchliessen}>{t('Zurück zum Werk')}</button>
          </div>
        </>
      )}
    </div>
  );
}
