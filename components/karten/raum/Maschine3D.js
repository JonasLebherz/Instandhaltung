'use client';
/**
 * components/karten/raum/Maschine3D.js – vereinfachte 3D-Formen der Maschinen
 *
 * Jede Maschine besteht aus wenigen Quadern und Zylindern, damit man den Typ
 * auf einen Blick erkennt (Fräse, Drehmaschine, Roboterzelle, Presse, Regal …).
 * Bewegliche Teile laufen (Spindel, Futter, Stößel, Portal, Pakete, Roboterarm) –
 * außer bei Stillstand (Ampel rot) und bei "Bewegung reduzieren".
 * An jeder Maschine steht eine Signalampel: grün = läuft, orange = Störung,
 * rot = Stillstand (offene Störung mit Priorität "hoch" – "Maschine steht").
 *
 * Gebaut wird entlang der Längsachse x (Länge L = längere Seite der Stellfläche,
 * Breite W = kürzere Seite); hochkant stehende Maschinen dreht der Aufrufer.
 * Maße in Metern, Ursprung = Mitte der Stellfläche auf dem Boden.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ampelZustand } from '@/lib/karten/ampel';
import { Gehaeuse, Viele, useCanvasTextur } from './Bausteine';


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

/** Bewegtes Teil: hin und her schieben (achse x/y/z) oder drehen */
function Bewegt({ p = [0, 0, 0], art = 'schieben', achse = 'x', weite = 0.3, tempo = 1, aktiv, children }) {
  const ref = useRef(null);
  const i = { x: 0, y: 1, z: 2 }[achse];
  useFrame(({ clock }) => {
    if (!aktiv || !ref.current) return;
    const t = clock.elapsedTime * tempo;
    if (art === 'drehen') ref.current.rotation[achse] = t;
    else ref.current.position[achse] = p[i] + Math.sin(t) * weite;
  });
  return <group ref={ref} position={p}>{children}</group>;
}

/** Glasscheibe (durchsichtig) bzw. Sichtfenster mit Innenlicht (leuchtet, wenn die Maschine läuft) */
function Glas({ p, g, f, licht = 0, drehung = [0, 0, 0] }) {
  return (
    <mesh position={p} rotation={drehung}>
      <boxGeometry args={g} />
      <meshStandardMaterial color={f.glas} transparent opacity={0.28} roughness={0.05} metalness={0.3} depthWrite={false}
                            emissive="#dcecff" emissiveIntensity={licht} />
    </mesh>
  );
}

/** Pakete auf dem Förderband: laufen von links nach rechts und beginnen wieder vorn */
function Pakete({ L, f, aktiv, hoehe = 1.12 }) {
  const ref = useRef(null);
  const anzahl = Math.max(3, Math.round(L / 3));
  useFrame(({ clock }) => {
    if (!aktiv || !ref.current) return;
    ref.current.children.forEach((paket, i) => {
      paket.position.x = (((clock.elapsedTime * 0.8 + (i * L) / anzahl) % L) + L) % L - L / 2;
    });
  });
  return (
    <group ref={ref}>
      {Array.from({ length: anzahl }, (_, i) => (
        <group key={i} position={[-L / 2 + (i * L) / anzahl, hoehe, 0]}>
          <Kiste p={[0, 0, 0]} g={[0.5 + (i % 2) * 0.15, 0.36 + (i % 3) * 0.06, 0.45]} farbe="#c8a77a" />
          <Kiste p={[0, 0.19 + (i % 3) * 0.03, 0]} g={[0.52 + (i % 2) * 0.15, 0.01, 0.08]} farbe="#a9865a" schatten={false} />
        </group>
      ))}
    </group>
  );
}

/** Schweißroboter (6 Achsen vereinfacht): Drehsockel, Schwinge, Arm, Handgelenk mit Brenner */
function Roboter({ p, groesse, f, aktiv }) {
  const dreh = useRef(null);
  const schulter = useRef(null);
  const ellbogen = useRef(null);
  useFrame(({ clock }) => {
    if (!aktiv) return;
    const t = clock.elapsedTime + p[0];
    if (dreh.current) dreh.current.rotation.y = Math.sin(t * 0.6) * 0.9;
    if (schulter.current) schulter.current.rotation.z = 0.25 + Math.sin(t * 0.9) * 0.18;
    if (ellbogen.current) ellbogen.current.rotation.z = -1.1 + Math.sin(t * 1.2 + 1) * 0.25;
  });
  const s = groesse;
  const lack = f.signal;
  return (
    <group position={p} scale={s}>
      <Rolle p={[0, 0.2, 0]} r={0.42} l={0.4} farbe={f['maschine-dunkel']} />
      <group ref={dreh} position={[0, 0.4, 0]}>
        <Gehaeuse p={[0, 0.22, 0]} g={[0.7, 0.44, 0.6]} farbe={lack} radius={0.1} />
        <group ref={schulter} position={[0.1, 0.45, 0]}>
          <Gehaeuse p={[0, 0.55, 0]} g={[0.26, 1.15, 0.3]} farbe={lack} radius={0.1} />
          <group ref={ellbogen} position={[0, 1.1, 0]}>
            <Rolle p={[0, 0, 0]} r={0.17} l={0.36} achse="z" farbe={f['maschine-dunkel']} />
            <Gehaeuse p={[0.5, 0, 0]} g={[1.0, 0.2, 0.22]} farbe={lack} radius={0.08} />
            <Rolle p={[1.05, -0.08, 0]} r={0.07} l={0.3} farbe={f['maschine-dunkel']} />
            <Rolle p={[1.12, -0.28, 0]} r={0.025} oben={0.04} l={0.22} farbe="#c3c8cf" />
          </group>
        </group>
      </group>
    </group>
  );
}

/**
 * Signalampel (Signalsäule) wie an echten Maschinen: rot oben, orange, grün unten.
 * Die passende Leuchte strahlt, die anderen sind dunkel. zustand = null: alle aus (beim Melden).
 */
export function Ampel({ p, zustand, f, hoehe = 2.4, groesse = 1 }) {
  const leuchten = [['rot', 0.38], ['orange', 0.2], ['gruen', 0.02]];
  return (
    <group position={p} scale={groesse}>
      <Rolle p={[0, (hoehe - 0.55) / 2, 0]} r={0.035} l={hoehe - 0.55} farbe={f['maschine-dunkel']} />
      {leuchten.map(([name, y]) => {
        const an = zustand === name;
        return (
          <mesh key={name} position={[0, hoehe - 0.55 + y + 0.09, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.17, 18]} />
            <meshStandardMaterial color={f[`ampel-${name}`]} emissive={f[`ampel-${name}`]}
                                  emissiveIntensity={an ? 2.6 : 0} transparent opacity={an ? 1 : 0.3} roughness={0.3} />
          </mesh>
        );
      })}
      {/* Leuchtschein um die aktive Leuchte – so erkennt man den Zustand auch von weitem */}
      {zustand && (
        <mesh position={[0, hoehe - 0.55 + { rot: 0.38, orange: 0.2, gruen: 0.02 }[zustand] + 0.09, 0]}>
          <sphereGeometry args={[0.3, 16, 12]} />
          <meshBasicMaterial color={f[`ampel-${zustand}`]} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
      <Rolle p={[0, hoehe + 0.05, 0]} r={0.1} l={0.06} farbe={f['maschine-dunkel']} />
    </group>
  );
}

/** Ungefähre Höhe je Maschinentyp in Metern (für die Kamera im Infofenster) */
export const MASCHINEN_HOEHE = { Pressen: 5.3, Lackieren: 6, Lagertechnik: 4, Spritzguss: 3.2, Fräsen: 3.1 };

/**
 * Die Form je Maschinentyp. laeuft: bewegliche Teile in Bewegung (nicht bei Stillstand).
 * Vorn = +z (Bedienseite). Verkleidungen mit runden Kanten, Glastüren mit Blick in den Arbeitsraum.
 */
export function MaschinenForm({ typ, L, W, f, laeuft }) {
  const k = f.maschine;
  const d = f['maschine-dunkel'];
  const s = f.signal;
  const stahl = '#b8bec6';
  const licht = laeuft ? 0.25 : 0;
  switch (typ) {
    case 'Fräsen': {
      // Bearbeitungszentrum: Sockel, Kabine (Seiten, Rückwand, Dach), Schiebetür aus Glas,
      // im Arbeitsraum Tisch mit Werkstück und Spindel; Späneförderer und Schaltschrank hinten
      const H = 2.1;
      const zb = -W * 0.04;
      return (
        <>
          <Gehaeuse p={[0, 0.28, 0]} g={[L * 0.94, 0.56, W * 0.86]} farbe={d} radius={0.05} />
          <Gehaeuse p={[-L * 0.42, 0.56 + H / 2, zb]} g={[L * 0.1, H, W * 0.78]} farbe={k} radius={0.06} />
          <Gehaeuse p={[L * 0.36, 0.56 + H / 2, zb]} g={[L * 0.22, H, W * 0.78]} farbe={k} radius={0.06} />
          <Kiste p={[-L * 0.05, 0.56 + H / 2, zb - W * 0.36]} g={[L * 0.66, H, 0.12]} farbe={k} />
          <Gehaeuse p={[-L * 0.03, 0.56 + H + 0.12, zb]} g={[L * 0.9, 0.24, W * 0.8]} farbe={k} radius={0.08} />
          <Kiste p={[-L * 0.05, 0.56 + H - 0.22, zb + W * 0.39]} g={[L * 0.66, 0.36, 0.06]} farbe={f.akzent} />
          <Glas p={[-L * 0.05, 1.45, zb + W * 0.39]} g={[L * 0.64, 1.3, 0.03]} f={f} licht={licht} />
          <Kiste p={[-L * 0.05, 0.08 + 0.56, zb + W * 0.39]} g={[L * 0.66, 0.16, 0.06]} farbe={d} />
          <Kiste p={[L * 0.12, 1.45, zb + W * 0.41]} g={[0.04, 0.5, 0.05]} farbe={stahl} />
          {/* Arbeitsraum: Tisch fährt in x, Spindelkopf auf und ab, Werkzeug dreht */}
          <Bewegt p={[-L * 0.05, 0.75, zb]} weite={L * 0.08} tempo={0.7} aktiv={laeuft}>
            <Kiste p={[0, 0, 0]} g={[L * 0.42, 0.14, W * 0.42]} farbe={d} />
            <Kiste p={[0, 0.2, 0]} g={[L * 0.16, 0.26, W * 0.18]} farbe={stahl} />
          </Bewegt>
          <Bewegt p={[-L * 0.05, 1.75, zb - W * 0.05]} achse="y" weite={0.12} tempo={1.1} aktiv={laeuft}>
            <Gehaeuse p={[0, 0, 0]} g={[0.5, 0.7, 0.55]} farbe={k} radius={0.08} />
            <Bewegt p={[0, -0.5, 0]} art="drehen" achse="y" tempo={14} aktiv={laeuft}>
              <Rolle p={[0, 0, 0]} r={0.05} oben={0.09} l={0.32} farbe={stahl} />
            </Bewegt>
          </Bewegt>
          {/* Späneförderer mit Behälter hinten links, Schaltschrank hinten rechts */}
          <group position={[-L * 0.3, 0.55, -W * 0.47]} rotation-x={0.45}>
            <Kiste p={[0, 0, 0]} g={[0.55, 0.3, 1.1]} farbe={d} />
          </group>
          <Kiste p={[-L * 0.3, 0.32, -W * 0.5 - 0.35]} g={[0.7, 0.64, 0.6]} farbe={f.blau} />
          <Gehaeuse p={[L * 0.12, 1.0, -W * 0.46]} g={[L * 0.3, 2.0, 0.45]} farbe={k} radius={0.04} />
          <Kiste p={[L * 0.12, 1.0, -W * 0.46 - 0.23]} g={[0.02, 1.8, 0.01]} farbe={d} schatten={false} />
        </>
      );
    }
    case 'Drehen': {
      // Schrägbett-Drehmaschine: Spindelstock links, Revolver rechts, Futter dreht hinter der Glastür
      return (
        <>
          <Gehaeuse p={[0, 0.3, 0]} g={[L * 0.95, 0.6, W * 0.7]} farbe={d} radius={0.05} />
          <Gehaeuse p={[-L * 0.34, 1.35, -W * 0.03]} g={[L * 0.26, 1.5, W * 0.7]} farbe={k} radius={0.08} />
          <Gehaeuse p={[L * 0.36, 1.35, -W * 0.03]} g={[L * 0.2, 1.5, W * 0.7]} farbe={k} radius={0.08} />
          <Kiste p={[0, 1.35, -W * 0.33]} g={[L * 0.5, 1.5, 0.1]} farbe={k} />
          <Gehaeuse p={[0, 2.18, -W * 0.03]} g={[L * 0.92, 0.18, W * 0.72]} farbe={k} radius={0.06} />
          <Kiste p={[0, 1.98, W * 0.33]} g={[L * 0.5, 0.2, 0.05]} farbe={f.akzent} />
          <Glas p={[0, 1.3, W * 0.33]} g={[L * 0.48, 1.1, 0.03]} f={f} licht={licht} />
          <Kiste p={[L * 0.2, 1.3, W * 0.35]} g={[0.04, 0.45, 0.05]} farbe={stahl} />
          {/* Futter mit Backen (dreht), Werkstück, Werkzeugrevolver */}
          <Bewegt p={[-L * 0.18, 1.3, -W * 0.05]} art="drehen" achse="x" tempo={9} aktiv={laeuft}>
            <Rolle p={[0, 0, 0]} r={W * 0.15} l={0.22} achse="x" farbe={stahl} />
            {[0, 1, 2].map((i) => (
              <Kiste key={i} p={[0.12, Math.cos((i * 2 * Math.PI) / 3) * W * 0.08, Math.sin((i * 2 * Math.PI) / 3) * W * 0.08]} g={[0.06, 0.08, 0.08]} farbe={d} />
            ))}
          </Bewegt>
          <Rolle p={[-L * 0.08, 1.3, -W * 0.05]} r={W * 0.05} l={L * 0.18} achse="x" farbe={stahl} />
          <Bewegt p={[L * 0.12, 1.12, -W * 0.02]} weite={L * 0.04} tempo={0.8} aktiv={laeuft}>
            <Rolle p={[0, 0, 0]} r={W * 0.12} l={0.2} achse="x" farbe={d} />
            <Kiste p={[0, 0, 0]} g={[0.24, 0.32, 0.32]} farbe={k} />
          </Bewegt>
          {/* Späneförderer hinten rechts */}
          <group position={[L * 0.3, 0.75, -W * 0.45]} rotation-z={0.35}>
            <Kiste p={[0, 0, 0]} g={[L * 0.4, 0.25, 0.32]} farbe={d} />
          </group>
        </>
      );
    }
    case 'Spritzguss': {
      // Schließeinheit links (Holme, bewegliche Platte, Schutzhaube aus Glas), Spritzeinheit rechts (Zylinder, Trichter)
      const y = 1.6;
      return (
        <>
          <Gehaeuse p={[0, 0.45, 0]} g={[L, 0.9, W * 0.72]} farbe={d} radius={0.06} />
          <Kiste p={[0, 0.75, W * 0.365]} g={[L * 0.98, 0.12, 0.02]} farbe={f.akzent} schatten={false} />
          <Gehaeuse p={[-L * 0.45, y, 0]} g={[0.35, 1.3, W * 0.7]} farbe={k} radius={0.05} />
          <Gehaeuse p={[-L * 0.05, y, 0]} g={[0.4, 1.5, W * 0.76]} farbe={k} radius={0.05} />
          {[[0.45, 0.28], [0.45, -0.28], [-0.45, 0.28], [-0.45, -0.28]].map(([dy, dz]) => (
            <Rolle key={`${dy}${dz}`} p={[-L * 0.25, y + dy, dz * W]} r={0.06} l={L * 0.4} achse="x" farbe={stahl} />
          ))}
          <Bewegt p={[-L * 0.27, y, 0]} weite={L * 0.06} tempo={1.4} aktiv={laeuft}>
            <Gehaeuse p={[0, 0, 0]} g={[0.32, 1.2, W * 0.66]} farbe={s} radius={0.05} />
          </Bewegt>
          <Glas p={[-L * 0.25, y + 0.1, 0]} g={[L * 0.44, 1.7, W * 0.82]} f={f} />
          <Kiste p={[-L * 0.25, y + 0.97, 0]} g={[L * 0.45, 0.06, W * 0.84]} farbe={k} />
          {/* Spritzeinheit: Zylinder mit Heizbändern, Antrieb, Trichter */}
          <Rolle p={[L * 0.17, y, 0]} r={W * 0.07} l={L * 0.3} achse="x" farbe={stahl} />
          {[0.07, 0.15, 0.23].map((x) => <Rolle key={x} p={[L * x, y, 0]} r={W * 0.095} l={0.18} achse="x" farbe={f['ampel-rot']} />)}
          <Gehaeuse p={[L * 0.4, y + 0.05, 0]} g={[L * 0.18, 1.0, W * 0.55]} farbe={k} radius={0.08} />
          <Rolle p={[L * 0.27, y + 0.75, 0]} r={W * 0.05} oben={W * 0.2} l={0.7} farbe={k} />
          <Rolle p={[L * 0.27, y + 1.25, 0]} r={W * 0.2} l={0.3} farbe={f.glas} />
        </>
      );
    }
    case 'Laserschneiden': {
      // Flachbett: Gestell, Auflageleisten, Blechtafel, Portal (fährt in x) mit Schneidkopf (fährt in z),
      // Glaswand vorn, Wechseltisch rechts, Laserquelle hinten rechts
      const leisten = Array.from({ length: Math.floor((L * 0.66) / 0.3) }, (_, i) => ({ p: [-L * 0.43 + 0.15 + i * 0.3, 0.86, 0], g: [0.03, 0.14, W * 0.78] }));
      return (
        <>
          <Gehaeuse p={[-L * 0.1, 0.4, 0]} g={[L * 0.76, 0.8, W * 0.9]} farbe={d} radius={0.05} />
          <Viele teile={leisten} farbe={stahl} schatten={false} />
          <Kiste p={[-L * 0.12, 0.94, 0]} g={[L * 0.55, 0.02, W * 0.66]} farbe={f.tank} schatten={false} />
          <Kiste p={[-L * 0.1, 1.35, -W * 0.46]} g={[L * 0.76, 1.1, 0.08]} farbe={k} />
          <Glas p={[-L * 0.1, 1.3, W * 0.46]} g={[L * 0.74, 1.0, 0.03]} f={f} />
          <Kiste p={[-L * 0.1, 1.84, W * 0.46]} g={[L * 0.76, 0.1, 0.06]} farbe={f.akzent} />
          <Bewegt p={[-L * 0.1, 0, 0]} weite={L * 0.28} tempo={0.45} aktiv={laeuft}>
            {[-1, 1].map((z) => <Gehaeuse key={z} p={[0, 1.2, z * W * 0.46]} g={[0.5, 0.75, 0.3]} farbe={s} radius={0.06} />)}
            <Gehaeuse p={[0, 1.62, 0]} g={[0.42, 0.42, W * 0.98]} farbe={s} radius={0.08} />
            <Bewegt p={[0.28, 1.4, 0]} achse="z" weite={W * 0.32} tempo={1.3} aktiv={laeuft}>
              <Gehaeuse p={[0, 0, 0]} g={[0.24, 0.55, 0.26]} farbe={d} radius={0.05} />
              <Rolle p={[0, -0.36, 0]} r={0.02} oben={0.06} l={0.18} farbe={stahl} />
            </Bewegt>
          </Bewegt>
          <Gehaeuse p={[L * 0.38, 0.35, W * 0.1]} g={[L * 0.2, 0.7, W * 0.7]} farbe={d} radius={0.05} />
          <Kiste p={[L * 0.38, 0.72, W * 0.1]} g={[L * 0.18, 0.02, W * 0.6]} farbe={f.tank} schatten={false} />
          <Gehaeuse p={[L * 0.4, 1.0, -W * 0.36]} g={[L * 0.15, 2.0, W * 0.24]} farbe={k} radius={0.06} />
          <Kiste p={[L * 0.4, 1.7, -W * 0.36 + W * 0.121]} g={[L * 0.1, 0.2, 0.01]} farbe={f.akzent} schatten={false} />
        </>
      );
    }
    case 'Schweißen': {
      // Roboterzelle: Schutzzaun (Gitter), Roboter auf Sockel, Dreh-Positionierer mit Werkstück, Drahtfass
      return (
        <>
          <Kiste p={[0, 0.02, 0]} g={[L, 0.04, W]} farbe={d} schatten={false} />
          <Schutzzaun L={L} W={W} f={f} />
          <Roboter p={[-L * 0.18, 0.3, -W * 0.05]} groesse={Math.min(1.25, W / 2.4)} f={f} aktiv={laeuft} />
          <Kiste p={[-L * 0.18, 0.15, -W * 0.05]} g={[0.9, 0.3, 0.9]} farbe={d} />
          {[-1, 1].map((x) => <Gehaeuse key={x} p={[L * 0.2 + x * L * 0.16, 0.5, W * 0.05]} g={[0.35, 1.0, 0.5]} farbe={d} radius={0.04} />)}
          <Bewegt p={[L * 0.2, 0.85, W * 0.05]} art="drehen" achse="x" tempo={0.6} aktiv={laeuft}>
            <Rolle p={[0, 0, 0]} r={0.06} l={L * 0.3} achse="x" farbe={stahl} />
            <Kiste p={[0, 0.12, 0]} g={[L * 0.22, 0.18, 0.5]} farbe={f.tank} />
            <Kiste p={[0, -0.05, 0]} g={[L * 0.16, 0.12, 0.3]} farbe={stahl} />
          </Bewegt>
          <Rolle p={[-L * 0.38, 0.45, -W * 0.36]} r={0.3} l={0.9} farbe={f.blau} />
          <Gehaeuse p={[-L * 0.4, 0.8, W * 0.3]} g={[0.6, 1.6, 0.5]} farbe={k} radius={0.05} />
        </>
      );
    }
    case 'Pressen': {
      // Hydraulische Presse: Tisch, zwei Ständer, Kopfstück mit Zylindern, Stößel mit Werkzeug, Lichtgitter vorn
      return (
        <>
          <Gehaeuse p={[0, 0.45, 0]} g={[L * 0.9, 0.9, W * 0.85]} farbe={d} radius={0.06} />
          <Kiste p={[0, 0.97, 0]} g={[L * 0.55, 0.14, W * 0.62]} farbe={stahl} />
          <Kiste p={[0, 1.14, 0]} g={[L * 0.38, 0.2, W * 0.45]} farbe={d} />
          {[-1, 1].map((x) => <Gehaeuse key={x} p={[x * L * 0.36, 2.3, 0]} g={[L * 0.18, 2.8, W * 0.72]} farbe={k} radius={0.08} />)}
          <Gehaeuse p={[0, 4.15, 0]} g={[L * 0.95, 1.1, W * 0.85]} farbe={k} radius={0.1} />
          <Kiste p={[0, 4.15, W * 0.43]} g={[L * 0.9, 0.2, 0.02]} farbe={f.akzent} schatten={false} />
          <Bewegt p={[0, 2.55, 0]} achse="y" weite={0.45} tempo={2} aktiv={laeuft}>
            <Gehaeuse p={[0, 0, 0]} g={[L * 0.5, 0.6, W * 0.6]} farbe={s} radius={0.06} />
            <Kiste p={[0, -0.42, 0]} g={[L * 0.38, 0.24, W * 0.45]} farbe={d} />
            <Rolle p={[0, 0.9, 0]} r={0.16} l={1.2} farbe={stahl} />
          </Bewegt>
          {[-0.2, 0.2].map((x) => <Rolle key={x} p={[L * x, 4.95, 0]} r={0.22} l={0.5} farbe={f.tank} />)}
          <Gehaeuse p={[L * 0.3, 4.95, -W * 0.2]} g={[L * 0.25, 0.5, W * 0.35]} farbe={f.blau} radius={0.05} />
          {[-1, 1].map((x) => (
            <group key={`lg${x}`} position={[x * L * 0.3, 0, W * 0.47]}>
              <Kiste p={[0, 1.2, 0]} g={[0.08, 1.5, 0.08]} farbe={s} />
              <Kiste p={[-x * 0.045, 1.2, 0]} g={[0.01, 1.3, 0.05]} farbe={d} schatten={false} />
            </group>
          ))}
        </>
      );
    }
    case 'Fördertechnik': {
      // Rollenbahn: Seitenwangen, viele Rollen, Stützen, Antrieb; Pakete laufen
      const rollen = Array.from({ length: Math.floor(L / 0.25) }, (_, i) => ({ p: [-L / 2 + 0.125 + i * 0.25, 0.86, 0], g: [0.09, W * 0.58, 0.09], r: [Math.PI / 2, 0, 0] }));
      const stuetzen = Array.from({ length: Math.floor(L / 2) + 1 }, (_, i) => [-1, 1].map((z) => ({ p: [-L / 2 + 0.2 + i * ((L - 0.4) / Math.floor(L / 2)), 0.4, z * W * 0.3], g: [0.08, 0.8, 0.08] }))).flat();
      return (
        <>
          <Viele teile={rollen} form="zyl" farbe={stahl} metall={0.5} rauheit={0.35} schatten={false} />
          <Viele teile={stuetzen} farbe={d} schatten={false} />
          {[-1, 1].map((z) => <Kiste key={z} p={[0, 0.86, z * W * 0.32]} g={[L, 0.2, 0.06]} farbe={f.blau} />)}
          <Gehaeuse p={[L * 0.3, 0.55, W * 0.4]} g={[0.5, 0.35, 0.3]} farbe={f.blau} radius={0.05} />
          <Rolle p={[L * 0.3 - 0.3, 0.55, W * 0.4]} r={0.12} l={0.3} achse="x" farbe={d} />
          <Pakete L={L * 0.92} f={f} aktiv={laeuft} hoehe={1.13} />
        </>
      );
    }
    case 'Lackieren': {
      // Lackierkabine: große Kabine, Türen mit hellen Sichtfenstern, Lüftungsaufbau, Abluftkamin mit Ventilator
      return (
        <>
          <Gehaeuse p={[0, 1.6, 0]} g={[L * 0.95, 3.2, W * 0.9]} farbe={k} radius={0.1} />
          <Kiste p={[0, 3.25, W * 0.45]} g={[L * 0.95, 0.12, 0.02]} farbe={f.akzent} schatten={false} />
          {[-1, 1].map((x) => (
            <group key={x} position={[x * L * 0.14, 0, W * 0.45 + 0.02]}>
              <Kiste p={[0, 1.3, 0]} g={[L * 0.24, 2.5, 0.05]} farbe={d} />
              <mesh position={[0, 1.75, 0.03]}>
                <planeGeometry args={[L * 0.17, 0.8]} />
                <meshStandardMaterial color="#e8f1ff" emissive="#e8f1ff" emissiveIntensity={laeuft ? 0.9 : 0.15} />
              </mesh>
            </group>
          ))}
          <Gehaeuse p={[0, 3.45, -W * 0.05]} g={[L * 0.9, 0.5, W * 0.75]} farbe={d} radius={0.05} />
          <Gehaeuse p={[L * 0.25, 4.1, -W * 0.15]} g={[L * 0.28, 0.85, W * 0.4]} farbe={k} radius={0.06} />
          <Rolle p={[-L * 0.32, 4.6, -W * 0.2]} r={0.35} l={2.2} farbe={stahl} />
          <Bewegt p={[-L * 0.32, 5.75, -W * 0.2]} art="drehen" achse="y" tempo={5} aktiv={laeuft}>
            <Kiste p={[0, 0, 0]} g={[0.65, 0.04, 0.12]} farbe={d} />
          </Bewegt>
          <Rolle p={[L * 0.05, 4.0, -W * 0.15]} r={0.22} l={L * 0.25} achse="x" farbe={stahl} />
        </>
      );
    }
    case 'Montage': {
      // Montagearbeitsplatz: Alu-Profilgestell, Arbeitsplatte, Regal mit Kleinteilebehältern, Leuchte,
      // Bildschirm, Werkstück, Federzug, Hocker
      const behaelter = [-0.3, -0.1, 0.1, 0.3].flatMap((x, i) => [0, 1].map((r) => ({
        p: [L * x, 1.42 + r * 0.32, -W * 0.27], g: [L * 0.17, 0.2, 0.3], farbe: [f.blau, f['ampel-rot'], s, f.blau][(i + r) % 4],
      })));
      const profile = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => ({ p: [a * L * 0.42, 0.45, b * W * 0.3], g: [0.06, 0.9, 0.06] }))
        .concat([-1, 1].map((a) => ({ p: [a * L * 0.42, 1.55, -W * 0.3], g: [0.06, 1.3, 0.06] })));
      return (
        <>
          <Viele teile={profile} farbe={stahl} metall={0.5} rauheit={0.35} />
          <Kiste p={[0, 0.92, 0]} g={[L * 0.9, 0.05, W * 0.66]} farbe="#c9b48f" />
          <Kiste p={[0, 1.3, -W * 0.27]} g={[L * 0.86, 0.03, 0.34]} farbe={stahl} />
          <Viele teile={behaelter} />
          <Kiste p={[0, 2.18, -W * 0.15]} g={[L * 0.8, 0.06, 0.18]} farbe={d} />
          <Kiste p={[0, 2.14, -W * 0.15]} g={[L * 0.7, 0.02, 0.12]} farbe="#ffffff" schatten={false} />
          <group position={[L * 0.3, 1.25, -W * 0.08]}>
            <Kiste p={[0, 0, 0]} g={[0.55, 0.36, 0.04]} farbe={d} />
            <mesh position={[0, 0, 0.022]}>
              <planeGeometry args={[0.5, 0.31]} />
              <meshStandardMaterial color={f.akzent} emissive={f.akzent} emissiveIntensity={laeuft ? 0.7 : 0.2} />
            </mesh>
          </group>
          <Rolle p={[-L * 0.1, 1.06, W * 0.05]} r={0.16} l={0.22} farbe={s} />
          <Kiste p={[-L * 0.1, 1.06, W * 0.05]} g={[0.45, 0.14, 0.2]} farbe={d} />
          <Kiste p={[0, 1.95, -W * 0.05]} g={[L * 0.7, 0.04, 0.04]} farbe={d} />
          <Bewegt p={[0, 1.8, -W * 0.05]} weite={L * 0.25} tempo={0.7} aktiv={laeuft}>
            <Kiste p={[0, 0, 0]} g={[0.12, 0.2, 0.12]} farbe={s} />
            <Rolle p={[0, -0.3, 0]} r={0.01} l={0.4} farbe={d} />
          </Bewegt>
          <Rolle p={[L * 0.05, 0.3, W * 0.42]} r={0.05} l={0.6} farbe={stahl} />
          <Rolle p={[L * 0.05, 0.62, W * 0.42]} r={0.2} l={0.06} farbe={d} />
        </>
      );
    }
    case 'Druckluft': {
      // Schraubenkompressor (Gehäuse mit Lüftungsgitter, Display), Kältetrockner, stehender Druckluftbehälter
      const gitter = Array.from({ length: 6 }, (_, i) => ({ p: [-L * 0.2, 0.5 + i * 0.16, W * 0.405], g: [L * 0.4, 0.05, 0.02] }));
      return (
        <>
          <Gehaeuse p={[-L * 0.2, 0.85, 0]} g={[L * 0.56, 1.7, W * 0.8]} farbe={k} radius={0.08} />
          <Viele teile={gitter} farbe={d} schatten={false} />
          <Kiste p={[-L * 0.2, 1.65, W * 0.405]} g={[L * 0.56, 0.1, 0.02]} farbe={f.akzent} schatten={false} />
          <mesh position={[-L * 0.05, 1.35, W * 0.405]}>
            <planeGeometry args={[0.22, 0.14]} />
            <meshStandardMaterial color={f.akzent} emissive={f.akzent} emissiveIntensity={laeuft ? 0.8 : 0.2} />
          </mesh>
          <Bewegt p={[-L * 0.2, 1.72, 0]} art="drehen" achse="y" tempo={8} aktiv={laeuft}>
            <Kiste p={[0, 0, 0]} g={[0.55, 0.03, 0.1]} farbe={d} />
          </Bewegt>
          <Gehaeuse p={[L * 0.12, 0.55, W * 0.1]} g={[L * 0.14, 1.1, W * 0.5]} farbe={f.blau} radius={0.05} />
          <Rolle p={[L * 0.34, 0.95, 0]} r={Math.min(0.45, W * 0.22)} l={1.5} farbe={f.tank} />
          {[0.2, 1.7].map((y) => (
            <mesh key={y} position={[L * 0.34, y, 0]} scale={[1, 0.35, 1]}>
              <sphereGeometry args={[Math.min(0.45, W * 0.22), 18, 10]} />
              <meshStandardMaterial color={f.tank} roughness={0.5} metalness={0.2} />
            </mesh>
          ))}
          <Rolle p={[L * 0.34, 1.35, Math.min(0.45, W * 0.22) + 0.03]} r={0.08} l={0.03} achse="z" farbe={f.markierung} />
          <Rolle p={[L * 0.1, 1.85, 0]} r={0.05} l={L * 0.5} achse="x" farbe={stahl} />
        </>
      );
    }
    case 'Lagertechnik': {
      // Palettenregal (Stützen blau, Traversen orange) mit Paletten und Waren; Regalbediengerät fährt auf und ab
      const felder = Math.max(2, Math.round(L / 2.7));
      const fb = L / felder;
      const ebenen = [0.05, 1.3, 2.55];
      const stuetzen = [];
      const traversen = [];
      const ware = [];
      const z0 = zufallsfolge(L * 100 + W);
      for (let i = 0; i <= felder; i += 1) [-1, 1].forEach((z) => stuetzen.push({ p: [-L / 2 + i * fb, 1.85, z * W * 0.42], g: [0.09, 3.7, 0.09] }));
      for (let i = 0; i < felder; i += 1) {
        ebenen.slice(1).forEach((y) => [-1, 1].forEach((z) => traversen.push({ p: [-L / 2 + (i + 0.5) * fb, y, z * W * 0.42], g: [fb, 0.12, 0.06] })));
        ebenen.forEach((y) => [-0.25, 0.25].forEach((dx) => {
          if (z0() < 0.25) return;
          const x = -L / 2 + (i + 0.5 + dx) * fb;
          ware.push({ p: [x, y + 0.13, 0], g: [fb * 0.42, 0.14, W * 0.75], farbe: '#b08a5e' });
          const art = z0();
          const h = 0.6 + z0() * 0.45;
          ware.push({ p: [x, y + 0.2 + h / 2, 0], g: [fb * 0.38, h, W * 0.7], farbe: art < 0.5 ? '#c8a77a' : art < 0.8 ? '#e9edf1' : f.blau });
        }));
      }
      return (
        <>
          <Viele teile={stuetzen} farbe={f.blau} />
          <Viele teile={traversen} farbe={f['ampel-orange']} schatten={false} />
          <Viele teile={ware} />
          <Bewegt p={[L * 0.05, 1.5, W * 0.5 + 0.2]} achse="y" weite={1.1} tempo={0.8} aktiv={laeuft}>
            <Kiste p={[0, 0, 0]} g={[1.2, 0.1, 0.6]} farbe={d} />
            <Kiste p={[0, 0.2, 0]} g={[1.0, 0.3, 0.5]} farbe="#c8a77a" />
          </Bewegt>
          <Kiste p={[L * 0.05, 1.85, W * 0.5 + 0.2]} g={[0.1, 3.7, 0.1]} farbe={d} />
        </>
      );
    }
    default:
      return <Gehaeuse p={[0, 0.8, 0]} g={[L * 0.9, 1.6, W * 0.9]} farbe={k} radius={0.08} />;
  }
}

/** Fester Pseudozufall (gleiche Maschine → gleiches Bild) */
function zufallsfolge(start) {
  let h = Math.floor(start) || 1;
  return () => { h = (h * 16807) % 2147483647; return (h - 1) / 2147483646; };
}

/** Schutzzaun der Roboterzelle: Gitterfelder (durchsichtig) mit gelben Pfosten, vorn offen mit Lichtschranke */
function Schutzzaun({ L, W, f }) {
  const gitter = useCanvasTextur(32, 32, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    for (let i = 0; i <= w; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  }, [Math.max(L, W) / 0.4, 2 / 0.4]);
  const pfosten = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1]].map(([x, z]) => ({ p: [x * L * 0.49, 1, z * W * 0.49], g: [0.08, 2, 0.08] }));
  const seiten = [
    { p: [0, 1, -W * 0.49], b: L * 0.98, r: 0 },
    { p: [-L * 0.49, 1, 0], b: W * 0.98, r: Math.PI / 2 },
    { p: [L * 0.49, 1, 0], b: W * 0.98, r: Math.PI / 2 },
  ];
  return (
    <>
      <Viele teile={pfosten} farbe={f.signal} />
      {seiten.map((sei, i) => (
        <mesh key={i} position={sei.p} rotation-y={sei.r}>
          <planeGeometry args={[sei.b, 1.9]} />
          <meshStandardMaterial map={gitter} color={f['maschine-dunkel']} transparent alphaTest={0.3} side={2} />
        </mesh>
      ))}
    </>
  );
}

/** Leuchtpunkt, der flackert (Schweißfunke, Laserpunkt) */
function Funke({ p, farbe, aktiv, groesse = 0.08 }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.visible = aktiv && Math.sin(clock.elapsedTime * 37) > -0.3;
    ref.current.scale.setScalar(1 + Math.abs(Math.sin(clock.elapsedTime * 23)) * 0.6);
  });
  return (
    <mesh ref={ref} position={p}>
      <sphereGeometry args={[groesse, 10, 8]} />
      <meshBasicMaterial color={farbe} />
    </mesh>
  );
}

/**
 * Zusätzliche Einzelheiten für die Detailansicht im Infofenster: Bedienpult mit Bildschirm und
 * Not-Halt, Warnstreifen, Kabelkanal und je Typ ein paar typische Teile.
 */
function Details({ typ, L, W, f, laeuft, voll }) {
  const d = f['maschine-dunkel'];
  const s = f.signal;
  const streifen = Math.max(2, Math.floor((L * 0.85) / 0.3));
  let typisch = null;
  switch (typ) {
    case 'Fräsen':        // Werkzeugmagazin an der Seite, dreht sich beim Werkzeugwechsel
      typisch = (
        <Bewegt p={[-L * 0.47, 1.6, -W * 0.05]} art="drehen" achse="x" tempo={0.6} aktiv={laeuft}>
          <Rolle p={[0, 0, 0]} r={W * 0.28} l={0.18} achse="x" farbe={k(f)} />
          {Array.from({ length: 10 }, (_, i) => (
            <Kiste key={i} p={[-0.12, Math.cos((i / 10) * Math.PI * 2) * W * 0.22, Math.sin((i / 10) * Math.PI * 2) * W * 0.22]} g={[0.18, 0.06, 0.06]} farbe={d} />
          ))}
        </Bewegt>
      );
      break;
    case 'Spritzguss':    // Werkzeughälften (blau/rot) zwischen den Platten
      typisch = (
        <>
          <Kiste p={[-L * 0.12, 1.6, 0]} g={[0.18, 0.7, W * 0.45]} farbe={f.blau} />
          <Kiste p={[-L * 0.17, 1.6, 0]} g={[0.18, 0.7, W * 0.45]} farbe={f.rot} />
        </>
      );
      break;
    case 'Laserschneiden': // roter Laserpunkt unter dem Schneidkopf
      typisch = <Funke p={[-L * 0.1, 0.97, W * 0.1]} farbe={f['ampel-rot']} aktiv={laeuft} />;
      break;
    case 'Schweißen':     // Schweißfunken am Werkstück
      typisch = <Funke p={[L * 0.2, 1.05, W * 0.05]} farbe={f['ampel-orange']} aktiv={laeuft} groesse={0.1} />;
      break;
    case 'Fördertechnik': // Lichtschranke
      typisch = (
        <>
          <Kiste p={[L * 0.3, 1.25, W * 0.36]} g={[0.06, 0.8, 0.06]} farbe={s} />
          <Kiste p={[L * 0.3, 1.25, -W * 0.36]} g={[0.06, 0.8, 0.06]} farbe={s} />
        </>
      );
      break;
    case 'Montage':       // Bildschirm am Arm, Werkzeugwand
      typisch = (
        <>
          <Kiste p={[0, 1.35, -W * 0.4]} g={[L * 0.8, 0.9, 0.04]} farbe={d} />
          {[-0.3, -0.1, 0.1, 0.3].map((x) => <Kiste key={x} p={[L * x, 1.4, -W * 0.37]} g={[0.06, 0.35, 0.03]} farbe={s} />)}
        </>
      );
      break;
    case 'Druckluft':     // Kondensatbehälter
      typisch = <Rolle p={[L * 0.05, 0.3, W * 0.35]} r={0.1} l={0.5} farbe={f.tank} />;
      break;
    default:
  }
  return (
    <>
      {/* Bedienpult mit Bildschirm und Not-Halt */}
      <group position={[L * 0.38, 0, W / 2 + 0.4]}>
        <Kiste p={[0, 0.55, 0]} g={[0.1, 1.1, 0.1]} farbe={d} />
        <Kiste p={[0, 1.25, 0]} g={[0.56, 0.4, 0.1]} farbe={d} />
        <mesh position={[-0.05, 1.27, 0.052]}>
          <planeGeometry args={[0.36, 0.26]} />
          <meshStandardMaterial color={f.akzent} emissive={f.akzent} emissiveIntensity={laeuft ? 0.9 : 0.25} />
        </mesh>
        <Rolle p={[0.2, 1.2, 0.07]} r={0.045} l={0.05} achse="z" farbe={f['ampel-rot']} />
      </group>
      {/* Warnstreifen gelb/schwarz am Sockel (nur in der Detailansicht – viele kleine Teile) */}
      {voll && Array.from({ length: streifen }, (_, i) => (
        <Kiste key={i} p={[-L * 0.425 + (i + 0.5) * ((L * 0.85) / streifen), 0.07, W * 0.44]} g={[(L * 0.85) / streifen, 0.14, 0.02]}
               farbe={i % 2 ? d : s} schatten={false} />
      ))}
      {/* Kabelkanal hinten am Boden */}
      <Kiste p={[0, 0.06, -W * 0.5 - 0.1]} g={[L * 0.9, 0.12, 0.16]} farbe={d} schatten={false} />
      {typisch}
    </>
  );
}

const k = (f) => f.maschine;

/**
 * Maschine mit Ampel an der Ecke (lokale Achsen wie MaschinenForm). Die Ampel leuchtet immer – auch beim Melden.
 * detail: "voll" (Infofenster: alle Einzelheiten) oder "mittel" (Halle: Bedienpult und typische Teile, sparsamer).
 */
export function MaschineMitAmpel({ m, L, W, f, bewegt, detail = null, ampelGroesse = 1 }) {
  const zustand = ampelZustand(m);
  const laeuft = bewegt && zustand !== 'rot';
  return (
    <>
      <MaschinenForm typ={m.typ} L={L} W={W} f={f} laeuft={laeuft} />
      {detail && <Details typ={m.typ} L={L} W={W} f={f} laeuft={laeuft} voll={detail === 'voll'} />}
      <Ampel p={[L / 2 - 0.15, 0, -W / 2 + 0.15]} zustand={zustand} f={f} groesse={ampelGroesse} />
    </>
  );
}
