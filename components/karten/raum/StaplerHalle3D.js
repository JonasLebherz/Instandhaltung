'use client';
/**
 * components/karten/raum/StaplerHalle3D.js – 3D-Halle des Gabelstapler-Spiels (/spiel)
 *
 * Zeichnet die Halle (Boden, Gang, Wände, Lagerregal mit den Ersatzteilen, sechs Maschinen mit Ampel)
 * und fährt den Gabelstapler. Die Spiel-Regeln (Punkte, Zeit, Aufgaben) stehen in
 * app/spiel/GabelstaplerSpiel.js, der Hallenplan in lib/staplerSpiel.js.
 *
 * Ablauf je Bild (useFrame in Fahren):
 *   1. Tasten lesen (eingabe.current: vor, zurueck, links, rechts) → Geschwindigkeit und Lenkung
 *   2. neue Lage berechnen; stößt der Stapler an (Wand, Maschine, Regal, Paletten), bleibt er stehen
 *      und federt leicht zurück – bei Tempo meldet er einen Rempler (onEreignis('rempler'))
 *   3. Gabelspitze in einem Abholplatz → onEreignis('abholen', teil);
 *      in einem Übergabeplatz → onEreignis('abgeben', maschine)
 *   4. Kamera folgt weich von hinten oben, Pfeil über dem Stapler zeigt zum Ziel
 * Zahlen für die Anzeige (Restzeit, gefahrene Meter) meldet onStand etwa zehnmal pro Sekunde.
 * Die Teile sind dieselben 3D-Modelle wie im Lager (modellFuer aus LagerRegal3D.js).
 * Hinweis: refs werden je Zeichnen neu angelegt, die useRef-Inhalte bleiben aber erhalten.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MaschineMitAmpel } from './Maschine3D';
import { Gehaeuse, Viele, canvasTextur } from './Bausteine';
import { useRaum } from './farben';
import { modellFuer } from './LagerRegal3D';
import { ABHOL_X, HALLE, HINDERNISSE, MASCHINEN, PALETTEN, REGAL, START, TEILE, zielFuer } from '@/lib/staplerSpiel';

// Fahrverhalten
const V_VOR = 7;          // m/s vorwärts
const V_RUECK = 3.5;      // m/s rückwärts
const BESCHLEUNIGUNG = 5;
const BREMSE = 12;
const ROLLEN = 4;         // Abbremsen ohne Gas
const LENKUNG = 1.9;      // rad/s bei voller Fahrt
// Zusammenstoß: Stapler als zwei Kreise (Rumpf und Gabel), lokale x-Achse = vorwärts
const KREISE = [{ x: -0.15, r: 1.0 }, { x: 1.75, r: 0.55 }];
const GABELSPITZE = 2.0;
const ABHOL_RADIUS = 1.9;
const UEBERGABE_RADIUS = 2.1;

/** Liegt ein Kreis (Mitte x/z, Radius r) in einem Hindernis oder außerhalb der Halle? */
function stoesst(x, z, r) {
  if (x - r < HALLE.x0 || x + r > HALLE.x1 || z - r < HALLE.z0 || z + r > HALLE.z1) return true;
  return HINDERNISSE.some((h) => {
    const nx = Math.max(h.x0, Math.min(x, h.x1));
    const nz = Math.max(h.z0, Math.min(z, h.z1));
    return (x - nx) ** 2 + (z - nz) ** 2 < r * r;
  });
}
/** Punkt auf der lokalen x-Achse des Staplers in Weltkoordinaten (vorwärts = (cos h, −sin h)) */
const vorne = (s, abstand) => [s.x + Math.cos(s.h) * abstand, s.z - Math.sin(s.h) * abstand];

/** Schild als Canvas-Textur (keine Schriftdateien): Fachnummer und Teilename */
function schildTextur(fach, name) {
  return canvasTextur(512, 160, (g, w, h) => {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e0782a'; g.fillRect(0, 0, 18, h);
    g.fillStyle = '#1d1d1f';
    g.font = 'bold 54px system-ui, sans-serif'; g.fillText(`Fach ${fach}`, 40, 64);
    g.font = '600 40px system-ui, sans-serif';
    const kurz = name.length > 22 ? `${name.slice(0, 21)}…` : name;
    g.fillText(kurz, 40, 126);
  });
}

/** Lagerregal an der linken Wand: ein Fach je Teil, das Teil groß auf dem Boden des Fachs, Schild darüber */
function Lagerregal({ f }) {
  const schilder = useMemo(() => TEILE.map((t) => schildTextur(t.fach, t.name)), []);
  useEffect(() => () => schilder.forEach((s) => s.dispose()), [schilder]);
  const mitte = (REGAL.x0 + REGAL.x1) / 2;
  const tiefe = REGAL.x1 - REGAL.x0;
  const gestell = useMemo(() => {
    const pfosten = [];
    const boeden = [];
    for (let i = 0; i <= TEILE.length; i += 1) {
      const z = TEILE[0].z - 1.75 + i * 3.5;
      for (const x of [REGAL.x0 + 0.05, REGAL.x1 - 0.05]) pfosten.push({ p: [x, 1.6, z], g: [0.1, 3.2, 0.1] });
    }
    for (const y of [0.12, 1.55, 3.0]) {
      boeden.push({ p: [mitte, y, 0], g: [tiefe, 0.08, REGAL.z1 - REGAL.z0] });
    }
    return { pfosten, boeden };
  }, [mitte, tiefe]);
  return (
    <group>
      <Viele teile={gestell.pfosten} farbe={f['regal-stuetze']} metall={0.3} rauheit={0.5} />
      <Viele teile={gestell.boeden} farbe={f['regal-traeger']} metall={0.2} rauheit={0.5} />
      {TEILE.map((t, i) => {
        const { Modell } = modellFuer(t.name);
        return (
          <group key={t.id}>
            {/* das Teil, 4,5-fach vergrößert, Vorderseite zum Gang (+x) */}
            <group position={[mitte + 0.1, 0.16, t.z]} rotation-y={Math.PI / 2} scale={4.5}><Modell /></group>
            <mesh position={[REGAL.x1 + 0.02, 2.2, t.z]} rotation-y={Math.PI / 2}>
              <planeGeometry args={[2.6, 0.81]} />
              <meshBasicMaterial map={schilder[i]} toneMapped={false} />
            </mesh>
            {/* Abholplatz auf dem Boden */}
            <mesh position={[ABHOL_X, 0.012, t.z]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[1.25, 1.42, 40]} />
              <meshBasicMaterial color={f['regal-traeger']} transparent opacity={0.8} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Der steuerbare Gabelstapler (Form wie in der Halle der Störungskarte, vorwärts = +x) */
function Stapler({ f, refs, geladen }) {
  const Teil = geladen !== null && geladen !== undefined ? modellFuer(TEILE[geladen].name).Modell : null;
  const dunkel = f['maschine-dunkel'];
  return (
    <group ref={refs.koerper}>
      <Gehaeuse p={[0, 0.72, 0]} g={[1.8, 0.95, 1.1]} farbe={f.signal} radius={0.14} rauheit={0.45} />
      <Gehaeuse p={[-1.0, 0.78, 0]} g={[0.45, 0.95, 1.12]} farbe={dunkel} radius={0.14} />
      <mesh position={[-0.25, 1.45, 0]} castShadow>
        <boxGeometry args={[0.45, 0.5, 0.45]} />
        <meshStandardMaterial color="#22262c" roughness={0.8} />
      </mesh>
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
      {/* Räder: drehen sich mit der gefahrenen Strecke */}
      {[[0.55, 0.58], [0.55, -0.58], [-0.75, 0.58], [-0.75, -0.58]].map(([x, z], i) => (
        <mesh key={i} ref={(el) => { refs.raeder.current[i] = el; }} position={[x, 0.3, z]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.3, 0.3, 0.22, 16]} />
          <meshStandardMaterial color="#202226" roughness={0.9} />
        </mesh>
      ))}
      {[0.32, -0.32].map((z) => (
        <mesh key={z} position={[1.02, 1.3, z]}>
          <boxGeometry args={[0.1, 2.5, 0.1]} />
          <meshStandardMaterial color="#5b6069" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      <group ref={refs.gabel} position={[0, 0.12, 0]}>
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
        {/* geladenes Teil auf einer kleinen Palette (dasselbe 3D-Modell wie im Lager) */}
        {Teil && (
          <group key={geladen}>
            <mesh position={[1.7, 0.12, 0]} castShadow>
              <boxGeometry args={[1.0, 0.12, 0.9]} />
              <meshStandardMaterial color={f.stamm} roughness={0.9} />
            </mesh>
            <group position={[1.7, 0.18, 0]} rotation-y={Math.PI / 2} scale={3.2}><Teil /></group>
          </group>
        )}
      </group>
    </group>
  );
}

/** Ziel-Markierung: leuchtender Ring mit Lichtsäule; pulsiert */
function Ziel({ ziel, farbe }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
    ref.current.scale.set(s, 1, s);
  });
  if (!ziel) return null;
  return (
    <group ref={ref} position={[ziel.x, 0, ziel.z]}>
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.45, 1.85, 48]} />
        <meshBasicMaterial color={farbe} transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 5, 32, 1, true]} />
        <meshBasicMaterial color={farbe} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

const kameraZiel = new THREE.Vector3();

/** Spiellogik je Bild: Fahren, Zusammenstöße, Plätze, Kamera, Richtungspfeil */
function Fahren({ laeuft, eingabe, onEreignis, onStand, aufgabe, geladen, ziel, refs, neustart }) {
  const { camera } = useThree();
  const s = useRef({ ...START, h: START.richtung, v: 0, weg: 0, zeit: 0, gemeldet: 0, imPlatz: null, letzterRempler: 0 });
  const pfeil = refs.pfeil;
  // Werte aus den Props für die Bild-Schleife (ohne sie neu anzulegen)
  const aktuell = useRef({});
  aktuell.current = { laeuft, aufgabe, geladen, ziel, onEreignis, onStand };

  // Neue Runde: zurück zum Start
  useEffect(() => {
    s.current = { ...START, h: START.richtung, v: 0, weg: 0, zeit: 0, gemeldet: 0, imPlatz: null, letzterRempler: 0 };
    camera.position.set(START.x + 9, 7, START.z);
    camera.lookAt(START.x - 3, 0.8, START.z);
  }, [neustart, camera]);

  useFrame((_, roh) => {
    const dt = Math.min(roh, 0.05);   // nach einem Hänger nicht durch Wände springen
    const st = s.current;
    const a = aktuell.current;
    const k = eingabe.current;
    if (a.laeuft) {
      st.zeit += dt;
      // 1. Gas, Bremse, Lenkung
      const gas = (k.vor ? 1 : 0) - (k.zurueck ? 1 : 0);
      if (gas > 0) st.v = Math.min(V_VOR, st.v + (st.v < 0 ? BREMSE : BESCHLEUNIGUNG) * dt);
      else if (gas < 0) st.v = Math.max(-V_RUECK, st.v - (st.v > 0 ? BREMSE : BESCHLEUNIGUNG) * dt);
      else st.v -= Math.sign(st.v) * Math.min(Math.abs(st.v), ROLLEN * dt);
      const lenk = (k.links ? 1 : 0) - (k.rechts ? 1 : 0);
      const h = st.h + lenk * LENKUNG * Math.max(-1, Math.min(1, st.v / 3)) * dt;
      // 2. neue Lage prüfen
      const x = st.x + Math.cos(h) * st.v * dt;
      const z = st.z - Math.sin(h) * st.v * dt;
      const kollision = KREISE.some((kr) => stoesst(x + Math.cos(h) * kr.x, z - Math.sin(h) * kr.x, kr.r));
      if (kollision) {
        if (Math.abs(st.v) > 2.5 && st.zeit - st.letzterRempler > 0.8) { st.letzterRempler = st.zeit; a.onEreignis('rempler'); }
        st.v *= -0.25;
        // Drehen im Stand bleibt möglich, solange die neue Richtung frei ist
        if (!KREISE.some((kr) => stoesst(st.x + Math.cos(h) * kr.x, st.z - Math.sin(h) * kr.x, kr.r))) st.h = h;
      } else {
        st.weg += Math.hypot(x - st.x, z - st.z);
        st.x = x; st.z = z; st.h = h;
      }
      // 3. Abhol- und Übergabeplätze (nur beim Hineinfahren melden)
      const [gx, gz] = vorne(st, GABELSPITZE);
      let platz = null;
      const teil = TEILE.find((t) => (gx - ABHOL_X) ** 2 + (gz - t.z) ** 2 < ABHOL_RADIUS ** 2);
      if (teil) platz = `t${teil.id}`;
      const maschine = MASCHINEN.find((m) => (gx - m.uebergabe.x) ** 2 + (gz - m.uebergabe.z) ** 2 < UEBERGABE_RADIUS ** 2);
      if (maschine) platz = `m${maschine.id}`;
      if (platz !== st.imPlatz) {
        st.imPlatz = platz;
        if (teil) a.onEreignis('abholen', teil.id);
        if (maschine) a.onEreignis('abgeben', maschine.id);
      }
      if (st.zeit - st.gemeldet > 0.1) { st.gemeldet = st.zeit; a.onStand({ zeit: st.zeit, weg: st.weg, x: st.x, z: st.z, h: st.h }); }
    }

    // 4. Stapler, Räder, Gabel, Kamera und Pfeil bewegen
    const kp = refs.koerper.current;
    if (kp) { kp.position.set(st.x, 0, st.z); kp.rotation.y = st.h; }
    refs.raeder.current.forEach((r) => { if (r) r.rotation.y = -st.weg / 0.3; });
    if (refs.gabel.current) refs.gabel.current.position.y += ((a.geladen !== null ? 0.45 : 0.12) - refs.gabel.current.position.y) * Math.min(1, dt * 6);
    const fx = Math.cos(st.h);
    const fz = -Math.sin(st.h);
    const weich = 1 - Math.exp(-3.5 * dt);
    camera.position.lerp(kameraZiel.set(st.x - fx * 8.5, 6.8, st.z - fz * 8.5), weich);
    camera.lookAt(st.x + fx * 3, 0.8, st.z + fz * 3);
    if (pfeil.current) {
      pfeil.current.visible = Boolean(a.ziel) && a.laeuft;
      pfeil.current.position.set(st.x, 3.3 + Math.sin(st.zeit * 3) * 0.08, st.z);
      if (a.ziel) pfeil.current.rotation.y = Math.atan2(-(a.ziel.z - st.z), a.ziel.x - st.x);
    }
  });
  return null;
}

/** Richtungspfeil über dem Stapler (zeigt zum aktuellen Ziel) */
function Pfeil({ farbe, refPfeil }) {
  return (
    <group ref={refPfeil} visible={false}>
      <mesh position={[0.45, 0, 0]} rotation-z={-Math.PI / 2}>
        <coneGeometry args={[0.32, 0.7, 16]} />
        <meshBasicMaterial color={farbe} toneMapped={false} />
      </mesh>
      <mesh rotation-z={-Math.PI / 2}>
        <cylinderGeometry args={[0.11, 0.11, 0.6, 12]} />
        <meshBasicMaterial color={farbe} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Boden mit Gang-Markierung, niedrige Wände, Paletten */
function Hallenboden({ f }) {
  const linien = useMemo(() => {
    const l = [];
    // Gangränder vor den Maschinen
    for (const z of [-6.1, 6.1]) l.push({ p: [2, 0.008, z], g: [32, 0.01, 0.12] });
    // Übergabeplätze: gelbe Rahmen vor jeder Maschine
    MASCHINEN.forEach((m) => {
      const { x, z } = m.uebergabe;
      l.push({ p: [x, 0.009, z - 1.4], g: [3, 0.01, 0.12] }, { p: [x, 0.009, z + 1.4], g: [3, 0.01, 0.12] });
      l.push({ p: [x - 1.5, 0.009, z], g: [0.12, 0.01, 2.9] }, { p: [x + 1.5, 0.009, z], g: [0.12, 0.01, 2.9] });
    });
    return l;
  }, []);
  const breite = HALLE.x1 - HALLE.x0;
  const tiefe = HALLE.z1 - HALLE.z0;
  const waende = [
    { p: [0, 1, HALLE.z0 - 0.15], g: [breite + 0.6, 2, 0.3] }, { p: [0, 1, HALLE.z1 + 0.15], g: [breite + 0.6, 2, 0.3] },
    { p: [HALLE.x0 - 0.15, 1, 0], g: [0.3, 2, tiefe] }, { p: [HALLE.x1 + 0.15, 1, 0], g: [0.3, 2, tiefe] },
  ];
  const paletten = PALETTEN.map(([x, z]) => ({ p: [x, 0.55, z], g: [1.3, 1.1, 1.1] }));
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[breite + 30, tiefe + 30]} />
        <meshStandardMaterial color={f.hallenboden} roughness={0.95} />
      </mesh>
      <Viele teile={linien} farbe="#e3b505" schatten={false} rauheit={0.9} />
      <Viele teile={waende} farbe={f.wand} rauheit={0.9} />
      <Viele teile={paletten} farbe={f.stamm} rauheit={0.95} />
    </>
  );
}

/**
 * Props:
 *   laeuft      – Runde läuft (sonst steht der Stapler, Kamera bleibt)
 *   neustart    – Zähler: ändert er sich, beginnt eine neue Runde am Start
 *   eingabe     – Ref mit { vor, zurueck, links, rechts } (Tasten bzw. Knöpfe auf dem Handy)
 *   aufgabe     – { maschine, teil } (welche Maschine steht und welches Teil sie braucht)
 *   geladen     – Nummer des Teils auf der Gabel oder null
 *   onEreignis  – ('abholen', teil) | ('abgeben', maschine) | ('rempler')
 *   onStand     – ({ zeit, weg, x, z, h }) etwa zehnmal pro Sekunde
 */
export default function StaplerHalle3D({ laeuft, neustart, eingabe, aufgabe, geladen, onEreignis, onStand }) {
  const { f } = useRaum();
  const refs = { koerper: useRef(null), gabel: useRef(null), raeder: useRef([]), pfeil: useRef(null) };
  // Ziel: erst das Fach des gesuchten Teils, mit dem richtigen Teil auf der Gabel die Maschine
  const ziel = zielFuer(aufgabe, geladen);
  const maschinen = useMemo(() => MASCHINEN.map((m) => ({
    ...m, offen: aufgabe?.maschine === m.id ? 1 : 0, hoechste_prioritaet: aufgabe?.maschine === m.id ? 'hoch' : null,
  })), [aufgabe]);

  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 50, near: 0.1, far: 200, position: [START.x + 9, 7, START.z] }}
            gl={{ antialias: true }} onCreated={({ gl }) => { gl.debug.checkShaderErrors = false; }}>
      <color attach="background" args={[f.umgebung]} />
      <hemisphereLight args={['#ffffff', f.hallenboden, f.dunkel ? 0.75 : 0.95]} />
      <directionalLight position={[-8, 18, 10]} intensity={f.dunkel ? 1.3 : 1.7} castShadow shadow-mapSize={[2048, 2048]}
                        shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={18} shadow-camera-bottom={-18} shadow-bias={-0.0004} />
      <Hallenboden f={f} />
      <Lagerregal f={f} />
      {maschinen.map((m) => (
        <group key={m.id} position={[m.x, 0, m.z]} rotation-y={m.drehung}>
          <MaschineMitAmpel m={m} L={m.L} W={m.W} f={f} bewegt detail="mittel" ampelGroesse={1.6} />
        </group>
      ))}
      <Stapler f={f} refs={refs} geladen={geladen} />
      <Ziel ziel={laeuft ? ziel : null} farbe={geladen === aufgabe?.teil ? f.gruen : f['regal-traeger']} />
      <Pfeil farbe={geladen === aufgabe?.teil ? f.gruen : f['regal-traeger']} refPfeil={refs.pfeil} />
      <Fahren laeuft={laeuft} neustart={neustart} eingabe={eingabe} aufgabe={aufgabe} geladen={geladen} ziel={ziel}
              onEreignis={onEreignis} onStand={onStand} refs={refs} />
    </Canvas>
  );
}
