'use client';
/**
 * components/karten/raum/Bausteine.js – gemeinsame Bausteine der 3D-Ansicht
 *
 *  - Viele:   viele gleiche Quader (Regalstützen, Paletten, Hallenstützen, Pakete …) in EINEM
 *             Zeichenaufruf (InstancedMesh). Das hält die Szene flüssig, auch mit vielen Einzelteilen.
 *  - Gehaeuse: Quader mit abgerundeten Kanten (Maschinenverkleidung, Autos) – wirkt deutlich echter.
 *  - canvasTextur: kleine, wiederholbare Textur aus einem Canvas (keine Bilddateien).
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

const hilfe = new THREE.Object3D();
const farbeHilfe = new THREE.Color();

/**
 * teile: [{ p: [x, y, z], g: [b, h, t], r?: [rx, ry, rz], farbe?: '#…' }]
 * form: 'box' (Standard) oder 'zyl' (stehender Zylinder, g = [Durchmesser, Höhe, Durchmesser])
 * geometrie: eigene Form in Originalgröße (z. B. Autokarosserie), g ist dann Skalierung (Standard 1)
 */
export function Viele({ teile, farbe = '#ffffff', form = 'box', geometrie = null, schatten = true, rauheit = 0.75, metall = 0 }) {
  const ref = useRef(null);
  const mitFarben = teile.some((t) => t.farbe);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    teile.forEach((t, i) => {
      hilfe.position.set(...t.p);
      hilfe.rotation.set(...(t.r ?? [0, 0, 0]));
      hilfe.scale.set(...(t.g ?? [1, 1, 1]));
      hilfe.updateMatrix();
      mesh.setMatrixAt(i, hilfe.matrix);
      if (mitFarben) mesh.setColorAt(i, farbeHilfe.set(t.farbe ?? farbe));
    });
    mesh.count = teile.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [teile, farbe, mitFarben]);
  if (!teile.length) return null;
  return (
    <instancedMesh ref={ref} args={[null, null, teile.length]} castShadow={schatten} receiveShadow>
      {geometrie ? <primitive object={geometrie} attach="geometry" dispose={null} />
        : form === 'zyl' ? <cylinderGeometry args={[0.5, 0.5, 1, 12]} /> : <boxGeometry args={[1, 1, 1]} />}
      {/* bei Einzelfarben je Teil: Grundfarbe weiß, sonst würde sie mit der Teilfarbe multipliziert */}
      <meshStandardMaterial color={mitFarben ? '#ffffff' : farbe} roughness={rauheit} metalness={metall} />
    </instancedMesh>
  );
}

/** Quader mit abgerundeten Kanten. p = Mitte, g = [b, h, t] */
export function Gehaeuse({ p, g, farbe, radius = 0.06, rauheit = 0.55, metall = 0.1, schatten = true, ...rest }) {
  const r = Math.min(radius, ...g.map((w) => w / 2 - 0.001));
  return (
    <RoundedBox args={g} radius={r} smoothness={2} position={p} castShadow={schatten} receiveShadow {...rest}>
      <meshStandardMaterial color={farbe} roughness={rauheit} metalness={metall} />
    </RoundedBox>
  );
}

/** Kleine Canvas-Textur, wiederholbar in beide Richtungen */
export function canvasTextur(breite, hoehe, zeichnen) {
  const c = document.createElement('canvas');
  c.width = breite; c.height = hoehe;
  zeichnen(c.getContext('2d'), breite, hoehe);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Textur einmal erzeugen und beim Abbauen freigeben; wiederholung = [x, y] */
export function useCanvasTextur(breite, hoehe, zeichnen, wiederholung = [1, 1], abhaengig = []) {
  const textur = useMemo(() => {
    const t = canvasTextur(breite, hoehe, zeichnen);
    t.repeat.set(...wiederholung);
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breite, hoehe, ...wiederholung, ...abhaengig]);
  useLayoutEffect(() => () => textur.dispose(), [textur]);
  return textur;
}
