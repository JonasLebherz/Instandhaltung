'use client';
/**
 * app/auftraege/[id]/Fotos.js – Fotos der Störmeldung: Vorschaubilder, Großansicht, Fotos ergänzen
 *
 * Bilder kommen aus /api/fotos/<id>. Ein Klick öffnet die Großansicht (Escape oder Klick schließt).
 * „Foto hinzufügen“ verkleinert die Bilder im Browser (FotoAuswahl) und speichert sie über die
 * Server-Aktion fotosHinzufuegen; danach lädt die Seite neu.
 */
import { useActionState, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/SpracheKontext';
import FotoAuswahl, { MAX_FOTOS } from '@/components/FotoAuswahl';
import SpeichernKnopf from '@/components/SpeichernKnopf';
import { fotosHinzufuegen } from '@/app/aktionen';

export default function Fotos({ meldungId, fotos }) {
  const t = useT();
  const router = useRouter();
  const [gross, setGross] = useState(null);
  const [neue, setNeue] = useState([]);
  const [zustand, aktion] = useActionState(fotosHinzufuegen.bind(null, meldungId), {});

  useEffect(() => { if (zustand.ok) { setNeue([]); router.refresh(); } }, [zustand]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (gross === null) return undefined;
    const taste = (e) => { if (e.key === 'Escape') setGross(null); };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [gross]);

  return (
    <div className="fotos">
      {fotos.length > 0 && (
        <div className="foto-reihe">
          {fotos.map((id, i) => (
            <button key={id} type="button" className="foto-klein" onClick={() => setGross(id)} aria-label={t('Foto {n} groß anzeigen', { n: i + 1 })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/fotos/${id}`} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {fotos.length < MAX_FOTOS && (
        <form action={aktion} className="foto-ergaenzen">
          <FotoAuswahl vorhanden={fotos.length} fotos={neue} setFotos={setNeue} />
          {neue.length > 0 && <SpeichernKnopf className="btn btn-primary btn-klein mt-2" ladeText={t('Wird hochgeladen …')}><i className="bi bi-upload" aria-hidden="true" /> {t('Fotos speichern')}</SpeichernKnopf>}
          {zustand.fehler && <div className="invalid-feedback d-block">{zustand.fehler}</div>}
        </form>
      )}
      {gross !== null && createPortal(
        <div className="foto-gross" role="dialog" aria-modal="true" aria-label={t('Foto')} onClick={() => setGross(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/fotos/${gross}`} alt={t('Foto der Störung')} />
          <button type="button" className="rund-knopf" aria-label={t('Schließen')}><i className="bi bi-x-lg" /></button>
        </div>,
        document.body,
      )}
    </div>
  );
}
