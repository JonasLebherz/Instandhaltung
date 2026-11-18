'use client';
/**
 * app/datenbasis/Verbindungen.js – „So funktioniert die App“ als Anzeigetafel wie am Bahnsteig
 *
 * Eine dunkle Tafel mit einer Zeile je Dienst, über den die App läuft:
 *   Browser → Vercel (Server) → Supabase (Datenbank, Anmeldung), dazu GitHub (Code → Vercel).
 * Je Zeile: Kürzel als Linienschild, Dienst, Aufgabe, Ort, Antwortzeit und Status-Leuchte
 * (Farbe UND Text). Passt zum Datenmodell als Liniennetzplan darunter.
 * Die Prüfung läuft im Hintergrund über /api/verbindungen; nie Zugangsdaten anzeigen.
 */
import { useEffect, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import { uhrzeit } from '@/lib/format';
import { T } from '@/lib/sprache';

const STATUS_TEXT = {
  ok: T('verbunden'), warnung: T('Hinweis'), fehler: T('Fehler'), unbekannt: T('nicht prüfbar'), pruefe: T('wird geprüft …'),
};

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

  // Zeilen der Tafel (Reihenfolge = Weg einer Anfrage)
  const zeilen = [
    { id: 'br', schild: 'WEB', dienst: t('Browser'), aufgabe: t('PC, Tablet oder Handy'), ort: '–', ms: browserMs, status: daten ? 'ok' : status(null) },
    { id: 'vc', schild: 'APP', dienst: 'Vercel', aufgabe: t('Next.js – Seiten, Prüfungen, Abfragen'), status: status(vc),
      ort: vc?.grund === 'lokal' ? t('lokal') : vc?.region ?? '–', hinweis: vc?.grund === 'lokal' ? t('Lokaler Testbetrieb – nicht bei Vercel') : null },
    { id: 'db', schild: 'DB', dienst: 'Supabase', aufgabe: t('PostgreSQL mit Zeilensicherheit'), ms: db?.ms, status: status(db),
      ort: db?.region ?? (db?.art === 'lokal' ? t('lokal') : '–'), port: db?.port,
      hinweis: db?.status === 'warnung' ? t('Session Pooler (Port 5432) – bitte Port 6543 verwenden') : db?.meldung },
    { id: 'au', schild: 'AUTH', dienst: 'Supabase Auth', aufgabe: t('Anmeldung'), ms: au?.ms || undefined, status: status(au), ort: '–',
      hinweis: au?.grund === 'deaktiviert' ? t('Login für lokale Tests abgeschaltet') : au?.meldung },
    { id: 'gh', schild: 'GIT', dienst: 'GitHub', aufgabe: t('Quellcode, jeder Push wird veröffentlicht'), status: status(gh), ort: 'github.com',
      hinweis: gh?.grund === 'lokal' ? t('nur online prüfbar') : null },
  ];

  return (
    <section className="karte tafel-karte" style={{ '--i': 4 }}>
      <div className="karte-kopf">
        <h2 className="abschnitt-titel">{t('So funktioniert die App')}</h2>
        <button type="button" className="btn btn-sekundaer btn-klein" onClick={pruefen} disabled={laedt}>
          <i className={`bi bi-arrow-repeat${laedt ? ' drehen' : ''}`} aria-hidden="true" /> {t('Erneut prüfen')}
        </button>
      </div>
      <div className="tafel" aria-busy={laedt}>
        <div className="tafel-kopf" aria-hidden="true">
          <span>{t('Linie')}</span><span>{t('Dienst')}</span><span>{t('Aufgabe')}</span><span>{t('Ort')}</span><span className="rechts">{t('Zeit')}</span><span>{t('Status')}</span>
        </div>
        {zeilen.map((z) => (
          <div key={z.id} className={`tafel-zeile status-${z.status}`} data-dienst={z.id}>
            <span className={`tafel-schild schild-${z.id}`}>{z.schild}</span>
            <span className="tafel-dienst">{z.dienst}</span>
            <span className="tafel-aufgabe">{z.aufgabe}{z.hinweis && <small>{z.hinweis}</small>}</span>
            <span className="tafel-ort">{z.ort}{z.port ? ` · ${z.port}` : ''}</span>
            <span className="tafel-ms rechts">{z.ms !== undefined && z.status === 'ok' ? `${z.ms} ms` : '–'}</span>
            <span className="tafel-status"><i className="tafel-led" aria-hidden="true" />{t(STATUS_TEXT[z.status])}</span>
          </div>
        ))}
        <div className="tafel-fuss">
          <span>{daten ? t('Geprüft: {zeit}', { zeit: uhrzeit(daten.zeit, t.sprache) }) : fehler ? t('Die Prüfung konnte nicht ausgeführt werden.') : t('wird geprüft …')}</span>
          <span className="tafel-weg">WEB → APP → DB · AUTH &nbsp;·&nbsp; GIT → APP</span>
        </div>
      </div>
    </section>
  );
}
