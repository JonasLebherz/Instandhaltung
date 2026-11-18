'use client';
/**
 * app/datenbasis/Verbindungen.js – „So funktioniert die App“ als kleiner Liniennetzplan
 *
 * Gleiche Bildsprache wie das Datenmodell darunter: Die Dienste sind Stationen, die Verbindungen
 * zwischen ihnen Strecken (nur waagerecht/45°, runde Kurven). Eine Anfrage fährt
 *   Browser → Vercel (App) → Supabase (Datenbank) bzw. Supabase Auth (Anmeldung),
 * der Code kommt von GitHub zu Vercel. Die Farbe einer Strecke zeigt den Zustand des Ziels
 * (grün verbunden, orange Hinweis, rot Fehler, grau nicht prüfbar), auf aktiven Strecken
 * fährt ein Punkt hin und her, an der Strecke steht die gemessene Antwortzeit.
 * Die Prüfung läuft über /api/verbindungen; es werden nie Zugangsdaten angezeigt.
 */
import { useEffect, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import { uhrzeit } from '@/lib/format';
import { T } from '@/lib/sprache';

const STATUS_TEXT = {
  ok: T('verbunden'), warnung: T('Hinweis'), fehler: T('Fehler'), unbekannt: T('nicht prüfbar'), pruefe: T('wird geprüft …'),
};

// Lage der Stationen (Pixel im viewBox) und wo die Beschriftung steht
const STATIONEN = {
  br: { x: 150, y: 140, seite: 'u' },
  vc: { x: 350, y: 140, seite: 'o' },
  db: { x: 670, y: 60, seite: 'r' },
  au: { x: 670, y: 220, seite: 'r' },
  gh: { x: 150, y: 280, seite: 'u' },
};
// Strecken: von → nach mit Zwischenpunkten; vc→db und vc→au fahren das erste Stück parallel
const STRECKEN = [
  { id: 'br-vc', von: 'br', nach: 'vc', ziel: 'vc', punkte: [[150, 140], [350, 140]], ms: 'br' },
  { id: 'vc-db', von: 'vc', nach: 'db', ziel: 'db', punkte: [[350, 140], [470, 140], [550, 60], [670, 60]], versatz: 5, ms: 'db' },
  { id: 'vc-au', von: 'vc', nach: 'au', ziel: 'au', punkte: [[350, 140], [470, 140], [550, 220], [670, 220]], versatz: -5, ms: 'au' },
  { id: 'gh-vc', von: 'gh', nach: 'vc', ziel: 'gh', punkte: [[150, 280], [210, 280], [350, 140]] },
];

/** Linienzug seitlich verschieben (gleicher Abstand auch in den Ecken) – wie im Datenmodell */
function parallel(p, abstand) {
  if (!abstand) return p;
  const normale = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]; };
  return p.map((punkt, i) => {
    const n1 = i > 0 ? normale(p[i - 1], punkt) : null;
    const n2 = i < p.length - 1 ? normale(punkt, p[i + 1]) : null;
    if (!n1 || !n2) { const n = n1 ?? n2; return [punkt[0] + n[0] * abstand, punkt[1] + n[1] * abstand]; }
    const faktor = abstand / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [punkt[0] + (n1[0] + n2[0]) * faktor, punkt[1] + (n1[1] + n2[1]) * faktor];
  });
}

/** Linienzug mit runden Ecken als SVG-Pfad */
function pfad(p, r = 22) {
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i += 1) {
    const [a, b, c] = [p[i - 1], p[i], p[i + 1]];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k = Math.min(r, l1 / 2, l2 / 2);
    d += ` L ${b[0] - ((b[0] - a[0]) / l1) * k} ${b[1] - ((b[1] - a[1]) / l1) * k}`
      + ` Q ${b[0]} ${b[1]} ${b[0] + ((c[0] - b[0]) / l2) * k} ${b[1] + ((c[1] - b[1]) / l2) * k}`;
  }
  return `${d} L ${p[p.length - 1][0]} ${p[p.length - 1][1]}`;
}

export default function Verbindungen() {
  const t = useT();
  const [daten, setDaten] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState(false);
  const [browserMs, setBrowserMs] = useState(undefined);

  function pruefen() {
    setLaedt(true);
    setFehler(false);
    const start = performance.now();
    fetch('/api/verbindungen', { cache: 'no-store' })
      .then((antwort) => (antwort.ok ? antwort.json() : Promise.reject(new Error(String(antwort.status)))))
      .then((d) => { setDaten(d); setBrowserMs(Math.round(performance.now() - start)); })
      .catch(() => setFehler(true))
      .finally(() => setLaedt(false));
  }
  useEffect(pruefen, []);

  const k = daten?.knoten;
  const status = (knoten) => (!daten ? (fehler ? 'fehler' : 'pruefe') : knoten?.status ?? 'unbekannt');
  const { vercel: vc, github: gh, datenbank: db, login: au } = k ?? {};

  // Inhalt je Station: Name, Aufgabe, Ort, Zustand, Hinweis
  const dienste = {
    br: { name: t('Browser'), aufgabe: t('PC, Tablet oder Handy'), status: daten ? 'ok' : status(null), ms: browserMs },
    vc: { name: 'Vercel', aufgabe: `Next.js · ${vc?.grund === 'lokal' ? t('lokal') : vc?.region ?? '–'}`, status: status(vc),
      hinweis: vc?.grund === 'lokal' ? t('Lokaler Testbetrieb – nicht bei Vercel') : null },
    db: { name: 'Supabase', aufgabe: `PostgreSQL · ${db?.region ?? (db?.art === 'lokal' ? t('lokal') : '–')}${db?.port ? ` · ${db.port}` : ''}`,
      status: status(db), ms: db?.ms,
      hinweis: db?.status === 'warnung' ? t('Session Pooler (Port 5432) – bitte Port 6543 verwenden') : db?.meldung },
    au: { name: 'Supabase Auth', aufgabe: t('Anmeldung'), status: status(au), ms: au?.ms || undefined,
      hinweis: au?.grund === 'deaktiviert' ? t('Login für lokale Tests abgeschaltet') : au?.meldung },
    gh: { name: 'GitHub', aufgabe: t('Quellcode, jeder Push wird veröffentlicht'), status: status(gh),
      hinweis: gh?.grund === 'lokal' ? t('nur online prüfbar') : null },
  };
  const hinweise = Object.entries(dienste).filter(([, d]) => d.hinweis);

  return (
    <section className="karte system-karte" style={{ '--i': 4 }}>
      <div className="karte-kopf">
        <h2 className="abschnitt-titel">{t('So funktioniert die App')}</h2>
        <button type="button" className="btn btn-sekundaer btn-klein" onClick={pruefen} disabled={laedt}>
          <i className={`bi bi-arrow-repeat${laedt ? ' drehen' : ''}`} aria-hidden="true" /> {t('Erneut prüfen')}
        </button>
      </div>

      <div className="netzplan-rahmen">
        <svg className="systemplan" viewBox="0 0 920 380" role="img" aria-label={t('So funktioniert die App')} aria-busy={laedt}>
          {STRECKEN.map((s) => {
            const st = dienste[s.ziel].status;
            const d = pfad(parallel(s.punkte, s.versatz ?? 0));
            const ms = s.ms ? dienste[s.ms].ms : undefined;
            const [mx, my] = s.punkte[s.punkte.length - 2].map((w, i) => (w + s.punkte[s.punkte.length - 1][i]) / 2);
            return (
              <g key={s.id} className={`sys-strecke status-${st}`} data-strecke={s.id}>
                <path d={d} className="sys-linie" />
                {/* Fahrender Punkt = Daten unterwegs (nur bei funktionierender Verbindung) */}
                {(st === 'ok' || st === 'warnung') && (
                  <circle r={4.5} className="sys-zug">
                    <animateMotion dur={s.id === 'gh-vc' ? '4s' : '2.6s'} repeatCount="indefinite" path={d} keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" />
                  </circle>
                )}
                {ms !== undefined && (st === 'ok' || st === 'warnung') && <text x={mx} y={my - 12} className="sys-ms">{`${ms} ms`}</text>}
              </g>
            );
          })}
          {Object.entries(STATIONEN).map(([id, pos]) => {
            const dienst = dienste[id];
            const rechts = pos.seite === 'r';
            const tx = rechts ? pos.x + 24 : pos.x, ty = pos.seite === 'o' ? pos.y - 62 : rechts ? pos.y - 14 : pos.y + 34;
            return (
              <g key={id} className={`sys-station status-${dienst.status}`} data-dienst={id}>
                <circle cx={pos.x} cy={pos.y} r={13} className="sys-ring" />
                <circle cx={pos.x} cy={pos.y} r={5} className="sys-led" />
                <text x={tx} y={ty} textAnchor={rechts ? 'start' : 'middle'} className="sys-text">
                  <tspan x={tx} className="sys-name">{dienst.name}</tspan>
                  <tspan x={tx} dy={20} className="sys-aufgabe">{dienst.aufgabe}</tspan>
                  <tspan x={tx} dy={19} className="sys-zustand">{t(STATUS_TEXT[dienst.status])}</tspan>
                </text>
                <title>{[dienst.name, dienst.aufgabe, t(STATUS_TEXT[dienst.status]), dienst.hinweis].filter(Boolean).join(' · ')}</title>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="sys-fuss klein">
        {hinweise.map(([id, d]) => (
          <span key={id} className={`sys-hinweis status-${d.status}`}><i aria-hidden="true" /><strong>{d.name}:</strong> {d.hinweis}</span>
        ))}
        <span className="sys-zeit">
          {daten ? t('Geprüft: {zeit}', { zeit: uhrzeit(daten.zeit, t.sprache) }) : fehler ? t('Die Prüfung konnte nicht ausgeführt werden.') : t('wird geprüft …')}
        </span>
      </div>
    </section>
  );
}
