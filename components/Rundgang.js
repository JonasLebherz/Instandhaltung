'use client';
/**
 * components/Rundgang.js – geführter Rundgang durch die App (z. B. für die Präsentation)
 *
 * Start: Knopf „Rundgang“ auf der Übersicht oder im Konto-Menü der Seitenleiste
 * (beide lösen das Ereignis RUNDGANG_START aus, siehe RundgangKnopf).
 * Ablauf: SCHRITTE der Reihe nach. Je Schritt wird die Seite geöffnet (router.push), das Ziel-Element
 * gesucht (CSS-Auswahl, bis zu 5 s – manche Teile wie die 3D-Ansicht laden nach), sanft ins Bild
 * gescrollt und hervorgehoben: Ein Rahmen mit großem halbdunklem Schatten drumherum dunkelt den Rest ab.
 * Daneben steht eine Karte mit Titel, Erklärung und Zurück/Weiter/Beenden (Tasten ← → Esc).
 * Fehlt das Ziel (z. B. Seitenleiste auf dem Handy), steht die Karte allein in der Mitte.
 * Der aktuelle Schritt liegt in sessionStorage („rundgang“) – so übersteht er den Seitenwechsel.
 * Die Seite bleibt bedienbar (der Rahmen fängt keine Klicks ab).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { useT } from '@/components/SpracheKontext';
import { T } from '@/lib/sprache';

export const RUNDGANG_START = 'rundgang-start';
const SPEICHER = 'rundgang';

// Die Stationen: Seite, hervorgehobenes Element, Titel und ein bis zwei Sätze
export const SCHRITTE = [
  { pfad: '/', ziel: '.seitenleiste', titel: T('Willkommen'), text: T('Das ist die Instandhaltungs-App für alle Werke. Links die Seitenleiste mit allen Bereichen – eingeklappt reichen die Symbole.') },
  { pfad: '/', ziel: '.row:has(.kennzahl)', titel: T('Die Lage auf einen Blick'), text: T('Die Übersicht zeigt offene Meldungen, dringende Störungen, knappe Ersatzteile und was in den letzten 30 Tagen erledigt wurde.') },
  { pfad: '/karte', ziel: '.explorer-buehne', titel: T('Störungskarte'), text: T('Von der Welt über das Land ins Werk bis in die Halle – auf Wunsch in 3D. Die Zahl an jedem Ort sind die offenen Störungen, die Farbe zeigt die höchste Priorität.') },
  { pfad: '/melden', ziel: '.explorer-buehne', titel: T('Störung melden'), text: T('In fünf Schritten über die Karte zur Maschine und kurz beschreiben – mit Fotos. Schneller geht es mit dem QR-Code an der Maschine.') },
  { pfad: '/auftraege', ziel: '.tabelle', titel: T('Aufträge'), text: T('Zu jeder Meldung gibt es einen Auftrag. Filter nach Status, Werk, Maschine und Priorität; ein Klick öffnet den Auftrag mit Techniker, Ersatzteilen, Checkliste und Verlauf.') },
  { pfad: '/maschinen', ziel: '.karte', titel: T('Maschinen'), text: T('Alle Anlagen mit Ampel. Die Maschinen-Seite zeigt Kennzahlen, die Historie aller Störungen, das 3D-Modell und den QR-Code.') },
  { pfad: '/wartung', ziel: '.wartung-kalender', titel: T('Wartungsplan'), text: T('Vorbeugende Wartung im Kalender oder als Zeitachse: rot überfällig, orange fällig, grün erledigt.') },
  { pfad: '/lager', ziel: '.regal3d, .lager-regal, .lager-werke', titel: T('Lager'), text: T('Jedes Werk hat sein Ersatzteillager. Im 3D-Regal steht jedes Teil – rot durchsichtig, was bis zum Mindestbestand fehlt.') },
  { pfad: '/statistik', ziel: '.kennzahl', titel: T('Statistik'), text: T('Kennzahlen wie MTTR, Ausfallzeit und Verfügbarkeit – mit Zoom von weltweit bis zur Maschine. Das „i“ erklärt jede Zahl: aus welcher Tabelle und wie berechnet.') },
  { pfad: '/datenbasis', ziel: '.er-diagramm', titel: T('Datenbasis'), text: T('Die Datenbank dahinter: alle Tabellen mit Schlüsseln und Beziehungen, live aus PostgreSQL gelesen.') },
  { pfad: '/spiel', ziel: '.spiel-buehne', titel: T('Zum Schluss'), text: T('Das Gabelstapler-Spiel: Ersatzteil holen, zur stehenden Maschine bringen – gegen die Uhr. Viel Spaß!') },
];

/** Knopf, der den Rundgang startet */
export function RundgangKnopf({ className = 'btn btn-sekundaer', children }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(RUNDGANG_START))}>
      {children}
    </button>
  );
}

function lesen() {
  try { const n = Number(sessionStorage.getItem(SPEICHER)); return sessionStorage.getItem(SPEICHER) === null || !Number.isInteger(n) ? null : n; } catch { return null; }
}
function merken(n) {
  try { if (n === null) sessionStorage.removeItem(SPEICHER); else sessionStorage.setItem(SPEICHER, String(n)); } catch { /* privat */ }
}

export default function Rundgang() {
  const t = useT();
  const router = useRouter();
  const pfad = usePathname();
  const [schritt, setSchritt] = useState(null);
  const [rahmen, setRahmen] = useState(null);     // Bildschirm-Rechteck des Ziels oder null
  const [gesucht, setGesucht] = useState(false);  // Suche abgeschlossen (gefunden oder nicht)
  const ziel = useRef(null);
  const karte = useRef(null);

  const gehe = useCallback((n) => {
    const neu = n === null || n < 0 || n >= SCHRITTE.length ? null : n;
    merken(neu);
    setSchritt(neu);
  }, []);

  // Start per Ereignis; nach einem Neuladen mitten im Rundgang weitermachen
  useEffect(() => {
    setSchritt(lesen());
    const start = () => gehe(0);
    window.addEventListener(RUNDGANG_START, start);
    return () => window.removeEventListener(RUNDGANG_START, start);
  }, [gehe]);

  // Seite öffnen und Ziel suchen
  useEffect(() => {
    if (schritt === null) return undefined;
    const s = SCHRITTE[schritt];
    setRahmen(null); setGesucht(false); ziel.current = null;
    if (pfad !== s.pfad) { router.push(s.pfad); return undefined; }
    let fertig = false;
    const beginn = Date.now();
    const suche = setInterval(() => {
      const el = [...document.querySelectorAll(s.ziel)].find((e) => e.getBoundingClientRect().width > 0);
      if (el || Date.now() - beginn > 5000) {
        clearInterval(suche);
        fertig = true;
        ziel.current = el ?? null;
        if (el) el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.6 ? 'start' : 'center', behavior: 'smooth' });
        setGesucht(true);
      }
    }, 150);
    return () => { if (!fertig) clearInterval(suche); };
  }, [schritt, pfad, router]);

  // Rahmen mitführen (Scrollen, Größe, nachladende Inhalte)
  useEffect(() => {
    if (schritt === null || !gesucht) return undefined;
    const messen = () => {
      const el = ziel.current;
      if (!el || !el.isConnected) { setRahmen(null); return; }
      const r = el.getBoundingClientRect();
      setRahmen({ links: r.left - 6, oben: r.top - 6, breite: r.width + 12, hoehe: r.height + 12 });
    };
    messen();
    const takt = setInterval(messen, 400);
    window.addEventListener('scroll', messen, { passive: true });
    window.addEventListener('resize', messen);
    return () => { clearInterval(takt); window.removeEventListener('scroll', messen); window.removeEventListener('resize', messen); };
  }, [schritt, gesucht]);

  // Tastatur
  useEffect(() => {
    if (schritt === null) return undefined;
    const taste = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable]')) return;
      if (e.key === 'Escape') gehe(null);
      else if (e.key === 'ArrowRight') gehe(schritt + 1);
      else if (e.key === 'ArrowLeft' && schritt > 0) gehe(schritt - 1);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [schritt, gehe]);

  // Fokus auf die Karte, damit Bildschirmleser den neuen Schritt vorlesen
  useEffect(() => { if (gesucht) karte.current?.focus({ preventScroll: true }); }, [gesucht, schritt]);

  if (schritt === null) return null;
  const s = SCHRITTE[schritt];
  const letzter = schritt === SCHRITTE.length - 1;

  // Lage der Karte: unter dem Ziel, sonst darüber, sonst unten mittig (Handy: immer unten)
  const breit = typeof window !== 'undefined' && window.innerWidth >= 768;
  let lage = null;
  if (rahmen && breit) {
    const hoeheKarte = 230;
    const links = Math.max(16, Math.min(rahmen.links, window.innerWidth - 400));
    if (rahmen.oben + rahmen.hoehe + hoeheKarte + 16 < window.innerHeight) lage = { left: links, top: rahmen.oben + rahmen.hoehe + 12 };
    else if (rahmen.oben - hoeheKarte - 12 > 0) lage = { left: links, top: rahmen.oben - hoeheKarte - 12 };
  }

  return createPortal(
    <div className="rundgang" data-schritt={schritt + 1}>
      {rahmen ? (
        <div className="rundgang-rahmen" style={{ left: rahmen.links, top: rahmen.oben, width: rahmen.breite, height: rahmen.hoehe }} aria-hidden="true" />
      ) : (
        <div className="rundgang-abdunkeln" aria-hidden="true" />
      )}
      <div ref={karte} className={`rundgang-karte${lage ? '' : ' unten'}`} style={lage ?? undefined}
           role="dialog" aria-modal="false" aria-labelledby="rundgang-titel" tabIndex={-1}>
        <div className="rundgang-kopf">
          <span className="rundgang-zaehler">{t('Rundgang · {n} von {m}', { n: schritt + 1, m: SCHRITTE.length })}</span>
          <button type="button" className="rundgang-zu" onClick={() => gehe(null)} aria-label={t('Rundgang beenden')}><i className="bi bi-x-lg" aria-hidden="true" /></button>
        </div>
        <h2 id="rundgang-titel">{t(s.titel)}</h2>
        <p>{t(s.text)}</p>
        <div className="rundgang-fortschritt" aria-hidden="true">
          {SCHRITTE.map((_, i) => <span key={i} className={i === schritt ? 'aktiv' : i < schritt ? 'fertig' : ''} />)}
        </div>
        <div className="rundgang-knoepfe">
          <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => gehe(schritt - 1)} disabled={schritt === 0}>
            <i className="bi bi-arrow-left" aria-hidden="true" /> {t('Zurück')}
          </button>
          <button type="button" className="btn btn-primary btn-klein rundgang-weiter" onClick={() => gehe(letzter ? null : schritt + 1)}>
            {letzter ? t('Fertig') : <>{t('Weiter')} <i className="bi bi-arrow-right" aria-hidden="true" /></>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
