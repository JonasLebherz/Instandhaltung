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
 *  - Klick auf eine Halle: Die Kamera fliegt hinein, Dach, Wände und Anbauten verschwinden
 *    (freie Sicht). Innen: Bereiche als Bodenmarkierung, Regale, Maschinen als
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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { werkGestaltung, zufall } from '@/lib/karten/werkGestaltung';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import { ortszeit } from '@/lib/karten/ortszeit';
import { stufe, offenText } from '../stufe';
import { useT } from '@/components/SpracheKontext';
import { MaschineMitAmpel, MASCHINEN_HOEHE } from './Maschine3D';
import { useRaum, useSichtbar } from './farben';
import Landesdeko, { LAND_STIL, mitLandStil, Baum3D, Buero3D, BaumGruppe } from './Landesdeko';
import Figur from './Figur';
import { Auto, Lkw, ParkendeAutos, Gabelstapler, AUTO_FARBEN } from './Fahrzeuge';
import { Viele, canvasTextur, grasTextur, useCanvasTextur } from './Bausteine';

/** Farbe einer Störungsstufe */
const stufenFarbe = (f, offen, prio, neutral = false) => (neutral ? f.linie : ({ rot: f.rot, orange: f.orange, blau: f.blau, ruhig: f.gruen })[stufe(offen, prio)]);

// weiche Kurve (Sinus): sanftes Anfahren und Abbremsen, ohne Ruck in der Mitte
const easing = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);

/* ---------------------------------------------------------------------------
 * Kamera: fliegt zum Ziel (Werk oder Halle); Ziehen mit der Maus bricht den Flug ab
 * ------------------------------------------------------------------------- */
/**
 * Kamerafahrt. Die Kamera fliegt auf einer Kugel um den Blickpunkt: Höhe, Neigung und Richtung ändern sich
 * gleichzeitig (kein „erst hoch, dann drehen“), der Abstand gleichmäßig (logarithmisch).
 * onFortschritt(schluessel, t): Stand der Fahrt 0…1 (für Abläufe wie 3D → 2D: Gebäude sinken schon ab der Hälfte)
 */
const kugelJetzt = new THREE.Spherical();
const versatz = new THREE.Vector3();
function Kamera({ ziel, bewegt, steuerung, onFortschritt }) {
  const { camera, invalidate } = useThree();
  const zustand = useRef({ schluessel: null, flug: null, abbruch: null });
  const fortschritt = useRef(onFortschritt);
  fortschritt.current = onFortschritt;
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
        fortschritt.current?.(ziel.schluessel, 1);
      } else {
        const vonZiel = steuer.target.clone();
        const von = new THREE.Spherical().setFromVector3(versatz.subVectors(camera.position, vonZiel));
        const nach = new THREE.Spherical().setFromVector3(versatz.subVectors(nachPos, nachZiel));
        // Richtung auf dem kürzesten Weg drehen
        let dTheta = nach.theta - von.theta;
        if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
        if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
        z.flug = { t: 0, dauer: ziel.dauer ?? 1.1, von, nach, dTheta, vonZiel, nachZiel };
      }
      z.schluessel = ziel.schluessel;
      invalidate();
    }
    const f = z.flug;
    if (!f) return;
    // Zeitschritt begrenzen: nach einem langsamen Bild (z. B. Texturen hochladen) soll der Flug nicht springen
    f.t = Math.min(1, f.t + Math.min(dt, 1 / 30) / f.dauer);
    const e = easing(f.t);
    steuer.target.lerpVectors(f.vonZiel, f.nachZiel, e);
    kugelJetzt.set(
      f.von.radius * (f.nach.radius / f.von.radius) ** e,
      f.von.phi + (f.nach.phi - f.von.phi) * e,
      f.von.theta + f.dTheta * e,
    );
    camera.position.setFromSpherical(kugelJetzt).add(steuer.target);
    steuer.update();
    fortschritt.current?.(z.schluessel, f.t);
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

/** Alle Laternen als Instanzen: Mast, Ausleger und Leuchte je ein Zeichenaufruf statt drei je Laterne */
function LaternenGruppe({ laternen, f }) {
  const teile = useMemo(() => {
    const masten = [];
    const arme = [];
    const koepfe = [];
    laternen.forEach(({ x, z, richtung: [dx, dz] }) => {
      masten.push({ p: [x, 3, z], g: [0.22, 6, 0.22] });
      arme.push({ p: [x + dx * 0.7, 5.95, z + dz * 0.7], g: [Math.abs(dx) * 1.4 + 0.12, 0.12, Math.abs(dz) * 1.4 + 0.12] });
      koepfe.push({ p: [x + dx * 1.35, 5.82, z + dz * 1.35], g: [dx ? 0.7 : 0.35, 0.18, dx ? 0.35 : 0.7] });
    });
    return { masten, arme, koepfe };
  }, [laternen]);
  return (
    <>
      <Viele teile={teile.masten} form="zyl" farbe={f['maschine-dunkel']} rauheit={0.6} />
      <Viele teile={teile.arme} farbe={f['maschine-dunkel']} schatten={false} />
      <Viele teile={teile.koepfe} farbe={f.nacht ? f.licht : f.tank} schatten={false} leuchten={f.nacht ? 2 : 0} lichtFarbe={f.licht} />
    </>
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
        {/* Attika: niedrige Brüstung am Dachrand */}
        {[[0, -1], [0, 1], [-1, 0], [1, 0]].map(([x, z]) => (
          <Quader key={`at${x}${z}`} p={[x * (b / 2 + 0.2), hoehe + 0.75, z * (t / 2 + 0.2)]} g={x ? [0.25, 0.5, t + 0.65] : [b + 0.65, 0.5, 0.25]}
                  farbe={farbe} schatten={false} />
        ))}
        {/* Lüftungsgeräte mit Ventilatoren */}
        <Quader p={[b * 0.2, hoehe + 1.1, -t * 0.15]} g={[3, 1.2, 2.2]} farbe={glas} />
        <Quader p={[-b * 0.25, hoehe + 1.0, t * 0.18]} g={[2.4, 1, 2.4]} farbe={glas} />
        {[[b * 0.2 - 0.7, -t * 0.15, 1.7], [b * 0.2 + 0.7, -t * 0.15, 1.7], [-b * 0.25, t * 0.18, 1.5]].map(([x, z, y]) => (
          <mesh key={`lf${x}`} position={[x, hoehe + y + 0.02, z]}>
            <cylinderGeometry args={[0.5, 0.5, 0.08, 16]} />
            <meshStandardMaterial color="#3a3f47" roughness={0.6} />
          </mesh>
        ))}
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
function Anbau({ a, lx, lz, f, dachFarbe, wand }) {
  if (a.art === 'hochteil') {
    // höherer Hallenteil: etwas größer als die Halle selbst, damit die Wände nicht flimmern
    return (
      <group position={[lx, 0, lz]}>
        <mesh position={[0, a.hoehe / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[a.b + 0.2, a.hoehe, a.t + 0.3]} />
          <meshStandardMaterial color={f.wand} map={wand} roughness={0.8} />
        </mesh>
        <Quader p={[0, a.hoehe * 0.8, 0]} g={[a.b + 0.3, 1, a.t + 0.4]} farbe={f.fenster} schatten={false} leuchten={f.nacht ? 0.9 : 0} lichtFarbe={f.licht} />
        <Quader p={[0, a.hoehe + 0.25, 0]} g={[a.b + 0.6, 0.5, a.t + 0.7]} farbe={dachFarbe} />
      </group>
    );
  }
  const buero = a.art === 'kopfbau';
  return (
    <group position={[lx, 0, lz]}>
      <Quader p={[0, a.hoehe / 2, 0]} g={[a.b, a.hoehe, a.t]} farbe={buero ? f.buero : f.wand} />
      {buero
        ? Array.from({ length: a.etagen }, (_, e) => (
          <Quader key={e} p={[0, 1.9 + e * 3.6, 0]} g={[a.b + 0.08, 1.3, a.t + 0.08]} farbe={f.fenster} schatten={false}
                  leuchten={f.nacht && e % 2 === 0 ? 0.8 : 0} lichtFarbe={f.licht} />
        ))
        : <Quader p={[0, a.hoehe * 0.6, 0]} g={[a.b + 0.08, 0.9, a.t + 0.08]} farbe={f.fenster} schatten={false} />}
      <Quader p={[0, a.hoehe + 0.2, 0]} g={[a.b + 0.4, 0.4, a.t + 0.4]} farbe={f['maschine-dunkel']} />
      {/* Eingang (Glas) an der Vorderseite */}
      {buero && <Quader p={[0, 1.4, a.t / 2 + 0.06]} g={[2.6, 2.8, 0.1]} farbe={f.glas} schatten={false} />}
    </group>
  );
}

/** Vor dem Verwaltungsgebäude: zwei Bänke, Mülleimer, Fahrradständer mit Rädern (lokal zur Gebäudemitte, vorn = +z) */
function VorDemBuero({ d, f }) {
  const z0 = d.t / 2 + 2.2;
  const teile = useMemo(() => {
    const holz = [];
    const metall = [];
    const raeder = [];
    [-0.3, 0.3].forEach((a) => {
      const x = a * d.b;
      holz.push({ p: [x, 0.45, z0], g: [1.8, 0.06, 0.45] }, { p: [x, 0.75, z0 + 0.22], g: [1.8, 0.35, 0.05] });
      [-0.8, 0.8].forEach((dx) => metall.push({ p: [x + dx, 0.22, z0], g: [0.06, 0.44, 0.45] }));
      metall.push({ p: [x + 1.3, 0.45, z0], g: [0.45, 0.9, 0.45] });
    });
    // Fahrradständer (Bügel) mit drei Rädern rechts vor dem Eingang
    for (let i = 0; i < 4; i += 1) {
      const x = d.b * 0.5 - 0.6 - i * 0.8;
      metall.push({ p: [x, 0.4, z0 + 1.2], g: [0.05, 0.8, 0.7] });
      if (i < 3) {
        [-0.5, 0.5].forEach((dz) => raeder.push({ p: [x + 0.35, 0.35, z0 + 1.2 + dz], g: [0.68, 0.68, 0.68], r: [0, Math.PI / 2, 0] }));
        metall.push({ p: [x + 0.35, 0.55, z0 + 1.2], g: [0.04, 0.05, 1.0], farbe: [f.blau, f['ampel-rot'], f['maschine-dunkel']][i] });
      }
    }
    // Zwei Pflanzkübel mit Blumen neben dem Eingang
    const kuebel = [];
    const blumen = [];
    [-1, 1].forEach((seite) => {
      const x = seite * 2.2;
      kuebel.push({ p: [x, 0.25, d.t / 2 + 0.9], g: [1.4, 0.5, 0.6] });
      for (let i = 0; i < 6; i += 1) blumen.push({ p: [x - 0.55 + i * 0.22, 0.6, d.t / 2 + 0.9 + (i % 2 ? 0.1 : -0.1)], g: [0.26, 0.26, 0.26], farbe: [f['ampel-rot'], f.signal, '#e85d9b'][i % 3] });
    });
    return { holz, metall, raeder, kuebel, blumen };
  }, [d.b, d.t, z0, f]);
  return (
    <>
      <Viele teile={teile.holz} farbe="#a0764d" schatten={false} />
      <Viele teile={teile.metall} farbe={f['maschine-dunkel']} schatten={false} metall={0.4} />
      <Viele teile={teile.raeder} form="ring" farbe="#1b1c1f" schatten={false} />
      <Viele teile={teile.kuebel} farbe={f.beton} schatten={false} />
      <Viele teile={teile.blumen} form="kugel" schatten={false} />
    </>
  );
}

/** Kurzname der Maschine als dunkle Bodenschrift vorn auf dem Sockel (Textur einmal je Maschine; Graphit wie das Logo) */
function BodenSchild({ text, b, z, f }) {
  const textur = useCanvasTextur(Math.round(64 * (b / 0.75)), 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = '800 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  }, [1, 1], [text, b]);
  return (
    <mesh position={[0, 0.13, z]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[b, 0.75]} />
      <meshBasicMaterial map={textur} color="#1d1d1f" transparent depthWrite={false} />
    </mesh>
  );
}

/**
 * Kleinkram am Hallenrand, wie in echten Hallen: Feuerlöscher mit Schild, Mülltrennung,
 * Werkzeugwagen, Paletten mit Kartons, Erste-Hilfe-Kasten – nur an freien Stellen (nicht auf
 * Maschinen, nicht im Gang). Dazu die gelb-schwarze Sperrfläche innen am Tor.
 * Zwei Zeichenaufrufe für alles (Instanzen).
 */
function HallenDetails({ halle, h, maschinen, gang, f }) {
  const schraffur = useCanvasTextur(64, 64, (g, w, hh) => {
    g.fillStyle = '#f2b632'; g.fillRect(0, 0, w, hh);
    g.fillStyle = '#22262c';
    for (let i = -hh; i < w; i += 16) { g.beginPath(); g.moveTo(i, hh); g.lineTo(i + 8, hh); g.lineTo(i + 8 + hh, 0); g.lineTo(i + hh, 0); g.fill(); }
  }, [Math.min(6, h.b * 0.3) / 1.2, 3 / 1.2]);
  const teile = useMemo(() => {
    const ox = -h.b / 2;
    const oz = -h.t / 2;
    const haupt = (halle.bereiche ?? [])[0] ?? { x: 0, y: 0, b: h.b, t: h.t };
    const frei = (x, y) => Math.abs(y - gang.y) > gang.breite / 2 + 0.3
      && !maschinen.some((m) => x > m.pos_x_m - 1.4 && x < m.pos_x_m + m.breite_m + 1.4 && y > m.pos_y_m - 1.4 && y < m.pos_y_m + m.tiefe_m + 1.4);
    const stellen = [];
    for (let x = haupt.x + 2.5; x < haupt.x + haupt.b - 2; x += 5) [haupt.y + 0.7, haupt.y + haupt.t - 0.7].forEach((y) => stellen.push([x, y]));
    for (let y = haupt.y + 3; y < haupt.y + haupt.t - 3; y += 5) [haupt.x + 0.7, haupt.x + haupt.b - 0.7].forEach((x) => stellen.push([x, y]));
    const kisten = [];
    const rollen = [];
    const ARTEN = ['loescher', 'muell', 'wagen', 'palette', 'erstehilfe', 'palette', 'loescher', 'muell'];
    stellen.filter(([x, y]) => frei(x, y)).slice(0, 12).forEach(([hx, hy], i) => {
      const x = ox + hx;
      const z = oz + hy;
      switch (ARTEN[i % ARTEN.length]) {
        case 'loescher':
          rollen.push({ p: [x, 0.3, z], g: [0.18, 0.55, 0.18], farbe: f['ampel-rot'] });
          kisten.push({ p: [x + 0.3, 0.9, z], g: [0.05, 1.8, 0.05], farbe: f['maschine-dunkel'] }, { p: [x + 0.3, 1.7, z], g: [0.3, 0.3, 0.03], farbe: f['ampel-rot'] });
          break;
        case 'muell':
          [f.blau, f.signal, '#7a8089', '#8b6b4e'].forEach((farbe, j) => kisten.push(
            { p: [x - 0.75 + j * 0.5, 0.42, z], g: [0.44, 0.84, 0.5], farbe },
            { p: [x - 0.75 + j * 0.5, 0.86, z], g: [0.47, 0.05, 0.53], farbe: f['maschine-dunkel'] },
          ));
          break;
        case 'wagen':
          kisten.push({ p: [x, 0.5, z], g: [0.7, 0.8, 0.45], farbe: f['ampel-rot'] }, { p: [x, 0.93, z], g: [0.74, 0.06, 0.49], farbe: f['maschine-dunkel'] },
            { p: [x + 0.4, 0.95, z], g: [0.03, 0.3, 0.4], farbe: '#c3c8cf' });
          [-0.28, 0.28].forEach((dx) => [-0.16, 0.16].forEach((dz) => rollen.push({ p: [x + dx, 0.06, z + dz], g: [0.1, 0.12, 0.1], farbe: '#1b1c1f' })));
          break;
        case 'palette':
          kisten.push({ p: [x, 0.07, z], g: [1.2, 0.14, 0.8], farbe: '#b08a5e' }, { p: [x, 0.5, z], g: [1.1, 0.72, 0.74], farbe: '#c8a77a' },
            { p: [x, 0.5, z], g: [1.12, 0.06, 0.76], farbe: '#e9edf1' });
          break;
        default:   // Erste Hilfe
          kisten.push({ p: [x, 0.8, z], g: [0.05, 1.6, 0.05], farbe: f['maschine-dunkel'] }, { p: [x, 1.45, z + 0.06], g: [0.45, 0.4, 0.14], farbe: '#2e8b57' },
            { p: [x, 1.45, z + 0.135], g: [0.22, 0.06, 0.01], farbe: '#ffffff' }, { p: [x, 1.45, z + 0.135], g: [0.06, 0.22, 0.01], farbe: '#ffffff' });
      }
    });
    return { kisten, rollen };
  }, [halle, h.b, h.t, maschinen, gang, f]);
  return (
    <>
      <Viele teile={teile.kisten} schatten={false} />
      <Viele teile={teile.rollen} form="zyl" schatten={false} rauheit={0.4} />
      {/* Sperrfläche innen vor dem Rolltor */}
      <Flaeche x={0} z={h.t / 2 - 1.6} b={Math.min(6, h.b * 0.3) + 1} t={3} farbe="#ffffff" y={0.045} map={schraffur} />
    </>
  );
}

/** Draußen: Hecke am Parkplatz, Büsche am Zaun, Kanaldeckel auf den Straßen */
function AussenDetails({ gs, f, X, Z }) {
  const teile = useMemo(() => {
    const z = zufall(`${gs.B}-${gs.T}-${gs.parkplatz.x}-aussen`);
    const buesche = [];
    const hecke = [];
    const deckel = [];
    // Hecke entlang der oberen Kante des Parkplatzes
    hecke.push({ p: [X(gs.parkplatz.x + gs.parkplatz.b / 2), 0.4, Z(gs.parkplatz.y - 0.7)], g: [gs.parkplatz.b, 0.8, 0.7] });
    // Büsche am vorderen Zaun (nicht am Tor, nicht am Parkplatz)
    for (let x = 8; x < gs.B - 8; x += 3.2 + z() * 2) {
      const amTor = Math.abs(x - gs.B / 2) < 24;
      const amParkplatz = x > gs.parkplatz.x - 2 && x < gs.parkplatz.x + gs.parkplatz.b + 2;
      if (amTor || amParkplatz || z() < 0.25) continue;
      const g = 0.9 + z() * 0.8;
      buesche.push({ p: [X(x), g * 0.45, Z(gs.T - 4.6)], g: [g * 1.4, g, g * 1.2] });
    }
    // Kanaldeckel auf geraden Straßen (alle ~28 m)
    gs.strassen.filter((s) => !s.pfad).forEach((s) => {
      const laengs = s.b > s.t;
      const laenge = laengs ? s.b : s.t;
      for (let d = 12; d < laenge - 6; d += 28) {
        deckel.push({ p: laengs ? [X(s.x + d), 0.025, Z(s.y + s.t * 0.3)] : [X(s.x + s.b * 0.3), 0.025, Z(s.y + d)], g: [0.8, 0.02, 0.8] });
      }
    });
    return { buesche, hecke, deckel };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs]);
  return (
    <>
      <Viele teile={teile.buesche} form="kugel" farbe={f.baum} schatten={false} rauheit={0.95} />
      <Viele teile={teile.hecke} farbe={f.baum} rauheit={0.95} />
      <Viele teile={teile.deckel} form="zyl" farbe={f['maschine-dunkel']} schatten={false} metall={0.3} />
    </>
  );
}

/** Rohrfarben: Stahl, Gas (gelb), Wasser (blau), Druckluft (grau-blau) */
const ROHRE = ['#c3c8cf', '#e0b000', '#2f6fb5', '#7d8fa3'];

/** Rauch aus dem Schornstein: ein paar Wölkchen steigen auf und lösen sich auf */
function Rauch({ y, bewegt }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.children.forEach((w, i) => {
      const s = ((bewegt ? clock.elapsedTime * 0.25 : 0) + i / 5) % 1;
      w.position.set(s * 4, y + s * 9, s * 1.5);
      w.scale.setScalar(1 + s * 2.5);
      w.material.opacity = 0.45 * (1 - s);
    });
  });
  return (
    <group ref={ref}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i}>
          <sphereGeometry args={[1.4, 10, 8]} />
          <meshStandardMaterial color="#e6e8eb" transparent opacity={0.4} depthWrite={false} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Industrie an einer Produktionshalle (nicht an Lagerhallen): Schornstein mit rot-weißem Kopf und Rauch,
 * Lüftungskanäle an der Rückwand, Rohrtrasse an einer Seite, Kabeltrasse mit Schaltkasten vorn,
 * Dachlüfter, Trafostation. Fast alles als Instanzen (wenige Zeichenaufrufe).
 * seite: +1/−1 = Seite der Rohrtrasse (gegenüber einem Kopfbau)
 */
function Industrie({ h, f, bewegt, seite }) {
  const S = Math.min(h.b, h.t);
  const laengs = h.b >= h.t;
  // Höhe des Dachfirsts (für Dachlüfter), wie in Dach()
  const dachOben = h.hoehe + (h.dach === 'sattel' ? Math.max(1.5, S * 0.12) : h.dach === 'shed' ? 2.4 : 0.5);
  const teile = useMemo(() => {
    const stahl = [];
    const rohre = [];
    const lufter = [];
    const kappen = [];
    // Lüftungskanäle an der Rückwand: zwei Steigleitungen und ein Sammelkanal
    [-0.25, 0.22].forEach((a) => rohre.push({ p: [a * h.b, (h.hoehe + 2) / 2, -h.t / 2 - 0.7], g: [0.9, h.hoehe + 2, 0.9], farbe: ROHRE[0] }));
    rohre.push({ p: [0, h.hoehe - 1, -h.t / 2 - 0.7], g: [0.9, h.b * 0.5, 0.9], r: [0, 0, Math.PI / 2], farbe: ROHRE[0] });
    // Rohrtrasse an der Seite: Stützen mit Querträger, drei Rohre in Längsrichtung, eine Leitung in die Wand
    const x = seite * (h.b / 2 + 1.3);
    for (let z = -h.t / 2; z <= h.t / 2 + 0.1; z += 5) {
      stahl.push({ p: [seite * (h.b / 2 + 2), 3.2, z], g: [0.22, 6.4, 0.22] }, { p: [seite * (h.b / 2 + 1.1), 6.3, z], g: [1.9, 0.18, 0.18] });
    }
    [5.6, 6.0, 6.4].forEach((y, i) => rohre.push({ p: [x + seite * (i - 1) * 0.35, y + 0.12, 0], g: [0.28, h.t + 3, 0.28], r: [Math.PI / 2, 0, 0], farbe: ROHRE[i + 1] }));
    rohre.push({ p: [seite * (h.b / 2 + 0.6), 6.0, h.t * 0.2], g: [0.28, 1.4, 0.28], r: [0, 0, Math.PI / 2], farbe: ROHRE[2] });
    // Kabeltrasse vorn unter dem Fensterband, senkrecht hinab zum Schaltkasten
    stahl.push({ p: [-h.b * 0.05, h.hoehe * 0.58, h.t / 2 + 0.3], g: [h.b * 0.7, 0.12, 0.45] });
    stahl.push({ p: [-h.b * 0.4, (h.hoehe * 0.58 + 2.2) / 2, h.t / 2 + 0.3], g: [0.45, h.hoehe * 0.58 - 2.2, 0.12] });
    stahl.push({ p: [-h.b * 0.4, 1.3, h.t / 2 + 0.3], g: [1.3, 1.8, 0.45] });
    // Dachlüfter entlang des Firsts
    [-0.3, 0, 0.3].forEach((a) => {
      const p = laengs ? [a * h.b, dachOben + 0.5, 0] : [0, dachOben + 0.5, a * h.t];
      lufter.push({ p, g: [1.1, 1.0, 1.1] });
      kappen.push({ p: [p[0], p[1] + 0.8, p[2]], g: [1.5, 0.6, 1.5] });
    });
    // Trafostation neben der Rohrtrasse
    stahl.push({ p: [seite * (h.b / 2 + 4.2), 1.3, -h.t * 0.3], g: [2.4, 2.6, 3.2], farbe: f.beton });
    return { stahl, rohre, lufter, kappen };
  }, [h, seite, laengs, dachOben, f.beton]);
  const hoch = h.hoehe + 22;   // Schornstein deutlich über dem Dach
  return (
    <>
      <Viele teile={teile.stahl} farbe="#8e959f" schatten={false} metall={0.4} rauheit={0.5} />
      <Viele teile={teile.rohre} form="zyl" schatten={false} metall={0.5} rauheit={0.35} />
      <Viele teile={teile.lufter} form="zyl" farbe={f.tank} schatten={false} metall={0.4} />
      <Viele teile={teile.kappen} form="kegel" farbe="#6b7280" schatten={false} />
      {/* Warnschild an der Trafostation */}
      <mesh position={[seite * (h.b / 2 + 4.2) + seite * 1.21, 1.7, -h.t * 0.3]} rotation-y={seite * Math.PI / 2}>
        <circleGeometry args={[0.35, 3]} />
        <meshStandardMaterial color={f.signal} />
      </mesh>
      {h.schornstein && (
        <group position={[h.b * 0.3, 0, -h.t / 2 - 3.2]}>
          <mesh position={[0, hoch / 2, 0]} castShadow>
            <cylinderGeometry args={[1.1, 1.6, hoch, 20]} />
            <meshStandardMaterial color={f.tank} roughness={0.5} metalness={0.3} />
          </mesh>
          {[[hoch - 3, '#c8102e'], [hoch - 1.8, '#f2f3f5'], [hoch - 0.6, '#c8102e']].map(([y, farbe]) => (
            <mesh key={y} position={[0, y, 0]}>
              <cylinderGeometry args={[1.16, 1.2, 1.4, 20]} />
              <meshStandardMaterial color={farbe} roughness={0.5} />
            </mesh>
          ))}
          <Rauch y={hoch + 1} bewegt={bewegt} />
        </group>
      )}
    </>
  );
}

/** Rohrbrücken zwischen Produktionshallen: drei Rohre über die Lücke, Stütze in der Mitte */
function Rohrbruecken({ gs, f, X, Z, gewaehltId }) {
  const offen = gewaehltId ? gs.hallen[gewaehltId] : null;
  const teile = useMemo(() => {
    const rohre = [];
    const stahl = [];
    gs.rohrbruecken.forEach((r) => {
      if (offen && (Math.abs(r.x1 - (offen.x + offen.b)) < 0.1 || Math.abs(r.x2 - offen.x) < 0.1)) return;  // nicht an der geöffneten Halle
      const laenge = r.x2 - r.x1;
      const mx = X((r.x1 + r.x2) / 2);
      [0, 1, 2].forEach((i) => rohre.push({ p: [mx, r.hoehe + i * 0.45, Z(r.y + (i - 1) * 0.5)], g: [0.32, laenge, 0.32], r: [0, 0, Math.PI / 2], farbe: ROHRE[i + 1] }));
      stahl.push({ p: [mx, (r.hoehe - 0.3) / 2, Z(r.y)], g: [0.35, r.hoehe - 0.3, 0.35] }, { p: [mx, r.hoehe - 0.3, Z(r.y)], g: [0.25, 0.25, 2] });
    });
    return { rohre, stahl };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs, gewaehltId]);
  return (
    <>
      <Viele teile={teile.rohre} form="zyl" schatten={false} metall={0.5} rauheit={0.35} />
      <Viele teile={teile.stahl} farbe="#8e959f" schatten={false} metall={0.4} />
    </>
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

/** Brückenkran unter der Decke (halb durchsichtig, damit er die Maschinen nicht verdeckt): Brücke fährt längs, Katze mit Haken quer */
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
      <group ref={bruecke} position={[L * 0.1, y + 0.5, 0]}>
        <Quader p={[0, 0, 0]} g={[0.7, 0.8, S - 1.1]} farbe={f.signal} schatten={false} deckkraft={0.35} />
        {[-1, 1].map((z) => <Quader key={z} p={[0, -0.15, z * (S / 2 - 0.6)]} g={[2.2, 0.45, 0.55]} farbe={f.signal} schatten={false} deckkraft={0.35} />)}
        <group ref={katze}>
          <Quader p={[0, 0.55, 0]} g={[1.2, 0.5, 1.1]} farbe={f['maschine-dunkel']} schatten={false} deckkraft={0.35} />
          <Quader p={[0, -1.6, 0]} g={[0.04, 3.2, 0.04]} farbe={f['maschine-dunkel']} schatten={false} deckkraft={0.35} />
          <Quader p={[0, -3.3, 0]} g={[0.32, 0.4, 0.22]} farbe={f.signal} schatten={false} deckkraft={0.35} />
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
function Szene({ standort, gebaeude, maschinen, gebaeudeId, maschineId, onGebaeude, onMaschine, f: fBasis, bewegt, neutral, phase, kamera, flach, hintergrund, onKameraFortschritt, onFlachFertig, vorschau }) {
  const vonOben = kamera === 'oben';
  const t = useT();
  // Boden, Straßen, Wände und Dächer in den Farben des Landes (Wüste in Mexiko, Schnee in Russland …)
  // nacht (Laternen, Fenster, Scheinwerfer an) aus der Ortszeit des Werks – auch in der Dämmerung schon Licht
  const f = useMemo(() => ({ ...mitLandStil(fBasis, standort.land), nacht: phase !== 'tag', phase }), [fBasis, standort.land, phase]);
  const stil = LAND_STIL[standort.land];
  const gs = useMemo(() => werkGestaltung(standort, gebaeude), [standort, gebaeude]);
  const { B, T } = gs;
  const X = (x) => x - B / 2;
  const Z = (y) => y - T / 2;
  const baumListe = useMemo(() => gs.baeume.map((bm, i) => ({ x: bm.x - B / 2, z: bm.y - T / 2, groesse: bm.groesse, i, art: stil?.baum ?? 'rund' })),
    [gs, B, T, stil]);
  const [hover, setHover] = useState(null);
  const steuerung = useRef(null);       // OrbitControls (Drehen, Zoomen, Verschieben)
  // Handy/Tablet: Ein Finger scrollt die Seite weiter (sonst bliebe man auf der 3D-Fläche „hängen“),
  // zwei Finger zoomen die Kamera. OrbitControls setzt sonst touch-action: none (läuft vorher, Kind-Effekt).
  const { gl } = useThree();
  useEffect(() => {
    if (window.matchMedia?.('(pointer: coarse)').matches) gl.domElement.style.touchAction = 'pan-y';
  }, [gl]);
  // Beschriftungen (HTML) erst nach dem ersten Bild einblenden – vorher ging die erste verloren
  const [bereit, setBereit] = useState(false);
  useFrame(() => { if (!bereit) setBereit(true); });
  // Halleninneres vorab aufbauen: nach dem ersten Bild eine Halle nach der anderen, wenn der Browser Luft hat
  const [vorbereitet, setVorbereitet] = useState(() => new Set());
  useEffect(() => {
    // erst wenn die Kamera zur Ruhe gekommen ist – sonst stockt das Kippen
    if (!bereit || !hintergrund) return undefined;
    const offen = gebaeude.map((g) => g.id).filter((id) => !vorbereitet.has(id));
    if (!offen.length) return undefined;
    const spaeter = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 200));
    const abbrechen = window.cancelIdleCallback ?? clearTimeout;
    const auftrag = spaeter(() => setVorbereitet((alt) => new Set([...alt, offen[0]])), { timeout: 1500 });
    return () => abbrechen(auftrag);
  }, [bereit, hintergrund, vorbereitet, gebaeude]);
  const gewaehlt = gebaeude.find((g) => g.id === gebaeudeId) ?? null;
  const dachFarbe = f[`dach-${gs.dachFarbe}`];

  // Kameraziel: ganzes Werk oder die gewählte Halle (schräg von vorn oben)
  const richtung = new THREE.Vector3(0.42, 0.78, 0.82).normalize();
  // Maschinen je Halle (einmal sortiert, damit die Halle nicht bei jedem Neuzeichnen alles neu berechnet)
  const maschinenJeHalle = useMemo(() => {
    const karte = new Map();
    maschinen.forEach((m) => karte.set(m.gebaeude_id, [...(karte.get(m.gebaeude_id) ?? []), m]));
    return karte;
  }, [maschinen]);
  const { size } = useThree();
  const ziel = useMemo(() => {
    // Von oben: Kamera senkrecht über Werk bzw. Halle, so weit weg, dass das Bild dem 2D-Plan darunter
    // entspricht (gleiche Breite und Lage wie in der Bühne: Kopfzeile 66 px, Rand 22 px). So kann die
    // Szene aus dem Plan heraus einblenden und die Kamera danach in die Schrägansicht kippen – und umgekehrt.
    if (vonOben) {
      const fl = gewaehlt ? gs.hallen[gewaehlt.id] : { x: 0, y: 0, b: B, t: T };
      const kopf = 66;
      const breitePx = Math.max(50, Math.min(size.width - 44, ((size.height - kopf - 22) * fl.b) / fl.t));
      const proPx = fl.b / breitePx;                                   // Meter je Bildpunkt
      const abstand = (size.height * proPx) / (2 * Math.tan((38 / 2) * (Math.PI / 180)));
      const cx = X(fl.x + fl.b / 2);
      const cz = Z(fl.y + fl.t / 2) - ((kopf - 22) / 2) * proPx;
      return { schluessel: `oben-${gewaehlt?.id ?? 'werk'}`, target: [cx, 0, cz], position: [cx, abstand, cz + abstand * 0.001], dauer: 1.1 };
    }
    // Herauszoomen ins Land: Kamera steigt hoch in die Vogelperspektive
    if (kamera === 'hoch') {
      const abstand = Math.max(B, T) * 3;
      return { schluessel: 'hoch', target: [0, 0, 0], position: [0, abstand, abstand * 0.25], dauer: 1.1 };
    }
    // Schmale Bühne (Handy hochkant): Kamera weiter weg, damit links und rechts nichts abgeschnitten wird
    const schmal = Math.min(2.2, Math.max(1, 1.45 / (size.width / Math.max(1, size.height))));
    if (gewaehlt) {
      const h = gs.hallen[gewaehlt.id];
      const mitte = [X(h.x + h.b / 2), 0, Z(h.y + h.t / 2)];
      const abstand = (Math.max(h.b * 1.35, h.t * 1.8) + 8) * schmal ** 0.6;   // Halle: Maschinen sollen groß bleiben
      return { schluessel: `g${gewaehlt.id}`, target: mitte, position: mitte.map((w, i) => w + richtung.getComponent(i) * abstand), dauer: 1.2 };
    }
    // Werk füllt das Bild, die Landschaft drumherum läuft bis zum Horizont
    const abstand = (Math.max(B * 1.2, T * 1.7) + 10) * schmal;
    const mitte = [0, 0, 4];
    return { schluessel: 'werk', target: mitte, position: mitte.map((w, i) => w + richtung.getComponent(i) * abstand), dauer: 1.6 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gewaehlt, gs, kamera, size.width, size.height]);

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
      [0, 1].forEach((j) => liste.push({ a: [X(s.x + 3), Z(s.y - 0.8)], b: [X(s.x + s.b - 3), Z(s.y - 0.8)], farbe: f[`person-${(i + j) % 3}`], phase: z(), tempo: 1 + z() * 0.5 }));
    });
    // vom Parkplatz zum Tor
    [0, 1].forEach((j) => liste.push({
      a: [X(gs.parkplatz.x + gs.parkplatz.b * (0.3 + j * 0.4)), Z(gs.parkplatz.y - 1)], b: [X(gs.tor.x + gs.tor.b / 2 + j * 2), Z(gs.parkplatz.y - 1.5)],
      farbe: f[`person-${j + 1}`], phase: z(), tempo: 0.9 + z() * 0.3,
    }));
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

  // Weg des Gabelstaplers draußen: auf der ersten Längsstraße, rechte Fahrspur
  const staplerWeg = useMemo(() => {
    const s = gs.strassen.find((st) => !st.pfad && st.b > st.t && st.t <= 6);
    return s ? { a: [X(s.x + 8), Z(s.y + 4.3)], b: [X(s.x + s.b - 8), Z(s.y + 4.3)] } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs]);

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
  // Laternen bis 35 m um die geöffnete Halle werden ausgeblendet (sie stünden im Blick)
  const naheGeoeffneterHalle = (l) => {
    if (!gewaehlt) return false;
    const h = gs.hallen[gewaehlt.id];
    const dx = Math.max(X(h.x) - l.x, 0, l.x - X(h.x + h.b));
    const dz = Math.max(Z(h.y) - l.z, 0, l.z - Z(h.y + h.t));
    return Math.hypot(dx, dz) < 35;
  };
  const sichtbareLaternen = useMemo(() => laternen.filter((l) => !naheGeoeffneterHalle(l)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [laternen, gewaehlt, gs]);
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

  const welt = useRef(null);
  // Gebäude flach machen (3D → 2D) bzw. aus der Fläche wachsen lassen (2D → 3D, Szene beginnt flach)
  const { invalidate } = useThree();   // gl kommt von oben (Zeile mit useThree am Anfang der Szene)
  const flachStand = useRef(flach ? 1 : 0);
  useLayoutEffect(() => { if (welt.current && flachStand.current === 1) welt.current.scale.y = 0.015; }, []);
  useFrame((_, dt) => {
    const ziel = flach ? 1 : 0;
    if (!welt.current || flachStand.current === ziel) return;
    const schritt = vorschau ? 1 : Math.min(dt, 1 / 30) / (ziel ? 0.9 : 1.3);   // unsichtbar: sofort
    flachStand.current = ziel ? Math.min(1, flachStand.current + schritt) : Math.max(0, flachStand.current - schritt);
    welt.current.scale.y = 1 - 0.985 * easing(flachStand.current);
    if (flachStand.current === 1) onFlachFertig?.();   // ganz flach → jetzt darf die 2D-Zeichnung überblenden
    // Schatten in jedem Bild neu: Sonst rechnet SchattenTakt sie nur jedes dritte Bild – während die Gebäude
    // sinken bzw. wachsen passten sie dann nicht zur Form und sprangen sichtbar (Flackern beim Wechsel 2D ↔ 3D)
    gl.shadowMap.needsUpdate = true;
    invalidate();
  });
  const schatten = Math.max(B, T) * 0.7;
  const dimm = f.dunkel ? 0.78 : 1;
  const licht = {
    tag: { himmel: '#ffffff', hemi: 0.85, staerke: 1.7, farbe: '#ffffff', sonne: [B * 0.35, 140, T * 0.55], hintergrund: f['himmel-tag'] },
    daemmerung: { himmel: '#ffd9b8', hemi: 0.65, staerke: 1.15, farbe: '#ffb27a', sonne: [B * 0.9, 45, T * 0.3], hintergrund: f['himmel-daemmerung'] },
    nacht: { himmel: '#a9b9da', hemi: 0.95, staerke: 0.95, farbe: '#aabbff', sonne: [B * 0.35, 140, T * 0.55], hintergrund: f['himmel-nacht'] },
  }[phase] ?? null;
  const weite = Math.max(B * 1.2, T * 1.7) + 10;   // Abstand der Werksansicht (für Zoom-Grenze und Dunst)
  return (
    <>
      {/* Tag: Sonne. Nacht (Dunkelmodus): schwaches, bläuliches Mondlicht – Laternen und Hallen leuchten */}
      {/* Licht nach Ortszeit: Tag (Sonne hoch), Dämmerung (tiefe, warme Sonne), Nacht (Mond).
          Dunkelmodus dämpft alles etwas – damit es abends am Bildschirm nicht blendet. */}
      <hemisphereLight args={[licht.himmel, f.gelaende, licht.hemi * dimm]} />
      <ambientLight intensity={0.25 * dimm} />
      <directionalLight position={licht.sonne} intensity={licht.staerke * dimm} color={licht.farbe} castShadow
                        shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006}
                        shadow-camera-left={-schatten} shadow-camera-right={schatten}
                        shadow-camera-top={schatten} shadow-camera-bottom={-schatten} shadow-camera-far={400} />
      <Kamera ziel={ziel} bewegt={bewegt && !vorschau} steuerung={steuerung} onFortschritt={onKameraFortschritt} />
      {/* Nur zoomen (Mausrad bzw. zwei Finger), dorthin wo der Zeiger steht – kein Drehen, kein Verschieben */}
      <OrbitControls ref={steuerung} makeDefault enableDamping dampingFactor={0.12} enableRotate={false} enablePan={false} zoomToCursor
                     minDistance={6} maxDistance={weite * 1.5} />
      {/* Himmel und Dunst: die Landschaft läuft bis zum Horizont weich aus (keine schwebende Platte) */}
      <color attach="background" args={[licht.hintergrund]} />
      <fog attach="fog" args={[licht.hintergrund, weite * 1.3, weite * 4.5]} />
      {/* Alles Gebaute in einer Gruppe: beim Wechsel zu 2D sinken die Höhen auf (fast) null – von oben sieht
          die Szene dann aus wie die Zeichnung, in die danach übergeblendet wird */}
      <group ref={welt}>

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
      <AussenDetails gs={gs} f={f} X={X} Z={Z} />
      <Rohrbruecken gs={gs} f={f} X={X} Z={Z} gewaehltId={gewaehlt?.id} />
      {/* Zebrastreifen über die Zufahrt vor dem Tor */}
      <Viele teile={Array.from({ length: 9 }, (_, i) => ({ p: [X(gs.tor.x + gs.tor.b / 2), 0.035, Z(gs.zufahrtY + 1 + i)], g: [3.2, 0.01, 0.5] }))}
             farbe={f.markierung} schatten={false} />
      {/* Geparkte Autos (alle zusammen als Instanzen) */}
      <ParkendeAutos plaetze={autos} />
      <Quader p={[X(gs.tor.x + gs.tor.b / 2), 0.6, Z(T - 1)]} g={[gs.tor.b, 1.2, 0.3]} farbe={f.tor} />

      <LaternenGruppe laternen={sichtbareLaternen} f={f} />
      <Landesdeko standort={standort} gs={gs} f={f} X={X} Z={Z} gebaeudeId={gewaehlt?.id} />
      {/* Betonflächen rund um die Hallen (Vorplatz, Anlieferung) */}
      {gebaeude.map((g) => {
        const h = gs.hallen[g.id];
        return <Flaeche key={`vp${g.id}`} x={X(h.x + h.b / 2)} z={Z(h.y + h.t / 2)} b={h.b + 10} t={h.t + 9} farbe={f.beton} y={0.012} />;
      })}
      {/* Hallenlicht: immer zwei Lichtquellen (nachts in der geöffneten Halle an, sonst aus). Die Anzahl der Lichter
          bleibt so gleich – sonst müsste Three.js beim Öffnen einer Halle alle Grafikprogramme neu übersetzen. */}
      {[-0.25, 0.25].map((ax) => {
        const h = gewaehlt ? gs.hallen[gewaehlt.id] : null;
        return (
          <pointLight key={`hl${ax}`} position={h ? [X(h.x + h.b / 2) + ax * h.b, h.hoehe - 1.2, Z(h.y + h.t / 2)] : [0, -50, 0]} color={f.licht}
                      intensity={h && nacht ? 380 : 0} distance={h ? Math.max(h.b, h.t) * 1.3 : 1} decay={2} />
        );
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
          return (
            <group key={i} position={[X(d.x + d.b / 2), 0, Z(d.y + d.t / 2)]}>
              <VorDemBuero d={d} f={f} />
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
      {/* Bäume auf dem Gelände: als Instanzen (ein Zeichenaufruf je Teileart statt je Baum) */}
      <BaumGruppe baeume={baumListe} f={f} />

      {/* Hallen */}
      {gebaeude.map((g) => {
        const h = gs.hallen[g.id];
        const offen = gewaehlt?.id === g.id;
        const hervor = hover === `g${g.id}`;
        const farbe = stufenFarbe(f, g.offen, g.hoechste_prioritaet, neutral);
        return (
          <group key={g.id} position={[X(h.x + h.b / 2), 0, Z(h.y + h.t / 2)]}>
            {/* Geöffnete Halle: Wände, Dach und Anbauten ganz weg – nur Boden und Einrichtung bleiben (freie Sicht) */}
            {!offen && (
              <>
                <mesh position={[0, h.hoehe / 2, 0]} castShadow receiveShadow
                      onClick={(e) => klick(e, () => onGebaeude(g))}
                      onPointerOver={(e) => { e.stopPropagation(); setHover(`g${g.id}`); }} onPointerOut={() => setHover(null)}>
                  <boxGeometry args={[h.b, h.hoehe, h.t]} />
                  <meshStandardMaterial color={f.wand} map={wandTexturen.get(g.id)} roughness={0.8}
                                        emissive={f.akzent} emissiveIntensity={hervor ? 0.18 : 0} />
                </mesh>
                {/* Fensterband, Rolltor, Dach, Streifen in der Störungsfarbe */}
                <Quader p={[0, h.hoehe * 0.72, 0]} g={[h.b + 0.1, 1.3, h.t + 0.1]} farbe={f.fenster} schatten={false}
                        map={texturen.fenster.get(g.id)} leuchten={nacht ? 0.9 : 0} lichtFarbe={f.licht} />
                <Quader p={[0, 2.4, h.t / 2 + 0.05]} g={[Math.min(6, h.b * 0.3), 4.8, 0.2]} farbe={f.tor} schatten={false} />
                <Quader p={[0, 0.25, 0]} g={[h.b + 0.5, 0.5, h.t + 0.5]} farbe={farbe} schatten={false} />
                <Dach form={h.dach} b={h.b} t={h.t} hoehe={h.hoehe} farbe={dachFarbe} glas={f.glas} />
                <Fassade h={h} f={f} />
                {!h.lager && <Industrie h={h} f={f} bewegt={bewegt} seite={h.anbauten.find((a) => a.art === 'kopfbau')?.seite ? -h.anbauten.find((a) => a.art === 'kopfbau').seite : 1} />}
                {solar.has(g.id) && <Solar h={h} map={texturen.solar} />}
              </>
            )}
            {/* Anbauten: Flachbau, Kopfbau mit Büros, höherer Hallenteil (bei geöffneter Halle ausgeblendet) */}
            {!offen && (
              <group onClick={(e) => klick(e, () => onGebaeude(g))}
                     onPointerOver={(e) => { e.stopPropagation(); setHover(`g${g.id}`); }} onPointerOut={() => setHover(null)}>
                {h.anbauten.map((a, i) => (
                  <Anbau key={i} a={a} lx={a.x + a.b / 2 - h.x - h.b / 2} lz={a.y + a.t / 2 - h.y - h.t / 2} f={f}
                         dachFarbe={dachFarbe} wand={wandTexturen.get(g.id)} />
                ))}
              </group>
            )}
            {/* Innenleben: einmal aufgebaut (vorab im Hintergrund oder beim ersten Öffnen), danach nur noch
                ein- und ausgeblendet – Öffnen und Schließen einer Halle ohne Wartezeit */}
            {(offen || vorbereitet.has(g.id)) && (
              <HallenInneres halle={g} h={h} f={f} bewegt={bewegt && offen} aktiv={offen} maschineId={maschineId} neutral={neutral}
                             boden={texturen.boden} maschinen={maschinenJeHalle.get(g.id) ?? []}
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
      {/* Gabelstapler bringt Paletten über die Werksstraße */}
      {staplerWeg && <Gabelstapler a={staplerWeg.a} b={staplerWeg.b} f={f} bewegt={bewegt} phase={0.55} tempo={3} />}
      {/* Verkehr auf der Zufahrt: je Spur eine Richtung */}
      {bewegt && [
        { art: 'lkw', spur: 2.6, richtung: 1, tempo: 7, phase: 0.1, farbe: AUTO_FARBEN[5] },
        { art: 'auto', spur: 7.4, richtung: -1, tempo: 11, phase: 0.45, farbe: AUTO_FARBEN[4] },
        { art: 'auto', spur: 2.6, richtung: 1, tempo: 10, phase: 0.75, farbe: AUTO_FARBEN[0] },
      ].map((v, i) => (
        <Fahrzeug key={i} {...v} von={X(6)} bis={X(B - 6)} z={Z(gs.zufahrtY + v.spur)} f={f} />
      ))}
      </group>
    </>
  );
}

/** Innenleben der gewählten Halle (Koordinaten relativ zur Hallenmitte) */
function HallenInneres({ halle, h, f, bewegt, aktiv, maschinen, maschineId, onMaschine, hover, setHover, klick, neutral, boden }) {
  const t = useT();
  // Beim ersten Aufbau die Grafikprogramme (Shader) im Hintergrund übersetzen lassen (compileAsync blockiert
  // den Browser nicht), danach einmal kurz zeichnen (hinter den geschlossenen Wänden), damit auch Formen und
  // Texturen auf der Grafikkarte liegen, wenn die Halle geöffnet wird. Danach unsichtbar, solange die Halle zu ist.
  const innen = useRef(null);
  const { gl, camera, scene, invalidate } = useThree();
  const [aufwaermen, setAufwaermen] = useState(aktiv ? 0 : -1);   // -1 = Shader werden noch übersetzt
  useEffect(() => {
    if (aufwaermen !== -1 || !innen.current) return undefined;
    let aktuell = true;
    const gruppe = innen.current;
    // compile() berücksichtigt nur sichtbare Teile – deshalb für den Aufruf kurz sichtbar schalten
    gruppe.visible = true;
    const fertig = () => { if (aktuell) { setAufwaermen(1); invalidate(); } };
    const versprechen = gl.compileAsync ? gl.compileAsync(gruppe, camera, scene) : Promise.resolve();
    gruppe.visible = false;
    versprechen.then(fertig, fertig);
    return () => { aktuell = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFrame(() => { if (aufwaermen > 0) setAufwaermen((n) => n - 1); });
  const sichtbar = aktiv || aufwaermen > 0;
  const ox = -h.b / 2;
  const oz = -h.t / 2;
  const bereiche = halle.bereiche ?? [];
  const gang = useMemo(() => gangInHalle(halle, maschinen), [halle, maschinen]);
  const stellflaechen = useMemo(() => {
    const sockel = [];
    const rahmen = [];
    maschinen.forEach((m) => {
      const x = -h.b / 2 + m.pos_x_m + m.breite_m / 2;
      const z = -h.t / 2 + m.pos_y_m + m.tiefe_m / 2;
      // Sockel vorn 1 m länger: dort steht der Kurzname als Bodenschrift
      const b = m.breite_m * 1.12 + 1.2;
      const t = m.tiefe_m * 1.12 + 2.2;
      const zm = z + 0.5;
      sockel.push({ p: [x, 0.06, zm], g: [b, 0.12, t] });
      rahmen.push({ p: [x, 0.125, zm - t / 2 + 0.12], g: [b, 0.01, 0.24] }, { p: [x, 0.125, zm + t / 2 - 0.12], g: [b, 0.01, 0.24] },
        { p: [x - b / 2 + 0.12, 0.125, zm], g: [0.24, 0.01, t] }, { p: [x + b / 2 - 0.12, 0.125, zm], g: [0.24, 0.01, t] });
    });
    return { sockel, rahmen };
  }, [maschinen, h.b, h.t]);
  // Betonboden mit Fugen (Textur je Halle passend zur Größe)
  const bodenMap = useMemo(() => {
    const m = boden.clone();
    m.repeat.set(h.b / 6, h.t / 6);
    m.needsUpdate = true;
    return m;
  }, [boden, h.b, h.t]);
  const mitKran = h.hoehe < 14 && !/lager|logistik|versand|labor|büro/i.test(halle.bezeichnung ?? '');
  return (
    <group ref={innen} visible={sichtbar}>
      <Flaeche x={0} z={0} b={h.b} t={h.t} farbe={f.hallenboden} y={0.03} map={bodenMap} />
      <HallenDetails halle={halle} h={h} maschinen={maschinen} gang={gang} f={f} />
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
      {/* Stellflächen: jede Maschine steht auf einem hellen Sockel mit gelbem Sicherheitsrahmen –
          so hebt sie sich klar von Boden, Lager und Büro ab (zwei Zeichenaufrufe für alle) */}
      <Viele teile={stellflaechen.sockel} farbe={f.hallenboden} schatten={false} rauheit={0.6} />
      <Viele teile={stellflaechen.rahmen} farbe={f.signal} schatten={false} />
      {maschinen.map((m) => {
        const L = Math.max(m.breite_m, m.tiefe_m);
        const W = Math.min(m.breite_m, m.tiefe_m);
        const gewaehlt = m.id === maschineId;
        const hervor = hover === `m${m.id}`;
        const farbe = stufenFarbe(f, m.offen, m.hoechste_prioritaet, neutral);
        const mitStoerung = !neutral && m.offen > 0;
        const ereignisse = aktiv ? {
          onClick: (e) => klick(e, () => onMaschine(m)),
          onPointerOver: (e) => { e.stopPropagation(); setHover(`m${m.id}`); },
          onPointerOut: () => setHover(null),
        } : {};
        return (
          <group key={m.id} position={[ox + m.pos_x_m + m.breite_m / 2, 0, oz + m.pos_y_m + m.tiefe_m / 2]} {...ereignisse}>
            {/* Leuchtender Rand bei Störung bzw. Auswahl */}
            {(gewaehlt || mitStoerung || hervor) && (
              <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[m.breite_m + 2.2, m.tiefe_m + 2.2]} />
                <meshBasicMaterial color={gewaehlt ? f.akzent : mitStoerung ? farbe : f.linie} transparent opacity={gewaehlt ? 0.75 : mitStoerung ? 0.55 : 0.4} />
              </mesh>
            )}
            {/* Maschine etwas größer als ihre Stellfläche in der Datenbank, damit sie gut zu erkennen ist */}
            <group position-y={0.12} rotation-y={m.tiefe_m > m.breite_m ? Math.PI / 2 : 0} scale={hervor || gewaehlt ? 1.18 : 1.12}>
              {/* Große Ampel mit LED-Anzeige (Zahl offener Störungen) – ragt deutlich über die Maschine */}
              <MaschineMitAmpel m={m} L={L} W={W} f={f} bewegt={bewegt} detail="mittel" ampelGroesse={3} anzeige={neutral ? null : m.offen} />
            </group>
            {/* Kurzname als Bodenmarkierung vorn auf dem Sockel – nichts schwebt über der Maschine */}
            <BodenSchild text={m.bezeichnung.split(' ').pop()} b={Math.min(m.breite_m * 1.12 + 0.6, 3.2)} z={m.tiefe_m * 0.56 + 0.95} f={f} />
            {/* Name beim Darüberfahren bzw. bei Auswahl klein an der vorderen Ecke des Sockels (die Zahl steht auf der Ampel) */}
            {aktiv && (gewaehlt || hervor) && (
              <Html position={[-(m.breite_m * 0.56 + 0.3), 0.3, m.tiefe_m * 0.56 + 1.3]} center zIndexRange={[4, 1]}>
                <button type="button" className={`raum-marke stufe-ruhig${gewaehlt ? ' gewaehlt' : ''}`}
                        aria-label={neutral ? `${m.bezeichnung} (${m.anlagennummer})` : `${m.bezeichnung} (${m.anlagennummer}): ${offenText(m.offen, t)}`}
                        aria-pressed={gewaehlt} data-ort={`m-${m.id}`} onClick={() => onMaschine(m)}>
                  <span className="raum-marke-name">{m.bezeichnung} · {m.anlagennummer}</span>
                </button>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Schatten nicht in jedem Bild neu berechnen: Die Schattenkarte zeichnet alle schattenwerfenden Teile ein
 * zweites Mal. Die Sonne steht still, nur Figuren und Fahrzeuge bewegen sich – jedes dritte Bild reicht
 * (sieht gleich aus, spart viel Rechenzeit).
 */
function SchattenTakt({ bewegt }) {
  const { gl } = useThree();
  const bild = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => { gl.shadowMap.autoUpdate = true; };
  }, [gl]);
  useFrame(() => {
    bild.current += 1;
    if (!bewegt || bild.current % 3 === 0) gl.shadowMap.needsUpdate = true;
  });
  return null;
}

/** Meldet, sobald nach dem Übersetzen zwei Bilder gezeichnet wurden (die Szene ist dann sichtbar fertig) */
function ErsteBilder({ onFertig }) {
  const zaehler = useRef(0);
  const { invalidate } = useThree();
  useFrame(() => {
    zaehler.current += 1;
    if (zaehler.current === 2) onFertig(); else if (zaehler.current < 2) invalidate();
  });
  useEffect(() => { invalidate(); }, [invalidate]);
  return null;
}

/** Grafikprogramme (Shader) vorab übersetzen, ohne den Browser zu blockieren – erst danach wird gezeichnet */
function Vorbereiten({ onFertig }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let abgebrochen = false;
    const fertig = () => { if (!abgebrochen) onFertig(); };
    if (gl.compileAsync) gl.compileAsync(scene, camera).then(fertig, fertig); else fertig();
    return () => { abgebrochen = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function Werk3D(props) {
  const { f, bewegt } = useRaum();
  const rahmen = useRef(null);
  const sichtbar = useSichtbar(rahmen);   // außerhalb des Bildschirms wird nicht gezeichnet
  const [fertig, setFertig] = useState(false);   // Shader übersetzt → zeichnen und einblenden
  // Kamera: beginnt senkrecht von oben (dort landet die Kamerafahrt aus dem Land) und kippt, sobald die Ebene
  // aktiv ist, in die Schrägansicht. Verlassen: 'flach' = nach oben, dann sinken die Gebäude ab (→ 2D);
  // 'hoch' = Kamera steigt in die Vogelperspektive, während die Karte ins Land herauszoomt.
  const { verlassen, starten, onBereit, vorschau, onFlach, aufbauen, ruhen, onWeg } = props;
  // Beim Abbauen melden (die Szene gilt dann nicht mehr als vorbereitet)
  useEffect(() => () => onWeg?.(), []);   // eslint-disable-line react-hooks/exhaustive-deps
  // Erst „bereit“ melden, wenn wirklich Bilder gezeichnet sind – sonst wäre die Fläche während der Kamerafahrt leer
  const [gezeichnet, setGezeichnet] = useState(false);
  // Unsichtbar vorbereitete Szene (vorschau): nach den ersten Bildern anhalten, bis sie gebraucht wird –
  // so zeichnet im Hintergrund nichts, während man noch über die Landkarte fährt
  const [pause, setPause] = useState(false);
  // Wird eine Szene unsichtbar vorbereitet bzw. behalten: Kamera senkrecht von oben, Gebäude flach, wenn sie
  // beim Umschalten 2D → 3D erst wachsen sollen (aufbauen) – so passt sie deckungsgleich zur Zeichnung
  useEffect(() => {
    if (!vorschau) return;
    setKamera('oben');
    setFlach(Boolean(aufbauen));
  }, [vorschau, aufbauen]);
  // Ändert sich die vorbereitete Ebene (z. B. andere Halle), kurz weiterzeichnen – die Kamera springt dorthin
  useEffect(() => {
    if (!vorschau || !fertig) { setPause(false); return undefined; }
    setPause(false);
    const warten = setTimeout(() => setPause(true), 400);
    return () => clearTimeout(warten);
  }, [vorschau, fertig, props.gebaeudeId]);
  const [kamera, setKamera] = useState('oben');
  // aufbauen (2D → 3D): Szene beginnt flach von oben (deckungsgleich mit der Zeichnung), die Gebäude wachsen,
  // während die Kamera in die Schrägansicht kippt
  const [flach, setFlach] = useState(Boolean(aufbauen));
  const [hintergrund, setHintergrund] = useState(false);   // Halleninneres vorbereiten erst, wenn Ruhe ist
  useEffect(() => { if (gezeichnet) onBereit?.(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [gezeichnet]);
  useEffect(() => {
    if (verlassen === 'hoch') { setKamera('hoch'); return undefined; }
    if (verlassen === 'flach') {
      // Ablauf ohne feste Zeiten (auch auf langsamen Rechnern im Takt): Kamera steigt und dreht sich nach oben →
      // ab der Hälfte der Fahrt sinken die Gebäude ab → onFlach (KartenExplorer blendet zur Zeichnung über)
      setKamera('oben');
      // schon oben (keine neue Fahrt, also keine Ankunft) oder ohne Bewegung: gleich flach machen
      if (!bewegt || kamera === 'oben') setFlach(true);
      return undefined;
    }
    if (!fertig || !starten) return undefined;
    // Kippen in die Schrägansicht und (falls flach) Gebäude wachsen lassen – gleichzeitig
    const warten = setTimeout(() => { setKamera('normal'); setFlach(false); }, bewegt ? 120 : 0);
    return () => clearTimeout(warten);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fertig, starten, verlassen, bewegt]);
  const kameraFortschritt = (schluessel, stand) => { if (verlassen === 'flach' && schluessel.startsWith('oben') && stand >= 0.5) setFlach(true); };
  const flachGemeldet = useRef(false);
  const flachFertig = () => { if (!flachGemeldet.current && verlassen === 'flach') { flachGemeldet.current = true; onFlach?.(); } };
  useEffect(() => { if (verlassen !== 'flach') flachGemeldet.current = false; }, [verlassen]);
  useEffect(() => {
    if (kamera !== 'normal') return undefined;
    const warten = setTimeout(() => setHintergrund(true), 2000);
    return () => clearTimeout(warten);
  }, [kamera]);
  // Ortszeit des Werks, jede Minute neu – bestimmt Tag, Dämmerung oder Nacht
  const [zeit, setZeit] = useState(() => ortszeit(props.standort));
  useEffect(() => {
    setZeit(ortszeit(props.standort));
    const takt = setInterval(() => setZeit(ortszeit(props.standort)), 60000);
    return () => clearInterval(takt);
  }, [props.standort]);
  const t = useT();
  return (
    <div className={`raum${fertig ? ' fertig' : ''}${props.verlassen ? ' verlassen' : ''}`} ref={rahmen}
         // Zahl der Maschinen mit LED-Anzeige > 0 in der geöffneten Halle (für Tests und Screenreader-Hinweis)
         data-stoerungsanzeigen={props.gebaeudeId && !props.neutral ? props.maschinen.filter((m) => m.gebaeude_id === props.gebaeudeId && m.offen > 0).length : undefined}>
      {/* offsetSize: Größe ohne CSS-Transform messen (die Ebene wird beim Zoomen skaliert) */}
      {/* ruhen: während der Zoom-Fahrt aus dem Land steht die Kamera still über dem Werk – die Szene muss nicht neu
          gezeichnet werden; die Grafikkarte hat dann nur die Kamerafahrt der Karte zu tun (flüssiger) */}
      <Canvas shadows dpr={[1, 1.5]} frameloop={!sichtbar || !fertig || pause || (ruhen && gezeichnet) ? 'never' : bewegt ? 'always' : 'demand'} resize={{ offsetSize: true }}
              camera={{ fov: 38, near: 0.5, far: 4000, position: [150, 200, 220] }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
              // Keine Shader-Fehlerprüfung: Sie wartet nach jedem neuen Grafikprogramm synchron auf die Grafikkarte
              // und blockierte beim Aufbau über eine Sekunde (Profil). compileAsync übersetzt dann wirklich im Hintergrund.
              onCreated={({ gl }) => { gl.debug.checkShaderErrors = false; }}>
        <Szene {...props} f={f} bewegt={bewegt} phase={zeit.phase} kamera={kamera} flach={flach} hintergrund={hintergrund}
               onKameraFortschritt={kameraFortschritt} onFlachFertig={flachFertig} />
        <Vorbereiten onFertig={() => setFertig(true)} />
        <SchattenTakt bewegt={bewegt} />
        {fertig && !gezeichnet && <ErsteBilder onFertig={() => setGezeichnet(true)} />}
      </Canvas>
      <span className="raum-uhr" title={t('Ortszeit am Standort')}>
        <i className={`bi ${zeit.phase === 'nacht' ? 'bi-moon-stars' : zeit.phase === 'daemmerung' ? 'bi-sunset' : 'bi-sun'}`} aria-hidden="true" />
        {t('Ortszeit {zeit}', { zeit: zeit.text })}
      </span>
    </div>
  );
}
