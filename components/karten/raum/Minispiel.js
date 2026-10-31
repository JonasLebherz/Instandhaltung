'use client';
/**
 * components/karten/raum/Minispiel.js – Easter Egg „Störungsjagd“
 *
 * Wer in der 3D-Werksansicht auf das Verwaltungsgebäude klickt (Fachwerkhaus, Glasturm, Pagode …),
 * fliegt mit der Kamera heran und bekommt eine kleine Kaffeepause angeboten – mit Haken:
 * 30 Sekunden Schicht, die Maschinen des Werks fallen nacheinander aus.
 *  - Ampel orange = Störung → schnell anklicken (je schneller, desto mehr Punkte)
 *  - nach 2,6 s ohne Reparatur wird sie rot = Stillstand (kostet Verfügbarkeit, weniger Punkte)
 *  - Klick auf eine laufende Maschine = unnötiger Einsatz (−3 Punkte)
 * Am Ende stehen die echten Kennzahlen der Instandhaltung: MTTR (Ø Zeit bis zur Reparatur)
 * und Verfügbarkeit (Anteil der Zeit ohne Stillstand). Der Rekord bleibt im Browser (localStorage).
 * Rein zum Spaß – nichts davon wird in der Datenbank gespeichert.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import { zahl } from '@/lib/format';

const DAUER = 30000;          // Schichtlänge in ms
const BIS_STILLSTAND = 2600;  // so lange bleibt eine Störung orange
const KACHELN = 12;
const REKORD = 'minispiel-rekord';

const RAENGE = [[0, 'Azubi'], [120, 'Profi'], [220, 'Meisterklasse'], [320, 'Legende der Instandhaltung']];

function rekordLesen() {
  try { return Number(localStorage.getItem(REKORD)) || 0; } catch { return 0; }
}

/** Kacheln aus den Maschinen des Werks (bei weniger als 12 Maschinen wiederholt) */
function kachelnAus(maschinen) {
  const liste = maschinen.length ? maschinen : [{ id: 0, typ: 'Montage', bezeichnung: 'Montage' }];
  return Array.from({ length: KACHELN }, (_, i) => {
    const m = liste[i % liste.length];
    return { nr: i, typ: m.typ, name: m.bezeichnung, zustand: 'gruen', seit: 0, stoerungSeit: 0, wackeln: 0 };
  });
}

export default function Minispiel({ maschinen, ort, onSchliessen }) {
  const t = useT();
  const [phase, setPhase] = useState('start');
  const [kacheln, setKacheln] = useState(() => kachelnAus(maschinen));
  const [stand, setStand] = useState({ punkte: 0, behoben: 0, rest: DAUER });
  const [ergebnis, setErgebnis] = useState(null);
  const [rekord, setRekord] = useState(0);
  const spiel = useRef(null);          // laufende Werte ohne Neuzeichnen: Start, nächste Störung, Rot-Zeit, Reparaturzeiten
  const startKnopf = useRef(null);

  useEffect(() => { setRekord(rekordLesen()); startKnopf.current?.focus(); }, []);
  // Esc schließt das Spiel
  useEffect(() => {
    const taste = (e) => { if (e.key === 'Escape') onSchliessen(); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [onSchliessen]);

  const starten = useCallback(() => {
    const jetzt = performance.now();
    spiel.current = { start: jetzt, naechste: jetzt + 600, rotZeit: 0, zuletzt: jetzt, reparaturen: [], punkte: 0, behoben: 0 };
    setKacheln(kachelnAus(maschinen));
    setStand({ punkte: 0, behoben: 0, rest: DAUER });
    setErgebnis(null);
    setPhase('laeuft');
  }, [maschinen]);

  // Spielschleife: alle 100 ms Störungen auslösen, orange → rot, Zeit zählen
  useEffect(() => {
    if (phase !== 'laeuft') return undefined;
    const takt = setInterval(() => {
      const s = spiel.current;
      const jetzt = performance.now();
      const vergangen = jetzt - s.start;
      setKacheln((alt) => {
        let neu = alt.map((k) => (k.zustand === 'orange' && jetzt - k.seit > BIS_STILLSTAND ? { ...k, zustand: 'rot', seit: jetzt } : k));
        const rote = neu.filter((k) => k.zustand === 'rot').length;
        s.rotZeit += rote * (jetzt - s.zuletzt);
        s.zuletzt = jetzt;
        if (jetzt >= s.naechste) {
          const laufende = neu.filter((k) => k.zustand === 'gruen');
          if (laufende.length) {
            const opfer = laufende[Math.floor(Math.random() * laufende.length)];
            neu = neu.map((k) => (k.nr === opfer.nr ? { ...k, zustand: 'orange', seit: jetzt, stoerungSeit: jetzt } : k));
          }
          // je länger die Schicht, desto öfter fällt etwas aus (1,1 s → 0,45 s)
          s.naechste = jetzt + 1100 - (650 * Math.min(1, vergangen / DAUER)) + Math.random() * 250;
        }
        return neu;
      });
      setStand({ punkte: s.punkte, behoben: s.behoben, rest: Math.max(0, DAUER - vergangen) });
      if (vergangen >= DAUER) {
        const mttr = s.reparaturen.length ? s.reparaturen.reduce((a, b) => a + b, 0) / s.reparaturen.length / 1000 : null;
        const verfuegbarkeit = 100 * (1 - s.rotZeit / (KACHELN * DAUER));
        const bisher = rekordLesen();
        const neuerRekord = s.punkte > bisher;
        if (neuerRekord) { try { localStorage.setItem(REKORD, String(s.punkte)); } catch { /* privat: kein Speicher */ } }
        setRekord(Math.max(bisher, s.punkte));
        setErgebnis({ punkte: s.punkte, behoben: s.behoben, mttr, verfuegbarkeit, neuerRekord });
        setPhase('ende');
      }
    }, 100);
    return () => clearInterval(takt);
  }, [phase]);

  const klick = (nr) => {
    const s = spiel.current;
    if (phase !== 'laeuft' || !s) return;
    const jetzt = performance.now();
    setKacheln((alt) => alt.map((k) => {
      if (k.nr !== nr) return k;
      if (k.zustand === 'gruen') { s.punkte -= 3; return { ...k, wackeln: jetzt }; }
      const dauer = jetzt - k.stoerungSeit;
      s.reparaturen.push(dauer);
      s.behoben += 1;
      s.punkte += k.zustand === 'orange' ? 10 + Math.max(0, 5 - Math.floor(dauer / 500)) : 4;
      return { ...k, zustand: 'gruen', seit: jetzt };
    }));
    setStand((st) => ({ ...st, punkte: s.punkte, behoben: s.behoben }));
  };

  const rang = (punkte) => RAENGE.filter(([ab]) => punkte >= ab).pop()[1];
  const titel = { gruen: t('Läuft'), orange: t('Störung'), rot: t('Stillstand') };

  return (
    <div className="minispiel" role="dialog" aria-modal="true" aria-labelledby="minispiel-titel">
      <div className="minispiel-karte">
        <button type="button" className="minispiel-zu" onClick={onSchliessen} aria-label={t('Zurück zum Werk')}>
          <i className="bi bi-x-lg" aria-hidden="true" />
        </button>
        <div className="minispiel-kopf">
          <span className="minispiel-symbol"><i className="bi bi-cup-hot-fill" aria-hidden="true" /></span>
          <div>
            <h2 id="minispiel-titel">{t('Störungsjagd')}</h2>
            <p>{t('Kaffeepause in der Verwaltung {ort}? Erst noch schnell die Störungen beheben!', { ort })}</p>
          </div>
        </div>

        {phase === 'start' && (
          <div className="minispiel-start">
            <ul>
              <li><span className="minispiel-punkt orange" /> {t('Orange = Störung: Maschine schnell anklicken. Je schneller, desto mehr Punkte.')}</li>
              <li><span className="minispiel-punkt rot" /> {t('Rot = Stillstand: Das kostet Verfügbarkeit und bringt weniger Punkte.')}</li>
              <li><span className="minispiel-punkt gruen" /> {t('Klicks auf laufende Maschinen sind unnötige Einsätze (−3 Punkte).')}</li>
            </ul>
            <p className="text-leise">{t('Eine Schicht dauert 30 Sekunden.')} {rekord > 0 && t('Dein Rekord: {n} Punkte', { n: rekord })}</p>
            <button ref={startKnopf} type="button" className="btn btn-primary" onClick={starten}>
              <i className="bi bi-play-fill" aria-hidden="true" /> {t('Schicht starten')}
            </button>
          </div>
        )}

        {phase === 'laeuft' && (
          <>
            <div className="minispiel-leiste" aria-live="polite">
              <span><i className="bi bi-stopwatch" aria-hidden="true" /> {Math.ceil(stand.rest / 1000)} s</span>
              <span><i className="bi bi-star-fill" aria-hidden="true" /> {t('{n} Punkte', { n: stand.punkte })}</span>
              <span><i className="bi bi-wrench-adjustable" aria-hidden="true" /> {t('{n} behoben', { n: stand.behoben })}</span>
            </div>
            <div className="minispiel-zeit"><span style={{ width: `${(stand.rest / DAUER) * 100}%` }} /></div>
            <div className="minispiel-feld">
              {kacheln.map((k) => (
                <button key={k.nr} type="button" onClick={() => klick(k.nr)}
                        className={`minispiel-maschine ist-${k.zustand}${k.wackeln && performance.now() - k.wackeln < 400 ? ' wackelt' : ''}`}
                        aria-label={`${k.name}: ${titel[k.zustand]}`}>
                  <span className="minispiel-ampel" aria-hidden="true"><i /><i /><i /></span>
                  <i className={`bi ${MASCHINEN_SYMBOLE[k.typ] ?? 'bi-gear'} minispiel-icon`} aria-hidden="true" />
                  <span className="minispiel-name">{k.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {phase === 'ende' && ergebnis && (
          <div className="minispiel-ende">
            <p className="minispiel-rang">{ergebnis.neuerRekord ? t('Neuer Rekord!') : t('Schicht vorbei!')} <span>{t(rang(ergebnis.punkte))}</span></p>
            <div className="minispiel-werte">
              <div><strong>{ergebnis.punkte}</strong><span>{t('Punkte')}</span></div>
              <div><strong>{ergebnis.behoben}</strong><span>{t('Störungen behoben')}</span></div>
              <div><strong>{ergebnis.mttr === null ? '–' : `${zahl(ergebnis.mttr, 1, t.sprache)} s`}</strong><span>{t('deine MTTR')}</span></div>
              <div><strong>{zahl(ergebnis.verfuegbarkeit, 1, t.sprache)} %</strong><span>{t('Verfügbarkeit')}</span></div>
            </div>
            <p className="text-leise">{t('Dein Rekord: {n} Punkte', { n: rekord })}</p>
            <div className="minispiel-knoepfe">
              <button type="button" className="btn btn-primary" onClick={starten}>
                <i className="bi bi-arrow-repeat" aria-hidden="true" /> {t('Noch eine Schicht')}
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={onSchliessen}>{t('Zurück zum Werk')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
