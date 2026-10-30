'use client';
/**
 * components/karten/raum/Maschine3D.js – vereinfachte 3D-Formen der Maschinen
 *
 * Jede Maschine besteht aus wenigen Quadern und Zylindern, damit man den Typ
 * auf einen Blick erkennt (Fräse, Drehmaschine, Roboterzelle, Presse, Regal …).
 * Gebaut wird entlang der Längsachse x (Länge L = längere Seite der Stellfläche,
 * Breite W = kürzere Seite); hochkant stehende Maschinen dreht der Aufrufer.
 * Maße in Metern, Ursprung = Mitte der Stellfläche auf dem Boden.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/** Quader: Mitte [x, y, z], Größe [b, h, t] */
function Kiste({ p, g, farbe, schatten = true }) {
  return (
    <mesh position={p} castShadow={schatten} receiveShadow>
      <boxGeometry args={g} />
      <meshStandardMaterial color={farbe} roughness={0.75} />
    </mesh>
  );
}

/** Zylinder: Mitte p, Radius r, Länge l, liegend entlang x (achse "x") oder stehend */
function Rolle({ p, r, l, farbe, achse = 'y', oben = r }) {
  const drehung = achse === 'x' ? [0, 0, Math.PI / 2] : achse === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={p} rotation={drehung} castShadow receiveShadow>
      <cylinderGeometry args={[oben, r, l, 20]} />
      <meshStandardMaterial color={farbe} roughness={0.6} metalness={0.15} />
    </mesh>
  );
}

/** Roboterarm, der sich langsam dreht (bei "Bewegung reduzieren" steht er still) */
function Roboter({ p, groesse, f, bewegt }) {
  const arm = useRef(null);
  useFrame(({ clock }) => {
    if (bewegt && arm.current) arm.current.rotation.y = Math.sin(clock.elapsedTime * 0.6 + p[0]) * 0.9;
  });
  const s = groesse;
  return (
    <group position={p}>
      <Rolle p={[0, 0.25 * s, 0]} r={0.35 * s} l={0.5 * s} farbe={f['maschine-dunkel']} />
      <group ref={arm} position={[0, 0.5 * s, 0]}>
        <Kiste p={[0.25 * s, 0.6 * s, 0]} g={[0.28 * s, 1.3 * s, 0.28 * s]} farbe={f.signal} />
        <Kiste p={[0.75 * s, 1.15 * s, 0]} g={[1.1 * s, 0.22 * s, 0.22 * s]} farbe={f.signal} />
        <Kiste p={[1.32 * s, 1.0 * s, 0]} g={[0.14 * s, 0.35 * s, 0.14 * s]} farbe={f['maschine-dunkel']} />
      </group>
    </group>
  );
}

/** Die Form je Maschinentyp */
export function MaschinenForm({ typ, L, W, f, bewegt }) {
  const k = f.maschine;
  const d = f['maschine-dunkel'];
  const s = f.signal;
  switch (typ) {
    case 'Fräsen':
      return (
        <>
          <Kiste p={[0, 0.45, 0]} g={[L * 0.92, 0.9, W * 0.85]} farbe={d} />
          <Kiste p={[0, 1.55, -W * 0.05]} g={[L * 0.8, 1.3, W * 0.72]} farbe={k} />
          <Kiste p={[-L * 0.12, 1.55, W * 0.32]} g={[L * 0.38, 0.75, 0.05]} farbe={f.glas} />
          <Kiste p={[L * 0.18, 2.45, -W * 0.1]} g={[L * 0.22, 0.5, W * 0.28]} farbe={s} />
        </>
      );
    case 'Drehen':
      return (
        <>
          <Kiste p={[0, 0.4, 0]} g={[L * 0.95, 0.8, W * 0.6]} farbe={d} />
          <Kiste p={[-L * 0.34, 1.2, 0]} g={[L * 0.26, 0.9, W * 0.7]} farbe={k} />
          <Rolle p={[-L * 0.17, 1.15, 0]} r={W * 0.17} l={0.3} achse="x" farbe={s} />
          <Kiste p={[L * 0.12, 1.25, -W * 0.05]} g={[L * 0.5, 0.95, W * 0.6]} farbe={k} />
          <Kiste p={[L * 0.12, 1.25, W * 0.26]} g={[L * 0.3, 0.55, 0.05]} farbe={f.glas} />
          <Kiste p={[L * 0.41, 1.05, 0]} g={[L * 0.1, 0.5, W * 0.35]} farbe={d} />
        </>
      );
    case 'Spritzguss':
      return (
        <>
          <Kiste p={[0, 0.45, 0]} g={[L, 0.9, W * 0.7]} farbe={d} />
          <Kiste p={[-L * 0.27, 1.55, 0]} g={[L * 0.4, 1.3, W * 0.8]} farbe={k} />
          <Rolle p={[L * 0.22, 1.3, 0]} r={W * 0.16} l={L * 0.45} achse="x" farbe={s} />
          <Rolle p={[L * 0.36, 2.0, 0]} r={W * 0.06} oben={W * 0.24} l={0.8} farbe={k} />
        </>
      );
    case 'Laserschneiden':
      return (
        <>
          <Kiste p={[0, 0.4, 0]} g={[L, 0.8, W]} farbe={d} />
          <Kiste p={[0, 0.83, 0]} g={[L * 0.9, 0.06, W * 0.85]} farbe={k} />
          <Kiste p={[-L * 0.1, 1.15, -W * 0.46]} g={[0.3, 0.7, 0.3]} farbe={s} />
          <Kiste p={[-L * 0.1, 1.15, W * 0.46]} g={[0.3, 0.7, 0.3]} farbe={s} />
          <Kiste p={[-L * 0.1, 1.55, 0]} g={[0.4, 0.3, W]} farbe={s} />
          <Kiste p={[-L * 0.1, 1.25, W * 0.1]} g={[0.3, 0.45, 0.3]} farbe={d} />
        </>
      );
    case 'Schweißen':
      return (
        <>
          <Kiste p={[0, 0.03, 0]} g={[L, 0.06, W]} farbe={s} schatten={false} />
          <Kiste p={[L * 0.22, 0.45, 0]} g={[L * 0.35, 0.9, W * 0.5]} farbe={d} />
          <Roboter p={[-L * 0.2, 0, 0]} groesse={Math.min(1.2, W / 2.2)} f={f} bewegt={bewegt} />
        </>
      );
    case 'Pressen':
      return (
        <>
          <Kiste p={[0, 0.45, 0]} g={[L * 0.85, 0.9, W * 0.85]} farbe={d} />
          <Kiste p={[-L * 0.36, 2.0, 0]} g={[L * 0.14, 2.6, W * 0.7]} farbe={k} />
          <Kiste p={[L * 0.36, 2.0, 0]} g={[L * 0.14, 2.6, W * 0.7]} farbe={k} />
          <Kiste p={[0, 3.6, 0]} g={[L * 0.9, 0.9, W * 0.85]} farbe={k} />
          <Kiste p={[0, 2.6, 0]} g={[L * 0.55, 0.5, W * 0.55]} farbe={s} />
        </>
      );
    case 'Fördertechnik':
      return (
        <>
          {[-0.42, -0.14, 0.14, 0.42].map((x) => <Kiste key={x} p={[L * x, 0.4, 0]} g={[0.12, 0.8, W * 0.55]} farbe={d} />)}
          <Kiste p={[0, 0.85, 0]} g={[L, 0.14, W * 0.6]} farbe={d} />
          {[-0.3, 0.05, 0.32].map((x) => <Kiste key={x} p={[L * x, 1.12, 0]} g={[0.5, 0.4, 0.45]} farbe={f.stamm} />)}
        </>
      );
    case 'Lackieren':
      return (
        <>
          <Kiste p={[0, 1.4, 0]} g={[L * 0.95, 2.8, W * 0.95]} farbe={k} />
          <Kiste p={[L * 0.2, 1.1, W * 0.48]} g={[L * 0.3, 2.0, 0.05]} farbe={d} />
          <Rolle p={[-L * 0.3, 3.2, 0]} r={0.3} l={0.8} farbe={d} />
        </>
      );
    case 'Montage':
      return (
        <>
          {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => (
            <Kiste key={`${a}${b}`} p={[a * L * 0.4, 0.45, b * W * 0.32]} g={[0.08, 0.9, 0.08]} farbe={d} />
          ))}
          <Kiste p={[0, 0.92, 0]} g={[L * 0.9, 0.06, W * 0.75]} farbe={k} />
          <Kiste p={[-L * 0.15, 1.05, 0]} g={[0.4, 0.2, 0.3]} farbe={s} />
          <Kiste p={[L * 0.2, 1.08, W * 0.1]} g={[0.3, 0.26, 0.3]} farbe={f.stamm} />
          <Kiste p={[0, 1.6, -W * 0.33]} g={[L * 0.7, 0.05, 0.05]} farbe={d} />
        </>
      );
    case 'Druckluft':
      return (
        <>
          <Rolle p={[-L * 0.18, 0.9, 0]} r={Math.min(0.75, W * 0.35)} l={L * 0.55} achse="x" farbe={k} />
          <Kiste p={[L * 0.3, 0.65, 0]} g={[L * 0.32, 1.3, W * 0.75]} farbe={s} />
          <Rolle p={[L * 0.08, 1.6, 0]} r={0.08} l={0.6} achse="x" farbe={d} />
        </>
      );
    case 'Lagertechnik':
      return (
        <>
          {[-0.48, 0, 0.48].map((x) => [-1, 1].map((z) => (
            <Kiste key={`${x}${z}`} p={[L * x, 1.6, z * W * 0.42]} g={[0.1, 3.2, 0.1]} farbe={f.blau} />
          )))}
          {[0.5, 1.5, 2.5].map((y) => <Kiste key={y} p={[0, y, 0]} g={[L, 0.06, W * 0.9]} farbe={s} />)}
          {[0.5, 1.5, 2.5].flatMap((y, i) => [-0.3, 0.05, 0.32].map((x, j) => (
            (i + j) % 3 !== 2 && <Kiste key={`${y}${x}`} p={[L * x, y + 0.3, 0]} g={[L * 0.22, 0.5, W * 0.7]} farbe={f.stamm} />
          )))}
        </>
      );
    default:
      return <Kiste p={[0, 0.8, 0]} g={[L * 0.9, 1.6, W * 0.9]} farbe={k} />;
  }
}
