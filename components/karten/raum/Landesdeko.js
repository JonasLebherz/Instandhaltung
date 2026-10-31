'use client';
/**
 * components/karten/raum/Landesdeko.js – woran man in 3D erkennt, in welchem Land ein Werk liegt
 *
 *  - Fahnen am Tor: Landesflagge, Firmenflagge, Landesflagge; Torschild in Landessprache und -schrift
 *  - Landesstil (LAND_STIL, mitLandStil): Boden, Straßen, Hallenwände, Dächer, Bäume (Baum3D)
 *    und Bürogebäude (Buero3D: Fachwerk, Glasturm, Pagode, Hacienda, Zwiebeltürme, Mansarde, Kuppel, Backstein)
 *  - kleine Landesflagge an der Haupthalle (HallenFlagge, ausgeblendet, wenn die Halle geöffnet ist)
 *  - Umgebung: Umland mit Feldern/Bäumen, Landstraße vor dem Tor, Wahrzeichen hinten
 *    (DE Windräder, US Scheune, CN Pagode, IN Tempel, RU Kirche, MX Berge) und das
 *    typische Objekt gegenüber dem Tor: DE Biergarten · MX Taco-Truck mit Kakteen ·
 *    CN Ehrentor mit roten Laternen · US Wasserturm · IN Tuk-Tuks und Palmen ·
 *    FR kleiner Eiffelturm mit Café · RU Birken und Kiosk mit Zwiebelturm · PL Pierogi-Stand
 *
 * Fahnen und Schrift werden einmal in ein kleines Canvas gezeichnet und als Textur genutzt –
 * keine Bilddateien, keine Schriftdateien (die Schrift kommt vom System, auch Chinesisch usw.).
 * Die Farben der Flaggen sind Nationalfarben und deshalb hier fest hinterlegt.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { zufall } from '@/lib/karten/werkGestaltung';
import { grasTextur } from './Bausteine';

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
      <mesh position={[1.4, 8, 0]} castShadow>
        <planeGeometry args={[2.8, 1.75]} />
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

/* =====================================================================
 * Landesstil: Boden, Straßen, Hallen, Dächer, Bäume und Bürogebäude je Land
 * Farben je [hell, dunkel] – das Werk soll auf den ersten Blick "nach dem Land" aussehen.
 * ================================================================== */
export const LAND_STIL = {
  DE: { gras: ['#c6dbbb', '#34473a'], wand: ['#dfe2e5', '#6e7681'], dach: ['#a2402f', '#6e3a33'], baum: 'mix', buero: 'fachwerk', umland: ['#b4cc9f', '#2f3f33'], umlandBaeume: ['kegel', 'rund'], feld: [['#ecd648', '#9cbc6a'], ['#6f6a35', '#41543a']] },
  US: { gras: ['#bfd8a8', '#3a4a36'], wand: ['#e6dbc8', '#7d776c'], dach: ['#c3c9d0', '#5c636d'], linie: ['#f2c14e', '#d9a826'],
    baum: 'rund', buero: 'glas', umland: ['#c4d49c', '#36442f'], umlandBaeume: ['rund'], feld: [['#d9c66a', '#8fae5a'], ['#6a6237', '#3f5236']] },
  MX: { gras: ['#e8d3a0', '#6e604a'], strasse: ['#d0bf9b', '#5f584a'], wand: ['#eab274', '#8a6a4a'], dach: ['#c45f37', '#7a4532'],
    baum: 'kaktus', buero: 'hacienda', umland: ['#dcbf8c', '#6b5a43'], umlandBaeume: ['kaktus'], feld: [['#8fb3a0', '#d6bd88'], ['#3f564b', '#5a4b38']] },
  CN: { gras: ['#cadbc4', '#36443b'], wand: ['#f3f3f1', '#727a85'], dach: ['#3373c4', '#2f5d93'], baum: 'rund', buero: 'pagode', umland: ['#b3cfa6', '#2f4034'], umlandBaeume: ['rund'], feld: [['#7cc766', '#9cc8d8'], ['#3c6236', '#3b5560']] },
  IN: { gras: ['#dcc290', '#55493a'], strasse: ['#cbb497', '#5b5245'], wand: ['#f4efe4', '#7b7770'], dach: ['#3a8d66', '#2f6b50'],
    baum: 'palme', buero: 'kuppel', umland: ['#d6ad79', '#5a4733'], umlandBaeume: ['palme'], feld: [['#f0a238', '#c9b27a'], ['#74522a', '#55493a']] },
  FR: { gras: ['#cbdcbd', '#38463a'], wand: ['#efe5d3', '#7e786d'], dach: ['#717d8a', '#4d5560'], baum: 'pappel', buero: 'mansarde', umland: ['#bfd2a0', '#344233'], umlandBaeume: ['pappel', 'rund'], feld: [['#9a7ed4', '#86a76c'], ['#4f4370', '#3d5236']] },
  RU: { gras: ['#eef2f6', '#5d6670'], strasse: ['#c3c9d1', '#474c55'], wand: ['#c4d0db', '#66707c'], dach: ['#3b7d50', '#2f5a3d'],
    baum: 'birke', buero: 'zwiebel', umland: ['#f6f8fb', '#6c7580'], umlandBaeume: ['birke', 'kegel'] },
  PL: { gras: ['#c4d9b8', '#34463a'], wand: ['#f0e9df', '#787470'], dach: ['#b53a2c', '#7a3530'], baum: 'kegel', buero: 'backstein', umland: ['#b9d0a1', '#314033'], umlandBaeume: ['kegel'], feld: [['#e6c862', '#a8c070'], ['#6c6234', '#46573a']] },
};

/** Farben der Szene mit dem Landesstil überschreiben */
export function mitLandStil(f, land) {
  const s = LAND_STIL[land];
  if (!s) return f;
  const i = f.nacht ? 1 : 0;
  const neu = { ...f, gelaende: s.gras[i], wand: s.wand[i] };
  if (s.strasse) neu.strasse = s.strasse[i];
  if (s.linie) neu.markierung = s.linie[i];
  ['dach-0', 'dach-1', 'dach-2', 'dach-3'].forEach((k) => { neu[k] = s.dach[i]; });
  return neu;
}

/** Dreieckiges Satteldach (Prisma) entlang x */
function Prisma({ p, b, t, h, farbe }) {
  const geo = useMemo(() => {
    const form = new THREE.Shape();
    form.moveTo(-t / 2, 0); form.lineTo(t / 2, 0); form.lineTo(0, h); form.closePath();
    const g = new THREE.ExtrudeGeometry(form, { depth: b, bevelEnabled: false });
    g.translate(0, 0, -b / 2);
    return g;
  }, [b, t, h]);
  return (
    <mesh geometry={geo} position={p} rotation-y={Math.PI / 2} castShadow receiveShadow>
      <meshStandardMaterial color={farbe} roughness={0.8} />
    </mesh>
  );
}

/** Baum im Landesstil */
export function Baum3D({ art, groesse = 1, i = 0, f }) {
  const stil = art === 'mix' ? (i % 2 ? 'kegel' : 'rund') : art;
  const stamm = f.stamm;
  switch (stil) {
    case 'kegel':   // Kiefer/Tanne
      return (
        <group scale={groesse}>
          <Teil p={[0, 1, 0]} g={[0.22, 0.28, 2, 8]} form="zyl" farbe={stamm} />
          <Teil p={[0, 3.6, 0]} g={[1.9, 4.2, 10]} form="kegel" farbe="#3e6b47" />
          <Teil p={[0, 5.4, 0]} g={[1.3, 2.8, 10]} form="kegel" farbe="#447650" />
        </group>
      );
    case 'kaktus':
      return (
        <group scale={groesse * 1.3}>
          <Teil p={[0, 2, 0]} g={[0.4, 0.45, 4, 10]} form="zyl" farbe="#4f8a3c" />
          <Teil p={[0.6, 1.8, 0]} g={[0.8, 0.26, 0.26]} farbe="#4f8a3c" />
          <Teil p={[0.95, 2.5, 0]} g={[0.24, 0.26, 1.4, 8]} form="zyl" farbe="#4f8a3c" />
          <Teil p={[-0.55, 2.6, 0]} g={[0.7, 0.24, 0.24]} farbe="#4f8a3c" />
          <Teil p={[-0.85, 3.1, 0]} g={[0.2, 0.24, 1.1, 8]} form="zyl" farbe="#4f8a3c" />
        </group>
      );
    case 'palme':
      return (
        <group scale={groesse * 1.2} rotation-z={(i % 3 - 1) * 0.08}>
          <Teil p={[0, 3, 0]} g={[0.16, 0.26, 6, 8]} form="zyl" farbe="#8b6b4e" />
          {Array.from({ length: 7 }, (_, j) => (
            <Teil key={j} p={[Math.cos((j / 7) * Math.PI * 2) * 1.1, 5.8, Math.sin((j / 7) * Math.PI * 2) * 1.1]}
                  drehung={[0, -(j / 7) * Math.PI * 2, -0.45]} g={[2.4, 0.06, 0.45]} farbe="#3f8f3a" />
          ))}
        </group>
      );
    case 'birke':
      return (
        <group scale={groesse}>
          <Teil p={[0, 2.6, 0]} g={[0.15, 0.2, 5.2, 8]} form="zyl" farbe="#f1f1ec" />
          {[1.2, 2.3, 3.4].map((y) => <Teil key={y} p={[0, y, 0.16]} g={[0.18, 0.08, 0.04]} farbe="#2b2b2b" />)}
          <mesh position={[0, 5.4, 0]} scale={[1, 1.4, 1]} castShadow>
            <sphereGeometry args={[1.3, 12, 10]} />
            <meshStandardMaterial color={f.nacht ? '#5f7a4c' : '#a6c97f'} roughness={0.9} />
          </mesh>
        </group>
      );
    case 'pappel':
      return (
        <group scale={groesse}>
          <Teil p={[0, 1, 0]} g={[0.18, 0.24, 2, 8]} form="zyl" farbe={stamm} />
          <mesh position={[0, 5, 0]} scale={[0.75, 2.6, 0.75]} castShadow>
            <sphereGeometry args={[1.5, 12, 10]} />
            <meshStandardMaterial color={f.baum} roughness={0.9} />
          </mesh>
        </group>
      );
    default:        // Laubbaum: Krone aus drei Kugeln, wirkt natürlicher als eine einzelne
      return (
        <group scale={groesse} rotation-y={i * 1.7}>
          <Teil p={[0, 1.2, 0]} g={[0.25, 0.3, 2.4, 8]} form="zyl" farbe={stamm} />
          <Teil p={[0, 3.8, 0]} g={[1.8, 12, 10]} form="kugel" farbe={f.baum} />
          <Teil p={[0.95, 3.3, 0.35]} g={[1.25, 10, 8]} form="kugel" farbe={f.baum} />
          <Teil p={[-0.75, 3.4, -0.55]} g={[1.35, 10, 8]} form="kugel" farbe={f.baum} />
        </group>
      );
  }
}

/** Bürogebäude im Landesstil (Mitte unten, Maße aus werkGestaltung) */
export function Buero3D({ stil, d, f }) {
  const { b, t, etagen } = d;
  const h = etagen * 3.6;
  const licht = f.nacht ? 0.8 : 0;
  const fensterbaender = (farbe = f.fenster, breite = b + 0.08, tiefe = t + 0.08) => Array.from({ length: etagen }, (_, e) => (
    <Teil key={`f${e}`} p={[0, 1.9 + e * 3.6, 0]} g={[breite, 1.2, tiefe]} farbe={farbe} leuchten={e % 2 === 0 ? licht : 0} />
  ));
  switch (stil) {
    case 'fachwerk': {   // weiße Gefache, dunkle Balken, steiles rotes Dach
      const balken = '#4a2f1d';
      const felder = Math.max(3, Math.round(b / 2.6));
      return (
        <>
          <Teil p={[0, h / 2, 0]} g={[b, h, t]} farbe="#f6f1e6" />
          {Array.from({ length: etagen + 1 }, (_, e) => <Teil key={`h${e}`} p={[0, Math.min(h - 0.12, e * 3.6 + 0.12), 0]} g={[b + 0.14, 0.26, t + 0.14]} farbe={balken} />)}
          {Array.from({ length: felder + 1 }, (_, i) => [1, -1].map((z) => (
            <Teil key={`v${i}${z}`} p={[-b / 2 + (i * b) / felder, h / 2, z * (t / 2 + 0.07)]} g={[0.24, h, 0.1]} farbe={balken} />
          )))}
          {Array.from({ length: felder * etagen }, (_, k) => {
            const i = k % felder; const e = Math.floor(k / felder);
            return (k % 2 === 0) && <Teil key={`d${k}`} p={[-b / 2 + ((i + 0.5) * b) / felder, e * 3.6 + 1.8, t / 2 + 0.08]}
                                          drehung={[0, 0, (i % 2 ? 1 : -1) * 0.95]} g={[0.2, 3.6, 0.08]} farbe={balken} />;
          })}
          <Prisma p={[0, h, 0]} b={b + 1} t={t + 1.2} h={Math.max(4, t * 0.6)} farbe="#a2402f" />
        </>
      );
    }
    case 'glas':        // gläserner Büroturm
      return (
        <>
          <mesh position={[0, (h + 10.8) / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[b * 0.8, h + 10.8, t * 0.9]} />
            <meshStandardMaterial color="#5b8fc7" metalness={0.55} roughness={0.15} emissive="#ffd58a" emissiveIntensity={f.nacht ? 0.25 : 0} />
          </mesh>
          {Array.from({ length: etagen + 3 }, (_, e) => <Teil key={e} p={[0, (e + 1) * 3.6, 0]} g={[b * 0.8 + 0.1, 0.2, t * 0.9 + 0.1]} farbe="#e8edf2" />)}
          <Teil p={[0, h + 11.5, 0]} g={[b * 0.4, 1.4, t * 0.4]} farbe="#9aa3ad" />
        </>
      );
    case 'pagode': {    // chinesischer Stil: rote Säulen, gestufte grüne Dächer mit goldener Spitze
      return (
        <>
          <Teil p={[0, h / 2, 0]} g={[b - 2, h, t - 2]} farbe="#f2ebe0" />
          {fensterbaender('#b9d0e8', b - 1.9, t - 1.9)}
          {[-1, -0.33, 0.33, 1].map((x) => <Teil key={x} p={[x * (b / 2 - 1.2), h / 2, t / 2 - 0.4]} g={[0.3, 0.35, h, 10]} form="zyl" farbe="#c8102e" />)}
          {[0, 1, 2].map((k) => (
            <group key={k} position={[0, h + k * 2.4, 0]}>
              <Teil p={[0, 0.25, 0]} g={[b + 2.4 - k * 3, 0.45, t + 2.4 - k * 3]} farbe="#2f5f55" />
              {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
                <Teil key={`${x}${z}`} p={[x * ((b + 2.4 - k * 3) / 2), 0.55, z * ((t + 2.4 - k * 3) / 2)]} g={[0.18, 0.7, 6]} form="kegel" farbe="#2f5f55" />
              ))}
              {k < 2 && <Teil p={[0, 1.4, 0]} g={[b - 3 - k * 3, 1.9, t - 3 - k * 3]} farbe="#c8102e" />}
            </group>
          ))}
          <Teil p={[0, h + 7.2, 0]} g={[0.35, 2, 10]} form="kegel" farbe="#d4a72c" />
        </>
      );
    }
    case 'hacienda':    // ockerfarben, Bogengang, flaches Terrakotta-Dach
      return (
        <>
          <Teil p={[0, h / 2, 0]} g={[b, h, t]} farbe="#e9b67a" />
          {fensterbaender('#9a6a3a')}
          {Array.from({ length: Math.max(3, Math.floor(b / 3)) }, (_, i) => {
            const n = Math.max(3, Math.floor(b / 3));
            const x = -b / 2 + ((i + 0.5) * b) / n;
            return (
              <group key={i} position={[x, 0, t / 2 + 0.05]}>
                <Teil p={[0, 1.2, 0]} g={[1.7, 2.4, 0.1]} farbe="#6b4226" />
                <mesh position={[0, 2.4, 0.01]}><circleGeometry args={[0.85, 16, 0, Math.PI]} /><meshStandardMaterial color="#6b4226" /></mesh>
              </group>
            );
          })}
          <Prisma p={[0, h, 0]} b={b + 0.8} t={t + 0.8} h={1.6} farbe="#c45f37" />
        </>
      );
    case 'zwiebel':     // russischer Stil: helle Fassade mit goldenen Zwiebeltürmen
      return (
        <>
          <Teil p={[0, h / 2, 0]} g={[b, h, t]} farbe="#efe6d4" />
          {fensterbaender()}
          <Teil p={[0, h + 0.2, 0]} g={[b + 0.3, 0.4, t + 0.3]} farbe="#3b7d50" />
          {[[-b / 4, 1], [b / 4, 1], [0, 1.45]].map(([x, s], i) => (
            <group key={i} position={[x, h + 0.4, 0]} scale={s}>
              <Teil p={[0, 1.2, 0]} g={[1.1, 1.1, 2.4, 14]} form="zyl" farbe="#efe6d4" />
              <mesh position={[0, 3.2, 0]} scale={[1, 1.35, 1]} castShadow>
                <sphereGeometry args={[1.3, 18, 14]} />
                <meshStandardMaterial color={i === 2 ? '#d4a72c' : '#2f6fb5'} metalness={0.5} roughness={0.35} />
              </mesh>
              <Teil p={[0, 5.2, 0]} g={[0.22, 1.4, 10]} form="kegel" farbe="#d4a72c" />
            </group>
          ))}
        </>
      );
    case 'mansarde':    // französisch: cremefarben, graues Mansarddach mit Gauben
      return (
        <>
          <Teil p={[0, h / 2, 0]} g={[b, h, t]} farbe="#efe3cc" />
          {fensterbaender()}
          {/* Mansarddach: vierseitiger Kegelstumpf, erst gedreht (Kanten parallel), dann auf b × t gestreckt */}
          <group position={[0, h + 1.6, 0]} scale={[b / Math.SQRT2, 1, t / Math.SQRT2]}>
            <mesh rotation-y={Math.PI / 4} castShadow>
              <cylinderGeometry args={[0.72, 1.02, 3.2, 4]} />
              <meshStandardMaterial color="#56606b" roughness={0.6} metalness={0.3} />
            </mesh>
          </group>
          {[-0.3, 0, 0.3].map((x) => <Teil key={x} p={[x * b, h + 1.6, t / 2 - 0.2]} g={[1.2, 1.4, 0.8]} farbe="#efe3cc" />)}
        </>
      );
    case 'kuppel':      // indisch: weißer Bau mit großer Kuppel und Ecktürmchen
      return (
        <>
          <Teil p={[0, h / 2, 0]} g={[b, h, t]} farbe="#f4f1ea" />
          {fensterbaender('#d9b48a')}
          <Teil p={[0, h + 0.8, 0]} g={[t * 0.32, t * 0.32, 1.6, 20]} form="zyl" farbe="#f4f1ea" />
          <mesh position={[0, h + 1.6, 0]} castShadow>
            <sphereGeometry args={[t * 0.36, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#f7f4ee" roughness={0.5} />
          </mesh>
          <Teil p={[0, h + 1.6 + t * 0.36 + 0.6, 0]} g={[0.2, 1.2, 8]} form="kegel" farbe="#d4a72c" />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
            <group key={`${x}${z}`} position={[x * (b / 2 - 0.5), 0, z * (t / 2 - 0.5)]}>
              <Teil p={[0, (h + 3) / 2, 0]} g={[0.45, 0.5, h + 3, 10]} form="zyl" farbe="#f4f1ea" />
              <Teil p={[0, h + 3.2, 0]} g={[0.6, 12, 8]} form="kugel" farbe="#f7f4ee" />
            </group>
          ))}
        </>
      );
    case 'backstein':   // polnischer Backsteinbau
      return (
        <>
          <Teil p={[0, h / 2, 0]} g={[b, h, t]} farbe="#a8513a" />
          {fensterbaender('#eef0f2')}
          <Prisma p={[0, h, 0]} b={b + 0.6} t={t + 0.6} h={Math.max(3, t * 0.45)} farbe="#7a2f25" />
        </>
      );
    default:
      return null;
  }
}

/** Kleine Landesflagge an der Front der Haupthalle – ausgeblendet, wenn man in diese Halle hineinschaut */
function HallenFlagge({ gs, land, X, Z, flaggeZeichnen, gebaeudeId }) {
  const textur = useTextur(flaggeZeichnen ?? ((g) => g.clearRect(0, 0, 1, 1)), 192, 120, [land, 'halle']);
  const [id, h] = Object.entries(gs.hallen).sort(([, a], [, c]) => c.b * c.t - a.b * a.t)[0] ?? [];
  if (!flaggeZeichnen || !h || String(gebaeudeId) === id) return null;
  const breite = Math.min(h.b * 0.16, 6);
  return (
    <mesh position={[X(h.x + h.b / 2) + h.b * 0.3, h.hoehe * 0.45, Z(h.y + h.t) + 0.12]}>
      <planeGeometry args={[breite, breite * 0.625]} />
      <meshStandardMaterial map={textur} roughness={0.7} />
    </mesh>
  );
}

/* =====================================================================
 * Umgebung: Landschaft rund um das Werk (Felder, Berge, Bäume, Wahrzeichen)
 * und eine Landstraße vor dem Tor. Das typische Objekt des Landes steht
 * vor dem Werk auf der anderen Straßenseite – dort ist es immer gut zu sehen.
 * ================================================================== */
export const UMLAND_RAND = 28;   // Umland links, rechts und hinten (m)
export const UMLAND_VORN = 50;   // Umland vor dem Werk: Landstraße + typisches Objekt

/** Flache Bodenfläche (Straße, Feldstreifen) */
function Boden({ x, z, b, t, farbe, y = 0.12 }) {
  return (
    <mesh position={[x, y, z]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[b, t]} />
      <meshStandardMaterial color={farbe} roughness={1} />
    </mesh>
  );
}

/** Feld mit Streifen in zwei Farben (Raps, Mais, Lavendel, Reis …) */
function Feld({ x, z, b, t, farben, streifen = 9 }) {
  return Array.from({ length: streifen }, (_, i) => (
    <Boden key={i} x={x} z={z - t / 2 + ((i + 0.5) * t) / streifen} b={b} t={t / streifen} farbe={farben[i % 2]} y={0.05} />
  ));
}

/** Windrad mit drehendem Rotor (Deutschland) */
function Windrad({ x, z }) {
  const rotor = useRef(null);
  useFrame((_, dt) => { if (rotor.current) rotor.current.rotation.z += dt * 0.9; });
  return (
    <group position={[x, 0, z]}>
      <Teil p={[0, 15, 0]} g={[0.45, 0.9, 30, 10]} form="zyl" farbe="#f2f4f6" />
      <Teil p={[0, 30.3, 0.4]} g={[1.2, 1.2, 3]} farbe="#e8ebee" />
      <group ref={rotor} position={[0, 30.3, 2]}>
        {[0, 1, 2].map((k) => (
          <group key={k} rotation-z={(k * Math.PI * 2) / 3}>
            <Teil p={[0, 6.5, 0]} g={[0.9, 13, 0.25]} farbe="#ffffff" />
          </group>
        ))}
      </group>
    </group>
  );
}

/** Rote Scheune mit Silo (USA) */
function Scheune({ x, z }) {
  return (
    <group position={[x, 0, z]} rotation-y={0.4}>
      <Teil p={[0, 3.5, 0]} g={[12, 7, 9]} farbe="#a63a2a" />
      <Prisma p={[0, 7, 0]} b={12.6} t={9.8} h={4} farbe="#4a2a24" />
      <Teil p={[0, 2.6, 4.56]} g={[4, 5.2, 0.1]} farbe="#ffffff" />
      <Teil p={[0, 2.6, 4.6]} g={[3.6, 4.8, 0.1]} farbe="#a63a2a" />
      {[0.9, -0.9].map((w) => <Teil key={w} p={[0, 2.6, 4.66]} g={[0.3, 5.6, 0.06]} drehung={[0, 0, w]} farbe="#ffffff" />)}
      <Teil p={[9, 7, 0]} g={[2.6, 2.6, 14, 18]} form="zyl" farbe="#c3ccd6" />
      <Teil p={[9, 14, 0]} g={[2.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} form="kugel" farbe="#9aa4b0" />
    </group>
  );
}

/** Berg (Mexiko: kahl und braun, sonst mit Schneekappe) */
function Berg({ x, z, r, h, farbe, schnee }) {
  return (
    <group position={[x, 0, z]}>
      <Teil p={[0, h / 2, 0]} g={[r, h, 7]} form="kegel" farbe={farbe} />
      {schnee && <Teil p={[0, h * 0.85, 0]} g={[r * 0.3, h * 0.3, 7]} form="kegel" farbe="#ffffff" />}
    </group>
  );
}

/** Mehrstöckige Pagode (China) */
function Pagode({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2, 3, 4].map((k) => {
        const w = 8 - k * 1.3;
        return (
          <group key={k} position={[0, k * 4, 0]}>
            <Teil p={[0, 1.6, 0]} g={[w, 3.2, w]} farbe={k % 2 ? '#f2ebe0' : '#c8102e'} />
            <Teil p={[0, 3.4, 0]} g={[w + 3, 0.5, w + 3]} farbe="#2f5f55" />
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, c]) => (
              <Teil key={`${a}${c}`} p={[a * (w + 3) / 2, 3.8, c * (w + 3) / 2]} g={[0.25, 1, 6]} form="kegel" farbe="#2f5f55" />
            ))}
          </group>
        );
      })}
      <Teil p={[0, 22, 0]} g={[0.5, 4, 10]} form="kegel" farbe="#d4a72c" />
    </group>
  );
}

/** Tempelturm (Gopuram, Indien): stufenförmig, ockerfarben, goldene Spitze */
function Tempel({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <Teil key={k} p={[0, k * 2.6 + 1.3, 0]} g={[13 - k * 1.8, 2.6, 8 - k * 1.05]} farbe={k % 2 ? '#e3b06a' : '#cf8f4a'} />
      ))}
      <Teil p={[0, 16.8, 0]} g={[1.1, 12, 10]} form="kugel" farbe="#d4a72c" />
      <Teil p={[0, 18.4, 0]} g={[0.3, 1.6, 8]} form="kegel" farbe="#d4a72c" />
    </group>
  );
}

/** Kirche mit Zwiebeltürmen (Russland) */
function Kirche({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <Teil p={[0, 4, 0]} g={[11, 8, 9]} farbe="#b5523b" />
      {[[0, 0, 1.5, '#d4a72c'], [-3.6, -3, 1, '#2f6fb5'], [3.6, -3, 1, '#2f6fb5'], [-3.6, 3, 1, '#2f6fb5'], [3.6, 3, 1, '#2f6fb5']].map(([a, c, g, farbe], i) => (
        <group key={i} position={[a, 8, c]} scale={g}>
          <Teil p={[0, 1.6, 0]} g={[1.2, 1.2, 3.2, 14]} form="zyl" farbe="#f2ead8" />
          <mesh position={[0, 4.1, 0]} scale={[1, 1.35, 1]} castShadow>
            <sphereGeometry args={[1.45, 18, 14]} />
            <meshStandardMaterial color={farbe} metalness={0.5} roughness={0.35} />
          </mesh>
          <Teil p={[0, 6.3, 0]} g={[0.25, 1.4, 10]} form="kegel" farbe="#d4a72c" />
        </group>
      ))}
    </group>
  );
}

/** Besonderes Bauwerk im Umland hinten (zweites Erkennungszeichen neben dem typischen Objekt) */
function Wahrzeichen({ land, x, z }) {
  switch (land) {
    case 'DE': return <><Windrad x={x - 9} z={z} /><Windrad x={x + 9} z={z - 4} /></>;
    case 'US': return <Scheune x={x} z={z} />;
    case 'CN': return <Pagode x={x} z={z} />;
    case 'IN': return <Tempel x={x} z={z} />;
    case 'RU': return <Kirche x={x} z={z} />;
    default: return null;
  }
}

/** Fluss als Band (eine Fläche aus Dreiecken entlang der Punkte) */
function Band({ punkte, breite, farbe, y, glanz = false }) {
  const geo = useMemo(() => {
    const pos = [];
    const idx = [];
    punkte.forEach(([x, z], i) => {
      const [x0, z0] = punkte[Math.max(i - 1, 0)];
      const [x2, z2] = punkte[Math.min(i + 1, punkte.length - 1)];
      const l = Math.hypot(x2 - x0, z2 - z0) || 1;
      const nx = (-(z2 - z0) / l) * (breite / 2);
      const nz = ((x2 - x0) / l) * (breite / 2);
      pos.push(x + nx, 0, z + nz, x - nx, 0, z - nz);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [punkte, breite]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position-y={y} receiveShadow>
      <meshStandardMaterial color={farbe} roughness={glanz ? 0.15 : 1} metalness={glanz ? 0.15 : 0} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Brücke der Landstraße über den Fluss */
function Bruecke({ x, z, breite, f }) {
  return (
    <group position={[x, 0, z]}>
      <Teil p={[0, 0.25, 0]} g={[breite, 0.5, 10]} farbe={f.beton} />
      <mesh position={[0, 0.51, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[breite, 8.6]} />
        <meshStandardMaterial color={f.strasse} roughness={1} />
      </mesh>
      {[-4.85, 4.85].map((dz) => (
        <group key={dz}>
          <Teil p={[0, 1.4, dz]} g={[breite, 0.12, 0.12]} farbe={f['maschine-dunkel']} />
          {Array.from({ length: Math.floor(breite / 2) + 1 }, (_, i) => (
            <Teil key={i} p={[-breite / 2 + i * 2, 0.95, dz]} g={[0.1, 0.9, 0.1]} farbe={f['maschine-dunkel']} />
          ))}
        </group>
      ))}
    </group>
  );
}

function Umgebung({ standort, gs, f }) {
  const land = standort.land;
  const stil = LAND_STIL[land];
  const { B, T } = gs;
  const nacht = f.nacht;
  const breite = B + 2 * UMLAND_RAND;
  const landstrasse = T / 2 + 9;                // Mitte der Landstraße vor dem Tor (Szenenkoordinaten)
  const wahrzeichenX = gs.fahnenSeite * B * 0.2;  // hinter den Hallen, hoch genug, um darüber hinaus zu ragen
  // Bei manchen Werken fließt links neben dem Gelände ein Fluss (das Feld liegt dann rechts) (geschwungen, mit Brücke für die Landstraße)
  const fluss = useMemo(() => {
    const z = zufall(`${standort.kuerzel}-fluss`);
    if (z() >= 0.45) return null;
    const phase = z() * Math.PI * 2;
    const punkte = [];
    for (let zz = -T / 2 - UMLAND_RAND; zz <= T / 2 + UMLAND_VORN + 0.1; zz += 4) {
      punkte.push([-B / 2 - 14 + Math.sin(zz * 0.05 + phase) * 4.5, zz]);
    }
    const anDerStrasse = punkte.reduce((a, p) => (Math.abs(p[1] - landstrasse) < Math.abs(a[1] - landstrasse) ? p : a));
    return { punkte, brueckeX: anDerStrasse[0] };
  }, [standort.kuerzel, B, T, landstrasse]);
  // Bäume am Rand des Umlands (fest je Werk), Platz für Feld (links) und Wahrzeichen (hinten rechts) bleibt frei
  const baeume = useMemo(() => {
    const z = zufall(`${standort.kuerzel}-umland`);
    const liste = [];
    for (let x = -breite / 2 + 6; x < breite / 2 - 6; x += 9 + z() * 5) {
      if (Math.abs(x - wahrzeichenX) < 22) continue;     // dort steht das Wahrzeichen
      liste.push({ x, z: -T / 2 - 8 - z() * 14, groesse: 0.9 + z() * 0.6 });
    }
    // Seiten: neben dem Feld nur vor und hinter dem Feld, am Fluss nur ein schmaler Streifen am äußeren Rand
    const feldSeite = fluss ? 1 : -1;
    for (let y = -T / 2; y < T / 2 + 4; y += 10 + z() * 5) {
      [-1, 1].forEach((seite) => {
        const x = seite * (fluss && seite === -1 ? B / 2 + 25 + z() * 2 : B / 2 + 7 + z() * 16);
        if (seite !== feldSeite || y < -T / 2 + 6 || y > T * 0.1) liste.push({ x, z: y, groesse: 0.9 + z() * 0.6 });
      });
    }
    return liste;
  }, [standort.kuerzel, B, T, breite, wahrzeichenX, fluss]);
  const grasMap = useMemo(() => {
    const m = grasTextur();
    m.repeat.set(breite / 12, (T + UMLAND_RAND + UMLAND_VORN) / 12);
    return m;
  }, [breite, T]);
  useEffect(() => () => grasMap.dispose(), [grasMap]);
  if (!stil) return null;
  const n = (paar) => paar[nacht ? 1 : 0];
  const arten = stil.umlandBaeume ?? [stil.baum];
  // Typisches Objekt: hohe Bauwerke (Wasserturm, Eiffelturm) etwas kleiner, damit sie das Werk nicht verdecken
  const gross = land === 'US' ? 1.5 : land === 'FR' ? 1.8 : 2.4;
  const objektX = -gs.fahnenSeite * Math.min(B * 0.2, 34);
  const objektZ = landstrasse + 4.5 + 2 + 6 * gross;
  return (
    <group position-y={-0.25}>
      {/* Umland als größere Platte unter dem Gelände */}
      <mesh position={[0, -0.5, (UMLAND_VORN - UMLAND_RAND) / 2]} receiveShadow>
        <boxGeometry args={[breite, 1, T + UMLAND_RAND + UMLAND_VORN]} />
        <meshStandardMaterial color={n(stil.umland)} roughness={1} map={grasMap} />
      </mesh>
      {/* Landstraße mit Mittellinie (USA: doppelt gelb) und Zufahrt zum Tor */}
      <Boden x={0} z={landstrasse} b={breite} t={9} farbe={f.strasse} />
      {land === 'US'
        ? [-0.2, 0.2].map((d) => <Boden key={d} x={0} z={landstrasse + d} b={breite} t={0.16} farbe={f.markierung} y={0.14} />)
        : Array.from({ length: Math.floor(breite / 9) }, (_, i) => (
          <Boden key={i} x={-breite / 2 + 4 + i * 9} z={landstrasse} b={3.5} t={0.2} farbe={f.markierung} y={0.14} />
        ))}
      <Boden x={gs.tor.x + gs.tor.b / 2 - B / 2} z={T / 2 + 2.3} b={gs.tor.b} t={4.6} farbe={f.strasse} />
      {/* Feld neben dem Werk */}
      {stil.feld && <Feld x={(fluss ? 1 : -1) * (B / 2 + UMLAND_RAND / 2)} z={-T * 0.12} b={UMLAND_RAND - 6} t={T * 0.55} farben={n(stil.feld)} />}
      {/* Berge hinten (Mexiko kahl, Russland nicht – dort liegt der Schnee schon auf dem Boden) */}
      {land === 'MX' && [-0.38, -0.12, 0.18].map((a, i) => (
        <Berg key={i} x={a * breite} z={-T / 2 - 16} r={11 + i * 2} h={14 + (i % 2) * 6} farbe={nacht ? '#6a5541' : '#c4935f'} />
      ))}
      {fluss && (
        <>
          <Band punkte={fluss.punkte} breite={13} farbe={n(['#b8a77f', '#4d4636'])} y={0.04} />
          <Band punkte={fluss.punkte} breite={9} farbe={n(land === 'RU' ? ['#bcd6ea', '#4d6b86'] : ['#5d9fd3', '#2d5b85'])} y={0.08} glanz />
          <Bruecke x={fluss.brueckeX} z={landstrasse} breite={16} f={f} />
        </>
      )}
      {baeume.map((bm, i) => (
        <group key={i} position={[bm.x, 0, bm.z]}>
          <Baum3D art={arten[i % arten.length]} groesse={bm.groesse} i={i} f={f} />
        </group>
      ))}
      <group position={[wahrzeichenX, 0, -T / 2 - 14]} scale={1.4}>
        <Wahrzeichen land={land} x={0} z={0} />
      </group>
      <group position={[objektX, 0, objektZ]} scale={gross}>
        <Typisch land={land} f={f} nacht={nacht} />
      </group>
    </group>
  );
}

/** Alle Länder-Merkmale eines Werks. X/Z: Umrechnung der Werkskoordinaten in die Szene */
export default function Landesdeko({ standort, gs, f, X, Z, gebaeudeId }) {
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
        {[-gs.tor.b / 2, gs.tor.b / 2].map((x) => <Teil key={x} p={[x, 3.9, 0]} g={[0.4, 7.8, 0.4]} farbe="#3a3f47" />)}
        <Schild p={[0, 6.6, 0.25]} b={gs.tor.b - 0.6} h={2.4} text={schildText}
                grund={land === 'CN' ? '#c8102e' : '#1f2a37'} schrift={land === 'CN' ? '#ffd34d' : '#ffffff'} />
      </group>
      <HallenFlagge gs={gs} land={land} X={X} Z={Z} flaggeZeichnen={zeichnen} gebaeudeId={gebaeudeId} />
      <Umgebung standort={standort} gs={gs} f={f} />
    </>
  );
}
