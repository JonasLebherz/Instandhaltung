'use client';
/**
 * components/karten/raum/MaschineDetail3D.js – Maschine als 3D-Modell im Infofenster
 *
 * Erscheint rechts in der Info-Spalte, sobald man eine Maschine anklickt (2D und 3D).
 * Feste Kamera schräg von vorn, ausführlicheres Modell als in der Halle (Bedienpult mit
 * Bildschirm und Not-Halt, Warnstreifen, typische Teile je Maschinentyp). Die beweglichen
 * Teile laufen und die Signalampel zeigt den Zustand – bei Stillstand steht alles still.
 * Gezeichnet wird nur, solange das Modell sichtbar ist.
 */
import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { MaschineMitAmpel, MASCHINEN_HOEHE } from './Maschine3D';
import { useRaum, useSichtbar } from './farben';

export default function MaschineDetail3D({ maschine }) {
  const { f, bewegt } = useRaum();
  const rahmen = useRef(null);
  const sichtbar = useSichtbar(rahmen);
  const L = Math.max(maschine.breite_m, maschine.tiefe_m);
  const W = Math.min(maschine.breite_m, maschine.tiefe_m);
  // Abstand so, dass die ganze Maschine samt Ampel und Bedienpult ins Bild passt (Kugel um das Modell)
  const hoehe = Math.max(3.8, (MASCHINEN_HOEHE[maschine.typ] ?? 0) + 1.25);   // + Ampel (vier Leuchten) über der Maschine
  const radius = 0.5 * Math.hypot(L + 0.6, W + 1.2, hoehe);
  const abstand = (radius / Math.sin((32 / 2) * (Math.PI / 180))) * 0.82;
  const blickHoehe = Math.max(1.3, hoehe * 0.38);

  return (
    <div className="maschine-detail-3d" ref={rahmen}>
      <Canvas shadows dpr={[1, 1.5]} frameloop={!sichtbar ? 'never' : bewegt ? 'always' : 'demand'}
              camera={{ fov: 32, near: 0.1, far: 200, position: [abstand * 0.62, blickHoehe + abstand * 0.42, abstand * 0.95] }}
              onCreated={({ camera, gl }) => { camera.lookAt(0, blickHoehe, 0.2); gl.debug.checkShaderErrors = false; }} gl={{ antialias: true, alpha: true }}>
        {/* in der Halle immer Tageslicht; im Dunkelmodus etwas gedämpft */}
        <hemisphereLight args={['#ffffff', f.hallenboden, f.dunkel ? 0.8 : 1]} />
        <directionalLight position={[5, 9, 6]} intensity={f.dunkel ? 1.25 : 1.6} castShadow shadow-mapSize={[1024, 1024]} />
        {/* Hallenboden unter der Maschine */}
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[L * 2.2 + 2, W * 2.2 + 2]} />
          <meshStandardMaterial color={f.hallenboden} roughness={1} />
        </mesh>
        <MaschineMitAmpel m={maschine} L={L} W={W} f={f} bewegt={bewegt} detail="voll" ampelGroesse={1.2} />
      </Canvas>
    </div>
  );
}
