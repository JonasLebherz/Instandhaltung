'use client';
/**
 * components/karten/raum/Figur.js – Mitarbeiterinnen und Mitarbeiter in der 3D-Ansicht
 *
 * Figur in natürlichen Proportionen (ca. 1,78 m): Sicherheitsschuhe, Arbeitshose, Warnweste mit
 * Reflexstreifen bzw. Arbeitsanzug, Hände, Kopf mit Helm (Krempe). Beine und Arme schwingen beim
 * Gehen, der Körper wippt leicht. Manche tragen ein Tablet oder eine Werkzeugkiste.
 * Läuft zwischen a und b hin und her (Werkskoordinaten der Szene).
 * Nur Rumpf und Beine werfen Schatten – das spart Rechenzeit.
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/** Kleidung je Art: Weste/Oberteil, Ärmel, Hose, Helm (Farben aus der Szene f) */
function kleidung(art, f, farbe) {
  switch (art % 3) {
    case 0: return { weste: farbe, aermel: f.blau, hose: f['maschine-dunkel'], helm: f.signal, streifen: true };
    case 1: return { weste: farbe, aermel: f['maschine-dunkel'], hose: f.blau, helm: f.markierung, streifen: true };
    default: return { weste: f.blau, aermel: f.blau, hose: f.blau, helm: f.blau, streifen: false };   // Arbeitsanzug
  }
}

export default function Figur({ a, b, farbe, f, bewegt, phase, tempo, art = 0 }) {
  const ref = useRef(null);
  const koerper = useRef(null);
  const glieder = useRef([]);          // linkes/rechtes Bein, linker/rechter Arm
  const laenge = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const setzen = (s, zeit) => {
    const weg = s % (2 * laenge);
    const d = weg < laenge ? weg : 2 * laenge - weg;
    const vor = weg < laenge;
    ref.current.position.set(a[0] + ((b[0] - a[0]) * d) / laenge, 0, a[1] + ((b[1] - a[1]) * d) / laenge);
    ref.current.rotation.y = Math.atan2((b[0] - a[0]) * (vor ? 1 : -1), (b[1] - a[1]) * (vor ? 1 : -1));
    const takt = zeit * tempo * 5.5;
    const schwung = Math.sin(takt) * 0.45;
    glieder.current.forEach((g, i) => { if (g) g.rotation.x = (i % 2 ? -schwung : schwung) * (i < 2 ? 1 : -0.8); });
    if (koerper.current) koerper.current.position.y = Math.abs(Math.cos(takt)) * 0.03;
  };
  useEffect(() => { if (ref.current) setzen(phase * laenge * 2, 0); });
  useFrame(({ clock }) => { if (bewegt && ref.current) setzen(clock.elapsedTime * tempo + phase * laenge * 2, clock.elapsedTime); });

  const k = kleidung(art, f, farbe);
  const traegt = art % 4 === 1 ? 'tablet' : art % 4 === 3 ? 'kiste' : null;
  const bein = (i, x) => (
    <group key={i} position={[x, 0.92, 0]} ref={(el) => { glieder.current[i] = el; }}>
      <mesh position={[0, -0.43, 0]} castShadow>
        <capsuleGeometry args={[0.075, 0.7, 3, 8]} />
        <meshStandardMaterial color={k.hose} roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.86, 0.05]}>
        <boxGeometry args={[0.12, 0.09, 0.27]} />
        <meshStandardMaterial color="#1d1f23" roughness={0.6} />
      </mesh>
    </group>
  );
  const arm = (i, x) => (
    <group key={i} position={[x, 1.44, 0]} ref={(el) => { glieder.current[i] = el; }}>
      <mesh position={[0, -0.27, 0]}>
        <capsuleGeometry args={[0.055, 0.42, 3, 8]} />
        <meshStandardMaterial color={k.aermel} roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.56, 0]}>
        <sphereGeometry args={[0.052, 10, 8]} />
        <meshStandardMaterial color={f.haut} roughness={0.8} />
      </mesh>
      {/* Tablet bzw. Werkzeugkiste in der rechten Hand */}
      {i === 3 && traegt === 'tablet' && (
        <mesh position={[0, -0.5, 0.1]} rotation-x={-0.9}>
          <boxGeometry args={[0.2, 0.28, 0.02]} />
          <meshStandardMaterial color="#22262c" emissive={f.akzent} emissiveIntensity={0.25} />
        </mesh>
      )}
      {i === 3 && traegt === 'kiste' && (
        <mesh position={[0, -0.66, 0]}>
          <boxGeometry args={[0.16, 0.16, 0.42]} />
          <meshStandardMaterial color={f['ampel-rot']} roughness={0.5} />
        </mesh>
      )}
    </group>
  );
  return (
    <group ref={ref}>
      <group ref={koerper}>
        {bein(0, -0.1)}
        {bein(1, 0.1)}
        {arm(2, -0.255)}
        {arm(3, 0.255)}
        {/* Rumpf (Weste bzw. Anzug), etwas flacher als breit */}
        <mesh position={[0, 1.2, 0]} scale={[1.12, 1, 0.78]} castShadow>
          <capsuleGeometry args={[0.18, 0.38, 4, 12]} />
          <meshStandardMaterial color={k.weste} roughness={0.7} />
        </mesh>
        {/* Reflexstreifen der Warnweste (nachts hell) */}
        {k.streifen && [1.1, 1.27].map((y) => (
          <mesh key={y} position={[0, y, 0]} scale={[1.12, 1, 0.78]}>
            <cylinderGeometry args={[0.186, 0.186, 0.035, 16, 1, true]} />
            <meshStandardMaterial color="#e6ebf0" emissive="#e6ebf0" emissiveIntensity={f.nacht ? 0.8 : 0.1} roughness={0.3} />
          </mesh>
        ))}
        {/* Hals, Kopf, Helm mit Krempe */}
        <mesh position={[0, 1.53, 0]}>
          <cylinderGeometry args={[0.055, 0.06, 0.08, 10]} />
          <meshStandardMaterial color={f.haut} roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.65, 0]} scale={[1, 1.12, 1]} castShadow>
          <sphereGeometry args={[0.11, 16, 12]} />
          <meshStandardMaterial color={f.haut} roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.69, 0]}>
          <sphereGeometry args={[0.128, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={k.helm} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.69, 0.03]}>
          <cylinderGeometry args={[0.15, 0.15, 0.012, 18]} />
          <meshStandardMaterial color={k.helm} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
