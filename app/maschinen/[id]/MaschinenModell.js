'use client';
/**
 * MaschinenModell.js – 3D-Modell der Maschine (wie im Infofenster der Karte), nur wenn der Browser WebGL kann.
 * three.js wird erst hier und nur im Browser geladen.
 */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const MaschineDetail3D = dynamic(() => import('@/components/karten/raum/MaschineDetail3D'), { ssr: false, loading: () => <div className="maschine-detail-3d" /> });

export default function MaschinenModell({ maschine }) {
  const [webgl, setWebgl] = useState(false);
  useEffect(() => {
    try {
      const c = document.createElement('canvas');
      setWebgl(Boolean(c.getContext('webgl2') || c.getContext('webgl')));
    } catch { /* ohne 3D */ }
  }, []);
  return webgl ? <MaschineDetail3D maschine={maschine} /> : null;
}
