'use client';
/**
 * components/karten/raum/LagerRegal3D.js – Ersatzteillager eines Werks als 3D-Regal, Blick von vorn
 *
 * Aufbau wie ein echtes Fachbodenregal: je Regal-Buchstabe (Lagerplatz A-03 → Regal A) ein Regal mit
 * blauen Pfosten, orangen Trägern und verzinkten Böden; Fach 01 liegt oben, darunter 02, 03 …
 * In jedem Fach liegen die Teile selbst als 3D-Modell (kein Karton): Kugellager, Keilriemen,
 * Hydraulikschlauch, Sicherungen auf der Hutschiene, Fräser im Halter usw. (MODELLE, am Namen erkannt).
 *
 * So sieht man auf einen Blick, was fehlt:
 *  - vorhandene Stücke stehen echt im Fach (höchstens KAPPE Stück, die Zahl steht am Schild),
 *  - fehlende Stücke bis zum Mindestbestand stehen daneben als rot durchsichtiger „Geist“,
 *  - ein leeres Fach zeigt das Teil als Geist und das Abzeichen „Fehlt“.
 * Schilder, Namen und Klickflächen sind normale HTML-Knöpfe über der Zeichenfläche (Tastatur, Tests,
 * scharfe Schrift). Das Schild am Träger zeigt Lagerplatz und Bestand/Mindestbestand; beim Darüberfahren
 * bzw. am gewählten Fach klappt es um den Namen auf (dort ist kein Teil im Weg). Die Kamera ist fest (nur von vorn) – ihre Lage rechnet Kamera() aus der Größe,
 * und dieselbe Rechnung liefert die Bildschirm-Rechtecke der Fächer für die Knöpfe.
 *
 * Materialfarben der Teile (Stahl, Gummi, Kupfer, Messing …) sind feste Werte – wie die Flaggen
 * eine Ausnahme von „nur CSS-Variablen“. Regal, Wand und Boden kommen aus --raum-* (hell/dunkel).
 * Gezeichnet wird nur bei Änderungen (frameloop „demand“) und nur, solange das Regal sichtbar ist.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Viele } from './Bausteine';
import { useRaum, useSichtbar } from './farben';
import { useT } from '@/components/SpracheKontext';
import { lagerZustand, teilArt } from '@/lib/lager';

/* ---------- Maße des Regals (Meter) ---------- */
const UB = 1.0;        // lichte Breite eines Fachs
const EH = 0.4;        // Höhe einer Ebene (Boden bis Boden)
const TIEFE = 0.5;     // Tiefe des Regals
const PF = 0.055;      // Pfosten
const LUECKE = 0.16;   // Abstand zwischen zwei Regalen
const BODEN = 0.1;     // unterster Boden über dem Hallenboden
const BALKEN = 0.07;   // Höhe des Trägers vorn (darauf sitzt das Schild)
const KAPPE = 8;       // höchstens so viele Stücke je Fach zeigen
const REIHE_ABSTAND = 0.5;   // schmale Bildschirme: Abstand zwischen zwei Regalreihen (Platz für die Schilder)
const GROESSE = 1.2;   // alle Teile etwas größer als echt, damit man sie im Regal erkennt

/* ---------- Materialfarben (fest, siehe oben) ---------- */
const STAHL = '#b9bfc7';
const STAHL_DUNKEL = '#7b828b';
const CHROM = '#e2e6eb';
const ALU = '#c8ccd2';
const ALU_DUNKEL = '#8b929a';
const GUMMI = '#242529';
const KUNSTSTOFF = '#d9dad5';
const KUNSTSTOFF_DUNKEL = '#3a3d43';
const WEISS = '#f0efea';
const MESSING = '#c9a250';
const KUPFER = '#bb6b3c';
const GOLD = '#c99b33';
const HARTMETALL = '#9aa1a9';
const PU_ROT = '#c4532d';
const BLAU = '#2c68b8';
const ORANGE = '#e07a26';
const GRUEN_FKM = '#3d8b55';
const FILTER = '#eee1b8';
const PAPPE = '#a98150';
const KERAMIK = '#e7e2d3';
const SENSOR_GELB = '#e2b420';

/* ---------- Formen: einmal gebaut, von allen Stücken geteilt ---------- */
const FORMEN = new Map();
function form(schluessel, bauen) {
  if (!FORMEN.has(schluessel)) FORMEN.set(schluessel, bauen());
  return FORMEN.get(schluessel);
}
const kasten = (b, h, t) => form(`k${b}-${h}-${t}`, () => new THREE.BoxGeometry(b, h, t));
const zyl = (r1, r2, h, seg = 24) => form(`z${r1}-${r2}-${h}-${seg}`, () => new THREE.CylinderGeometry(r1, r2, h, seg));
const rohr = (r, h, seg = 40) => form(`o${r}-${h}-${seg}`, () => new THREE.CylinderGeometry(r, r, h, seg, 1, true));
const torus = (r, dicke, seg = 40) => form(`t${r}-${dicke}-${seg}`, () => new THREE.TorusGeometry(r, dicke, 10, seg));

/** Ring mit Loch (Scheibe), Achse zeigt nach vorn (z) – Kugellager, Laufrad, Endkappen */
function ring(innen, aussen, dicke) {
  return form(`r${innen}-${aussen}-${dicke}`, () => {
    const s = new THREE.Shape();
    s.absarc(0, 0, aussen, 0, Math.PI * 2, false);
    const loch = new THREE.Path();
    loch.absarc(0, 0, innen, 0, Math.PI * 2, true);
    s.holes.push(loch);
    const g = new THREE.ExtrudeGeometry(s, { depth: dicke, bevelEnabled: false, curveSegments: 36 });
    g.translate(0, 0, -dicke / 2);
    return g;
  });
}

/** Schneidteil eines Fräsers: flache Leiste, entlang der Höhe verdreht (Drall) */
function drall() {
  return form('drall', () => {
    const g = new THREE.BoxGeometry(0.032, 0.09, 0.01, 1, 18, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const w = ((p.getY(i) + 0.045) / 0.09) * Math.PI * 1.1;
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setX(i, x * Math.cos(w) - z * Math.sin(w));
      p.setZ(i, x * Math.sin(w) + z * Math.cos(w));
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Mantel mit Falten (Luftfilter) bzw. Zähnen (Zahnriemen innen): Radius wechselt je Segment */
function gezackt(r, tiefe, h, zacken) {
  return form(`g${r}-${tiefe}-${h}-${zacken}`, () => {
    const g = new THREE.CylinderGeometry(r, r, h, zacken * 2, 1, true);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const k = i % (zacken * 2 + 1);
      const faktor = k % 2 === 0 ? 1 : (r - tiefe) / r;
      p.setX(i, p.getX(i) * faktor);
      p.setZ(i, p.getZ(i) * faktor);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Wendeschneidplatte CNMG: Raute mit 80°-Ecken links/rechts und Loch, leicht gefast */
function raute() {
  return form('raute', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.062, 0); s.lineTo(0, 0.052); s.lineTo(0.062, 0); s.lineTo(0, -0.052); s.closePath();
    const loch = new THREE.Path();
    loch.absarc(0, 0, 0.013, 0, Math.PI * 2, true);
    s.holes.push(loch);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 20 });
    g.translate(0, 0, -0.005);
    return g;
  });
}

/** Zahnrad (für Teile, die kein eigenes Modell haben) */
function zahnrad() {
  return form('zahnrad', () => {
    const s = new THREE.Shape();
    const zaehne = 18;
    for (let i = 0; i < zaehne * 4; i += 1) {
      const w = (i / (zaehne * 4)) * Math.PI * 2;
      const r = i % 4 < 2 ? 0.1 : 0.085;
      if (i === 0) s.moveTo(Math.cos(w) * r, Math.sin(w) * r); else s.lineTo(Math.cos(w) * r, Math.sin(w) * r);
    }
    s.closePath();
    const loch = new THREE.Path();
    loch.absarc(0, 0, 0.025, 0, Math.PI * 2, true);
    s.holes.push(loch);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
    g.translate(0, 0, -0.02);
    return g;
  });
}

/* ---------- Material: echt oder „Geist“ (fehlendes Stück, rot durchsichtig) ---------- */
const GeistKontext = createContext(null);   // null = echtes Stück, sonst Farbe des Geists
function Mat({ c, metall = 0, rau = 0.6, flach = false, doppelt = false, glas = false }) {
  const geist = useContext(GeistKontext);
  const seite = doppelt ? THREE.DoubleSide : THREE.FrontSide;
  if (geist) {
    return <meshStandardMaterial color={geist} emissive={geist} emissiveIntensity={0.45} transparent opacity={0.3} depthWrite={false} roughness={1} side={seite} />;
  }
  if (glas) return <meshStandardMaterial color="#ffffff" transparent opacity={0.18} roughness={0.05} metalness={0} depthWrite={false} />;
  return <meshStandardMaterial color={c} metalness={metall} roughness={rau} flatShading={flach} side={seite} />;
}
const STAHL_MAT = <Mat c={STAHL} metall={0.85} rau={0.28} />;

/* ============================================================================================
 * Die Teile. Ursprung = Mitte unten, auf dem Fachboden; +z zeigt zum Betrachter.
 * Bewusst etwas größer als echt, damit man sie im Regal erkennt.
 * ========================================================================================== */

/** Kugellager 6205-2RS: Außenring, schwarze Dichtscheibe, Innenring – hochkant, Bohrung nach vorn */
function Kugellager() {
  return (
    <group position={[0, 0.11, 0]} rotation-y={0.25}>
      <mesh geometry={ring(0.086, 0.11, 0.06)}>{STAHL_MAT}</mesh>
      <mesh geometry={ring(0.05, 0.086, 0.052)}><Mat c={GUMMI} rau={0.7} /></mesh>
      <mesh geometry={ring(0.034, 0.05, 0.06)}>{STAHL_MAT}</mesh>
    </group>
  );
}

/** Keilriemen: schwarzer Ring, schräg nebeneinander gestellt wie in einem Riemenständer */
function Keilriemen() {
  return (
    <group position={[0, 0.13, 0]} rotation={[0.1, 1.1, 0]}>
      <mesh geometry={torus(0.116, 0.013)}><Mat c={GUMMI} rau={0.8} /></mesh>
    </group>
  );
}

/** Zahnriemen: flaches Band mit Zähnen innen – liegen gestapelt */
function Zahnriemen() {
  return (
    <group position={[0, 0.014, 0]}>
      <mesh geometry={rohr(0.1, 0.026)}><Mat c={GUMMI} rau={0.75} doppelt /></mesh>
      <mesh geometry={gezackt(0.095, 0.008, 0.026, 40)}><Mat c="#303236" rau={0.8} flach doppelt /></mesh>
    </group>
  );
}

/** Förderbandgurt: Rolle mit Pappkern, liegt quer */
function Foerdergurt() {
  return (
    <group position={[0, 0.125, 0]}>
      <mesh geometry={zyl(0.125, 0.125, 0.34, 40)} rotation-z={Math.PI / 2}><Mat c="#2b2d31" rau={0.85} /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={ring(0.042, 0.122, 0.004)} position={[s * 0.171, 0, 0]} rotation-y={Math.PI / 2}><Mat c="#41444a" rau={0.9} /></mesh>
      ))}
      <mesh geometry={ring(0.03, 0.042, 0.35)} rotation-y={Math.PI / 2}><Mat c={PAPPE} rau={0.9} /></mesh>
      {/* Gurtende liegt vorn auf dem Boden */}
      <mesh geometry={kasten(0.34, 0.008, 0.09)} position={[0, -0.121, 0.13]}><Mat c="#2b2d31" rau={0.85} /></mesh>
    </group>
  );
}

/** Hydraulikschlauch DN10: aufgerollt, vorn die Pressarmatur mit Sechskant-Mutter */
function Schlauch() {
  return (
    <group>
      <mesh geometry={torus(0.1, 0.017)} position={[0, 0.018, 0]} rotation-x={Math.PI / 2}><Mat c={GUMMI} rau={0.75} /></mesh>
      <mesh geometry={torus(0.093, 0.017)} position={[0.008, 0.051, -0.004]} rotation-x={Math.PI / 2}><Mat c={GUMMI} rau={0.75} /></mesh>
      <mesh geometry={zyl(0.021, 0.021, 0.05, 18)} position={[0.03, 0.051, 0.093]} rotation-z={Math.PI / 2}>{STAHL_MAT}</mesh>
      <mesh geometry={zyl(0.026, 0.026, 0.022, 6)} position={[0.066, 0.051, 0.093]} rotation-z={Math.PI / 2}><Mat c={MESSING} metall={0.8} rau={0.3} /></mesh>
    </group>
  );
}

/** Hydraulik-Dichtungssatz: Sortimentskasten hochkant, O-Ringe in Fächern, durchsichtiger Deckel */
function Dichtungssatz() {
  const ringe = [];
  for (let sp = 0; sp < 3; sp += 1) {
    for (let z = 0; z < 3; z += 1) ringe.push({ x: (sp - 1) * 0.062, y: 0.045 + z * 0.075, r: [0.024, 0.019, 0.014][z], c: [GUMMI, ORANGE, GRUEN_FKM][sp] });
  }
  return (
    <group rotation-y={0.12}>
      <mesh geometry={kasten(0.2, 0.24, 0.012)} position={[0, 0.12, -0.024]}><Mat c={BLAU} rau={0.55} /></mesh>
      {[[0, 0.006, 0.2, 0.012], [0, 0.234, 0.2, 0.012], [-0.094, 0.12, 0.012, 0.24], [0.094, 0.12, 0.012, 0.24]].map(([x, y, b, h]) => (
        <mesh key={`${x}-${y}`} geometry={kasten(b, h, 0.05)} position={[x, y, 0]}><Mat c={BLAU} rau={0.55} /></mesh>
      ))}
      {[0.0825, 0.1575].map((y) => <mesh key={y} geometry={kasten(0.176, 0.004, 0.04)} position={[0, y, -0.002]}><Mat c={WEISS} /></mesh>)}
      {ringe.map((r) => <mesh key={`${r.x}-${r.y}`} geometry={torus(r.r, 0.0055, 24)} position={[r.x, r.y, -0.01]}><Mat c={r.c} rau={0.6} /></mesh>)}
      <mesh geometry={kasten(0.2, 0.24, 0.004)} position={[0, 0.12, 0.026]}><Mat glas /></mesh>
    </group>
  );
}

/** Näherungsschalter M12: Gewindehülse mit zwei Muttern, orange Sensorfläche, Kabel hinten */
function Naeherungsschalter() {
  return (
    <group position={[0, 0.03, 0]} rotation-y={0.75}>
      <mesh geometry={zyl(0.02, 0.02, 0.15, 20)} rotation-x={Math.PI / 2}><Mat c="#c6cacf" metall={0.8} rau={0.3} /></mesh>
      {[0.03, -0.025].map((z) => <mesh key={z} geometry={zyl(0.03, 0.03, 0.012, 6)} position={[0, 0, z]} rotation-x={Math.PI / 2}>{STAHL_MAT}</mesh>)}
      <mesh geometry={zyl(0.019, 0.019, 0.014, 20)} position={[0, 0, 0.081]} rotation-x={Math.PI / 2}><Mat c={ORANGE} rau={0.5} /></mesh>
      <mesh geometry={zyl(0.017, 0.017, 0.02, 16)} position={[0, 0, -0.085]} rotation-x={Math.PI / 2}><Mat c={KUNSTSTOFF_DUNKEL} /></mesh>
      <mesh geometry={zyl(0.007, 0.007, 0.1, 8)} position={[0, 0, -0.145]} rotation-x={Math.PI / 2}><Mat c={GUMMI} /></mesh>
    </group>
  );
}

/** Schütz: graues Gehäuse, Klemmen oben und unten, Mittelteil mit Schild und Schaltanzeige */
function Schuetz() {
  return (
    <group>
      <RoundedBox args={[0.1, 0.14, 0.1]} radius={0.008} smoothness={2} position={[0, 0.07, 0]}><Mat c={KUNSTSTOFF} rau={0.6} /></RoundedBox>
      <RoundedBox args={[0.074, 0.064, 0.02]} radius={0.005} smoothness={2} position={[0, 0.07, 0.056]}><Mat c="#c6c8c3" rau={0.55} /></RoundedBox>
      <mesh geometry={kasten(0.05, 0.014, 0.002)} position={[0, 0.085, 0.067]}><Mat c={WEISS} /></mesh>
      <mesh geometry={kasten(0.018, 0.014, 0.004)} position={[0, 0.058, 0.067]}><Mat c={KUNSTSTOFF_DUNKEL} /></mesh>
      {[0.123, 0.017].map((y) => [-0.03, 0, 0.03].map((x) => (
        <group key={`${x}-${y}`} position={[x, y, 0.049]}>
          <mesh geometry={kasten(0.022, 0.018, 0.004)}><Mat c={KUNSTSTOFF_DUNKEL} /></mesh>
          <mesh geometry={zyl(0.006, 0.006, 0.004, 12)} position={[0, 0, 0.003]} rotation-x={Math.PI / 2}>{STAHL_MAT}</mesh>
        </group>
      )))}
    </group>
  );
}

/** Sicherung (Leitungsschutzschalter): schmal, weiß, Kipphebel – nebeneinander auf der Hutschiene */
function Sicherung() {
  return (
    <group>
      <RoundedBox args={[0.054, 0.2, 0.09]} radius={0.005} smoothness={2} position={[0, 0.1, 0]}><Mat c={WEISS} rau={0.5} /></RoundedBox>
      <RoundedBox args={[0.05, 0.1, 0.03]} radius={0.004} smoothness={2} position={[0, 0.1, 0.05]}><Mat c={WEISS} rau={0.5} /></RoundedBox>
      <mesh geometry={kasten(0.02, 0.042, 0.03)} position={[0, 0.112, 0.07]} rotation-x={-0.35}><Mat c={BLAU} rau={0.5} /></mesh>
      <mesh geometry={kasten(0.03, 0.012, 0.002)} position={[0, 0.066, 0.066]}><Mat c={KUNSTSTOFF_DUNKEL} /></mesh>
      {[0.183, 0.017].map((y) => <mesh key={y} geometry={kasten(0.03, 0.014, 0.004)} position={[0, y, 0.044]}><Mat c={KUNSTSTOFF_DUNKEL} /></mesh>)}
    </group>
  );
}
function Hutschiene({ b, m }) {
  return <mesh geometry={kasten(b - 0.08, 0.035 * m, 0.01)} position={[0, 0.1 * m, -0.05 * m]}>{STAHL_MAT}</mesh>;
}

/** Servomotor-Encoder: schwarzes Gehäuse, Aluflansch, Welle, Stecker oben */
function Encoder() {
  return (
    <group position={[0, 0.062, 0]} rotation-y={0.55}>
      <mesh geometry={zyl(0.055, 0.055, 0.075, 30)} position={[0, 0, -0.01]} rotation-x={Math.PI / 2}><Mat c={KUNSTSTOFF_DUNKEL} rau={0.45} metall={0.3} /></mesh>
      <mesh geometry={zyl(0.062, 0.062, 0.014, 30)} position={[0, 0, 0.033]} rotation-x={Math.PI / 2}><Mat c={ALU} metall={0.8} rau={0.3} /></mesh>
      <mesh geometry={zyl(0.03, 0.03, 0.01, 24)} position={[0, 0, 0.045]} rotation-x={Math.PI / 2}><Mat c={ALU} metall={0.8} rau={0.3} /></mesh>
      <mesh geometry={zyl(0.01, 0.01, 0.05, 16)} position={[0, 0, 0.07]} rotation-x={Math.PI / 2}><Mat c={CHROM} metall={0.95} rau={0.15} /></mesh>
      <mesh geometry={zyl(0.015, 0.015, 0.035, 16)} position={[0, 0.065, -0.015]}><Mat c={ALU} metall={0.8} rau={0.3} /></mesh>
      <mesh geometry={zyl(0.012, 0.012, 0.02, 16)} position={[0, 0.09, -0.015]}><Mat c={GUMMI} /></mesh>
    </group>
  );
}

/** Fräser VHM: Hartmetall-Schaft, beschichtetes Schneidteil mit Drall – stehen in einem Halter */
function Fraeser() {
  return (
    <group position={[0, 0.03, 0]}>
      <mesh geometry={zyl(0.016, 0.016, 0.12, 20)} position={[0, 0.06, 0]}><Mat c={HARTMETALL} metall={0.85} rau={0.3} /></mesh>
      <group position={[0, 0.165, 0]}>
        <mesh geometry={zyl(0.008, 0.008, 0.09, 12)}><Mat c={GOLD} metall={0.8} rau={0.3} /></mesh>
        <mesh geometry={drall()}><Mat c={GOLD} metall={0.8} rau={0.3} /></mesh>
        <mesh geometry={drall()} rotation-y={Math.PI / 2}><Mat c={GOLD} metall={0.8} rau={0.3} /></mesh>
      </group>
    </group>
  );
}
function Werkzeughalter({ b }) {
  return <mesh geometry={kasten(b - 0.08, 0.05, 0.14)} position={[0, 0.025, 0]}><Mat c={KUNSTSTOFF_DUNKEL} rau={0.7} /></mesh>;
}

/** Wendeschneidplatte CNMG: goldene Raute mit Loch, steht in einem Ständer */
function Wendeplatte() {
  return (
    <group position={[0, 0.086, 0]} rotation-y={0.35}>
      <mesh geometry={raute()}><Mat c={GOLD} metall={0.75} rau={0.35} /></mesh>
    </group>
  );
}
function Plattenstaender({ b }) {
  return <mesh geometry={kasten(b - 0.08, 0.04, 0.07)} position={[0, 0.02, 0]}><Mat c={GUMMI} rau={0.7} /></mesh>;
}

/** Pneumatikzylinder: Aluprofil, Deckel, Kolbenstange mit Mutter, blaue Steckanschlüsse */
function Pneumatikzylinder() {
  return (
    <group position={[0, 0.034, 0]} rotation-y={0.22}>
      <mesh geometry={kasten(0.17, 0.056, 0.056)}><Mat c={ALU} metall={0.6} rau={0.35} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.098, 0, 0]}>
          <mesh geometry={kasten(0.026, 0.068, 0.068)}><Mat c={ALU_DUNKEL} metall={0.6} rau={0.4} /></mesh>
          <mesh geometry={zyl(0.009, 0.009, 0.014, 14)} position={[0, 0.041, 0]}><Mat c={STAHL} metall={0.8} rau={0.3} /></mesh>
          <mesh geometry={zyl(0.011, 0.011, 0.01, 14)} position={[0, 0.053, 0]}><Mat c={BLAU} rau={0.5} /></mesh>
        </group>
      ))}
      <mesh geometry={zyl(0.008, 0.008, 0.06, 14)} position={[0.14, 0, 0]} rotation-z={Math.PI / 2}><Mat c={CHROM} metall={0.95} rau={0.12} /></mesh>
      <mesh geometry={zyl(0.013, 0.013, 0.01, 6)} position={[0.163, 0, 0]} rotation-z={Math.PI / 2}>{STAHL_MAT}</mesh>
    </group>
  );
}

/** Lackierdüse: Messing, Sechskant, Gewinde, Kegel mit feiner Spitze – auf einer Ablageschale */
function Lackierduese() {
  return (
    <group position={[0, 0.012, 0]} scale={1.25}>
      <mesh geometry={zyl(0.03, 0.03, 0.022, 6)} position={[0, 0.011, 0]}><Mat c={MESSING} metall={0.85} rau={0.3} /></mesh>
      <mesh geometry={zyl(0.019, 0.019, 0.02, 20)} position={[0, 0.032, 0]}><Mat c={MESSING} metall={0.85} rau={0.35} /></mesh>
      <mesh geometry={zyl(0.006, 0.02, 0.05, 20)} position={[0, 0.067, 0]}><Mat c={MESSING} metall={0.85} rau={0.3} /></mesh>
      <mesh geometry={zyl(0.003, 0.006, 0.012, 12)} position={[0, 0.098, 0]}><Mat c={CHROM} metall={0.9} rau={0.2} /></mesh>
    </group>
  );
}
function Ablageschale({ b }) {
  return <mesh geometry={kasten(b - 0.1, 0.012, 0.16)} position={[0, 0.006, 0]}><Mat c={KUNSTSTOFF} rau={0.7} /></mesh>;
}

/** Heizband: Edelstahl-Ring mit Spannlaschen vorn und Anschlusskasten aus Keramik – gestapelt */
function Heizband() {
  return (
    <group position={[0, 0.026, 0]}>
      <mesh geometry={rohr(0.085, 0.05)}><Mat c="#c3c6c9" metall={0.75} rau={0.35} doppelt /></mesh>
      {[-1, 1].map((s) => <mesh key={s} geometry={kasten(0.008, 0.044, 0.024)} position={[s * 0.012, 0, 0.095]}>{STAHL_MAT}</mesh>)}
      <mesh geometry={zyl(0.005, 0.005, 0.05, 8)} position={[0, 0, 0.1]} rotation-z={Math.PI / 2}>{STAHL_MAT}</mesh>
      <mesh geometry={kasten(0.036, 0.032, 0.03)} position={[0.062, 0, 0.066]} rotation-y={-0.8}><Mat c={KERAMIK} rau={0.7} /></mesh>
    </group>
  );
}

/** Schutzgasdüse MIG/MAG: kegelige Kupferhülse, innen hohl */
function Gasduese() {
  const mantel = form('gasduese', () => new THREE.LatheGeometry([
    new THREE.Vector2(0.029, 0), new THREE.Vector2(0.029, 0.035), new THREE.Vector2(0.025, 0.09), new THREE.Vector2(0.018, 0.125)], 32));
  return (
    <group>
      <mesh geometry={mantel}><Mat c={KUPFER} metall={0.85} rau={0.32} doppelt /></mesh>
      <mesh geometry={ring(0.014, 0.0185, 0.004)} position={[0, 0.125, 0]} rotation-x={Math.PI / 2}><Mat c={KUPFER} metall={0.85} rau={0.32} /></mesh>
      <mesh geometry={rohr(0.024, 0.03)} position={[0, 0.02, 0]}><Mat c={KERAMIK} rau={0.7} doppelt /></mesh>
    </group>
  );
}

/** Luftfilter: gefaltetes Filterpapier, Gummikappen, Lochblech innen */
function Luftfilter() {
  return (
    <group>
      <mesh geometry={gezackt(0.072, 0.007, 0.16, 36)} position={[0, 0.095, 0]}><Mat c={FILTER} rau={0.9} flach doppelt /></mesh>
      <mesh geometry={rohr(0.036, 0.16)} position={[0, 0.095, 0]}><Mat c={STAHL_DUNKEL} metall={0.6} rau={0.5} doppelt /></mesh>
      <mesh geometry={ring(0.036, 0.079, 0.014)} position={[0, 0.177, 0]} rotation-x={Math.PI / 2}><Mat c={GUMMI} rau={0.7} /></mesh>
      <mesh geometry={zyl(0.079, 0.079, 0.014, 32)} position={[0, 0.007, 0]}><Mat c={GUMMI} rau={0.7} /></mesh>
    </group>
  );
}

/** Reflexions-Lichtschranke: gelbes Gehäuse mit dunkler Optik und LEDs, daneben der rote Reflektor */
function Lichtschranke() {
  return (
    <group rotation-y={0.3}>
      <RoundedBox args={[0.055, 0.1, 0.05]} radius={0.006} smoothness={2} position={[-0.03, 0.05, 0]}><Mat c={SENSOR_GELB} rau={0.5} /></RoundedBox>
      <mesh geometry={kasten(0.042, 0.05, 0.004)} position={[-0.03, 0.058, 0.026]}><Mat c="#14171c" metall={0.3} rau={0.12} /></mesh>
      <mesh geometry={kasten(0.008, 0.006, 0.004)} position={[-0.04, 0.094, 0.018]}><Mat c="#3fbf5a" /></mesh>
      <mesh geometry={kasten(0.008, 0.006, 0.004)} position={[-0.024, 0.094, 0.018]}><Mat c={ORANGE} /></mesh>
      <mesh geometry={zyl(0.008, 0.008, 0.02, 12)} position={[-0.03, 0.01, -0.03]} rotation-x={Math.PI / 2}>{STAHL_MAT}</mesh>
      <group position={[0.045, 0.041, 0]} rotation-x={-0.12}>
        <mesh geometry={zyl(0.04, 0.04, 0.008, 28)} rotation-x={Math.PI / 2}><Mat c="#b7202a" rau={0.25} /></mesh>
        <mesh geometry={ring(0.036, 0.042, 0.01)}><Mat c={KUNSTSTOFF_DUNKEL} /></mesh>
      </group>
    </group>
  );
}

/** Fahrantrieb-Rolle (Regalbediengerät): Laufrad mit rotem PU-Belag, Stahlnabe, Schrauben */
function Rolle() {
  return (
    <group position={[0, 0.12, 0]} rotation-y={0.45}>
      <mesh geometry={ring(0.075, 0.12, 0.07)}><Mat c={PU_ROT} rau={0.55} /></mesh>
      <mesh geometry={ring(0.03, 0.075, 0.074)}><Mat c={STAHL} metall={0.8} rau={0.3} /></mesh>
      <mesh geometry={ring(0.018, 0.03, 0.09)}><Mat c={STAHL_DUNKEL} metall={0.8} rau={0.35} /></mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} geometry={zyl(0.007, 0.007, 0.01, 6)} rotation-x={Math.PI / 2}
              position={[Math.cos((k * Math.PI) / 2 + 0.6) * 0.052, Math.sin((k * Math.PI) / 2 + 0.6) * 0.052, 0.04]}>{STAHL_MAT}</mesh>
      ))}
    </group>
  );
}

/** Greiferbacken-Satz: zwei Alu-Backen (gespiegelt) mit geriffelter Greiffläche */
function Greiferbacken() {
  return (
    <group rotation-y={0.3}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.036, 0, 0]} scale-x={s}>
          <mesh geometry={kasten(0.05, 0.022, 0.09)} position={[0, 0.011, 0]}><Mat c={ALU} metall={0.6} rau={0.35} /></mesh>
          <mesh geometry={kasten(0.022, 0.085, 0.09)} position={[-0.014, 0.0645, 0]}><Mat c={ALU} metall={0.6} rau={0.35} /></mesh>
          {[0, 1, 2, 3, 4].map((k) => <mesh key={k} geometry={kasten(0.004, 0.007, 0.088)} position={[-0.026, 0.04 + k * 0.014, 0]}><Mat c={KUNSTSTOFF_DUNKEL} /></mesh>)}
          <mesh geometry={zyl(0.006, 0.006, 0.004, 12)} position={[0.012, 0.0225, 0.022]}><Mat c={GUMMI} /></mesh>
          <mesh geometry={zyl(0.006, 0.006, 0.004, 12)} position={[0.012, 0.0225, -0.022]}><Mat c={GUMMI} /></mesh>
        </group>
      ))}
    </group>
  );
}

/** Teile ohne eigenes Modell: Zahnrad aus Stahl */
function Zahnrad() {
  return (
    <group position={[0, 0.1, 0]} rotation-y={0.4}>
      <mesh geometry={zahnrad()}><Mat c={STAHL} metall={0.85} rau={0.3} /></mesh>
    </group>
  );
}

/**
 * Welches Modell zu welchem Teil? Erkennung am Namen (erster Treffer gilt), sonst über die Teile-Art.
 * breite = Platz je Stück; lagen = so viele übereinander; hoehe = Stapelhöhe; m = Maßstab (kleine Teile größer);
 * stapel = erst nach oben stapeln, dann daneben (flache Teile); zubehoer = einmal je Fach (Schiene, Halter …)
 */
const MODELLE = [
  { muster: /kugellager|wälzlager/, Modell: Kugellager, breite: 0.25 },
  { muster: /zahnriemen/, Modell: Zahnriemen, breite: 0.23, lagen: 6, hoehe: 0.028, stapel: true, m: 1.3 },
  { muster: /keilriemen|riemen/, Modell: Keilriemen, breite: 0.1 },
  { muster: /förderband|gurt/, Modell: Foerdergurt, breite: 0.39 },
  { muster: /dichtung/, Modell: Dichtungssatz, breite: 0.24 },
  { muster: /schlauch/, Modell: Schlauch, breite: 0.25, lagen: 3, hoehe: 0.068, stapel: true },
  { muster: /näherungsschalter|initiator|sensor/, Modell: Naeherungsschalter, breite: 0.12, m: 1.4 },
  { muster: /lichtschranke|lichttaster/, Modell: Lichtschranke, breite: 0.15, m: 1.3 },
  { muster: /schütz|relais/, Modell: Schuetz, breite: 0.12, m: 1.4 },
  { muster: /sicherung|schutzschalter/, Modell: Sicherung, breite: 0.056, m: 1.25, zubehoer: Hutschiene },
  { muster: /encoder|drehgeber/, Modell: Encoder, breite: 0.16, m: 1.4 },
  { muster: /fräser|bohrer/, Modell: Fraeser, breite: 0.09, zubehoer: Werkzeughalter },
  { muster: /wendeschneidplatte|schneidplatte/, Modell: Wendeplatte, breite: 0.13, m: 1.2, zubehoer: Plattenstaender },
  { muster: /zylinder/, Modell: Pneumatikzylinder, breite: 0.3, lagen: 3, hoehe: 0.07, m: 1.25 },
  { muster: /schutzgas|gasdüse/, Modell: Gasduese, breite: 0.08, m: 1.4 },
  { muster: /düse/, Modell: Lackierduese, breite: 0.085, m: 1.5, zubehoer: Ablageschale },
  { muster: /heizband|heizung/, Modell: Heizband, breite: 0.2, lagen: 4, hoehe: 0.054, stapel: true },
  { muster: /filter/, Modell: Luftfilter, breite: 0.18 },
  { muster: /greifer|backen/, Modell: Greiferbacken, breite: 0.16, m: 1.4 },
  { muster: /rolle|laufrad|rad\b/, Modell: Rolle, breite: 0.27 },
];
const NACH_ART = {
  'Lager & Rollen': MODELLE[0], 'Riemen & Gurte': MODELLE[2], 'Hydraulik & Pneumatik': MODELLE[5],
  'Elektrik & Sensorik': MODELLE[8], Werkzeuge: MODELLE[11], 'Düsen & Filter': MODELLE[15],
};
const ERSATZ = { Modell: Zahnrad, breite: 0.23 };

export function modellFuer(bezeichnung) {
  const name = (bezeichnung ?? '').toLowerCase();
  return MODELLE.find((m) => m.muster.test(name)) ?? NACH_ART[teilArt(bezeichnung).art] ?? ERSATZ;
}

/** Stücke im Fach anordnen: erst die vorhandenen, dahinter die fehlenden bis zum Mindestbestand */
function anordnen(modell, teil, b) {
  const m = GROESSE * (modell.m ?? 1);
  const breite = modell.breite * m;
  const proReihe = Math.max(1, Math.floor((b - 0.06) / breite));
  const lagen = modell.lagen ?? 1;
  const platz = Math.min(KAPPE, proReihe * lagen);
  const echt = Math.min(teil.bestand, platz);
  const fehlen = Math.max(0, teil.mindestbestand - teil.bestand, teil.bestand === 0 ? 1 : 0);
  const n = echt + Math.min(fehlen, platz - echt);
  const spalten = modell.stapel ? Math.min(proReihe, Math.ceil(n / lagen)) : Math.min(proReihe, n);
  const stuecke = [];
  for (let i = 0; i < n; i += 1) {
    const spalte = modell.stapel ? Math.floor(i / lagen) : i % proReihe;
    const lage = modell.stapel ? i % lagen : Math.floor(i / proReihe);
    stuecke.push({ p: [(spalte - (spalten - 1) / 2) * breite, lage * (modell.hoehe ?? 0) * m, 0], m, geist: i >= echt });
  }
  return stuecke;
}

/** Ein Stück (echt oder Geist). Echte Stücke werfen Schatten, Geister nicht. */
function Stueck({ Modell, p, m, geist }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => { if (o.isMesh) { o.castShadow = !geist; o.receiveShadow = !geist; } });
  }, [geist]);
  return (
    <GeistKontext.Provider value={geist}>
      <group ref={ref} position={p} scale={m}><Modell /></group>
    </GeistKontext.Provider>
  );
}

function FachInhalt({ fach, geistFarbe }) {
  const { teil } = fach;
  const modell = modellFuer(teil.bezeichnung);
  const stuecke = useMemo(() => anordnen(modell, teil, fach.b), [modell, teil, fach.b]);
  const Zubehoer = modell.zubehoer;
  return (
    <group position={[fach.x, fach.y0, 0.03]}>
      {Zubehoer && <Zubehoer b={fach.b} m={GROESSE * (modell.m ?? 1)} />}
      {stuecke.map((s, i) => <Stueck key={`${i}-${s.geist}`} Modell={modell.Modell} p={s.p} m={s.m} geist={s.geist ? geistFarbe : null} />)}
    </group>
  );
}

/* ---------- Regal aus den Lagerplätzen ---------- */

/**
 * Regale (Buchstaben) nebeneinander, je Regal die Fächer übereinander (Fach 01 oben).
 * spalten: höchstens so viele Regale nebeneinander (schmale Bildschirme: 2, dann zwei Reihen übereinander)
 */
export function regalAufbau(teile, spalten = Infinity) {
  const gruppen = new Map();
  for (const teil of teile) {
    const [buchstabe, nummer] = (teil.lagerplatz ?? '').split('-');
    const regal = teil.lagerplatz ? buchstabe : '–';
    if (!gruppen.has(regal)) gruppen.set(regal, []);
    gruppen.get(regal).push({ teil, nr: parseInt(nummer, 10) });
  }
  // Teile ohne (gültige) Fachnummer hinten anhängen
  for (const liste of gruppen.values()) {
    let max = Math.max(0, ...liste.map((x) => (x.nr > 0 ? x.nr : 0)));
    for (const x of liste) if (!(x.nr > 0)) { max += 1; x.nr = max; }
  }
  const namen = [...gruppen.keys()].sort((a, b) => (a === '–' ? 1 : b === '–' ? -1 : a.localeCompare(b)));
  const ebenen = Math.max(1, ...[...gruppen.values()].flat().map((x) => x.nr));
  const aussen = UB + 2 * PF;
  const nebeneinander = Math.max(1, Math.min(namen.length, spalten));
  const reihen = Math.ceil(namen.length / nebeneinander);
  const breite = nebeneinander * aussen + (nebeneinander - 1) * LUECKE;
  const hoehe = BODEN + ebenen * EH + 0.03;                       // ein Regal
  const gesamt = reihen * hoehe + (reihen - 1) * REIHE_ABSTAND;   // alle Reihen
  const regale = namen.map((regal, k) => ({
    regal,
    x: -breite / 2 + aussen / 2 + (k % nebeneinander) * (aussen + LUECKE),
    y: (reihen - 1 - Math.floor(k / nebeneinander)) * (hoehe + REIHE_ABSTAND),   // Fuß des Regals
  }));
  const faecher = [];
  for (const { regal, x, y } of regale) {
    const proNummer = new Map();
    for (const eintrag of gruppen.get(regal)) proNummer.set(eintrag.nr, [...(proNummer.get(eintrag.nr) ?? []), eintrag]);
    for (const [nr, im] of proNummer) {
      const y0 = y + BODEN + (ebenen - nr) * EH;  // Oberkante des Bodens, auf dem das Fach steht
      const b = UB / im.length;                   // mehrere Teile auf einem Platz: Fach teilen
      im.forEach((eintrag, i) => faecher.push({ teil: eintrag.teil, regal, nr, x: x - UB / 2 + b / 2 + i * b, y0, b }));
    }
  }
  return { regale, faecher, breite, hoehe, gesamt, ebenen };
}

/** Pfosten, Böden und Träger – als Instanzen (drei Zeichenaufrufe für das ganze Regal) */
function Gestell({ plan, f }) {
  const teile = useMemo(() => {
    const pfosten = [];
    const boeden = [];
    const traeger = [];
    const buehnen = [];
    for (const { x, y: fuss } of plan.regale) {
      for (const s of [-1, 1]) {
        for (const z of [-TIEFE / 2 + 0.03, TIEFE / 2 - 0.03]) pfosten.push({ p: [x + s * (UB / 2 + PF / 2), fuss + plan.hoehe / 2, z], g: [PF, plan.hoehe, 0.045] });
      }
      // obere Reihe (schmale Bildschirme): Regal steht auf einer Bühne
      if (fuss > 0) buehnen.push({ p: [x, fuss - 0.02, 0.1], g: [UB + 2 * PF + LUECKE, 0.04, TIEFE + 0.4] });
      for (let i = 0; i <= plan.ebenen; i += 1) {
        const y = fuss + BODEN + i * EH;
        boeden.push({ p: [x, y - 0.0125, -0.01], g: [UB, 0.025, TIEFE - 0.04] });
        traeger.push({ p: [x, y - BALKEN / 2, TIEFE / 2 - 0.015], g: [UB, BALKEN, 0.03] });
      }
    }
    return { pfosten, boeden, traeger, buehnen };
  }, [plan]);
  return (
    <>
      <Viele teile={teile.buehnen} farbe={f.hallenboden} rauheit={1} />
      <Viele teile={teile.pfosten} farbe={f['regal-stuetze']} metall={0.3} rauheit={0.5} />
      <Viele teile={teile.boeden} farbe={f['regal-boden']} metall={0.45} rauheit={0.45} />
      <Viele teile={teile.traeger} farbe={f['regal-traeger']} metall={0.2} rauheit={0.5} />
    </>
  );
}

/** Weiches Umgebungslicht aus einem gedachten Raum (ohne Bilddatei) – Metall glänzt dadurch echt */
function Umgebungslicht({ dunkel }) {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const raum = new RoomEnvironment();
    const karte = pmrem.fromScene(raum, 0.04).texture;
    scene.environment = karte;
    raum.dispose?.();
    pmrem.dispose();
    invalidate();
    return () => { scene.environment = null; karte.dispose(); };
  }, [gl, scene, invalidate]);
  useEffect(() => { scene.environmentIntensity = dunkel ? 0.42 : 0.55; invalidate(); }, [scene, dunkel, invalidate]);
  return null;
}

/**
 * Feste Kamera genau von vorn: so weit weg, dass das ganze Regal samt Schildern oben ins Bild passt.
 * Danach die Rechtecke der Fächer (Vorderkante) auf den Bildschirm umrechnen – für die Knöpfe darüber.
 */
const hilfsPunkt = new THREE.Vector3();
function Kamera({ plan, onLagen }) {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    if (!size.width || !size.height) return;
    const vorn = TIEFE / 2;
    const unten = -0.04;
    const oben = plan.gesamt + 0.4;
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const seiten = size.width / size.height;
    const abstand = Math.max((oben - unten) / 2 / tan, (plan.breite / 2 + 0.16) / (tan * seiten));
    const mitte = (oben + unten) / 2;
    camera.aspect = seiten;
    camera.position.set(0, mitte, vorn + abstand);
    camera.lookAt(0, mitte, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const bild = (x, y) => {
      hilfsPunkt.set(x, y, vorn).project(camera);
      return [((hilfsPunkt.x + 1) / 2) * size.width, ((1 - hilfsPunkt.y) / 2) * size.height];
    };
    onLagen({
      faecher: plan.faecher.map((fach) => {
        const [l, o] = bild(fach.x - fach.b / 2, fach.y0 + EH - BALKEN);
        const [r, u] = bild(fach.x + fach.b / 2, fach.y0 - BALKEN);
        return { l, o, b: r - l, h: u - o, balken: u - bild(0, fach.y0)[1] };
      }),
      regale: plan.regale.map((r) => bild(r.x, r.y + plan.hoehe)),
    });
    invalidate();
  }, [camera, size.width, size.height, plan, onLagen, invalidate]);
  return null;
}

/**
 * teile: Lagerzeilen des Werks; gewaehlt/onWaehle: Auswahl wie in der Fächer-Ansicht;
 * treffer: Set der Teile, die zur Suche passen (null = alle)
 */
export default function LagerRegal3D({ teile, gewaehlt, onWaehle, treffer = null }) {
  const t = useT();
  const { f } = useRaum();
  const rahmen = useRef(null);
  const sichtbar = useSichtbar(rahmen);
  // Schmal (Handy): je zwei Regale nebeneinander, sonst alle in einer Reihe – die Teile bleiben so erkennbar
  const [schmal, setSchmal] = useState(false);
  useLayoutEffect(() => {
    const el = rahmen.current;
    if (!el) return undefined;
    const messen = () => setSchmal(el.clientWidth < 600);
    messen();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);
  const plan = useMemo(() => regalAufbau(teile, schmal ? 2 : Infinity), [teile, schmal]);
  const [lagen, setLagen] = useState(null);
  const s = Math.max(plan.breite, plan.gesamt) / 2 + 1;

  return (
    <div className={`regal3d${lagen ? ' fertig' : ''}`} ref={rahmen} data-faecher={plan.faecher.length}
         style={{ aspectRatio: `${(plan.breite + 0.32).toFixed(2)} / ${(plan.gesamt + 0.44).toFixed(2)}` }}>
      <Canvas shadows dpr={[1, 1.5]} frameloop={sichtbar ? 'demand' : 'never'} camera={{ fov: 18, near: 0.1, far: 60 }}
              resize={{ offsetSize: true }} gl={{ antialias: true, alpha: true }}
              onCreated={({ gl }) => { gl.debug.checkShaderErrors = false; }}>
        <Kamera plan={plan} onLagen={setLagen} />
        <Umgebungslicht dunkel={f.dunkel} />
        <hemisphereLight args={['#ffffff', f.hallenboden, f.dunkel ? 0.5 : 0.7]} />
        <directionalLight position={[-1.2, plan.gesamt + 3, 7]} intensity={f.dunkel ? 1.25 : 1.6} castShadow
                          shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.015}
                          shadow-camera-left={-s} shadow-camera-right={s} shadow-camera-top={s + plan.gesamt} shadow-camera-bottom={-s} />
        {/* Hallenwand hinter dem Regal und Hallenboden */}
        <mesh position={[0, plan.gesamt / 2, -TIEFE / 2 - 0.06]} receiveShadow>
          <planeGeometry args={[plan.breite + 6, plan.gesamt + 4]} />
          <meshStandardMaterial color={f['regal-wand']} roughness={0.95} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[plan.breite + 6, 6]} />
          <meshStandardMaterial color={f.hallenboden} roughness={1} />
        </mesh>
        <Gestell plan={plan} f={f} />
        {plan.faecher.map((fach) => <FachInhalt key={fach.teil.id} fach={fach} geistFarbe={f.rot} />)}
      </Canvas>

      {/* Regal-Schilder oben und je Fach ein Knopf: Schild am Träger, Abzeichen „Fehlt“, Name beim Darüberfahren */}
      {lagen && plan.regale.map((r, i) => (
        <span key={r.regal} className="regal3d-titel" style={{ left: lagen.regale[i][0], top: lagen.regale[i][1] }} aria-hidden="true">
          {r.regal === '–' ? t('Ohne Lagerplatz') : t('Regal {r}', { r: r.regal })}
        </span>
      ))}
      {lagen && plan.faecher.map((fach, i) => {
        const lage = lagen.faecher[i];
        const { teil } = fach;
        const zustand = lagerZustand(teil);
        const fehlen = Math.max(0, teil.mindestbestand - teil.bestand);
        const text = teil.bestand === 0 ? t('Fehlt') : fehlen === 1 ? t('1 fehlt') : fehlen > 1 ? t('{n} fehlen', { n: fehlen }) : null;
        return (
          <button key={teil.id} type="button" data-teil={teil.id} aria-pressed={teil.id === gewaehlt} onClick={() => onWaehle(teil.id)}
                  className={`regal3d-fach zustand-${zustand}${teil.id === gewaehlt ? ' gewaehlt' : ''}${treffer && !treffer.has(teil.id) ? ' gedimmt' : ''}`}
                  style={{ left: lage.l, top: lage.o, width: lage.b, height: lage.h, '--balken': `${Math.max(14, lage.balken)}px` }}
                  aria-label={`${teil.lagerplatz ?? '–'} · ${teil.bezeichnung} · ${t('{n} von {m} Stück', { n: teil.bestand, m: teil.mindestbestand })}${text ? ` · ${text}` : ''}`}>
            <span className="r3-schild" aria-hidden="true">
              <b>{teil.lagerplatz ?? '–'}</b>
              <span className="r3-name">{teil.bezeichnung}</span>
              <span className="r3-zahl">{teil.bestand}/{teil.mindestbestand}</span>
              {teil.bestellung_id && <i className="bi bi-truck" />}
              {text && <span className="r3-fehlt">{text}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
