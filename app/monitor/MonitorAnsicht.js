'use client';
/**
 * app/monitor/MonitorAnsicht.js – Vollbild-Anzeige einer Halle (Hallen-Monitor)
 *
 *  - Setzt <html data-vollbild="an">: Seitenleiste und Kopf sind ausgeblendet (globals.css).
 *  - Lädt alle 30 Sekunden neu (router.refresh, ohne Neuladen der Seite) und zeigt die Uhrzeit.
 *  - Links die Halle wie in der Störungskarte (KartenExplorer kompakt, groesse="monitor"): in 2D der
 *    Grundriss mit Ampeln und Störungszahlen, in 3D die Halle mit Ampeln und LED-Zahl.
 *  - Rechts alle Maschinen der Halle als Liste, sortiert nach Zustand: rot Stillstand (blinkt), orange
 *    Störung, grün läuft – mit „seit …“, Bearbeitungsstand und fälliger Wartung.
 *  - „Vollbild“ nutzt die Vollbild-Funktion des Browsers (z. B. für einen Fernseher in der Halle).
 *  - Umschalter 2D/3D im Kopf: steuert die Darstellung des KartenExplorers (Prop „ansicht“). Dadurch läuft
 *    derselbe saubere Übergang wie in der Karte (Gebäude wachsen bzw. sinken, kein Sprung). Wahl in
 *    localStorage "monitoransicht". Die Kartendaten kommen aus /api/kartendaten (alle 60 s neu).
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { startAusAdresse } from '@/lib/karten/adresse';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/SpracheKontext';
import { ampelZustand, AMPEL_TEXT } from '@/lib/karten/ampel';
import { gross } from '@/lib/sprache';

const TAKT = 30000;
// 3D-Halle nur bei Bedarf laden (three.js ist groß)
const KartenExplorer = dynamic(() => import('@/components/karten/KartenExplorer'), { ssr: false, loading: () => <div className="monitor-halle-laden" /> });
const REIHENFOLGE = ['rot', 'orange', 'gruen'];

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
  // null = gemerkte Wahl noch nicht gelesen (die Halle startet erst danach – sonst begänne sie in 2D und
  // wechselte sofort auf 3D)
  const [dreiD, setDreiD] = useState(null);
  const [daten, setDaten] = useState(null);
  useEffect(() => { try { setDreiD(localStorage.getItem('monitoransicht') === '3d'); } catch { setDreiD(false); } }, []);
  function ansichtWaehlen(drei) {
    setDreiD(drei);
    try { localStorage.setItem('monitoransicht', drei ? '3d' : '2d'); } catch { /* privat */ }
  }
  // Kartendaten laden und jede Minute auffrischen
  useEffect(() => {
    let aktuell = true;
    const laden = () => fetch('/api/kartendaten').then((a) => (a.ok ? a.json() : null)).then((d) => { if (aktuell && d) setDaten(d); }).catch(() => {});
    laden();
    const takt = setInterval(() => { if (document.visibilityState === 'visible') laden(); }, 60000);
    return () => { aktuell = false; clearInterval(takt); };
  }, []);
  // Startpunkt der Halle nur einmal festlegen (spätere Wechsel laufen über die Prop „ansicht“)
  const [start, setStart] = useState(null);
  useEffect(() => {
    if (daten && dreiD !== null && !start) setStart(startAusAdresse({ werk: ort.werk, halle: ort.kuerzel, ansicht: dreiD ? '3d' : '2d' }, daten));
  }, [daten, dreiD, start, ort.werk, ort.kuerzel]);

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
        <div className="sprach-schalter raum-schalter monitor-schalter" role="group" aria-label={t('Ansicht')}>
          <button type="button" aria-pressed={dreiD === false} onClick={() => ansichtWaehlen(false)}>2D</button>
          <button type="button" aria-pressed={dreiD === true} onClick={() => ansichtWaehlen(true)}>3D</button>
        </div>
        <div className="monitor-knoepfe">
          <button type="button" className="rund-knopf" onClick={vollbild} title={t('Vollbild')} aria-label={t('Vollbild')}><i className="bi bi-arrows-fullscreen" /></button>
          <Link href={`/karte?werk=${ort.werk.toLowerCase()}&halle=${ort.kuerzel.toLowerCase()}`} className="rund-knopf" title={t('Zurück zur Karte')} aria-label={t('Zurück zur Karte')}><i className="bi bi-x-lg" /></Link>
        </div>
      </header>

      <div className="monitor-halle" data-ansicht={dreiD ? '3d' : '2d'}>
        <div className="monitor-halle-buehne">
          {start ? (
            <KartenExplorer key={`${ort.werk}-${ort.kuerzel}`} daten={daten} kompakt groesse="monitor"
                            start={start} ansicht={dreiD ? '3d' : '2d'} />
          ) : <div className="monitor-halle-laden" />}
        </div>
        {/* Alle Maschinen der Halle, die dringendsten oben */}
        <ul className="monitor-liste" aria-label={t('Maschinen')}>
          {[...maschinen]
            .sort((a, b) => REIHENFOLGE.indexOf(ampelZustand(a)) - REIHENFOLGE.indexOf(ampelZustand(b)))
            .map((m) => {
              const z = ampelZustand(m);
              return (
                <li key={m.id} className={`monitor-zeile ampel-${z}`} data-zustand={z}>
                  <span className="ampel-symbol" aria-hidden="true"><i /><i /><i /></span>
                  <span className="monitor-zeile-text">
                    <span><strong>{m.anlagennummer}</strong> {m.bezeichnung}</span>
                    <small>
                      <b>{t(AMPEL_TEXT[z])}</b>
                      {m.offen > 0 && <> · {m.offen === 1 ? t('1 offene Störung') : t('{n} offene Störungen', { n: m.offen })} · {seitText(m.seit, jetzt, t)}</>}
                      {m.offen > 0 && m.status && <> · {gross(t(m.status))}</>}
                    </small>
                    {m.wartung_faellig > 0 && <span className="monitor-wartung"><i className="bi bi-calendar-check" aria-hidden="true" /> {t('Wartung fällig')}</span>}
                  </span>
                </li>
              );
            })}
        </ul>
      </div>
      <footer className="monitor-fuss">{t('Aktualisiert sich alle 30 Sekunden.')}</footer>
    </div>
  );
}
