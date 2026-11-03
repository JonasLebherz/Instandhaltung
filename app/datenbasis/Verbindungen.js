'use client';
/**
 * app/datenbasis/Verbindungen.js – „So funktioniert die App“: einfaches Schaubild mit Live-Status
 *
 *   Du (Browser) ──┐                  ┌──► Supabase-Datenbank (Daten)
 *                  ├──► Vercel (App) ──┤
 *   GitHub (Code) ─┘                  └──► Supabase Auth (Anmeldung)
 *
 * Gedacht zum Erklären: Jeder Kasten sagt in einem Satz, was er tut, und zeigt,
 * ob die Verbindung gerade funktioniert (Farbe UND Text, dazu die Antwortzeit).
 * Die Prüfung läuft im Hintergrund über /api/verbindungen.
 */
import { useEffect, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import { datumZeit } from '@/lib/format';
import { T } from '@/lib/sprache';

const STATUS_TEXT = {
  ok: T('verbunden'), warnung: T('Hinweis'), fehler: T('Fehler'), unbekannt: T('nicht prüfbar'), pruefe: T('wird geprüft …'),
};

function Knoten({ bereich, symbol, name, rolle, text, status, ms, hinweis }) {
  const t = useT();
  return (
    <div className={`verbund-knoten status-${status}`} style={{ gridArea: bereich }}>
      <div className="knoten-kopf">
        <span className="knoten-symbol" aria-hidden="true"><i className={`bi ${symbol}`} /></span>
        <span>
          <span className="knoten-name">{name}</span>
          <span className="knoten-rolle">{rolle}</span>
        </span>
      </div>
      <p className="knoten-text">{text}</p>
      <span className="knoten-status">
        <span className="punkt" aria-hidden="true" />{t(STATUS_TEXT[status])}
        {ms !== undefined && status === 'ok' && <span className="knoten-ms">· {ms} ms</span>}
      </span>
      {hinweis && <span className="knoten-hinweis">{hinweis}</span>}
    </div>
  );
}

/** Leitung zwischen zwei Kästen; die Kurve führt zur Mitte von Vercel bzw. von dort weg */
const KURVEN = {
  l1: 'M0 50 C 55 50, 45 100, 100 100',   // Browser → Vercel
  l2: 'M0 50 C 55 50, 45 0, 100 0',       // GitHub → Vercel
  l3: 'M0 100 C 55 100, 45 50, 100 50',   // Vercel → Datenbank
  l4: 'M0 0 C 55 0, 45 50, 100 50',       // Vercel → Anmeldung
};
function Leitung({ bereich, status, text }) {
  const t = useT();
  return (
    <div className={`verbund-leitung leitung-${bereich} status-${status}`} style={{ gridArea: bereich }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className="linie" d={KURVEN[bereich]} /></svg>
      <span className="leitung-text">{t(text)}</span>
    </div>
  );
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
  const lokal = t('nur online prüfbar');

  const vc = k?.vercel;
  const gh = k?.github;
  const db = k?.datenbank;
  const au = k?.login;

  return (
    <section className="karte verbund-karte" style={{ '--i': 4 }}>
      <div className="karte-kopf">
        <h2 className="abschnitt-titel">{t('So funktioniert die App')}</h2>
        <div className="d-flex align-items-center gap-3">
          {daten && <span className="klein">{t('Geprüft: {zeit}', { zeit: datumZeit(daten.zeit, t.sprache) })}</span>}
          <button type="button" className="btn btn-sekundaer btn-klein" onClick={pruefen} disabled={laedt}>
            <i className={`bi bi-arrow-repeat${laedt ? ' drehen' : ''}`} aria-hidden="true" /> {t('Erneut prüfen')}
          </button>
        </div>
      </div>
      {fehler && (
        <div className="hinweis hinweis-fehler" role="alert">
          <i className="bi bi-x-circle-fill" aria-hidden="true" />
          <span className="hinweis-text">{t('Die Prüfung konnte nicht ausgeführt werden.')}</span>
        </div>
      )}

      <div className="verbund" aria-busy={laedt}>
        <Knoten bereich="br" symbol="bi-laptop" name={t('Du')} rolle={t('Browser')} status={daten ? 'ok' : status(null)} ms={browserMs}
                text={t('Du öffnest die App im Browser – am PC, Tablet oder Handy.')} />
        <Leitung bereich="l1" status={daten ? 'ok' : status(null)} text={T('Seite aufrufen')} />
        <Knoten bereich="gh" symbol="bi-github" name="GitHub" rolle={t('Programmcode')} status={status(gh)}
                text={t('Hier liegt der Code. Jede Änderung wird automatisch veröffentlicht.')}
                hinweis={gh?.grund === 'lokal' ? lokal : null} />
        <Leitung bereich="l2" status={vc?.grund === 'lokal' ? 'unbekannt' : status(gh)} text={T('veröffentlichen')} />
        <Knoten bereich="vc" symbol="bi-cloud-check" name="Vercel" rolle={t('Hier läuft die App')} status={status(vc)}
                text={t('Baut die Seiten, prüft Eingaben und fragt die Datenbank ab.')}
                hinweis={vc?.grund === 'lokal' ? t('Lokaler Testbetrieb – nicht bei Vercel') : vc?.region ? t('Rechenzentrum: {r}', { r: vc.region }) : null} />
        <Leitung bereich="l3" status={status(db)} text={T('Daten lesen & speichern')} />
        <Knoten bereich="db" symbol="bi-database" name="Supabase" rolle={t('Datenbank')} status={status(db)} ms={db?.ms}
                text={t('Speichert alle Daten: Werke, Maschinen, Störungen und Aufträge.')}
                hinweis={db?.status === 'warnung' ? t('Session Pooler (Port 5432) – bitte Port 6543 verwenden') : db?.meldung} />
        <Leitung bereich="l4" status={status(au)} text={T('Anmeldung prüfen')} />
        <Knoten bereich="au" symbol="bi-shield-lock" name="Supabase Auth" rolle={t('Anmeldung')} status={status(au)} ms={au?.ms}
                text={t('Prüft beim Login E-Mail und Passwort.')}
                hinweis={au?.grund === 'deaktiviert' ? t('Login für lokale Tests abgeschaltet') : au?.meldung} />
      </div>
    </section>
  );
}
