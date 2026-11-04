'use client';
/**
 * components/karten/raum/Lager3D.js – Ersatzteillager als 3D-Palettenregal
 *
 * Jedes Ersatzteil hat ein Fach (4 Ebenen übereinander, so viele Felder nebeneinander wie nötig).
 * Im Fach steht eine Palette mit Kartons: je mehr Bestand im Verhältnis zum Mindestbestand,
 * desto mehr Kartons (höchstens 6). Das Schild am Träger zeigt den Zustand in Farbe:
 *   rot = unter Mindestbestand, orange = knapp (bis 1,5 × Mindestbestand), grün = ausreichend.
 * Darüberfahren zeigt Name und Bestand, Klick wählt das Teil (onWaehle) – die Seite zeigt rechts die Details.
 * Kamera wie in der Halle: nur zoomen (Mausrad / zwei Finger), nicht drehen.
 * Viele gleiche Teile (Stützen, Träger, Paletten, Kartons) als Instanzen (Viele) – wenige Zeichenaufrufe.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Viele } from './Bausteine';
import { useRaum, useSichtbar } from './farben';
import { lagerZustand } from '@/lib/lager';

const EBENEN = 4;
const B = 1.9;    // Breite eines Fachs (m)
const H = 1.3;    // Höhe einer Ebene
const T = 1.1;    // Tiefe des Regals

/**
 * Schild über dem Fach: ein normales HTML-Element über der Zeichenfläche (kein drei-Html – dessen
 * Aufräumen warf beim Wechsel des Fachs Fehler). Hier wird nur der 3D-Punkt auf den Bildschirm
 * umgerechnet und das Element per transform verschoben – bei jedem gezeichneten Bild.
 */
const punkt = new THREE.Vector3();
function SchildLage({ refs, punkte }) {
  const { camera, size, invalidate } = useThree();
  // Neues Schild (Darüberfahren/Auswahl): ein Bild zeichnen, damit es sofort an die richtige Stelle rückt
  useEffect(() => { invalidate(); }, [punkte, invalidate]);
  useFrame(() => {
    for (const [i, p] of punkte.entries()) {
      const el = refs.current[i];
      if (!el) continue;
      punkt.set(...p).project(camera);
      el.style.transform = `translate(-50%, -100%) translate(${((punkt.x + 1) / 2) * size.width}px, ${((1 - punkt.y) / 2) * size.height}px)`;
    }
  });
  return null;
}

/** Kamera so weit weg, dass das ganze Regal ins Bild passt (Breite und Höhe) */
function Kamera({ breite, hoehe }) {
  const { camera, size } = useThree();
  useMemo(() => {
    const fov = (camera.fov * Math.PI) / 180;
    const seitenverhaeltnis = size.width / Math.max(1, size.height);
    const abstandH = (hoehe / 2 + 0.8) / Math.tan(fov / 2);
    const abstandB = (breite / 2 + 0.8) / (Math.tan(fov / 2) * seitenverhaeltnis);
    const d = Math.max(abstandH, abstandB) * 1.05;
    camera.position.set(breite * 0.08, hoehe * 0.55 + d * 0.18, d);
    camera.lookAt(0, hoehe * 0.45, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, breite, hoehe]);
  return null;
}

export default function Lager3D({ teile, gewaehlt, onWaehle }) {
  const { f } = useRaum();
  const rahmen = useRef(null);
  const sichtbar = useSichtbar(rahmen);
  const [ueber, setUeber] = useState(null);
  const felder = Math.max(1, Math.ceil(teile.length / EBENEN));
  const breite = felder * B;
  const hoehe = EBENEN * H + 0.3;

  // Lage jedes Fachs: Teil i → Feld (links → rechts), Ebene (unten → oben)
  const faecher = useMemo(() => teile.map((teil, i) => {
    const feld = Math.floor(i / EBENEN);
    const ebene = i % EBENEN;
    return { teil, x: -breite / 2 + B / 2 + feld * B, y: ebene * H + 0.16, zustand: lagerZustand(teil) };
  }), [teile, breite]);

  // Gestell: Stützen vorn und hinten an jeder Feldgrenze, Träger je Ebene vorn und hinten
  const gestell = useMemo(() => {
    const stuetzen = [];
    const traeger = [];
    for (let k = 0; k <= felder; k += 1) {
      const x = -breite / 2 + k * B;
      for (const z of [-T / 2, T / 2]) stuetzen.push({ p: [x, hoehe / 2, z], g: [0.09, hoehe, 0.09] });
    }
    for (let feld = 0; feld < felder; feld += 1) {
      const x = -breite / 2 + B / 2 + feld * B;
      for (let e = 0; e < EBENEN; e += 1) {
        for (const z of [-T / 2, T / 2]) traeger.push({ p: [x, e * H + 0.08, z], g: [B - 0.09, 0.14, 0.06] });
      }
    }
    return { stuetzen, traeger };
  }, [felder, breite, hoehe]);

  // Paletten und Kartons (Anzahl nach Bestand), Schilder in Zustandsfarbe
  const inhalt = useMemo(() => {
    const paletten = [];
    const kartons = [];
    const schilder = [];
    const farbe = { rot: f.rot, orange: f.orange, gruen: f.gruen };
    for (const fach of faecher) {
      const { teil, x, y } = fach;
      paletten.push({ p: [x, y + 0.07, 0], g: [1.2, 0.14, 0.95] });
      const verhaeltnis = teil.bestand / Math.max(1, teil.mindestbestand);
      const anzahl = teil.bestand === 0 ? 0 : Math.max(1, Math.min(6, Math.round(verhaeltnis * 2)));
      for (let k = 0; k < anzahl; k += 1) {
        const spalte = k % 3;
        const lage = Math.floor(k / 3);
        // leichte Versätze: wirkt wie echte, nicht ganz genau gestapelte Kartons
        const versatz = ((teil.id * 7 + k * 3) % 5) * 0.012 - 0.024;
        kartons.push({ p: [x + (spalte - 1) * 0.4 + versatz, y + 0.14 + 0.17 + lage * 0.34, versatz], g: [0.37, 0.33, 0.85] });
      }
      schilder.push({ p: [x, y - 0.08, T / 2 + 0.035], g: [0.5, 0.11, 0.01], farbe: farbe[fach.zustand] });
    }
    return { paletten, kartons, schilder };
  }, [faecher, f]);

  const gewaehltesFach = faecher.find((x) => x.teil.id === gewaehlt);
  const ueberFach = faecher.find((x) => x.teil.id === ueber);
  const schilder = [ueberFach, gewaehltesFach].filter((x, i, l) => x && l.indexOf(x) === i);
  const schildRefs = useRef([]);

  return (
    <div className="lager-3d" ref={rahmen} data-faecher={faecher.length}>
      <Canvas shadows dpr={[1, 1.5]} frameloop={sichtbar ? 'demand' : 'never'} camera={{ fov: 35, near: 0.1, far: 200 }}
              resize={{ offsetSize: true }} gl={{ antialias: true, alpha: true }}
              onCreated={({ gl }) => { gl.debug.checkShaderErrors = false; }}
              onPointerMissed={() => setUeber(null)}>
        <Kamera breite={breite} hoehe={hoehe} />
        <hemisphereLight args={['#ffffff', f.hallenboden, f.dunkel ? 0.85 : 1.05]} />
        <directionalLight position={[breite * 0.3, hoehe * 2.2, 8]} intensity={f.dunkel ? 1.2 : 1.55} castShadow
                          shadow-mapSize={[1024, 1024]} shadow-camera-left={-breite} shadow-camera-right={breite}
                          shadow-camera-top={hoehe * 2} shadow-camera-bottom={-2} />
        {/* Hallenboden mit gelber Linie vor dem Regal (Gehweg) */}
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[breite + 12, 14]} />
          <meshStandardMaterial color={f.hallenboden} roughness={1} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, T / 2 + 1.1]}>
          <planeGeometry args={[breite + 2, 0.12]} />
          <meshStandardMaterial color="#e3b505" roughness={0.9} />
        </mesh>

        <Viele teile={gestell.stuetzen} farbe={f['regal-stuetze']} metall={0.3} rauheit={0.5} />
        <Viele teile={gestell.traeger} farbe={f['regal-traeger']} metall={0.2} rauheit={0.5} />
        <Viele teile={inhalt.paletten} farbe={f.palette} rauheit={0.95} />
        <Viele teile={inhalt.kartons} farbe={f.karton} rauheit={0.9} />
        <Viele teile={inhalt.schilder} schatten={false} rauheit={0.4} />

        {/* Unsichtbare Klickflächen je Fach */}
        {faecher.map(({ teil, x, y }) => (
          <mesh key={teil.id} position={[x, y + H / 2 - 0.1, 0]}
                onPointerOver={(e) => { e.stopPropagation(); setUeber(teil.id); document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { setUeber((u) => (u === teil.id ? null : u)); document.body.style.cursor = ''; }}
                onClick={(e) => { e.stopPropagation(); onWaehle?.(teil.id); }}>
            <boxGeometry args={[B - 0.12, H - 0.15, T]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}

        {/* Rahmen um das gewählte Fach */}
        {gewaehltesFach && (
          <lineSegments position={[gewaehltesFach.x, gewaehltesFach.y + H / 2 - 0.1, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(B - 0.1, H - 0.12, T + 0.04)]} />
            <lineBasicMaterial color={f.akzent} linewidth={2} />
          </lineSegments>
        )}
        {/* Leichter Schimmer im gewählten Fach – die Linie allein ist bei 1 px kaum zu sehen */}
        {gewaehltesFach && (
          <mesh position={[gewaehltesFach.x, gewaehltesFach.y + H / 2 - 0.1, 0]}>
            <boxGeometry args={[B - 0.14, H - 0.16, T + 0.02]} />
            <meshBasicMaterial color={f.akzent} transparent opacity={0.18} depthWrite={false} />
          </mesh>
        )}

        <SchildLage refs={schildRefs} punkte={schilder.map((fach) => [fach.x, fach.y + H - 0.15, T / 2])} />

        <OrbitControls enableRotate={false} enablePan={false} zoomToCursor minDistance={3} maxDistance={40} target={[0, hoehe * 0.45, 0]} />
      </Canvas>
      {/* Name beim Darüberfahren bzw. beim gewählten Teil (Lage setzt SchildLage) */}
      {schilder.map((fach, i) => (
        <div key={fach.teil.id} ref={(el) => { schildRefs.current[i] = el; }} className={`lager-marke zustand-${fach.zustand}`} aria-hidden="true">
          <strong>{fach.teil.bezeichnung}</strong>
          <span>{fach.teil.bestand} / {fach.teil.mindestbestand}</span>
        </div>
      ))}
    </div>
  );
}
