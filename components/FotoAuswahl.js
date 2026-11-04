'use client';
/**
 * components/FotoAuswahl.js – Fotos aufnehmen bzw. auswählen und vor dem Senden verkleinern
 *
 * Handyfotos haben oft 3–8 MB. Der Browser rechnet sie deshalb vor dem Senden auf höchstens
 * 1280 px Kantenlänge herunter und speichert sie als JPEG (Qualität 0,8, meist 150–350 KB).
 * Die verkleinerten Dateien landen in einem versteckten Datei-Feld (name, Standard "fotos") –
 * so schickt das Formular sie ganz normal mit (Server-Aktion liest formular.getAll).
 * Mit `fotos`/`setFotos` liegt die Auswahl beim Aufrufer – dann bleiben die Fotos erhalten,
 * wenn das Formular nach einer Fehlermeldung neu aufgebaut wird (key={…}).
 * Auf dem Handy öffnet „Foto aufnehmen“ direkt die Kamera (capture="environment").
 */
import { useEffect, useRef, useState } from 'react';
import { useT } from './SpracheKontext';

export const MAX_FOTOS = 3;
const MAX_KANTE = 1280;

/** Bild laden, verkleinern, als JPEG-Datei zurückgeben */
async function verkleinern(datei) {
  const bild = await createImageBitmap(datei).catch(() => null);
  if (!bild) return null;
  const faktor = Math.min(1, MAX_KANTE / Math.max(bild.width, bild.height));
  const leinwand = document.createElement('canvas');
  leinwand.width = Math.round(bild.width * faktor);
  leinwand.height = Math.round(bild.height * faktor);
  leinwand.getContext('2d').drawImage(bild, 0, 0, leinwand.width, leinwand.height);
  const blob = await new Promise((fertig) => leinwand.toBlob(fertig, 'image/jpeg', 0.8));
  return blob ? new File([blob], `${datei.name.replace(/\.[^.]+$/, '') || 'foto'}.jpg`, { type: 'image/jpeg' }) : null;
}

export default function FotoAuswahl({ name = 'fotos', vorhanden = 0, fotos: vonAussen, setFotos: setVonAussen }) {
  const t = useT();
  const [eigene, setEigene] = useState([]);   // { datei, vorschau }
  const fotos = vonAussen ?? eigene;
  const setFotos = setVonAussen ?? setEigene;
  const [arbeitet, setArbeitet] = useState(false);
  const verstecktRef = useRef(null);
  const frei = MAX_FOTOS - vorhanden - fotos.length;

  // Verkleinerte Dateien in das versteckte Feld legen (DataTransfer), damit das Formular sie sendet
  useEffect(() => {
    if (!verstecktRef.current) return;
    const dt = new DataTransfer();
    fotos.forEach((f) => dt.items.add(f.datei));
    verstecktRef.current.files = dt.files;
  }, [fotos]);

  async function gewaehlt(e) {
    const dateien = [...e.target.files].filter((d) => d.type.startsWith('image/')).slice(0, Math.max(0, frei));
    e.target.value = '';
    if (!dateien.length) return;
    setArbeitet(true);
    const neu = (await Promise.all(dateien.map(verkleinern))).filter(Boolean)
      .map((datei) => ({ datei, vorschau: URL.createObjectURL(datei) }));
    setFotos((alt) => [...alt, ...neu].slice(0, MAX_FOTOS - vorhanden));
    setArbeitet(false);
  }

  return (
    <div className="foto-auswahl">
      <input ref={verstecktRef} type="file" name={name} multiple hidden aria-hidden="true" tabIndex={-1} />
      <div className="foto-vorschauen">
        {fotos.map((f, i) => (
          <div key={f.vorschau} className="foto-vorschau">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.vorschau} alt={t('Foto {n}', { n: i + 1 })} />
            <button type="button" className="foto-weg" onClick={() => { URL.revokeObjectURL(f.vorschau); setFotos(fotos.filter((x) => x !== f)); }}
                    aria-label={t('Foto {n} entfernen', { n: i + 1 })}><i className="bi bi-x-lg" aria-hidden="true" /></button>
          </div>
        ))}
        {frei > 0 && (
          <label className={`foto-hinzu${arbeitet ? ' arbeitet' : ''}`}>
            <input type="file" accept="image/*" capture="environment" multiple onChange={gewaehlt} className="visually-hidden" data-foto-eingabe="" />
            {arbeitet ? <span className="lade-kreis" aria-hidden="true" /> : <i className="bi bi-camera" aria-hidden="true" />}
            <span>{arbeitet ? t('Wird verkleinert …') : t('Foto hinzufügen')}</span>
          </label>
        )}
      </div>
      <div className="form-text">{t('Bis zu {n} Fotos – auf dem Handy direkt mit der Kamera.', { n: MAX_FOTOS })}</div>
    </div>
  );
}
