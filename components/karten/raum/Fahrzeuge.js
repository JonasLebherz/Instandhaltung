'use client';
/**
 * components/karten/raum/Fahrzeuge.js – Autos, Lkw und Gabelstapler der 3D-Ansicht
 *
 *  - Auto: Karosserie aus einer Seitenansicht (abgerundet, Motorhaube, Heck), Fenster, Dach,
 *    Räder mit Felgen, Scheinwerfer und Rücklichter (nachts an)
 *  - ParkendeAutos: alle geparkten Autos zusammen in wenigen Zeichenaufrufen (Instanzen)
 *  - Lkw: Zugmaschine mit Frontscheibe, Kühlergrill, Spiegeln, Auflieger mit Firmenstreifen
 *  - Gabelstapler: fährt in der Halle den Gang entlang und hebt die Palette an
 * Die Formen werden einmal gebaut und von allen Fahrzeugen geteilt (spart Speicher).
 * Gebaut entlang x (vorn = +x), Ursprung Mitte am Boden.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Gehaeuse, Viele } from './Bausteine';

/* ---------- gemeinsame Formen (einmal erzeugt) ---------- */
let formen = null;
function autoFormen() {
  if (formen) return formen;
  // Seitenansicht der Karosserie: flache Front, Motorhaube, Heck
  const profil = new THREE.Shape();
  profil.moveTo(-2.18, 0.3);
  profil.lineTo(2.1, 0.3);
  profil.quadraticCurveTo(2.27, 0.32, 2.25, 0.56);
  profil.lineTo(2.17, 0.74);
  profil.quadraticCurveTo(1.9, 0.86, 1.15, 0.88);
  profil.lineTo(-1.75, 0.9);
  profil.quadraticCurveTo(-2.17, 0.88, -2.23, 0.62);
  profil.lineTo(-2.25, 0.42);
  profil.quadraticCurveTo(-2.24, 0.3, -2.18, 0.3);
  const karosserie = new THREE.ExtrudeGeometry(profil, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, curveSegments: 5 });
  karosserie.translate(0, 0, -0.8);
  // Fensterbereich (Glas) mit schrägen Scheiben vorn und hinten
  const kabine = new THREE.Shape();
  kabine.moveTo(1.12, 0.86); kabine.lineTo(0.32, 1.36); kabine.lineTo(-1.12, 1.38); kabine.lineTo(-1.7, 0.88); kabine.closePath();
  const glas = new THREE.ExtrudeGeometry(kabine, { depth: 1.4, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  glas.translate(0, 0, -0.7);
  const dach = new THREE.BoxGeometry(1.4, 0.07, 1.46);
  dach.translate(-0.38, 1.41, 0);
  const rad = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 18);
  rad.rotateX(Math.PI / 2);
  const felge = new THREE.CylinderGeometry(0.19, 0.19, 0.26, 12);
  felge.rotateX(Math.PI / 2);
  formen = { karosserie, glas, dach, rad, felge };
  return formen;
}

const RAEDER = [[1.36, 0.8], [1.36, -0.8], [-1.36, 0.8], [-1.36, -0.8]];
/** Typische Autolacke (Silber, Weiß, Schwarz, Grau, Blau, Rot) – wie Flaggen feste Farben */
export const AUTO_FARBEN = ['#c5cad1', '#f2f3f5', '#24272c', '#6d737c', '#2f5d9e', '#a8322d', '#d8d2c4'];
const GLAS = '#1c2733';
const REIFEN = '#1b1c1f';

/** Scheinwerfer (vorn) und Rücklichter (hinten); nachts leuchten sie */
function Lichter({ vorn, hinten, hoehe, abstand, f }) {
  return (
    <>
      {[-abstand, abstand].map((z) => (
        <group key={z}>
          <mesh position={[vorn, hoehe, z]}>
            <boxGeometry args={[0.06, 0.14, 0.32]} />
            <meshStandardMaterial color={f.nacht ? f.licht : '#e9edf2'} emissive={f.licht} emissiveIntensity={f.nacht ? 2.5 : 0} />
          </mesh>
          <mesh position={[hinten, hoehe, z]}>
            <boxGeometry args={[0.06, 0.12, 0.3]} />
            <meshStandardMaterial color="#b3261e" emissive="#ff3b30" emissiveIntensity={f.nacht ? 1.6 : 0.15} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Einzelnes Auto (für fahrende Autos) */
export function Auto({ farbe, f }) {
  const t = autoFormen();
  return (
    <group>
      <mesh geometry={t.karosserie} castShadow receiveShadow dispose={null}>
        <meshStandardMaterial color={farbe} roughness={0.32} metalness={0.45} />
      </mesh>
      <mesh geometry={t.glas} dispose={null}><meshStandardMaterial color={GLAS} roughness={0.1} metalness={0.6} /></mesh>
      <mesh geometry={t.dach} dispose={null}><meshStandardMaterial color={farbe} roughness={0.32} metalness={0.45} /></mesh>
      {RAEDER.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0.33, z]}>
          <mesh geometry={t.rad} dispose={null}><meshStandardMaterial color={REIFEN} roughness={0.9} /></mesh>
          <mesh geometry={t.felge} dispose={null}><meshStandardMaterial color="#c3c8cf" roughness={0.3} metalness={0.7} /></mesh>
        </group>
      ))}
      <Lichter vorn={2.27} hinten={-2.27} hoehe={0.66} abstand={0.6} f={f} />
    </group>
  );
}

/**
 * Geparkte Autos als Instanzen: plaetze = [{ x, z, drehung, farbe }].
 * 5 Zeichenaufrufe für alle Autos zusammen statt ~10 je Auto.
 */
export function ParkendeAutos({ plaetze }) {
  const t = autoFormen();
  const teile = useMemo(() => {
    const karosserie = [];
    const dach = [];
    const glas = [];
    const raeder = [];
    const felgen = [];
    plaetze.forEach(({ x, z, drehung = 0, farbe }) => {
      const r = [0, drehung, 0];
      karosserie.push({ p: [x, 0, z], r, farbe });
      dach.push({ p: [x, 0, z], r, farbe });
      glas.push({ p: [x, 0, z], r });
      RAEDER.forEach(([rx, rz]) => {
        const c = Math.cos(drehung);
        const s = Math.sin(drehung);
        const p = [x + rx * c + rz * s, 0.33, z - rx * s + rz * c];
        raeder.push({ p, r });
        felgen.push({ p, r });
      });
    });
    return { karosserie, dach, glas, raeder, felgen };
  }, [plaetze]);
  return (
    <>
      <Viele teile={teile.karosserie} geometrie={t.karosserie} rauheit={0.32} metall={0.45} />
      <Viele teile={teile.dach} geometrie={t.dach} rauheit={0.32} metall={0.45} schatten={false} />
      <Viele teile={teile.glas} geometrie={t.glas} farbe={GLAS} rauheit={0.1} metall={0.6} schatten={false} />
      <Viele teile={teile.raeder} geometrie={t.rad} farbe={REIFEN} rauheit={0.9} schatten={false} />
      <Viele teile={teile.felgen} geometrie={t.felge} farbe="#c3c8cf" rauheit={0.3} metall={0.7} schatten={false} />
    </>
  );
}

/** Sattelzug: Zugmaschine (vorn, Farbe farbe) und weißer Auflieger mit Firmenstreifen */
export function Lkw({ farbe, f }) {
  const t = autoFormen();
  const raeder = useMemo(() => [6.5, 4.5, -5.1, -6.4, -7.7].flatMap((x) => [1.02, -1.02].map((z) => ({ p: [x, 0.5, z], g: [1.5, 1.5, 1.3] }))), []);
  return (
    <group>
      {/* Zugmaschine */}
      <Gehaeuse p={[5.9, 2.05, 0]} g={[2.3, 2.7, 2.45]} farbe={farbe} radius={0.22} rauheit={0.35} metall={0.35} />
      <mesh position={[7.06, 2.65, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[2.2, 1.05]} />
        <meshStandardMaterial color={GLAS} roughness={0.1} metalness={0.6} />
      </mesh>
      <mesh position={[7.06, 1.25, 0]}>
        <boxGeometry args={[0.05, 0.75, 1.7]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[7.08, 0.62, 0]}>
        <boxGeometry args={[0.24, 0.35, 2.45]} />
        <meshStandardMaterial color="#3a3f47" roughness={0.6} />
      </mesh>
      {[1.38, -1.38].map((z) => (
        <mesh key={z} position={[6.95, 2.6, z]}>
          <boxGeometry args={[0.1, 0.5, 0.12]} />
          <meshStandardMaterial color="#2a2d33" />
        </mesh>
      ))}
      <mesh position={[5, 0.85, 0]} castShadow>
        <boxGeometry args={[4.6, 0.35, 1.1]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.7} />
      </mesh>
      <mesh position={[4.9, 0.85, 1.05]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.3, 0.3, 1.2, 14]} />
        <meshStandardMaterial color="#c3c8cf" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Auflieger */}
      <Gehaeuse p={[-1.8, 2.5, 0]} g={[12.6, 2.75, 2.5]} farbe={f.wand} radius={0.08} rauheit={0.5} metall={0.1} />
      <mesh position={[-1.8, 1.75, 0]}>
        <boxGeometry args={[12.62, 0.32, 2.53]} />
        <meshStandardMaterial color={f.akzent} roughness={0.4} />
      </mesh>
      <mesh position={[-1.8, 0.95, 0]}>
        <boxGeometry args={[12.2, 0.3, 1.0]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.7} />
      </mesh>
      <mesh position={[-0.6, 0.85, 0]}>
        <boxGeometry args={[6, 0.5, 2.46]} />
        <meshStandardMaterial color="#8e959f" roughness={0.6} />
      </mesh>
      <Viele teile={raeder} geometrie={t.rad} farbe={REIFEN} rauheit={0.9} schatten={false} />
      <Lichter vorn={7.1} hinten={-8.12} hoehe={0.95} abstand={0.95} f={f} />
    </group>
  );
}

/**
 * Gabelstapler mit Palette. Fährt zwischen a und b hin und her (Koordinaten der Szene)
 * und hebt die Gabel unterwegs langsam an und ab.
 */
export function Gabelstapler({ a, b, f, bewegt, phase = 0, tempo = 2.2 }) {
  const ref = useRef(null);
  const gabel = useRef(null);
  const laenge = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = (bewegt ? clock.elapsedTime * tempo : 0) + phase * laenge * 2;
    const weg = s % (2 * laenge);
    const d = weg < laenge ? weg : 2 * laenge - weg;
    const vor = weg < laenge;
    ref.current.position.set(a[0] + ((b[0] - a[0]) * d) / laenge, 0, a[1] + ((b[1] - a[1]) * d) / laenge);
    ref.current.rotation.y = Math.atan2(-(b[1] - a[1]) * (vor ? 1 : -1), (b[0] - a[0]) * (vor ? 1 : -1));
    if (gabel.current) gabel.current.position.y = 0.15 + (bewegt ? (Math.sin(clock.elapsedTime * 0.7 + phase * 6) + 1) * 0.35 : 0);
  });
  const dunkel = f['maschine-dunkel'];
  return (
    <group ref={ref}>
      <Gehaeuse p={[0, 0.72, 0]} g={[1.8, 0.95, 1.1]} farbe={f.signal} radius={0.14} rauheit={0.45} />
      <Gehaeuse p={[-1.0, 0.78, 0]} g={[0.45, 0.95, 1.12]} farbe={dunkel} radius={0.14} />
      <mesh position={[-0.25, 1.45, 0]}>
        <boxGeometry args={[0.45, 0.5, 0.45]} />
        <meshStandardMaterial color="#22262c" roughness={0.8} />
      </mesh>
      {/* Schutzdach */}
      {[[-0.65, 0.48], [-0.65, -0.48], [0.5, 0.48], [0.5, -0.48]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 1.75, z]}>
          <boxGeometry args={[0.06, 1.15, 0.06]} />
          <meshStandardMaterial color={dunkel} />
        </mesh>
      ))}
      <mesh position={[-0.08, 2.35, 0]} castShadow>
        <boxGeometry args={[1.25, 0.05, 1.02]} />
        <meshStandardMaterial color={dunkel} />
      </mesh>
      <mesh position={[-0.3, 2.45, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.14, 10]} />
        <meshStandardMaterial color={f['ampel-orange']} emissive={f['ampel-orange']} emissiveIntensity={1.4} />
      </mesh>
      {/* Hubmast und Gabel mit Palette */}
      {[0.32, -0.32].map((z) => (
        <mesh key={z} position={[1.02, 1.3, z]}>
          <boxGeometry args={[0.1, 2.5, 0.1]} />
          <meshStandardMaterial color="#5b6069" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      <group ref={gabel} position={[0, 0.15, 0]}>
        <mesh position={[1.1, 0.35, 0]}>
          <boxGeometry args={[0.06, 0.7, 0.85]} />
          <meshStandardMaterial color={dunkel} />
        </mesh>
        {[0.26, -0.26].map((z) => (
          <mesh key={z} position={[1.65, 0.03, z]}>
            <boxGeometry args={[1.1, 0.05, 0.12]} />
            <meshStandardMaterial color="#5b6069" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[1.7, 0.13, 0]}>
          <boxGeometry args={[1.2, 0.14, 1.0]} />
          <meshStandardMaterial color={f.stamm} roughness={0.9} />
        </mesh>
        <mesh position={[1.7, 0.6, 0]} castShadow>
          <boxGeometry args={[1.1, 0.8, 0.95]} />
          <meshStandardMaterial color="#c8a77a" roughness={0.9} />
        </mesh>
      </group>
      {[[0.62, 0.52], [0.62, -0.52], [-0.72, 0.5], [-0.72, -0.5]].map(([x, z]) => (
        <mesh key={`r${x}${z}`} position={[x, 0.28, z]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.28, 0.28, 0.22, 14]} />
          <meshStandardMaterial color={REIFEN} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
