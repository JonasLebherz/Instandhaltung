'use client';
/**
 * components/karten/raum/Werk3D.js – 3D-Ansicht eines Werks und seiner Hallen
 *
 * Wird von der Zoom-Karte (KartenExplorer.js) nur im Browser geladen (next/dynamic,
 * ssr: false) – die 3D-Bibliotheken (three, @react-three/fiber, @react-three/drei)
 * kommen also nur auf der Störungskarte und nur in der 3D-Ansicht dazu.
 *
 *  - Werk: Gelände als Modellplatte, Straßen, Parkplatz, Bürogebäude, Tanks, Bäume
 *    (Aufbau aus lib/karten/werkGestaltung.js, gleich wie im 2D-Lageplan). Hallen als
 *    Quader in Echtmaßen mit Dach je Werk (flach, Sattel- oder Sheddach).
 *  - Klick auf eine Halle: Die Kamera fliegt hinein, Dach verschwindet, Wände werden
 *    durchsichtig. Innen: Bereiche als Bodenmarkierung, Regale, Maschinen als
 *    einfache Formen je Typ (Maschine3D.js), Störungen als farbiger Boden + Zahl.
 *  - Figuren laufen die Werksstraßen bzw. den Gang in der Halle entlang.
 *  - Maus/Finger: drehen, zoomen, verschieben. Farben aus CSS-Variablen (--raum-*),
 *    neu eingelesen beim Umschalten hell/dunkel ("darstellungswechsel").
 *  - Jede Maschine hat eine Signalampel (grün läuft, orange Störung, rot Stillstand).
 *  - Dunkelmodus = Nacht: Straßenlaternen, Fenster und Hallenlampen leuchten (mit Lichtkegeln).
 *  - neutral (Störung melden): keine Störungszahlen und -farben, Ampeln aus.
 *  - Bei "Bewegung reduzieren" laufen keine Figuren und die Kamera springt statt zu fliegen.
 * Beschriftungen (Hallen, Störungszahlen) sind echte Knöpfe (HTML) – bedienbar mit
 * Tastatur und Screenreader.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { werkGestaltung, zufall } from '@/lib/karten/werkGestaltung';
import { stufe, offenText } from '../stufe';
import { useT } from '@/components/SpracheKontext';
import { MaschineMitAmpel } from './Maschine3D';
import { useRaum, useSichtbar } from './farben';
import Landesdeko, { LAND_STIL, mitLandStil, Baum3D, Buero3D } from './Landesdeko';
import Figur from './Figur';
import Minispiel from './Minispiel';
import { Auto, Lkw, ParkendeAutos, Gabelstapler, AUTO_FARBEN } from './Fahrzeuge';
import { Viele, canvasTextur, grasTextur } from './Bausteine';

/** Farbe einer Störungsstufe */
const stufenFarbe = (f, offen, prio, neutral = false) => (neutral ? f.linie : ({ rot: f.rot, orange: f.orange, blau: f.blau, ruhig: f.gruen })[stufe(offen, prio)]);

// Für durchsichtige Wände: keine Treffer beim Klicken (sonst kommt man nicht an die Maschinen)
const KEIN_STRAHL = () => null;
const easing = (x) => (x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2);

/* ---------------------------------------------------------------------------
 * Kamera: fliegt zum Ziel (Werk oder Halle); Ziehen mit der Maus bricht den Flug ab
 * ------------------------------------------------------------------------- */
function Kamera({ ziel, bewegt, steuerung }) {
  const { camera, invalidate } = useThree();
  const zustand = useRef({ schluessel: null, flug: null, abbruch: null });
  useEffect(() => { invalidate(); }, [ziel.schluessel, invalidate]);

  // Pro Bild: neues Ziel übernehmen (beim ersten Mal springen, danach fliegen)
  useFrame((_, dt) => {
    const steuer = steuerung.current;
    if (!steuer) return;
    const z = zustand.current;
    if (!z.abbruch) {
      z.abbruch = () => { z.flug = null; };
      steuer.addEventListener('start', z.abbruch);
    }
    if (z.schluessel !== ziel.schluessel) {
      const nachPos = new THREE.Vector3(...ziel.position);
      const nachZiel = new THREE.Vector3(...ziel.target);
      if (z.schluessel === null || !bewegt) {
        camera.position.copy(nachPos);
        steuer.target.copy(nachZiel);
        steuer.update();
        z.flug = null;
      } else {
        z.flug = { t: 0, vonPos: camera.position.clone(), vonZiel: steuer.target.clone(), nachPos, nachZiel };
      }
      z.schluessel = ziel.schluessel;
      invalidate();
    }
    const f = z.flug;
    if (!f) return;
    f.t = Math.min(1, f.t + dt / 1.1);
    const e = easing(f.t);
    camera.position.lerpVectors(f.vonPos, f.nachPos, e);
    steuer.target.lerpVectors(f.vonZiel, f.nachZiel, e);
    steuer.update();
    if (f.t >= 1) z.flug = null; else invalidate();
  });
  return null;
}

/* ---------------------------------------------------------------------------
 * Kleine Bausteine
 * ------------------------------------------------------------------------- */
function Quader({ p, g, farbe, schatten = true, leuchten = 0, lichtFarbe = null, deckkraft = 1, map = null, ...rest }) {
  const glas = deckkraft < 1;
  return (
    <mesh position={p} castShadow={schatten && !glas} receiveShadow {...rest}>
      <boxGeometry args={g} />
      <meshStandardMaterial key={glas ? 'glas' : 'voll'} color={farbe} map={map} roughness={0.85} emissive={lichtFarbe ?? farbe} emissiveIntensity={leuchten}
                            transparent={glas} opacity={deckkraft} depthWrite={!glas} />
    </mesh>
  );
}

/** Wandverkleidung aus Trapezblech: senkrechte Rippen, alle 6,6 m eine Stütze (Feld = 192 px) */
const WANDFELD = 6.6;
function rippenTextur() {
  return canvasTextur(192, 4, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 192, 4);
    for (let x = 0; x < 192; x += 32) { g.fillStyle = '#d4d6da'; g.fillRect(x, 0, 5, 4); g.fillStyle = '#ebedf0'; g.fillRect(x + 5, 0, 3, 4); }
    g.fillStyle = '#b4b8be'; g.fillRect(0, 0, 9, 4);
  });
}

/** Fensterband: Rahmen (hell) und Scheiben mit Spiegelung, 1 Feld = 1,6 m */
const fensterTextur = () => canvasTextur(64, 32, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  const verlauf = g.createLinearGradient(0, 0, w, h);
  verlauf.addColorStop(0, '#6f7a86'); verlauf.addColorStop(0.45, '#a9b4c0'); verlauf.addColorStop(0.55, '#8995a2'); verlauf.addColorStop(1, '#5f6a76');
  g.fillStyle = verlauf; g.fillRect(4, 4, w - 8, h - 8);
  g.fillStyle = '#ffffff'; g.fillRect(w / 2 - 1.5, 4, 3, h - 8);
});

/** Hallenboden: Beton mit leichter Struktur und Fugen (1 Feld = 6 m) */
const bodenTextur = () => canvasTextur(128, 128, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  let z = 7;
  for (let i = 0; i < 900; i += 1) {
    z = (z * 16807) % 2147483647;
    g.fillStyle = `rgba(120,125,135,${0.04 + (z % 7) / 120})`;
    g.fillRect(z % w, Math.floor(z / w) % h, 2, 2);
  }
  g.fillStyle = '#c3c8cf'; g.fillRect(0, 0, w, 1.5); g.fillRect(0, 0, 1.5, h);
});

/** Solarmodule: dunkelblaue Zellen mit hellem Raster (1 Feld = 1 × 1,7 m) */
const solarTextur = () => canvasTextur(32, 54, (g, w, h) => {
  g.fillStyle = '#c9d2dc'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1f3558'; g.fillRect(1, 1, w - 2, h - 2);
  g.fillStyle = '#2b4a78'; g.fillRect(1, 1, w - 2, 10);
});

/** Zaun: Pfosten, Ober- und Unterholm, Maschendraht (durchsichtig, alphaTest) – 1 Feld = 2,5 m */
const zaunTextur = () => canvasTextur(64, 56, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
  for (let i = -h; i < w; i += 8) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 4, h); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
});

/** Parkplatz: weiße Trennlinien der Stellplätze (1 Feld = 3 m breit, 8 m tief, Linien 5 m lang) */
const parkTextur = () => canvasTextur(30, 80, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1.5, 50);
});

/** Straßenlaterne: Mast, Ausleger zur Straße hin, Leuchte (nachts an) */
function Laterne({ x, z, richtung, f, durchsichtig = false }) {
  const [dx, dz] = richtung;
  const deckkraft = durchsichtig ? 0.05 : 1;   // an der geöffneten Halle: fast unsichtbar, damit sie nicht im Weg steht
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3, 0]} castShadow={!durchsichtig}>
        <cylinderGeometry args={[0.09, 0.13, 6, 10]} />
        <meshStandardMaterial key={durchsichtig ? 'glas' : 'voll'} color={f['maschine-dunkel']} roughness={0.6}
                              transparent={durchsichtig} opacity={deckkraft} depthWrite={!durchsichtig} />
      </mesh>
      <Quader p={[dx * 0.7, 5.95, dz * 0.7]} g={[Math.abs(dx) * 1.4 + 0.12, 0.12, Math.abs(dz) * 1.4 + 0.12]} farbe={f['maschine-dunkel']} schatten={false} deckkraft={deckkraft} />
      <Quader p={[dx * 1.35, 5.82, dz * 1.35]} g={[0.7, 0.18, 0.35]} farbe={f.nacht ? f.licht : f.tank} deckkraft={deckkraft}
              leuchten={f.nacht ? 2 : 0} lichtFarbe={f.licht} schatten={false} />
    </group>
  );
}

/** Flache Fläche knapp über dem Boden (Straßen, Markierungen) */
function Flaeche({ x, z, b, t, farbe, y = 0.02, deckkraft = 1, map = null, drehung = 0 }) {
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, drehung]} receiveShadow>
      <planeGeometry args={[b, t]} />
      <meshStandardMaterial color={farbe} map={map} roughness={1} transparent={deckkraft < 1} opacity={deckkraft} />
    </mesh>
  );
}

/**
 * Autos und Lkw fahren ab und zu über die Zufahrt (je Fahrspur eine Richtung).
 * Jedes Fahrzeug hat einen Umlauf, der länger ist als die Straße – in der übrigen Zeit
 * ist es "unterwegs" und unsichtbar. Nachts leuchten die Scheinwerfer.
 */
function Fahrzeug({ art, von, bis, z, richtung, tempo, phase, farbe, f }) {
  const ref = useRef(null);
  const strecke = Math.abs(bis - von);
  const umlauf = strecke * (art === 'lkw' ? 3.2 : 2.4);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = (clock.elapsedTime * tempo + phase * umlauf) % umlauf;
    ref.current.visible = s < strecke;
    ref.current.position.x = richtung > 0 ? von + s : bis - s;
  });
  return (
    <group ref={ref} position={[von, 0, z]} rotation-y={richtung > 0 ? 0 : Math.PI} visible={false}>
      {art === 'lkw' ? <Lkw farbe={farbe} f={f} /> : <Auto farbe={farbe} f={f} />}
    </group>
  );
}

/* ---------------------------------------------------------------------------
 * Dach je Werk: flach, Satteldach oder Sheddach (Sägezahn)
 * ------------------------------------------------------------------------- */
function Dach({ form, b, t, hoehe, farbe, glas }) {
  const laengs = b >= t;            // Firstrichtung entlang der längeren Seite
  const L = Math.max(b, t);
  const S = Math.min(b, t);
  const geometrie = useMemo(() => {
    if (form === 'flach') return null;
    const profil = new THREE.Shape();
    let tiefe;
    if (form === 'sattel') {
      const first = Math.max(1.5, S * 0.12);
      profil.moveTo(-S / 2 - 0.4, 0); profil.lineTo(S / 2 + 0.4, 0); profil.lineTo(0, first); profil.closePath();
      tiefe = L + 0.8;
    } else {
      const zaehne = Math.max(3, Math.round(L / 12));
      const s = L / zaehne;
      profil.moveTo(-L / 2, 0);
      for (let i = 0; i < zaehne; i += 1) { profil.lineTo(-L / 2 + i * s, 2.4); profil.lineTo(-L / 2 + (i + 1) * s, 0); }
      profil.closePath();
      tiefe = S;
    }
    const geo = new THREE.ExtrudeGeometry(profil, { depth: tiefe, bevelEnabled: false });
    geo.translate(0, 0, -tiefe / 2);
    return geo;
  }, [form, L, S]);

  if (!geometrie) {
    return (
      <group>
        <Quader p={[0, hoehe + 0.25, 0]} g={[b + 0.6, 0.5, t + 0.6]} farbe={farbe} />
        {/* Lichtbänder (Oberlichter) entlang der Halle */}
        {[-0.22, 0.22].map((a) => (
          <Quader key={a} p={b >= t ? [0, hoehe + 0.58, a * t] : [a * b, hoehe + 0.58, 0]}
                  g={b >= t ? [b * 0.72, 0.18, 1.3] : [1.3, 0.18, t * 0.72]} farbe={glas} schatten={false} />
        ))}
        <Quader p={[b * 0.2, hoehe + 0.9, -t * 0.15]} g={[3, 1.2, 2.2]} farbe={farbe} />
        <Quader p={[-b * 0.25, hoehe + 0.8, t * 0.18]} g={[2.4, 1, 2.4]} farbe={farbe} />
      </group>
    );
  }
  // Satteldach: Profil quer zur Längsseite; Sheddach: Zähne entlang der Längsseite
  const drehung = form === 'sattel' ? (laengs ? Math.PI / 2 : 0) : (laengs ? 0 : Math.PI / 2);
  return (
    <mesh geometry={geometrie} position={[0, hoehe, 0]} rotation-y={drehung} castShadow receiveShadow>
      <meshStandardMaterial color={farbe} roughness={0.8} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ---------------------------------------------------------------------------
 * Details an der Halle: Andockstellen mit Torabdichtung, Personaltür mit Vordach,
 * Solarmodule und Anbauten
 * ------------------------------------------------------------------------- */
function Fassade({ h, f }) {
  const vorn = h.t / 2;
  const docks = h.b >= 40 ? 3 : h.b >= 26 ? 2 : 0;
  return (
    <>
      {Array.from({ length: docks }, (_, k) => {
        const x = -h.b * 0.42 + 1.9 + k * 4;
        return (
          <group key={k} position={[x, 0, vorn]}>
            <Quader p={[0, 2.5, 0.3]} g={[3.4, 3.6, 0.6]} farbe={f['maschine-dunkel']} schatten={false} />
            <Quader p={[0, 2.4, 0.62]} g={[2.7, 2.8, 0.06]} farbe={f.tor} schatten={false} />
            <Quader p={[0, 0.6, 0.9]} g={[3, 1.2, 1.2]} farbe={f.beton} schatten={false} />
          </group>
        );
      })}
      {/* Fallrohre an den Ecken */}
      {[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([x, z]) => (
        <mesh key={`fr${x}${z}`} position={[x * (h.b / 2 - 0.4), h.hoehe / 2, z * (h.t / 2 + 0.14)]}>
          <cylinderGeometry args={[0.09, 0.09, h.hoehe, 8]} />
          <meshStandardMaterial color={f.tank} roughness={0.4} metalness={0.4} />
        </mesh>
      ))}
      {/* Personaltür mit Vordach */}
      <Quader p={[h.b * 0.42, 1.15, vorn + 0.05]} g={[1.1, 2.3, 0.1]} farbe={f['maschine-dunkel']} schatten={false} />
      <Quader p={[h.b * 0.42, 2.65, vorn + 0.6]} g={[2.2, 0.14, 1.2]} farbe={f.tor} schatten={false} />
    </>
  );
}

/** Solarmodule: Flachdach zwischen den Lichtbändern, Satteldach auf der vorderen Dachfläche */
function Solar({ h, map }) {
  const laengs = h.b >= h.t;
  const L = Math.max(h.b, h.t);
  const S = Math.min(h.b, h.t);
  const flach = h.dach === 'flach';
  // Satteldach: Profil wie in Dach() – First entlang der längeren Seite
  const first = Math.max(1.5, S * 0.12);
  const halb = S / 2 + 0.4;
  const b = flach ? (laengs ? h.b * 0.5 : h.b * 0.26) : L * 0.6;
  const t = flach ? (laengs ? h.t * 0.26 : h.t * 0.5) : Math.hypot(halb, first) * 0.7;
  const textur = useMemo(() => {
    const m = map.clone();
    m.repeat.set(b, t / 1.7);
    m.needsUpdate = true;
    return m;
  }, [map, b, t]);
  useEffect(() => () => textur.dispose(), [textur]);
  if (flach) {
    return (
      <mesh position={[laengs ? -h.b * 0.2 : 0, h.hoehe + 0.62, laengs ? 0 : -h.t * 0.2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[b, t]} />
        <meshStandardMaterial map={textur} roughness={0.3} metalness={0.3} />
      </mesh>
    );
  }
  return (
    <group rotation-y={laengs ? 0 : Math.PI / 2}>
      <mesh position={[0, h.hoehe + first / 2 + 0.1, halb / 2]} rotation-x={-Math.PI / 2 + Math.atan2(first, halb)}>
        <planeGeometry args={[b, t]} />
        <meshStandardMaterial map={textur} roughness={0.3} metalness={0.3} />
      </mesh>
    </group>
  );
}

/** Anbau an einer Halle (lx/lz: Mitte relativ zur Hallenmitte) */
function Anbau({ a, lx, lz, f, offen, dachFarbe, wand }) {
  const deckkraft = offen ? 0.08 : 1;
  if (a.art === 'hochteil') {
    // höherer Hallenteil: etwas größer als die Halle selbst, damit die Wände nicht flimmern
    return (
      <group position={[lx, 0, lz]}>
        <mesh position={[0, a.hoehe / 2, 0]} castShadow={!offen} receiveShadow raycast={offen ? KEIN_STRAHL : THREE.Mesh.prototype.raycast}>
          <boxGeometry args={[a.b + 0.2, a.hoehe, a.t + 0.3]} />
          <meshStandardMaterial key={offen ? 'glas' : 'voll'} color={f.wand} map={wand} roughness={0.8}
                                transparent={offen} opacity={deckkraft} depthWrite={!offen} />
        </mesh>
        {!offen && (
          <>
            <Quader p={[0, a.hoehe * 0.8, 0]} g={[a.b + 0.3, 1, a.t + 0.4]} farbe={f.fenster} schatten={false} leuchten={f.nacht ? 0.9 : 0} lichtFarbe={f.licht} />
            <Quader p={[0, a.hoehe + 0.25, 0]} g={[a.b + 0.6, 0.5, a.t + 0.7]} farbe={dachFarbe} />
          </>
        )}
      </group>
    );
  }
  const buero = a.art === 'kopfbau';
  return (
    <group position={[lx, 0, lz]}>
      <Quader p={[0, a.hoehe / 2, 0]} g={[a.b, a.hoehe, a.t]} farbe={buero ? f.buero : f.wand} deckkraft={deckkraft}
              raycast={offen ? KEIN_STRAHL : THREE.Mesh.prototype.raycast} />
      {!offen && (
        <>
          {buero
            ? Array.from({ length: a.etagen }, (_, e) => (
              <Quader key={e} p={[0, 1.9 + e * 3.6, 0]} g={[a.b + 0.08, 1.3, a.t + 0.08]} farbe={f.fenster} schatten={false}
                      leuchten={f.nacht && e % 2 === 0 ? 0.8 : 0} lichtFarbe={f.licht} />
            ))
            : <Quader p={[0, a.hoehe * 0.6, 0]} g={[a.b + 0.08, 0.9, a.t + 0.08]} farbe={f.fenster} schatten={false} />}
          <Quader p={[0, a.hoehe + 0.2, 0]} g={[a.b + 0.4, 0.4, a.t + 0.4]} farbe={f['maschine-dunkel']} />
          {/* Eingang (Glas) an der Vorderseite */}
          {buero && <Quader p={[0, 1.4, a.t / 2 + 0.06]} g={[2.6, 2.8, 0.1]} farbe={f.glas} schatten={false} />}
        </>
      )}
    </group>
  );
}

/* ---------------------------------------------------------------------------
 * Einrichtung der Nebenbereiche (wie im 2D-Grundriss): Palettenregale bzw. Hallenbüro
 * ------------------------------------------------------------------------- */
function Einrichtung({ bereich, f, ursprung, hoehe }) {
  const { x, y, b, t, name } = bereich;
  const [ox, oz] = ursprung;
  const teile = useMemo(() => {
    if (name === 'Büro & Sozial') return bueroTeile({ x: ox + x, z: oz + y, b, t }, f);
    // Palettenregale: Stützen blau, Traversen orange, Paletten mit Waren
    const stuetzen = [];
    const traversen = [];
    const ware = [];
    const reihen = Math.max(2, Math.floor((b - 4) / 4));
    const tiefe = Math.max(4, t - 9);
    const felder = Math.max(1, Math.round(tiefe / 2.7));
    const fb = tiefe / felder;
    const ebenen = [0.05, 1.4, 2.75, 4.1].filter((e) => e < hoehe - 2.5);
    let z = Math.floor(x * 31 + y * 17 + b) || 1;
    const zufall = () => { z = (z * 16807) % 2147483647; return (z - 1) / 2147483646; };
    for (let i = 0; i < reihen; i += 1) {
      const px = ox + x + 3.2 + i * 4;
      const z0 = oz + y + 5;
      const oben = ebenen[ebenen.length - 1] + 1.3;
      for (let j = 0; j <= felder; j += 1) [-0.65, 0.65].forEach((dx) => stuetzen.push({ p: [px + dx, oben / 2, z0 + j * fb], g: [0.08, oben, 0.08] }));
      for (let j = 0; j < felder; j += 1) {
        ebenen.slice(1).forEach((e) => [-0.65, 0.65].forEach((dx) => traversen.push({ p: [px + dx, e, z0 + (j + 0.5) * fb], g: [0.06, 0.12, fb] })));
        ebenen.forEach((e) => {
          if (zufall() < 0.2) return;
          const hw = 0.7 + zufall() * 0.5;
          const art = zufall();
          ware.push({ p: [px, e + 0.12, z0 + (j + 0.5) * fb], g: [1.1, 0.14, fb * 0.8], farbe: '#b08a5e' });
          ware.push({ p: [px, e + 0.2 + hw / 2, z0 + (j + 0.5) * fb], g: [1.0, hw, fb * 0.74], farbe: art < 0.55 ? '#c8a77a' : art < 0.85 ? '#e9edf1' : f.blau });
        });
      }
    }
    return { arten: [[stuetzen, f.blau], [traversen, f['ampel-orange'], { schatten: false }], [ware, null]] };
  }, [x, y, b, t, name, ox, oz, hoehe, f]);
  return (
    <>
      {teile.teppich && <Flaeche x={teile.teppich.x} z={teile.teppich.z} b={teile.teppich.b} t={teile.teppich.t} farbe={f.linie} y={0.05} />}
      {teile.arten.map(([liste, farbe, optionen = {}], i) => (
        <Viele key={i} teile={liste} farbe={farbe ?? '#ffffff'} schatten={optionen.schatten ?? i !== 1} {...optionen} />
      ))}
    </>
  );
}

/**
 * Hallenbüro mit Sozialbereich: Glaswände auf Brüstung (Tür zur Hallenmitte), Teppich,
 * Schreibtisch-Inseln zu je vier Plätzen mit Bildschirmen und Bürostühlen, Pflanzen,
 * Spinde, Küchenzeile und Tisch für die Pause. Alles als Instanzen (wenige Zeichenaufrufe).
 * r = Fläche in Hallenkoordinaten (x/z = linke hintere Ecke).
 */
function bueroTeile(r, f) {
  const holz = '#c9b48f';
  const weiss = '#f2f3f5';
  const stuhl = f['maschine-dunkel'];
  const bruestung = [];
  const glas = [];
  const rahmen = [];
  const moebel = [];
  const kugeln = [];
  // Wände: Tür in der Seite, die zur Hallenmitte (0, 0) zeigt
  const mx = r.x + r.b / 2;
  const mz = r.z + r.t / 2;
  const tuerSeite = Math.abs(mx) / r.b > Math.abs(mz) / r.t ? (mx > 0 ? 'links' : 'rechts') : (mz > 0 ? 'hinten' : 'vorn');
  const wand = (x1, z1, x2, z2, seite) => {
    const laenge = Math.hypot(x2 - x1, z2 - z1);
    const quer = x1 === x2;
    const stuecke = seite === tuerSeite ? [[0, laenge / 2 - 0.7], [laenge / 2 + 0.7, laenge]] : [[0, laenge]];
    stuecke.forEach(([von, bis]) => {
      const l = bis - von;
      const m = (von + bis) / 2;
      const p = quer ? [x1, 0, z1 + m] : [x1 + m, 0, z1];
      const g = (h) => (quer ? [0.1, h, l] : [l, h, 0.1]);
      bruestung.push({ p: [p[0], 0.5, p[2]], g: g(1.0) });
      glas.push({ p: [p[0], 1.9, p[2]], g: g(1.8) });
      rahmen.push({ p: [p[0], 2.84, p[2]], g: g(0.08) });
    });
    for (let d = 0; d <= laenge + 0.01; d += 3) rahmen.push({ p: quer ? [x1, 1.42, z1 + d] : [x1 + d, 1.42, z1], g: [0.06, 2.84, 0.06] });
  };
  wand(r.x, r.z, r.x + r.b, r.z, 'hinten');
  wand(r.x, r.z + r.t, r.x + r.b, r.z + r.t, 'vorn');
  wand(r.x, r.z, r.x, r.z + r.t, 'links');
  wand(r.x + r.b, r.z, r.x + r.b, r.z + r.t, 'rechts');

  // Sozialbereich am rechten Ende (wenn genug Platz): Spinde, Küchenzeile, Tisch mit Hockern
  const sozial = r.b >= 10 ? 3 : 0;
  if (sozial) {
    const sx = r.x + r.b - sozial / 2;
    const spinde = Math.max(2, Math.floor((r.t - 1.4) / 0.6));
    for (let i = 0; i < Math.min(spinde, 6); i += 1) moebel.push({ p: [r.x + r.b - 0.35, 0.95, r.z + 0.7 + i * 0.6], g: [0.5, 1.9, 0.55], farbe: f.blau });
    moebel.push({ p: [r.x + r.b - 0.4, 0.45, r.z + r.t - 1.6], g: [0.6, 0.9, 2.2], farbe: weiss });
    moebel.push({ p: [r.x + r.b - 0.4, 0.92, r.z + r.t - 1.6], g: [0.64, 0.04, 2.24], farbe: holz });
    moebel.push({ p: [sx - 0.4, 0.74, r.z + r.t / 2], g: [1.0, 0.04, 1.0], farbe: holz });
    moebel.push({ p: [sx - 0.4, 0.37, r.z + r.t / 2], g: [0.08, 0.74, 0.08], farbe: stuhl });
    [[-0.75, 0], [0.75, 0], [0, -0.75], [0, 0.75]].forEach(([dx, dz]) => moebel.push({ p: [sx - 0.4 + dx * 0.9, 0.45, r.z + r.t / 2 + dz * 0.9], g: [0.38, 0.06, 0.38], farbe: stuhl }));
  }
  // Schreibtisch-Inseln (2 × 2 Plätze, Bildschirme zur Mitte, Stühle außen)
  const breite = r.b - sozial - 0.8;
  const nx = Math.max(1, Math.floor(breite / 3.8));
  const nz = Math.max(1, Math.floor((r.t - 1.2) / 3.9));
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const cx = r.x + 0.4 + (breite / nx) * (i + 0.5);
      const cz = r.z + 0.6 + ((r.t - 1.2) / nz) * (j + 0.5);
      [-0.8, 0.8].forEach((dx) => [-1, 1].forEach((seite) => {
        const dz = seite * 0.4;
        moebel.push({ p: [cx + dx, 0.74, cz + dz], g: [1.56, 0.04, 0.78], farbe: weiss });
        moebel.push({ p: [cx + dx + (dx > 0 ? 0.55 : -0.55), 0.36, cz + dz], g: [0.4, 0.7, 0.6], farbe: f.tank });
        moebel.push({ p: [cx + dx, 1.0, cz + seite * 0.1], g: [0.58, 0.36, 0.03], farbe: '#22262c' });
        moebel.push({ p: [cx + dx, 1.0, cz + seite * 0.12], g: [0.52, 0.3, 0.01], farbe: f.akzent });
        moebel.push({ p: [cx + dx, 0.47, cz + seite * 1.12], g: [0.5, 0.07, 0.48], farbe: stuhl });
        moebel.push({ p: [cx + dx, 0.8, cz + seite * 1.34], g: [0.46, 0.55, 0.06], farbe: stuhl });
        moebel.push({ p: [cx + dx, 0.22, cz + seite * 1.12], g: [0.06, 0.44, 0.06], farbe: stuhl });
      }));
    }
  }
  // Pflanzen in den Ecken
  [[r.x + 0.5, r.z + 0.5], [r.x + r.b - sozial - 0.5, r.z + r.t - 0.5]].forEach(([px, pz]) => {
    moebel.push({ p: [px, 0.22, pz], g: [0.4, 0.44, 0.4], farbe: '#8b6b4e' });
    kugeln.push({ p: [px, 0.85, pz], g: [0.75, 0.9, 0.75] });
  });
  return {
    teppich: { x: r.x + r.b / 2, z: r.z + r.t / 2, b: r.b, t: r.t },
    arten: [
      [bruestung, f.buero],
      [glas, f.glas, { deckkraft: 0.22, schatten: false }],
      [rahmen, f['maschine-dunkel'], { schatten: false }],
      [moebel, null, { schatten: false }],
      [kugeln, f.baum, { form: 'kugel', schatten: false }],
    ],
  };
}

/** Brückenkran unter der Decke: Kranbahn an den Längswänden, Brücke fährt längs, Katze mit Haken quer */
function Hallenkran({ L, S, hoehe, f, bewegt }) {
  const bruecke = useRef(null);
  const katze = useRef(null);
  useFrame(({ clock }) => {
    if (!bewegt || !bruecke.current) return;
    const zeit = clock.elapsedTime;
    bruecke.current.position.x = Math.sin(zeit * 0.12) * L * 0.33;
    katze.current.position.z = Math.sin(zeit * 0.31) * S * 0.28;
  });
  const y = hoehe - 1.4;
  return (
    <>
      {[-1, 1].map((z) => <Quader key={z} p={[0, y, z * (S / 2 - 0.6)]} g={[L - 0.6, 0.4, 0.25]} farbe={f.tank} schatten={false} deckkraft={0.4} />)}
      <group ref={bruecke} position={[L * 0.1, y + 0.5, 0]}>
        <Quader p={[0, 0, 0]} g={[0.7, 0.8, S - 1.1]} farbe={f.signal} schatten={false} />
        {[-1, 1].map((z) => <Quader key={z} p={[0, -0.15, z * (S / 2 - 0.6)]} g={[2.2, 0.45, 0.55]} farbe={f.signal} schatten={false} />)}
        <group ref={katze}>
          <Quader p={[0, 0.55, 0]} g={[1.2, 0.5, 1.1]} farbe={f['maschine-dunkel']} schatten={false} />
          <Quader p={[0, -1.6, 0]} g={[0.04, 3.2, 0.04]} farbe={f['maschine-dunkel']} schatten={false} />
          <Quader p={[0, -3.3, 0]} g={[0.32, 0.4, 0.22]} farbe={f.signal} schatten={false} />
        </group>
      </group>
    </>
  );
}

/** Gang zwischen den Maschinenreihen finden (größte Lücke quer zur Halle) – dort laufen die Figuren */
function gangInHalle(halle, maschinen) {
  const haupt = (halle.bereiche ?? [])[0] ?? { x: 0, y: 0, b: halle.breite_m, t: halle.tiefe_m };
  const belegt = maschinen.map((m) => [m.pos_y_m, m.pos_y_m + m.tiefe_m]).sort((a, b) => a[0] - b[0]);
  let beste = { mitte: haupt.y + haupt.t / 2, breite: 0 };
  let ende = haupt.y;
  for (const [von, bis] of [...belegt, [haupt.y + haupt.t, haupt.y + haupt.t]]) {
    if (von - ende > beste.breite) beste = { mitte: (ende + von) / 2, breite: von - ende };
    ende = Math.max(ende, bis);
  }
  return { y: beste.mitte, breite: beste.breite, x0: haupt.x + 2, x1: haupt.x + haupt.b - 2 };
}

/* ---------------------------------------------------------------------------
 * Szene
 * ------------------------------------------------------------------------- */
function Szene({ standort, gebaeude, maschinen, gebaeudeId, maschineId, onGebaeude, onMaschine, f: fBasis, bewegt, neutral, verwaltung, onVerwaltung }) {
  const t = useT();
  // Boden, Straßen, Wände und Dächer in den Farben des Landes (Wüste in Mexiko, Schnee in Russland …)
  const f = useMemo(() => mitLandStil(fBasis, standort.land), [fBasis, standort.land]);
  const stil = LAND_STIL[standort.land];
  const gs = useMemo(() => werkGestaltung(standort, gebaeude), [standort, gebaeude]);
  const { B, T } = gs;
  const X = (x) => x - B / 2;
  const Z = (y) => y - T / 2;
  const [hover, setHover] = useState(null);
  const steuerung = useRef(null);       // OrbitControls (Drehen, Zoomen, Verschieben)
  // Beschriftungen (HTML) erst nach dem ersten Bild einblenden – vorher ging die erste verloren
  const [bereit, setBereit] = useState(false);
  useFrame(() => { if (!bereit) setBereit(true); });
  const gewaehlt = gebaeude.find((g) => g.id === gebaeudeId) ?? null;
  const dachFarbe = f[`dach-${gs.dachFarbe}`];

  // Kameraziel: ganzes Werk oder die gewählte Halle (schräg von vorn oben)
  const richtung = new THREE.Vector3(0.42, 0.78, 0.82).normalize();
  const buero = gs.deko.find((d) => d.art === 'buero');
  const ziel = useMemo(() => {
    // Easter Egg: Kamera fliegt nah an das Verwaltungsgebäude heran (dort wartet das Minispiel)
    if (verwaltung && buero) {
      const mitte = [X(buero.x + buero.b / 2), buero.etagen * 1.8, Z(buero.y + buero.t / 2)];
      const abstand = Math.max(buero.b, buero.t) * 1.5 + 16;
      return { schluessel: 'verwaltung', target: mitte, position: mitte.map((w, i) => w + richtung.getComponent(i) * abstand) };
    }
    if (gewaehlt) {
      const h = gs.hallen[gewaehlt.id];
      const mitte = [X(h.x + h.b / 2), 0, Z(h.y + h.t / 2)];
      const abstand = Math.max(h.b * 1.35, h.t * 1.8) + 8;
      return { schluessel: `g${gewaehlt.id}`, target: mitte, position: mitte.map((w, i) => w + richtung.getComponent(i) * abstand) };
    }
    // etwas nach vorn versetzt und weiter weg, damit Landstraße und typisches Objekt vor dem Werk mit im Bild sind
    const abstand = Math.max(B * 1.45, T * 2) + 10;
    const mitte = [0, 0, 8];
    return { schluessel: 'werk', target: mitte, position: mitte.map((w, i) => w + richtung.getComponent(i) * abstand) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gewaehlt, gs, verwaltung]);

  useEffect(() => { document.body.style.cursor = hover ? 'pointer' : ''; return () => { document.body.style.cursor = ''; }; }, [hover]);

  const klick = (e, aktion) => { e.stopPropagation(); if (e.delta > 5) return; aktion(); };
  // Belegte Stellplätze (fest je Werk, ändern sich beim Neuzeichnen nicht)
  const autos = useMemo(() => {
    const z = zufall(`${standort.kuerzel}-autos`);
    return Array.from({ length: Math.floor((gs.parkplatz.b - 4) / 3) }, (_, i) => ({ belegt: z() < 0.6, farbe: AUTO_FARBEN[Math.floor(z() * AUTO_FARBEN.length)], i }))
      .filter((a) => a.belegt)
      .map((a) => ({ x: X(gs.parkplatz.x + 3.5 + a.i * 3), z: Z(gs.parkplatz.y + 3), drehung: Math.PI / 2, farbe: a.farbe }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standort.kuerzel, gs]);

  // Figuren: auf den Werksstraßen bzw. im Gang der gewählten Halle
  const figuren = useMemo(() => {
    const z = zufall(`${standort.kuerzel}-figuren`);
    const liste = [];
    gs.strassen.filter((s) => s.t <= 6 && s.b > s.t).slice(0, 2).forEach((s, i) => {
      [0, 1].forEach((j) => liste.push({ a: [X(s.x + 3), Z(s.y + 3)], b: [X(s.x + s.b - 3), Z(s.y + 3)], farbe: f[`person-${(i + j) % 3}`], phase: z(), tempo: 1 + z() * 0.5 }));
    });
    if (gewaehlt) {
      const h = gs.hallen[gewaehlt.id];
      const gang = gangInHalle(gewaehlt, maschinen.filter((m) => m.gebaeude_id === gewaehlt.id));
      const seitlich = Math.min(1.4, Math.max(0.5, gang.breite / 2 - 0.5));
      [0, 1, 2].forEach((i) => liste.push({
        a: [X(h.x + gang.x0), Z(h.y + gang.y + [-1, 1, -0.6][i] * seitlich)], b: [X(h.x + gang.x1), Z(h.y + gang.y + [-1, 1, -0.6][i] * seitlich)],
        farbe: f[`person-${i % 3}`], phase: z(), tempo: 0.8 + z() * 0.6,
      }));
    }
    return liste;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs, gewaehlt, f]);

  // Straßenlaternen am Rand der Werksstraßen (alle 30 m), Ausleger zur Straße hin
  const laternen = useMemo(() => {
    const liste = [];
    gs.strassen.filter((st) => !st.pfad).forEach((st) => {
      if (st.b > st.t) for (let x = st.x + 8; x < st.x + st.b - 4; x += 30) liste.push({ x: X(x), z: Z(st.y - 1.2), richtung: [0, 1] });
      else for (let y = st.y + 8; y < st.y + st.t - 4; y += 30) liste.push({ x: X(st.x - 1.2), z: Z(y), richtung: [1, 0] });
    });
    return liste;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs]);
  const nacht = f.nacht;
  // Laternen bis 35 m um die geöffnete Halle werden (fast) unsichtbar
  const naheGeoeffneterHalle = (l) => {
    if (!gewaehlt) return false;
    const h = gs.hallen[gewaehlt.id];
    const dx = Math.max(X(h.x) - l.x, 0, l.x - X(h.x + h.b));
    const dz = Math.max(Z(h.y) - l.z, 0, l.z - Z(h.y + h.t));
    return Math.hypot(dx, dz) < 35;
  };
  // Trapezblech-Textur je Halle (Wiederholung passend zur Länge)
  const wandTexturen = useMemo(() => {
    const basis = rippenTextur();
    return new Map(gebaeude.map((g) => {
      const t = basis.clone();
      t.repeat.set(Math.max(gs.hallen[g.id].b, gs.hallen[g.id].t) / WANDFELD, 1);
      t.needsUpdate = true;
      return [g.id, t];
    }));
  }, [gebaeude, gs]);
  // Weitere Texturen (einmal je Szene): Solarmodule, Zaun, Stellplatz-Linien
  // Zaun um das Gelände (vorn mit Lücke für das Tor): [x1, y1, x2, y2] in Werkskoordinaten
  const texturen = useMemo(() => {
    const zaunBasis = zaunTextur();
    const zaun = [[3, 3, B - 3, 3], [3, 3, 3, T - 3.2], [B - 3, 3, B - 3, T - 3.2],
      [3, T - 3.2, gs.tor.x, T - 3.2], [gs.tor.x + gs.tor.b, T - 3.2, B - 3, T - 3.2]].map(([x1, y1, x2, y2]) => {
      const laenge = Math.hypot(x2 - x1, y2 - y1);
      const map = zaunBasis.clone();
      map.repeat.set(laenge / 2.5, 1);
      map.needsUpdate = true;
      return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, laenge, quer: x1 === x2, map };
    });
    const park = parkTextur();
    park.repeat.set(gs.parkplatz.b / 3, 1);
    park.offset.set(1 / 3, 0);
    // Fensterband je Halle (Wiederholung passend zur Länge)
    const fensterBasis = fensterTextur();
    const fenster = new Map(gebaeude.map((g) => {
      const t = fensterBasis.clone();
      t.repeat.set(Math.max(gs.hallen[g.id].b, gs.hallen[g.id].t) / 1.6, 1);
      t.needsUpdate = true;
      return [g.id, t];
    }));
    // Gras bzw. Boden des Geländes: leichte Struktur statt glatter Fläche (1 Feld = 12 m)
    const gras = grasTextur();
    gras.repeat.set(B / 12, T / 12);
    return { solar: solarTextur(), zaun, park, fenster, boden: bodenTextur(), gras };
  }, [gs, B, T, gebaeude]);

  // Solarmodule auf etwa jeder zweiten Halle (Flach- und Satteldach)
  const solar = useMemo(() => new Set(gebaeude.filter((g) => gs.hallen[g.id].dach !== 'shed'
    && zufall(`${standort.kuerzel}${g.kuerzel}-solar`)() < 0.5).map((g) => g.id)), [gebaeude, gs, standort.kuerzel]);

  const schatten = Math.max(B, T) * 0.7;
  return (
    <>
      {/* Tag: Sonne. Nacht (Dunkelmodus): schwaches, bläuliches Mondlicht – Laternen und Hallen leuchten */}
      <hemisphereLight args={[nacht ? '#a9b9da' : '#ffffff', f.gelaende, nacht ? 0.95 : 0.85]} />
      <ambientLight intensity={nacht ? 0.3 : 0.25} />
      <directionalLight position={[B * 0.35, 140, T * 0.55]} intensity={nacht ? 0.95 : 1.7} color={nacht ? '#aabbff' : '#ffffff'} castShadow
                        shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006}
                        shadow-camera-left={-schatten} shadow-camera-right={schatten}
                        shadow-camera-top={schatten} shadow-camera-bottom={-schatten} shadow-camera-far={400} />
      <Kamera ziel={ziel} bewegt={bewegt} steuerung={steuerung} />
      <OrbitControls ref={steuerung} makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.46}
                     minDistance={6} maxDistance={Math.max(B, T) * 2.4} />

      {/* Gelände als Modellplatte */}
      <mesh position={[0, -0.6, 0]} receiveShadow>
        <boxGeometry args={[B, 1.2, T]} />
        <meshStandardMaterial color={f.gelaende} roughness={1} map={texturen.gras} />
      </mesh>
      {gs.strassen.map((s, i) => (s.pfad
        // geschwungene Straße: Abschnitte als gedrehte Flächen, runde Stöße an den Knicken
        ? s.pfad.map(([x, y], j) => {
          const [x2, y2] = s.pfad[j + 1] ?? [x, y];
          return (
            <group key={`${i}-${j}`}>
              <mesh position={[X(x), 0.02, Z(y)]} rotation-x={-Math.PI / 2} receiveShadow>
                <circleGeometry args={[s.breite / 2, 16]} />
                <meshStandardMaterial color={f.strasse} roughness={1} />
              </mesh>
              {j < s.pfad.length - 1 && (
                <Flaeche x={X((x + x2) / 2)} z={Z((y + y2) / 2)} b={Math.hypot(x2 - x, y2 - y)} t={s.breite} farbe={f.strasse}
                         drehung={-Math.atan2(y2 - y, x2 - x)} />
              )}
            </group>
          );
        })
        : <Flaeche key={i} x={X(s.x + s.b / 2)} z={Z(s.y + s.t / 2)} b={s.b} t={s.t} farbe={f.strasse} />))}
      {/* Kreisverkehr, wo die geschwungene Straße abzweigt */}
      {gs.strassen.filter((s) => s.pfad).map((s, i) => (
        <group key={`kv${i}`} position={[X(s.pfad[0][0]), 0, Z(s.pfad[0][1])]}>
          <mesh position-y={0.022} rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[8, 32]} /><meshStandardMaterial color={f.strasse} roughness={1} /></mesh>
          <mesh position-y={0.12} receiveShadow><cylinderGeometry args={[3.6, 3.8, 0.24, 28]} /><meshStandardMaterial color={f.beton} roughness={1} /></mesh>
          <mesh position-y={0.25} receiveShadow><cylinderGeometry args={[3.2, 3.2, 0.06, 28]} /><meshStandardMaterial color={f.baum} roughness={1} /></mesh>
          <group position-y={0.25}><Baum3D art={LAND_STIL[standort.land]?.baum ?? 'rund'} groesse={0.8} i={1} f={f} /></group>
        </group>
      ))}
      {/* Gehwege an den Längsstraßen */}
      {gs.strassen.filter((s) => !s.pfad && s.b > s.t && s.t <= 6).flatMap((s, i) => [-0.8, s.t + 0.8].map((d) => (
        <Flaeche key={`gw${i}${d}`} x={X(s.x + s.b / 2)} z={Z(s.y + d)} b={s.b} t={1.4} farbe={f.beton} y={0.025} />
      )))}
      {/* Zaun ums Gelände */}
      {texturen.zaun.map((z, i) => (
        <mesh key={`z${i}`} position={[X(z.x), 1.1, Z(z.y)]} rotation-y={z.quer ? Math.PI / 2 : 0}>
          <planeGeometry args={[z.laenge, 2.2]} />
          <meshStandardMaterial map={z.map} color={f.linie} transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} roughness={0.6} />
        </mesh>
      ))}
      <Flaeche x={X(gs.parkplatz.x + gs.parkplatz.b / 2)} z={Z(gs.parkplatz.y + gs.parkplatz.t / 2)} b={gs.parkplatz.b} t={gs.parkplatz.t} farbe={f.strasse} />
      <Flaeche x={X(gs.parkplatz.x + gs.parkplatz.b / 2)} z={Z(gs.parkplatz.y + gs.parkplatz.t / 2)} b={gs.parkplatz.b} t={gs.parkplatz.t}
               farbe={f.markierung} map={texturen.park} deckkraft={0.95} y={0.03} />
      {/* Geparkte Autos (alle zusammen als Instanzen) */}
      <ParkendeAutos plaetze={autos} />
      <Quader p={[X(gs.tor.x + gs.tor.b / 2), 0.6, Z(T - 1)]} g={[gs.tor.b, 1.2, 0.3]} farbe={f.tor} />

      {laternen.map((l, i) => <Laterne key={`l${i}`} {...l} f={f} durchsichtig={naheGeoeffneterHalle(l)} />)}
      <Landesdeko standort={standort} gs={gs} f={f} X={X} Z={Z} gebaeudeId={gewaehlt?.id} />
      {/* Betonflächen rund um die Hallen (Vorplatz, Anlieferung) */}
      {gebaeude.map((g) => {
        const h = gs.hallen[g.id];
        return <Flaeche key={`vp${g.id}`} x={X(h.x + h.b / 2)} z={Z(h.y + h.t / 2)} b={h.b + 10} t={h.t + 9} farbe={f.beton} y={0.012} />;
      })}
      {/* Nachts werfen einige Laternen Licht auf die Straße (nicht alle – jede Lichtquelle kostet Rechenzeit) */}
      {nacht && laternen.filter((_, i) => i % 2 === 0).slice(0, 6).map((l, i) => (
        <pointLight key={`ll${i}`} position={[l.x + l.richtung[0] * 1.4, 5.4, l.z + l.richtung[1] * 1.4]} color={f.licht}
                    intensity={120} distance={30} decay={2} />
      ))}

      {/* Deko: Bürogebäude, Tanks/Silos, Bäume */}
      {gs.deko.map((d, i) => {
        if (d.art === 'buero') {
          const h = d.etagen * 3.6;
          // Easter Egg: Verwaltung anklickbar (nicht beim Melden und nicht, solange eine Halle offen ist)
          const klickbar = Boolean(onVerwaltung) && !neutral && !gewaehlt;
          return (
            <group key={i} position={[X(d.x + d.b / 2), 0, Z(d.y + d.t / 2)]} scale={klickbar && hover === 'verwaltung' ? 1.04 : 1}
                   onClick={klickbar ? (e) => klick(e, onVerwaltung) : undefined}
                   onPointerOver={klickbar ? (e) => { e.stopPropagation(); setHover('verwaltung'); } : undefined}
                   onPointerOut={klickbar ? () => setHover(null) : undefined}>
              {klickbar && hover === 'verwaltung' && bereit && !verwaltung && (
                <Html position={[0, h + 7, 0]} center zIndexRange={[4, 1]} style={{ pointerEvents: 'none' }}>
                  <span className="raum-name"><i className="bi bi-cup-hot" aria-hidden="true" /> {t('Verwaltung')} · ?</span>
                </Html>
              )}
              {/* Bürogebäude im Baustil des Landes (Fachwerk, Glasturm, Pagode …), sonst schlichter Quader */}
              {stil ? <Buero3D stil={stil.buero} d={d} f={f} /> : (
                <>
                  <Quader p={[0, h / 2, 0]} g={[d.b, h, d.t]} farbe={f.buero} />
                  {Array.from({ length: d.etagen }, (_, e) => (
                    <Quader key={e} p={[0, 1.9 + e * 3.6, 0]} g={[d.b + 0.08, 1.2, d.t + 0.08]} farbe={f.fenster} schatten={false}
                            leuchten={nacht && e % 2 === 0 ? 0.8 : 0} lichtFarbe={f.licht} />
                  ))}
                  <Quader p={[0, h + 0.2, 0]} g={[d.b + 0.4, 0.4, d.t + 0.4]} farbe={f['maschine-dunkel']} />
                </>
              )}
            </group>
          );
        }
        return (
          <group key={i} position={[X(d.x), 0, Z(d.y)]}>
            <mesh position={[0, d.hoehe / 2, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[d.r, d.r, d.hoehe, 24]} />
              <meshStandardMaterial color={f.tank} roughness={0.5} metalness={0.2} />
            </mesh>
            {d.art === 'silo' && (
              <mesh position={[0, d.hoehe + 1, 0]} castShadow>
                <coneGeometry args={[d.r, 2, 24]} />
                <meshStandardMaterial color={f.tank} roughness={0.5} metalness={0.2} />
              </mesh>
            )}
          </group>
        );
      })}
      {gs.baeume.map((bm, i) => (
        <group key={`${bm.x}-${bm.y}`} position={[X(bm.x), 0, Z(bm.y)]}>
          <Baum3D art={stil?.baum ?? 'rund'} groesse={bm.groesse} i={i} f={f} />
        </group>
      ))}

      {/* Hallen */}
      {gebaeude.map((g) => {
        const h = gs.hallen[g.id];
        const offen = gewaehlt?.id === g.id;
        const hervor = hover === `g${g.id}`;
        const farbe = stufenFarbe(f, g.offen, g.hoechste_prioritaet, neutral);
        return (
          <group key={g.id} position={[X(h.x + h.b / 2), 0, Z(h.y + h.t / 2)]}>
            <mesh position={[0, h.hoehe / 2, 0]} castShadow={!offen} receiveShadow
                  raycast={offen ? KEIN_STRAHL : THREE.Mesh.prototype.raycast}
                  onClick={(e) => klick(e, () => onGebaeude(g))}
                  onPointerOver={(e) => { e.stopPropagation(); setHover(`g${g.id}`); }} onPointerOut={() => setHover(null)}>
              <boxGeometry args={[h.b, h.hoehe, h.t]} />
              {/* key: Three.js übernimmt "durchsichtig" nur bei neuem Material */}
              <meshStandardMaterial key={offen ? 'glas' : 'voll'} color={f.wand} map={wandTexturen.get(g.id)} roughness={0.8} transparent={offen} opacity={offen ? 0.13 : 1}
                                    depthWrite={!offen} emissive={f.akzent} emissiveIntensity={hervor && !offen ? 0.18 : 0} />
            </mesh>
            {!offen && (
              <>
                {/* Fensterband, Rolltor, Dach, Streifen in der Störungsfarbe */}
                <Quader p={[0, h.hoehe * 0.72, 0]} g={[h.b + 0.1, 1.3, h.t + 0.1]} farbe={f.fenster} schatten={false}
                        map={texturen.fenster.get(g.id)} leuchten={nacht ? 0.9 : 0} lichtFarbe={f.licht} />
                <Quader p={[0, 2.4, h.t / 2 + 0.05]} g={[Math.min(6, h.b * 0.3), 4.8, 0.2]} farbe={f.tor} schatten={false} />
                <Quader p={[0, 0.25, 0]} g={[h.b + 0.5, 0.5, h.t + 0.5]} farbe={farbe} schatten={false} />
                <Dach form={h.dach} b={h.b} t={h.t} hoehe={h.hoehe} farbe={dachFarbe} glas={f.glas} />
                <Fassade h={h} f={f} />
                {solar.has(g.id) && <Solar h={h} map={texturen.solar} />}
              </>
            )}
            {/* Anbauten: Flachbau, Kopfbau mit Büros, höherer Hallenteil (bei geöffneter Halle durchsichtig) */}
            <group onClick={offen ? undefined : (e) => klick(e, () => onGebaeude(g))}
                   onPointerOver={offen ? undefined : (e) => { e.stopPropagation(); setHover(`g${g.id}`); }}
                   onPointerOut={offen ? undefined : () => setHover(null)}>
              {h.anbauten.map((a, i) => (
                <Anbau key={i} a={a} lx={a.x + a.b / 2 - h.x - h.b / 2} lz={a.y + a.t / 2 - h.y - h.t / 2} f={f} offen={offen}
                       dachFarbe={dachFarbe} wand={wandTexturen.get(g.id)} />
              ))}
            </group>
            {offen && (
              <HallenInneres halle={g} h={h} f={f} bewegt={bewegt} maschineId={maschineId} neutral={neutral} boden={texturen.boden}
                             maschinen={maschinen.filter((m) => m.gebaeude_id === g.id)}
                             onMaschine={onMaschine} setHover={setHover} hover={hover} klick={klick} />
            )}
            {/* Beschriftung als Knopf (auch per Tastatur bedienbar); in einer Halle nur die anderen kurz */}
            {!offen && bereit && (
              <Html position={[0, Math.max(h.hoehe + (h.dach === 'flach' ? 2.5 : Math.min(h.b, h.t) * 0.12 + 2.5), ...h.anbauten.map((a) => a.hoehe + 2.5)), 0]} center zIndexRange={[4, 1]}>
                <button type="button" className={`raum-halle stufe-${neutral ? 'neutral' : stufe(g.offen, g.hoechste_prioritaet)}${gewaehlt ? ' klein' : ''}`}
                        data-ort={`g-${g.id}`} aria-label={neutral ? g.bezeichnung : `${g.bezeichnung}: ${offenText(g.offen, t)}`}
                        onClick={() => onGebaeude(g)} onMouseEnter={() => setHover(`g${g.id}`)} onMouseLeave={() => setHover(null)}>
                  <strong>{g.kuerzel}</strong>
                  {!gewaehlt && <span className="raum-halle-name">{g.bezeichnung.split('–').pop().trim()}</span>}
                  {!neutral && <span className="zaehl-marke">{g.offen > 0 ? g.offen : <i className="bi bi-check-lg" />}</span>}
                </button>
              </Html>
            )}
          </group>
        );
      })}

      {figuren.map((p, i) => <Figur key={`${gewaehlt?.id ?? 'w'}-${i}`} {...p} art={i} f={f} bewegt={bewegt} />)}
      {/* Verkehr auf der Zufahrt: je Spur eine Richtung */}
      {bewegt && [
        { art: 'lkw', spur: 2.6, richtung: 1, tempo: 7, phase: 0.1, farbe: AUTO_FARBEN[5] },
        { art: 'auto', spur: 7.4, richtung: -1, tempo: 11, phase: 0.45, farbe: AUTO_FARBEN[4] },
        { art: 'auto', spur: 2.6, richtung: 1, tempo: 10, phase: 0.75, farbe: AUTO_FARBEN[0] },
      ].map((v, i) => (
        <Fahrzeug key={i} {...v} von={X(6)} bis={X(B - 6)} z={Z(gs.zufahrtY + v.spur)} f={f} />
      ))}
    </>
  );
}

/** Innenleben der gewählten Halle (Koordinaten relativ zur Hallenmitte) */
function HallenInneres({ halle, h, f, bewegt, maschinen, maschineId, onMaschine, hover, setHover, klick, neutral, boden }) {
  const t = useT();
  const ox = -h.b / 2;
  const oz = -h.t / 2;
  const bereiche = halle.bereiche ?? [];
  const lichtbaender = Math.max(2, Math.round(h.t / 9));   // Lichtbänder unter der Decke
  const gang = gangInHalle(halle, maschinen);
  // Betonboden mit Fugen (Textur je Halle passend zur Größe)
  const bodenMap = useMemo(() => {
    const m = boden.clone();
    m.repeat.set(h.b / 6, h.t / 6);
    m.needsUpdate = true;
    return m;
  }, [boden, h.b, h.t]);
  // Stahlstützen innen an der Rück- und linken Wand (alle 6,6 m) – ein Zeichenaufruf für alle.
  // Vorn und rechts (zur Kamera hin) bewusst keine: sie stünden wie Gitterstäbe vor dem Blick in die Halle.
  const stuetzen = useMemo(() => {
    const liste = [];
    const nx = Math.max(1, Math.round(h.b / WANDFELD));
    const nz = Math.max(1, Math.round(h.t / WANDFELD));
    for (let i = 0; i <= nx; i += 1) liste.push({ p: [ox + (i * h.b) / nx, h.hoehe / 2, -(h.t / 2 - 0.2)], g: [0.24, h.hoehe, 0.24] });
    for (let j = 1; j < nz; j += 1) liste.push({ p: [-(h.b / 2 - 0.2), h.hoehe / 2, oz + (j * h.t) / nz], g: [0.24, h.hoehe, 0.24] });
    return liste;
  }, [h.b, h.t, h.hoehe, ox, oz]);
  const mitKran = h.hoehe < 14 && !/lager|logistik|versand|labor|büro/i.test(halle.bezeichnung ?? '');
  return (
    <>
      <Flaeche x={0} z={0} b={h.b} t={h.t} farbe={f.hallenboden} y={0.03} map={bodenMap} />
      <Viele teile={stuetzen} farbe={f.tank} schatten={false} metall={0.3} deckkraft={0.35} />
      {/* Gehweg im Gang (grüne Linien) und Gabelstapler in der Mitte */}
      {[-1, 1].map((seite) => (
        <Flaeche key={`gw${seite}`} x={ox + (gang.x0 + gang.x1) / 2} z={oz + gang.y + seite * Math.max(0.8, gang.breite / 2 - 0.25)} b={gang.x1 - gang.x0}
                 t={0.12} farbe={f['ampel-gruen']} y={0.045} />
      ))}
      {gang.breite >= 2.6 && (
        <Gabelstapler a={[ox + gang.x0 + 2, oz + gang.y]} b={[ox + gang.x1 - 2, oz + gang.y]} f={f} bewegt={bewegt} phase={0.3} />
      )}
      {mitKran && (
        <group rotation-y={h.b >= h.t ? 0 : Math.PI / 2}>
          <Hallenkran L={Math.max(h.b, h.t)} S={Math.min(h.b, h.t)} hoehe={h.hoehe} f={f} bewegt={bewegt} />
        </group>
      )}
      {/* Hallenbeleuchtung (nur nachts, also im Dunkelmodus): Reihen einzelner Leuchten unter der Decke
          und warmes Licht in der Halle. Tagsüber ist das Dach offen – dann blieben nur schwebende Lampen. */}
      {f.nacht && Array.from({ length: lichtbaender }, (_, i) => (
        Array.from({ length: Math.max(2, Math.floor(h.b / 7)) }, (__, j) => {
          const proReihe = Math.max(2, Math.floor(h.b / 7));
          return (
            <Quader key={`lb${i}-${j}`} p={[ox + ((j + 0.5) * h.b) / proReihe, h.hoehe - 0.7, oz + ((i + 0.5) * h.t) / lichtbaender]}
                    g={[2.0, 0.05, 0.18]} farbe={f.licht} leuchten={1.6} lichtFarbe={f.licht} schatten={false} deckkraft={0.45} />
          );
        })
      ))}
      {f.nacht && [-0.25, 0.25].map((ax) => (
        <pointLight key={`hl${ax}`} position={[ax * h.b, h.hoehe - 1.2, 0]} color={f.licht}
                    intensity={380} distance={Math.max(h.b, h.t) * 1.3} decay={2} />
      ))}
      {bereiche.map((b, i) => (
        <group key={b.name}>
          {/* Bereichsgrenzen als Bodenmarkierung */}
          <Flaeche x={ox + b.x + b.b / 2} z={oz + b.y} b={b.b} t={0.18} farbe={f.signal} y={0.04} />
          <Flaeche x={ox + b.x + b.b / 2} z={oz + b.y + b.t} b={b.b} t={0.18} farbe={f.signal} y={0.04} />
          <Flaeche x={ox + b.x} z={oz + b.y + b.t / 2} b={0.18} t={b.t} farbe={f.signal} y={0.04} />
          <Flaeche x={ox + b.x + b.b} z={oz + b.y + b.t / 2} b={0.18} t={b.t} farbe={f.signal} y={0.04} />
          {i > 0 && <Einrichtung bereich={b} f={f} ursprung={[ox, oz]} hoehe={h.hoehe} />}
        </group>
      ))}
      {maschinen.map((m) => {
        const L = Math.max(m.breite_m, m.tiefe_m);
        const W = Math.min(m.breite_m, m.tiefe_m);
        const gewaehlt = m.id === maschineId;
        const hervor = hover === `m${m.id}`;
        const farbe = stufenFarbe(f, m.offen, m.hoechste_prioritaet, neutral);
        const mitStoerung = !neutral && m.offen > 0;
        return (
          <group key={m.id} position={[ox + m.pos_x_m + m.breite_m / 2, 0, oz + m.pos_y_m + m.tiefe_m / 2]}
                 onClick={(e) => klick(e, () => onMaschine(m))}
                 onPointerOver={(e) => { e.stopPropagation(); setHover(`m${m.id}`); }} onPointerOut={() => setHover(null)}>
            {/* Boden unter der Maschine: Störungsfarbe, gewählt = Akzentfarbe */}
            <mesh position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[m.breite_m + 0.8, m.tiefe_m + 0.8]} />
              <meshBasicMaterial color={gewaehlt ? f.akzent : mitStoerung ? farbe : f.linie}
                                 transparent opacity={gewaehlt ? 0.7 : mitStoerung ? 0.5 : hervor ? 0.45 : 0.22} />
            </mesh>
            <group rotation-y={m.tiefe_m > m.breite_m ? Math.PI / 2 : 0} scale={hervor || gewaehlt ? 1.04 : 1}>
              <MaschineMitAmpel m={m} L={L} W={W} f={f} bewegt={bewegt} detail="mittel" ampelGroesse={2.3} />
            </group>
            {/* Name beim Darüberfahren */}
            {hervor && !gewaehlt && (
              <Html position={[0, 3.6, 0]} center zIndexRange={[4, 1]} style={{ pointerEvents: 'none' }}>
                <span className="raum-name">{m.bezeichnung} · {m.anlagennummer}</span>
              </Html>
            )}
            {(mitStoerung || gewaehlt) && !hervor && (
              <Html position={[0, 4.6, 0]} center zIndexRange={[4, 1]}>
                <button type="button" className={`raum-marke stufe-${stufe(m.offen, m.hoechste_prioritaet)}${gewaehlt ? ' gewaehlt' : ''}`}
                        aria-label={`${m.bezeichnung} (${m.anlagennummer}): ${offenText(m.offen, t)}`}
                        aria-pressed={gewaehlt} data-ort={`m-${m.id}`} onClick={() => onMaschine(m)}>
                  {m.offen > 0 && <span className="zaehl-marke">{m.offen}</span>}
                  {gewaehlt && <span>{m.bezeichnung.split(' ').pop()}</span>}
                </button>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}

export default function Werk3D(props) {
  const { f, bewegt } = useRaum();
  const rahmen = useRef(null);
  const sichtbar = useSichtbar(rahmen);   // außerhalb des Bildschirms wird nicht gezeichnet
  // Easter Egg: null | 'flug' (Kamera fliegt zur Verwaltung) | 'offen' (Minispiel)
  const [spiel, setSpiel] = useState(null);
  useEffect(() => {
    if (spiel !== 'flug') return undefined;
    const warten = setTimeout(() => setSpiel('offen'), bewegt ? 1150 : 0);
    return () => clearTimeout(warten);
  }, [spiel, bewegt]);
  useEffect(() => { setSpiel(null); }, [props.gebaeudeId]);
  return (
    <div className="raum" ref={rahmen}>
      {/* offsetSize: Größe ohne CSS-Transform messen (die Ebene wird beim Zoomen skaliert) */}
      <Canvas shadows dpr={[1, 1.5]} frameloop={!sichtbar ? 'never' : bewegt ? 'always' : 'demand'} resize={{ offsetSize: true }}
              camera={{ fov: 38, near: 0.5, far: 4000, position: [150, 200, 220] }} gl={{ antialias: true, alpha: true }}>
        <Szene {...props} f={f} bewegt={bewegt} verwaltung={Boolean(spiel)} onVerwaltung={props.neutral ? null : () => setSpiel('flug')} />
      </Canvas>
      {spiel === 'offen' && (
        <Minispiel maschinen={props.maschinen ?? []} ort={props.standort.stadt} onSchliessen={() => setSpiel(null)} />
      )}
    </div>
  );
}
