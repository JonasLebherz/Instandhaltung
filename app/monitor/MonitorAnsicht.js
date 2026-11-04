'use client';
/**
 * app/monitor/MonitorAnsicht.js – Vollbild-Anzeige einer Halle (Hallen-Monitor)
 *
 *  - Setzt <html data-vollbild="an">: Seitenleiste und Kopf sind ausgeblendet (globals.css).
 *  - Lädt alle 30 Sekunden neu (router.refresh, ohne Neuladen der Seite) und zeigt die Uhrzeit.
 *  - Kachel je Maschine in Ampelfarbe: grün läuft, orange Störung, rot Stillstand (blinkt).
 *  - „Vollbild“ nutzt die Vollbild-Funktion des Browsers (z. B. für einen Fernseher in der Halle).
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/SpracheKontext';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import { ampelZustand, AMPEL_TEXT } from '@/lib/karten/ampel';
import { gross } from '@/lib/sprache';

const TAKT = 30000;

/** „seit 2 h 15 min“ */
function seitText(iso, jetzt, t) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((jetzt - new Date(iso)) / 60000));
  if (min < 60) return t('seit {n} min', { n: min });
  if (min < 48 * 60) return t('seit {h} h {m} min', { h: Math.floor(min / 60), m: min % 60 });
  return t('seit {n} Tagen', { n: Math.floor(min / 1440) });
}

export default function MonitorAnsicht({ ort, maschinen, stand }) {
  const t = useT();
  const router = useRouter();
  const [jetzt, setJetzt] = useState(() => new Date(stand));

  useEffect(() => {
    document.documentElement.dataset.vollbild = 'an';
    const neu = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, TAKT);
    const uhr = setInterval(() => setJetzt(new Date()), 15000);
    setJetzt(new Date());
    return () => { delete document.documentElement.dataset.vollbild; clearInterval(neu); clearInterval(uhr); };
  }, [router]);

  const zaehle = (z) => maschinen.filter((m) => ampelZustand(m) === z).length;
  const uhrzeit = new Intl.DateTimeFormat(t.locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(jetzt);
  const vollbild = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="monitor">
      <header className="monitor-kopf">
        <div>
          <div className="monitor-ort">{ort.standort} · {ort.stadt}</div>
          <h1>{ort.kuerzel} – {ort.bezeichnung}</h1>
        </div>
        <div className="monitor-summen" aria-label={t('Zusammenfassung')}>
          <span className="ampel-gruen"><strong>{zaehle('gruen')}</strong>{t(AMPEL_TEXT.gruen)}</span>
          <span className="ampel-orange"><strong>{zaehle('orange')}</strong>{t(AMPEL_TEXT.orange)}</span>
          <span className="ampel-rot"><strong>{zaehle('rot')}</strong>{t(AMPEL_TEXT.rot)}</span>
        </div>
        <div className="monitor-uhr" aria-label={t('Uhrzeit')}>{uhrzeit}</div>
        <div className="monitor-knoepfe">
          <button type="button" className="rund-knopf" onClick={vollbild} title={t('Vollbild')} aria-label={t('Vollbild')}><i className="bi bi-arrows-fullscreen" /></button>
          <Link href={`/karte?werk=${ort.werk.toLowerCase()}&halle=${ort.kuerzel.toLowerCase()}`} className="rund-knopf" title={t('Zurück zur Karte')} aria-label={t('Zurück zur Karte')}><i className="bi bi-x-lg" /></Link>
        </div>
      </header>

      <div className="monitor-raster">
        {maschinen.map((m) => {
          const z = ampelZustand(m);
          return (
            <div key={m.id} className={`monitor-kachel ampel-${z}`} data-zustand={z}>
              <div className="monitor-kachel-kopf">
                <i className={`bi ${MASCHINEN_SYMBOLE[m.typ] ?? 'bi-gear'}`} aria-hidden="true" />
                <span className="monitor-nummer">{m.anlagennummer}</span>
                <span className="ampel-symbol" aria-hidden="true"><i /><i /><i /></span>
              </div>
              <div className="monitor-name">{m.bezeichnung}</div>
              <div className="monitor-zustand">
                <strong>{t(AMPEL_TEXT[z])}</strong>
                {m.offen > 0 && <span>{m.offen === 1 ? t('1 offene Störung') : t('{n} offene Störungen', { n: m.offen })} · {seitText(m.seit, jetzt, t)}</span>}
                {m.offen > 0 && m.status && <span>{gross(t(m.status))}</span>}
              </div>
              {m.wartung_faellig > 0 && <div className="monitor-wartung"><i className="bi bi-calendar-check" aria-hidden="true" /> {t('Wartung fällig')}</div>}
            </div>
          );
        })}
      </div>
      <footer className="monitor-fuss">{t('Aktualisiert sich alle 30 Sekunden.')}</footer>
    </div>
  );
}
