'use client';
/**
 * components/karten/raum/MaschineDetail3D.js – Maschine als drehendes 3D-Modell im Infofenster
 *
 * Erscheint rechts in der Info-Spalte, sobald man eine Maschine anklickt (2D und 3D).
 * Das Modell dreht sich langsam (wie auf einem Drehteller), die beweglichen Teile laufen
 * und die Signalampel zeigt den Zustand. Mit Maus/Finger lässt es sich drehen und zoomen.
 * Bei Stillstand (Ampel rot) stehen die Teile still; bei "Bewegung reduzieren" dreht nichts.
 */
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MaschineMitAmpel } from './Maschine3D';
import { useRaum } from './farben';

export default function MaschineDetail3D({ maschine }) {
  const { f, bewegt } = useRaum();
  const L = Math.max(maschine.breite_m, maschine.tiefe_m);
  const W = Math.min(maschine.breite_m, maschine.tiefe_m);
  const abstand = Math.max(L, W * 1.4, 3.2) * 1.55;

  return (
    <div className="maschine-detail-3d">
      <Canvas shadows dpr={[1, 2]} frameloop={bewegt ? 'always' : 'demand'}
              camera={{ fov: 35, near: 0.1, far: 200, position: [abstand * 0.75, abstand * 0.55, abstand * 0.85] }}
              gl={{ antialias: true, alpha: true }}>
        <hemisphereLight args={[f.nacht ? '#9fb0d0' : '#ffffff', f.hallenboden, f.nacht ? 0.6 : 0.95]} />
        <directionalLight position={[6, 10, 5]} intensity={f.nacht ? 0.9 : 1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <OrbitControls target={[0, 1.1, 0]} autoRotate={bewegt} autoRotateSpeed={1.4} enablePan={false}
                       minDistance={abstand * 0.5} maxDistance={abstand * 1.8} maxPolarAngle={Math.PI * 0.48} />
        {/* Drehteller */}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]} receiveShadow>
          <circleGeometry args={[Math.max(L, W) * 0.85, 48]} />
          <meshStandardMaterial color={f.hallenboden} roughness={1} />
        </mesh>
        <MaschineMitAmpel m={maschine} L={L} W={W} f={f} bewegt={bewegt} />
      </Canvas>
    </div>
  );
}
