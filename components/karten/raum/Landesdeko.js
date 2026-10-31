'use client';
/**
 * components/karten/raum/Landesdeko.js – woran man in 3D erkennt, in welchem Land ein Werk liegt
 *
 *  - Fahnen am Tor: Landesflagge, Firmenflagge, Landesflagge
 *  - Torschild in Landessprache und -schrift ("Werk Albstadt", "上海工厂", "Завод Калуга" …)
 *  - ein typisches Objekt je Land (Platz aus lib/karten/werkGestaltung.js → landPlatz):
 *      DE Biergarten · MX Taco-Truck mit Kakteen · CN Ehrentor mit roten Laternen ·
 *      US Wasserturm · IN Tuk-Tuks und Palmen · FR kleiner Eiffelturm mit Café ·
 *      RU Birken und Kiosk mit Zwiebelturm · PL Pierogi-Stand mit Blumen
 *
 * Fahnen und Schrift werden einmal in ein kleines Canvas gezeichnet und als Textur genutzt –
 * keine Bilddateien, keine Schriftdateien (die Schrift kommt vom System, auch Chinesisch usw.).
 * Die Farben der Flaggen sind Nationalfarben und deshalb hier fest hinterlegt.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/* ---------- Canvas → Textur ---------- */
function useTextur(zeichnen, breite, hoehe, abhaengig) {
  const textur = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = breite;
    c.height = hoehe;
    zeichnen(c.getContext('2d'), breite, hoehe);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, abhaengig);
  useEffect(() => () => textur.dispose(), [textur]);
  return textur;
}

const streifenH = (g, w, h, farben) => farben.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, (i * h) / farben.length, w, h / farben.length + 1); });
const streifenV = (g, w, h, farben) => farben.forEach((c, i) => { g.fillStyle = c; g.fillRect((i * w) / farben.length, 0, w / farben.length + 1, h); });
function stern(g, x, y, r, farbe) {
  g.fillStyle = farbe;
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const w = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.4 : r;
    g.lineTo(x + Math.cos(w) * rr, y + Math.sin(w) * rr);
  }
  g.fill();
}

/** Nationalflaggen (vereinfacht) */
const FLAGGEN = {
  DE: (g, w, h) => streifenH(g, w, h, ['#000000', '#dd0000', '#ffce00']),
  FR: (g, w, h) => streifenV(g, w, h, ['#0055a4', '#ffffff', '#ef4135']),
  PL: (g, w, h) => streifenH(g, w, h, ['#ffffff', '#dc143c']),
  RU: (g, w, h) => streifenH(g, w, h, ['#ffffff', '#0039a6', '#d52b1e']),
  MX: (g, w, h) => {
    streifenV(g, w, h, ['#006847', '#ffffff', '#ce1126']);
    g.fillStyle = '#8b5a2b'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.14, 0, Math.PI * 2); g.fill();
  },
  IN: (g, w, h) => {
    streifenH(g, w, h, ['#ff9933', '#ffffff', '#138808']);
    g.strokeStyle = '#000080'; g.lineWidth = h * 0.025; g.beginPath(); g.arc(w / 2, h / 2, h * 0.13, 0, Math.PI * 2); g.stroke();
  },
  CN: (g, w, h) => {
    g.fillStyle = '#de2910'; g.fillRect(0, 0, w, h);
    stern(g, w * 0.17, h * 0.3, h * 0.16, '#ffde00');
    [[0.34, 0.1], [0.41, 0.2], [0.41, 0.36], [0.34, 0.46]].forEach(([x, y]) => stern(g, w * x, h * y, h * 0.055, '#ffde00'));
  },
  US: (g, w, h) => {
    for (let i = 0; i < 13; i += 1) { g.fillStyle = i % 2 ? '#ffffff' : '#b22234'; g.fillRect(0, (i * h) / 13, w, h / 13 + 1); }
    g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, w * 0.4, (h * 7) / 13);
    g.fillStyle = '#ffffff';
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 6; x += 1) { g.beginPath(); g.arc(w * 0.035 + x * w * 0.063, h * 0.05 + y * h * 0.1, h * 0.018, 0, Math.PI * 2); g.fill(); }
  },
};

/** Torschild in Landessprache */
const ORTSNAMEN = { Shanghai: '上海', Shenzhen: '深圳', Pune: 'पुणे', Kaluga: 'Калуга' };
const SCHILD = {
  DE: (s) => `Werk ${s}`, US: (s) => `${s} Plant`, MX: (s) => `Planta ${s}`, CN: (s) => `${s}工厂`,
  IN: (s) => `${s} संयंत्र`, FR: (s) => `Usine de ${s}`, RU: (s) => `Завод ${s}`, PL: (s) => `Zakład ${s}`,
};

/* ---------- Bausteine ---------- */
function Teil({ p, g, farbe, form = 'box', drehung = [0, 0, 0], leuchten = 0 }) {
  return (
    <mesh position={p} rotation={drehung} castShadow receiveShadow>
      {form === 'box' && <boxGeometry args={g} />}
      {form === 'zyl' && <cylinderGeometry args={g} />}
      {form === 'kugel' && <sphereGeometry args={g} />}
      {form === 'kegel' && <coneGeometry args={g} />}
      <meshStandardMaterial color={farbe} roughness={0.75} emissive={farbe} emissiveIntensity={leuchten} />
    </mesh>
  );
}

/** Schild mit Text (Canvas-Textur) auf einer Tafel, Vorderseite zeigt nach +z */
function Schild({ p, b, h, text, grund = '#1f2a37', schrift = '#ffffff', drehung = 0 }) {
  const textur = useTextur((g, w, hh) => {
    g.fillStyle = grund; g.fillRect(0, 0, w, hh);
    g.fillStyle = schrift;
    g.font = `600 ${Math.round(hh * 0.55)}px system-ui, "Segoe UI", "Microsoft YaHei", "Nirmala UI", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let groesse = Math.round(hh * 0.55);
    while (g.measureText(text).width > w * 0.9 && groesse > 10) { groesse -= 2; g.font = g.font.replace(/\d+px/, `${groesse}px`); }
    g.fillText(text, w / 2, hh / 2 + hh * 0.03);
  }, 512, Math.round((512 * h) / b), [text, grund, schrift, b, h]);
  return (
    <group position={p} rotation-y={drehung}>
      <Teil p={[0, 0, -0.06]} g={[b + 0.2, h + 0.2, 0.1]} farbe="#3a3f47" />
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[b, h]} />
        <meshStandardMaterial map={textur} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Fahnenmast mit Flagge (zeichnen = Funktion aus FLAGGEN) */
function Fahne({ x, z, zeichnen, kennung }) {
  const textur = useTextur(zeichnen, 192, 120, [kennung]);
  return (
    <group position={[x, 0, z]}>
      <Teil p={[0, 4.5, 0]} g={[0.07, 0.09, 9, 8]} form="zyl" farbe="#c9ced6" />
      <mesh position={[1.25, 8.1, 0]} castShadow>
        <planeGeometry args={[2.4, 1.5]} />
        <meshStandardMaterial map={textur} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

/* ---------- Typisches Objekt je Land (lokale Koordinaten, Platz 18 × 12 m) ---------- */
function Typisch({ land, f, nacht }) {
  switch (land) {
    case 'DE':   // Biergarten mit Garnituren und weiß-blauen Schirmen
      return (
        <>
          {[-5, 0, 5].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <Teil p={[0, 0.75, 0]} g={[2.2, 0.06, 0.65]} farbe="#a0764d" />
              {[-0.6, 0.6].map((z) => <Teil key={z} p={[0, 0.45, z]} g={[2.2, 0.05, 0.28]} farbe="#a0764d" />)}
              <Teil p={[0, 1.4, 0]} g={[0.04, 0.04, 2.8, 6]} form="zyl" farbe="#e5e5e5" />
              <Teil p={[0, 2.7, 0]} g={[1.5, 0.7, 12]} form="kegel" farbe={x === 0 ? '#ffffff' : '#2a6ebb'} />
            </group>
          ))}
          <Schild p={[0, 1.4, -3.5]} b={4} h={0.9} text="Biergarten" grund="#2a6ebb" />
        </>
      );
    case 'MX':   // Taco-Truck und Kakteen
      return (
        <>
          <group position={[-2, 0, 0]}>
            <Teil p={[0, 1.6, 0]} g={[5, 2.4, 2.2]} farbe="#f2c14e" />
            <Teil p={[3.1, 1.3, 0]} g={[1.6, 1.8, 2.1]} farbe="#f4f4f4" />
            <Teil p={[0, 1.8, 1.11]} g={[3, 1, 0.02]} farbe="#3a2a1a" leuchten={nacht ? 0.6 : 0} />
            {[-1.6, 1.4, 3.2].map((x) => [1, -1].map((z) => (
              <Teil key={`${x}${z}`} p={[x, 0.4, z * 1.05]} g={[0.4, 0.4, 0.25, 12]} form="zyl" drehung={[Math.PI / 2, 0, 0]} farbe="#202227" />
            )))}
            <Schild p={[0, 3.3, 0.6]} b={3.4} h={0.8} text="TACOS" grund="#ce1126" />
          </group>
          {[[6, -3], [7.5, 2.5], [4.5, 4]].map(([x, z], i) => (
            <group key={i} position={[x, 0, z]} scale={1 + i * 0.15}>
              <Teil p={[0, 1.8, 0]} g={[0.35, 0.4, 3.6, 10]} form="zyl" farbe="#4f8a3c" />
              <Teil p={[0.55, 1.6, 0]} g={[0.7, 0.22, 0.22]} farbe="#4f8a3c" />
              <Teil p={[0.85, 2.2, 0]} g={[0.2, 0.22, 1.2, 8]} form="zyl" farbe="#4f8a3c" />
              <Teil p={[-0.5, 2.3, 0]} g={[0.6, 0.2, 0.2]} farbe="#4f8a3c" />
              <Teil p={[-0.75, 2.8, 0]} g={[0.18, 0.2, 1, 8]} form="zyl" farbe="#4f8a3c" />
            </group>
          ))}
        </>
      );
    case 'CN':   // Ehrentor (Paifang) mit roten Laternen
      return (
        <>
          {[-4, 4].map((x) => <Teil key={x} p={[x, 3, 0]} g={[0.35, 0.4, 6, 12]} form="zyl" farbe="#c8102e" />)}
          <Teil p={[0, 5.2, 0]} g={[9.6, 0.6, 0.7]} farbe="#c8102e" />
          <Teil p={[0, 6, 0]} g={[11, 0.45, 1.8]} farbe="#2f6f5e" />
          <Teil p={[0, 6.35, 0]} g={[9, 0.3, 1.2]} farbe="#2f6f5e" />
          <Schild p={[0, 4.3, 0.36]} b={3.2} h={1} text="欢迎" grund="#c8102e" schrift="#ffd34d" />
          {[-2.6, -1.3, 1.3, 2.6].map((x) => (
            <group key={x} position={[x, 4.2, 0.5]}>
              <Teil p={[0, 0.5, 0]} g={[0.02, 0.02, 0.6, 4]} form="zyl" farbe="#333" />
              <Teil p={[0, 0, 0]} g={[0.38, 14, 10]} form="kugel" farbe="#e02a1d" leuchten={nacht ? 1.5 : 0.15} />
            </group>
          ))}
        </>
      );
    case 'US':   // Wasserturm
      return <Wasserturm f={f} />;
    case 'IN':   // Tuk-Tuks und Palmen
      return (
        <>
          {[[-4, 1, 0.4], [-0.5, -1.5, -0.3]].map(([x, z, d], i) => (
            <group key={i} position={[x, 0, z]} rotation-y={d}>
              <Teil p={[0, 0.85, 0]} g={[2.4, 1.1, 1.3]} farbe="#2e8b57" />
              <Teil p={[-0.1, 1.75, 0]} g={[2.2, 0.12, 1.35]} farbe="#f2c14e" />
              {[[0.9, 0], [-0.8, 0.6], [-0.8, -0.6]].map(([wx, wz]) => (
                <Teil key={`${wx}${wz}`} p={[wx, 0.3, wz]} g={[0.3, 0.3, 0.2, 10]} form="zyl" drehung={[Math.PI / 2, 0, 0]} farbe="#202227" />
              ))}
            </group>
          ))}
          {[[5, -3], [7, 1.5], [4, 4]].map(([x, z], i) => (
            <group key={i} position={[x, 0, z]} rotation-z={0.08 * (i - 1)}>
              <Teil p={[0, 3, 0]} g={[0.16, 0.24, 6, 8]} form="zyl" farbe="#8b6b4e" />
              {Array.from({ length: 7 }, (_, j) => (
                <Teil key={j} p={[Math.cos((j / 7) * Math.PI * 2) * 1.1, 5.8, Math.sin((j / 7) * Math.PI * 2) * 1.1]}
                      drehung={[0, -(j / 7) * Math.PI * 2, -0.45]} g={[2.4, 0.06, 0.45]} farbe="#3f8f3a" />
              ))}
            </group>
          ))}
        </>
      );
    case 'FR':   // kleiner Eiffelturm und Café mit rot-weißen Schirmen
      return (
        <>
          <group position={[-4.5, 0, 0]}>
            <Teil p={[0, 2.2, 0]} g={[1.2, 3, 4.4, 4]} form="zyl" farbe="#7a6650" />
            <Teil p={[0, 4.6, 0]} g={[1.4, 1.4, 0.3, 4]} form="zyl" farbe="#7a6650" />
            <Teil p={[0, 7, 0]} g={[0.45, 1.15, 4.6, 4]} form="zyl" farbe="#7a6650" />
            <Teil p={[0, 10.6, 0]} g={[0.05, 0.45, 2.8, 4]} form="zyl" farbe="#7a6650" />
          </group>
          {[[2.5, -2], [5.5, 0.5], [2.5, 3]].map(([x, z], i) => (
            <group key={i} position={[x, 0, z]}>
              <Teil p={[0, 0.72, 0]} g={[0.45, 0.45, 0.05, 14]} form="zyl" farbe="#e6e6e6" />
              <Teil p={[0, 1.2, 0]} g={[0.03, 0.03, 2.4, 6]} form="zyl" farbe="#555" />
              <Teil p={[0, 2.35, 0]} g={[1.2, 0.5, 12]} form="kegel" farbe={i % 2 ? '#ffffff' : '#c8102e'} />
            </group>
          ))}
          <Schild p={[4, 1.2, -4.5]} b={3.2} h={0.8} text="Café" grund="#0055a4" />
        </>
      );
    case 'RU':   // Birken und Kiosk mit Zwiebelturm
      return (
        <>
          {[[-6, -3], [-7.5, 1.5], [-5, 3.8], [6.5, -3.5]].map(([x, z], i) => (
            <group key={i} position={[x, 0, z]} scale={1 + (i % 2) * 0.2}>
              <Teil p={[0, 2.5, 0]} g={[0.15, 0.2, 5, 8]} form="zyl" farbe="#f1f1ec" />
              {[1.2, 2.3, 3.4].map((y) => <Teil key={y} p={[0, y, 0.16]} g={[0.18, 0.08, 0.04]} farbe="#2b2b2b" />)}
              <Teil p={[0, 5.4, 0]} g={[1.3, 12, 10]} form="kugel" farbe="#9cc27a" />
            </group>
          ))}
          <group position={[1.5, 0, 0]}>
            <Teil p={[0, 1.4, 0]} g={[3.2, 2.8, 3.2]} farbe="#e8d9b5" />
            <mesh position={[0, 3.6, 0]} scale={[1, 1.35, 1]} castShadow>
              <sphereGeometry args={[1.25, 18, 14]} />
              <meshStandardMaterial color="#d4a72c" metalness={0.5} roughness={0.35} />
            </mesh>
            <Teil p={[0, 5.5, 0]} g={[0.25, 1.2, 10]} form="kegel" farbe="#d4a72c" />
          </group>
        </>
      );
    case 'PL':   // Pierogi-Stand und rot-weiße Blumenbeete
      return (
        <>
          <Teil p={[0, 1.2, 0]} g={[3.2, 2.4, 2.2]} farbe="#a0764d" />
          <Teil p={[0, 2.55, 1.25]} g={[3.4, 0.08, 0.8]} drehung={[0.3, 0, 0]} farbe="#dc143c" />
          <Schild p={[0, 3, 0.2]} b={3} h={0.7} text="PIEROGI" grund="#ffffff" schrift="#dc143c" />
          {[-6, -4, 4, 6].map((x, i) => (
            <group key={x} position={[x, 0, 2]}>
              <Teil p={[0, 0.2, 0]} g={[1.6, 0.4, 1]} farbe="#6b4f36" />
              {[-0.5, 0, 0.5].map((dx) => <Teil key={dx} p={[dx, 0.55, 0]} g={[0.22, 10, 8]} form="kugel" farbe={i % 2 ? '#ffffff' : '#dc143c'} />)}
            </group>
          ))}
        </>
      );
    default:
      return null;
  }
}

/** Wasserturm mit Stadtnamen (typisch für amerikanische Werke) */
function Wasserturm({ f }) {
  const textur = useTextur((g, w, h) => {
    g.fillStyle = '#dfe6ee'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f3a68'; g.font = `700 ${Math.round(h * 0.42)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('★ USA ★', w * 0.25, h / 2); g.fillText('★ USA ★', w * 0.75, h / 2);
  }, 512, 128, ['us']);
  return (
    <group>
      {[[-2, -2], [2, -2], [-2, 2], [2, 2]].map(([x, z]) => (
        <Teil key={`${x}${z}`} p={[x, 6, z]} g={[0.18, 0.22, 12, 8]} form="zyl" farbe={f['maschine-dunkel']} />
      ))}
      <mesh position={[0, 13.8, 0]} castShadow>
        <cylinderGeometry args={[3, 3, 3.6, 28]} />
        <meshStandardMaterial map={textur} roughness={0.5} metalness={0.2} />
      </mesh>
      <Teil p={[0, 16.4, 0]} g={[3.2, 1.6, 28]} form="kegel" farbe="#c3ccd6" />
    </group>
  );
}

/** Alle Länder-Merkmale eines Werks. X/Z: Umrechnung der Werkskoordinaten in die Szene */
export default function Landesdeko({ standort, gs, f, X, Z }) {
  const land = standort.land;
  const zeichnen = FLAGGEN[land];
  const firma = (g, w, h) => {      // Firmenflagge: Akzentfarbe mit Schild-Zeichen
    g.fillStyle = f.akzent; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = h * 0.06;
    g.beginPath(); g.moveTo(w / 2, h * 0.18); g.lineTo(w * 0.62, h * 0.28); g.lineTo(w * 0.62, h * 0.52);
    g.quadraticCurveTo(w * 0.6, h * 0.75, w / 2, h * 0.84); g.quadraticCurveTo(w * 0.4, h * 0.75, w * 0.38, h * 0.52);
    g.lineTo(w * 0.38, h * 0.28); g.closePath(); g.stroke();
  };
  const schildText = (SCHILD[land] ?? ((s) => s))(ORTSNAMEN[standort.stadt] ?? standort.stadt);
  return (
    <>
      {zeichnen && gs.fahnen.map((p, i) => (
        <Fahne key={i} x={X(p.x)} z={Z(p.y)} zeichnen={i === 1 ? firma : zeichnen} kennung={i === 1 ? `firma${f.akzent}` : land} />
      ))}
      {/* Torbogen mit Schild in Landessprache */}
      <group position={[X(gs.tor.x + gs.tor.b / 2), 0, Z(gs.T - 3.2)]}>
        {[-gs.tor.b / 2, gs.tor.b / 2].map((x) => <Teil key={x} p={[x, 3, 0]} g={[0.3, 6, 0.3]} farbe="#3a3f47" />)}
        <Schild p={[0, 5.4, 0.2]} b={gs.tor.b - 1} h={1.6} text={schildText}
                grund={land === 'CN' ? '#c8102e' : '#1f2a37'} schrift={land === 'CN' ? '#ffd34d' : '#ffffff'} />
      </group>
      {gs.landPlatz && (
        <group position={[X(gs.landPlatz.x + gs.landPlatz.b / 2), 0, Z(gs.landPlatz.y + gs.landPlatz.t / 2)]} scale={gs.landGroesse}>
          <Typisch land={land} f={f} nacht={f.nacht} />
        </group>
      )}
    </>
  );
}
