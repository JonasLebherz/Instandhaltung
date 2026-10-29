'use client';
/**
 * app/datenbasis/Verbindungen.js – Verbindungen als Schaubild mit Live-Status
 *
 *   Claude & Codex ──► GitHub ──► Vercel (diese App) ──┬─► Supabase-Datenbank ◄── Power BI
 *                                                     └─► Supabase-Login
 *
 * Die Prüfung läuft im Hintergrund über /api/verbindungen. Jede Leitung und
 * jeder Knoten zeigt den Zustand mit Farbe UND Text: verbunden, Hinweis,
 * Fehler oder nicht prüfbar. Funktionierende Leitungen "fließen" (Animation).
 */
import { useEffect, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import { datumZeit } from '@/lib/format';
import { T } from '@/lib/sprache';

const STATUS_TEXT = {
  ok: T('verbunden'), warnung: T('Hinweis'), fehler: T('Fehler'), unbekannt: T('nicht prüfbar'), pruefe: T('wird geprüft …'),
};

/** "vor 5 Minuten" bzw. "5 minutes ago" */
function vorZeit(datum, locale) {
  if (!datum) return '';
  const sekunden = (new Date(datum) - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [einheit, groesse] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(sekunden) >= groesse) return format.format(Math.round(sekunden / groesse), einheit);
  }
  return format.format(Math.round(sekunden), 'second');
}

const kurzSha = (sha) => (sha ? sha.slice(0, 7) : '');

function Knoten({ bereich, symbol, name, rolle, status, details }) {
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
      <span className="knoten-status"><span className="punkt" aria-hidden="true" />{t(STATUS_TEXT[status])}</span>
      <ul className="knoten-details">
        {details.filter(Boolean).map((d) => <li key={d}>{d}</li>)}
      </ul>
    </div>
  );
}

/** Leitung zwischen zwei Knoten; "gabel" teilt sie in zwei (Vercel → Datenbank und Login) */
function Leitung({ bereich, status, text, gabel = null, rueckwaerts = false }) {
  const t = useT();
  return (
    <div className={`verbund-leitung status-${status}${gabel ? ' gabel' : ''}`} style={{ gridArea: bereich }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {gabel ? (
          <>
            <path className={`linie status-${gabel[0]}`} d="M0 50 C 40 50, 50 25, 100 25" />
            <path className={`linie status-${gabel[1]}`} d="M0 50 C 40 50, 50 75, 100 75" />
          </>
        ) : (
          <path className={`linie${rueckwaerts ? ' rueckwaerts' : ''}`} d="M0 50 L 100 50" />
        )}
      </svg>
      <span className="leitung-text">{t(text)}</span>
    </div>
  );
}

export default function Verbindungen() {
  const t = useT();
  const [daten, setDaten] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState(false);

  function pruefen() {
    setLaedt(true);
    setFehler(false);
    fetch('/api/verbindungen', { cache: 'no-store' })
      .then((antwort) => (antwort.ok ? antwort.json() : Promise.reject(new Error(String(antwort.status)))))
      .then(setDaten)
      .catch(() => setFehler(true))
      .finally(() => setLaedt(false));
  }
  useEffect(pruefen, []);

  const k = daten?.knoten;
  const status = (knoten) => (!daten ? (fehler ? 'fehler' : 'pruefe') : knoten?.status ?? 'unbekannt');
  const ms = (knoten) => (knoten?.ms !== undefined && knoten.status !== 'unbekannt' ? t('Antwort in {ms} ms', { ms: knoten.ms }) : null);
  const lokal = t('nur online prüfbar');

  /* ---------- Angaben je Knoten ---------- */
  const ki = k?.ki;
  const kiDetails = !ki ? [] : ki.anzahl !== undefined
    ? [t('{n} der letzten {m} Commits mit KI-Kennung', { n: ki.claude + ki.codex, m: ki.anzahl }),
      t('Claude: {a} · Codex: {b}', { a: ki.claude, b: ki.codex }),
      ki.zuletzt ? t('zuletzt {zeit}', { zeit: vorZeit(ki.zuletzt, t.locale) }) : null]
    : [ki.grund === 'lokal' ? lokal : ki.letzterVonKi ? t('Veröffentlichter Stand stammt von einem KI-Assistenten') : t('Arbeiten über GitHub (Commits)')];

  const gh = k?.github;
  const ghDetails = !gh ? [] : [
    gh.repo, gh.zweig && t('Zweig: {z}', { z: gh.zweig }),
    gh.neuester && `${kurzSha(gh.neuester.sha)} · ${gh.neuester.nachricht}`,
    gh.neuester && vorZeit(gh.neuester.datum, t.locale),
    gh.aktuell === false && t('Neuerer Stand als veröffentlicht – Vercel baut ihn vermutlich gerade'),
    gh.grund === 'privat' && t('Privates Repository – Stand wird über Vercel angezeigt'),
    gh.grund === 'limit' && t('GitHub-Abfragegrenze erreicht – später erneut prüfen'),
    gh.grund === 'lokal' && lokal,
    gh.meldung,
  ];

  const vc = k?.vercel;
  const vcDetails = !vc ? [] : vc.grund === 'lokal' ? [t('Lokaler Testbetrieb – nicht bei Vercel')] : [
    vc.umgebung && t('Umgebung: {u}', { u: vc.umgebung }), vc.region && t('Region: {r}', { r: vc.region }),
    vc.commit && t('Veröffentlicht: {sha}', { sha: kurzSha(vc.commit) }), vc.nachricht,
  ];

  const db = k?.datenbank;
  const art = { transaction: t('Transaction Pooler (Port 6543) – richtig'), session: t('Session Pooler (Port 5432) – bitte Port 6543 verwenden'), lokal: t('lokale Datenbank') }[db?.art];
  const dbDetails = !db ? [] : [ms(db), db.region && t('Region: {r}', { r: db.region }), art,
    db.version && `PostgreSQL ${db.version.split(' ')[0]}`, db.meldung];

  const au = k?.login;
  const auDetails = !au ? [] : au.grund === 'deaktiviert' ? [t('Login für lokale Tests abgeschaltet')]
    : [ms(au), au.version && t('Version {v}', { v: au.version }), au.meldung];

  const pb = k?.powerbi;
  const pbDetails = !pb ? [] : [pb.views && t('{n} Views bereit', { n: pb.views.length }), t('Verbindung über Session Pooler – nicht live prüfbar'), pb.meldung];

  return (
    <section className="karte verbund-karte" style={{ '--i': 4 }}>
      <div className="karte-kopf">
        <h2 className="abschnitt-titel">{t('Verbindungen')}</h2>
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
        <Knoten bereich="ki" symbol="bi-stars" name="Claude & Codex" rolle={t('KI-Assistenten im Team')} status={status(ki)} details={kiDetails} />
        <Leitung bereich="l1" status={status(ki)} text={T('Commits')} />
        <Knoten bereich="gh" symbol="bi-git" name="GitHub" rolle={t('Code und Versionen')} status={status(gh)} details={ghDetails} />
        <Leitung bereich="l2" status={vc?.grund === 'lokal' ? 'unbekannt' : status(gh)} text={T('veröffentlichen')} />
        <Knoten bereich="vc" symbol="bi-cloud-check" name="Vercel" rolle={t('Hosting dieser App')} status={status(vc)} details={vcDetails} />
        <Leitung bereich="l3" status={status(db)} gabel={[status(db), status(au)]} text={T('Abfragen & Login')} />
        <Knoten bereich="db" symbol="bi-database" name="Supabase" rolle={t('Datenbank (PostgreSQL)')} status={status(db)} details={dbDetails} />
        <Knoten bereich="au" symbol="bi-shield-lock" name="Supabase Auth" rolle={t('Anmeldung')} status={status(au)} details={auDetails} />
        <Leitung bereich="l4" status={pb?.status === 'ok' ? 'unbekannt' : status(pb)} text={T('liest Views')} rueckwaerts />
        <Knoten bereich="pb" symbol="bi-bar-chart-line" name="Power BI" rolle={t('Auswertung')} status={status(pb)} details={pbDetails} />
      </div>
    </section>
  );
}
