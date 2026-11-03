'use client';
/**
 * app/mitarbeiter/Chat.js – Nachrichten zwischen Personen
 *
 * Absender ist die gewählte Person (Konto → Person). Ohne Person: Hinweis mit Knopf zur Wahl.
 *  - Ohne Partner: Liste der Gespräche (letzte Nachricht, Zahl ungelesener) und Suche nach einer Person.
 *  - Mit Partner: Verlauf als Sprechblasen (eigene rechts in der Akzentfarbe), unten das Eingabefeld.
 *    Enter sendet, Umschalt+Enter macht eine neue Zeile.
 * Neue Nachrichten holt der Chat alle 5 Sekunden (nur solange die Seite sichtbar ist) aus /api/nachrichten.
 * Geöffnete Nachrichten werden als gelesen markiert (Server-Aktion nachrichtenGelesen); danach meldet
 * das Ereignis "nachrichtenwechsel" der Seitenleiste, die rote Zahl neu zu holen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import { RollenAbzeichen, PersonWaehlenKnopf } from '@/components/PersonWahl';
import { datum, datumZeit, uhrzeit } from '@/lib/format';
import { nachrichtSenden, nachrichtenGelesen } from '@/app/aktionen';

export const NACHRICHTEN_WECHSEL = 'nachrichtenwechsel';
const TAKT = 5000;

/** Wiederholt "aufgabe" alle TAKT ms, solange die Seite sichtbar ist */
function useAbfrage(aufgabe, aktiv) {
  useEffect(() => {
    if (!aktiv) return undefined;
    aufgabe();
    const zeitgeber = setInterval(() => { if (document.visibilityState === 'visible') aufgabe(); }, TAKT);
    const sichtbar = () => { if (document.visibilityState === 'visible') aufgabe(); };
    document.addEventListener('visibilitychange', sichtbar);
    return () => { clearInterval(zeitgeber); document.removeEventListener('visibilitychange', sichtbar); };
  }, [aufgabe, aktiv]);
}

export default function Chat({ ich, personen, mit, onMit }) {
  const t = useT();
  const [gespraeche, setGespraeche] = useState(null);
  const [nachrichten, setNachrichten] = useState(null);
  const [suche, setSuche] = useState('');
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState(null);
  const [sendet, setSendet] = useState(false);
  const verlaufRef = useRef(null);
  const eingabeRef = useRef(null);

  const partner = personen.find((p) => p.id === mit) ?? gespraeche?.find((g) => g.id === mit) ?? null;

  /* ---------- Laden ---------- */
  const listeLaden = useCallback(() => {
    fetch('/api/nachrichten?liste=1', { cache: 'no-store' }).then((a) => (a.ok ? a.json() : null))
      .then((d) => { if (d?.gespraeche) setGespraeche(d.gespraeche); }).catch(() => {});
  }, []);
  const verlaufLaden = useCallback(() => {
    if (!mit) return;
    fetch(`/api/nachrichten?mit=${mit}`, { cache: 'no-store' }).then((a) => (a.ok ? a.json() : null))
      .then((d) => {
        if (!d?.nachrichten) return;
        setNachrichten((alt) => (alt && alt.length === d.nachrichten.length && alt.at(-1)?.id === d.nachrichten.at(-1)?.id ? alt : d.nachrichten));
        // Ungelesene vom Partner → gelesen markieren, Seitenleiste neu zählen lassen
        if (d.nachrichten.some((n) => n.von_id === mit && !n.gelesen_am)) {
          nachrichtenGelesen(mit).then(() => window.dispatchEvent(new Event(NACHRICHTEN_WECHSEL))).catch(() => {});
        }
      }).catch(() => {});
  }, [mit]);

  useAbfrage(listeLaden, Boolean(ich) && !mit);
  useAbfrage(verlaufLaden, Boolean(ich) && Boolean(mit));
  useEffect(() => { setNachrichten(null); setFehler(null); if (mit) setTimeout(() => eingabeRef.current?.focus(), 50); }, [mit]);

  // Neue Nachricht → nach unten scrollen
  useEffect(() => {
    const v = verlaufRef.current;
    if (v) v.scrollTop = v.scrollHeight;
  }, [nachrichten]);

  /* ---------- Senden ---------- */
  async function senden(e) {
    e?.preventDefault();
    if (!text.trim() || sendet) return;
    setSendet(true);
    setFehler(null);
    try {
      const antwort = await nachrichtSenden(mit, text);
      if (antwort?.fehler) setFehler(antwort.fehler);
      else { setText(''); verlaufLaden(); }
    } catch {
      setFehler(t('Die Nachricht konnte nicht gesendet werden.'));
    } finally {
      setSendet(false);
      eingabeRef.current?.focus();
    }
  }

  /* ---------- Ohne gewählte Person ---------- */
  if (!ich) {
    return (
      <section className="karte chat" style={{ '--i': 5 }}>
        <h2 className="abschnitt-titel">{t('Nachrichten')}</h2>
        <div className="chat-leer">
          <i className="bi bi-chat-square-text" aria-hidden="true" />
          <p>{t('Wähle zuerst, als welche Person du arbeitest – dann kannst du dem Team schreiben.')}</p>
          <PersonWaehlenKnopf>{t('Person wählen')}</PersonWaehlenKnopf>
        </div>
      </section>
    );
  }

  /* ---------- Gespräch mit einer Person ---------- */
  if (mit) {
    let letzterTag = null;
    return (
      <section className="karte chat chat-offen" style={{ '--i': 5 }} aria-label={t('Gespräch mit {name}', { name: partner?.name ?? '' })}>
        <div className="chat-kopf">
          <button type="button" className="rund-knopf" onClick={() => onMit(null)} aria-label={t('Zurück zu den Gesprächen')}>
            <i className="bi bi-chevron-left" aria-hidden="true" />
          </button>
          <span className="avatar" aria-hidden="true">{partner?.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
          <span className="chat-partner">
            <strong>{partner?.name}</strong>
            <span className="d-flex gap-2 align-items-center">
              {partner && <RollenAbzeichen rolle={partner.rolle} />}<span className="klein">{partner?.standort}</span>
            </span>
          </span>
        </div>

        <div className="chat-verlauf" ref={verlaufRef} aria-live="polite">
          {nachrichten === null && <p className="text-leise text-center my-4"><span className="lade-kreis d-inline-block" aria-hidden="true" /></p>}
          {nachrichten?.length === 0 && <p className="chat-hinweis">{t('Noch keine Nachrichten. Schreib die erste!')}</p>}
          {nachrichten?.map((n) => {
            const tag = datum(n.zeitpunkt, t.sprache);
            const neuerTag = tag !== letzterTag;
            letzterTag = tag;
            const meine = n.von_id === ich.id;
            return [
              neuerTag && <div key={`tag-${n.id}`} className="chat-tag">{tag}</div>,
              <div key={n.id} className={`chat-blase${meine ? ' meine' : ''}`}>
                <span className="chat-text">{n.text}</span>
                <span className="chat-zeit">
                  {uhrzeit(n.zeitpunkt, t.sprache)}
                  {meine && <i className={`bi ${n.gelesen_am ? 'bi-check2-all' : 'bi-check2'}`} title={n.gelesen_am ? t('gelesen') : t('gesendet')} aria-label={n.gelesen_am ? t('gelesen') : t('gesendet')} />}
                </span>
              </div>,
            ];
          })}
        </div>

        <form className="chat-eingabe" onSubmit={senden} noValidate>
          <textarea ref={eingabeRef} className="form-control" rows={1} value={text} maxLength={1000}
                    onChange={(e) => setText(e.target.value)} placeholder={t('Nachricht schreiben …')} aria-label={t('Nachricht')}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) senden(e); }} />
          <button type="submit" className="btn btn-primary chat-senden" disabled={sendet || !text.trim()} aria-label={t('Senden')}>
            <i className="bi bi-send-fill" aria-hidden="true" />
          </button>
        </form>
        {fehler && <p className="invalid-feedback d-block mt-2 mb-0" role="alert">{fehler}</p>}
      </section>
    );
  }

  /* ---------- Liste der Gespräche ---------- */
  const treffer = suche.trim()
    ? personen.filter((p) => p.id !== ich.id && p.name.toLowerCase().includes(suche.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <section className="karte chat" style={{ '--i': 5 }}>
      <h2 className="abschnitt-titel">{t('Nachrichten')}</h2>
      <p className="klein">{t('Du schreibst als {name}.', { name: ich.name })}</p>
      <input type="search" className="form-control mb-2" value={suche} onChange={(e) => setSuche(e.target.value)}
             placeholder={t('Neue Nachricht an … (Name suchen)')} aria-label={t('Person suchen')} />
      {treffer.length > 0 && (
        <ul className="chat-liste chat-treffer">
          {treffer.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { setSuche(''); onMit(p.id); }}>
                <span className="avatar" aria-hidden="true">{p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                <span className="chat-zeile"><strong>{p.name}</strong><span className="klein">{p.standort}</span></span>
                <RollenAbzeichen rolle={p.rolle} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {gespraeche === null ? (
        <p className="text-leise text-center my-4"><span className="lade-kreis d-inline-block" aria-hidden="true" /></p>
      ) : gespraeche.length === 0 ? (
        <p className="chat-hinweis">{t('Noch keine Gespräche. Such oben eine Person oder klick in der Teamliste auf das Sprechblasen-Symbol.')}</p>
      ) : (
        <ul className="chat-liste">
          {gespraeche.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => onMit(g.id)} className={g.ungelesen > 0 ? 'ungelesen' : ''}>
                <span className="avatar" aria-hidden="true">{g.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                <span className="chat-zeile">
                  <span className="d-flex justify-content-between gap-2">
                    <strong>{g.name}</strong>
                    <span className="klein">{datumZeit(g.zeitpunkt, t.sprache)}</span>
                  </span>
                  <span className="chat-vorschau">{g.von_mir && `${t('Du')}: `}{g.text}</span>
                </span>
                {g.ungelesen > 0 && <span className="chat-zahl" aria-label={t('{n} ungelesen', { n: g.ungelesen })}>{g.ungelesen}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
