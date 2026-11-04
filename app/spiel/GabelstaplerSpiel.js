'use client';
/**
 * app/spiel/GabelstaplerSpiel.js – Ablauf des Gabelstapler-Spiels: Start, Runde, Punkte, Bestenliste
 *
 * Phasen: 'start' (Erklärung + Bestenliste) → 'laeuft' → 'pause' (Esc) → 'ende' (Ergebnis, Name eintragen).
 * Die 3D-Halle (components/karten/raum/StaplerHalle3D.js) fährt den Stapler und meldet Ereignisse:
 *   abholen (Teil auf die Gabel), abgeben (an einem Übergabeplatz), rempler (angestoßen).
 * Hier werden daraus Punkte: Lieferung 100 + Tempo-Bonus (60 − Sekunden), Rempler −10.
 * Steuerung: Pfeiltasten oder WASD; auf Touch-Geräten Knöpfe unten (pointer-Ereignisse, auch gedrückt halten).
 * Bestenliste je Browser in localStorage (lib/staplerSpiel.js) – dafür ist keine Datenbank nötig.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import { datum } from '@/lib/format';
import {
  MASCHINEN, TEILE, RUNDE_SEKUNDEN, PUNKTE_LIEFERUNG, PUNKTE_TEMPO_MAX, PUNKTE_REMPLER,
  neueAufgabe, bestenlisteLesen, bestenlisteEintragen, zielFuer,
} from '@/lib/staplerSpiel';

const Halle = dynamic(() => import('@/components/karten/raum/StaplerHalle3D'), {
  ssr: false, loading: () => <div className="spiel-laden"><span className="lade-kreis" /></div>,
});

// Tasten → Richtung
const TASTEN = {
  ArrowUp: 'vor', KeyW: 'vor', ArrowDown: 'zurueck', KeyS: 'zurueck',
  ArrowLeft: 'links', KeyA: 'links', ArrowRight: 'rechts', KeyD: 'rechts',
};

function webglVorhanden() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export default function GabelstaplerSpiel({ personName }) {
  const t = useT();
  const [webgl, setWebgl] = useState(null);
  const [phase, setPhase] = useState('start');
  const [neustart, setNeustart] = useState(0);
  const [aufgabe, setAufgabe] = useState(null);
  const [geladen, setGeladen] = useState(null);
  const [punkte, setPunkte] = useState(0);
  const [geliefert, setGeliefert] = useState(0);
  const [rempler, setRempler] = useState(0);
  const [rest, setRest] = useState(RUNDE_SEKUNDEN);
  const [weg, setWeg] = useState(0);
  const [meldung, setMeldung] = useState(null);   // { text, art, id }
  const [bestenliste, setBestenliste] = useState([]);
  const [name, setName] = useState(personName ?? '');
  const [gespeichert, setGespeichert] = useState(false);
  const eingabe = useRef({ vor: false, zurueck: false, links: false, rechts: false });
  const zeit = useRef(0);             // Spielzeit der Runde in Sekunden (aus der 3D-Halle)
  const aufgabeSeit = useRef(0);      // wann die aktuelle Aufgabe begann
  const stand = useRef({});           // aktuelle Werte für die Ereignis-Funktion
  stand.current = { aufgabe, geladen, phase };

  useEffect(() => { setWebgl(webglVorhanden()); setBestenliste(bestenlisteLesen()); }, []);

  const melden = useCallback((text, art = 'info') => setMeldung({ text, art, id: Date.now() }), []);
  useEffect(() => {
    if (!meldung) return undefined;
    const zu = setTimeout(() => setMeldung(null), 1800);
    return () => clearTimeout(zu);
  }, [meldung]);

  function starten() {
    setPunkte(0); setGeliefert(0); setRempler(0); setRest(RUNDE_SEKUNDEN); setWeg(0);
    setGeladen(null); setGespeichert(false); zeit.current = 0; aufgabeSeit.current = 0;
    setAufgabe(neueAufgabe());
    setNeustart((n) => n + 1);
    setPhase('laeuft');
  }

  // Ereignisse aus der Halle
  const onEreignis = useCallback((art, nummer) => {
    const { aufgabe: a, geladen: g, phase: p } = stand.current;
    if (p !== 'laeuft' || !a) return;
    if (art === 'abholen') {
      if (g === nummer) return;
      setGeladen(nummer);
      if (nummer === a.teil) melden(t('{teil} geladen – ab zur Maschine!', { teil: TEILE[nummer].name }), 'gut');
      else melden(t('{teil} geladen – die Maschine braucht aber {gesucht}', { teil: TEILE[nummer].name, gesucht: TEILE[a.teil].name }), 'warnung');
    } else if (art === 'abgeben') {
      if (nummer !== a.maschine) return;
      if (g === null) { melden(t('Erst das Ersatzteil im Lager holen'), 'warnung'); return; }
      if (g !== a.teil) { melden(t('Falsches Teil! Gesucht: {gesucht}', { gesucht: TEILE[a.teil].name }), 'schlecht'); return; }
      const sekunden = zeit.current - aufgabeSeit.current;
      const bonus = Math.max(0, Math.round(PUNKTE_TEMPO_MAX - sekunden));
      setPunkte((x) => x + PUNKTE_LIEFERUNG + bonus);
      setGeliefert((x) => x + 1);
      setGeladen(null);
      melden(t('Repariert! +{n} Punkte', { n: PUNKTE_LIEFERUNG + bonus }), 'gut');
      aufgabeSeit.current = zeit.current;
      setAufgabe(neueAufgabe(a));
    } else if (art === 'rempler') {
      setRempler((x) => x + 1);
      setPunkte((x) => Math.max(0, x + PUNKTE_REMPLER));
      melden(t('Rempler! {n} Punkte', { n: PUNKTE_REMPLER }), 'schlecht');
    }
  }, [melden, t]);

  const lage = useRef(null);          // Lage des Staplers (für Tests als data-Attribut)
  const onStand = useCallback(({ zeit: z, weg: w, x, z: tiefe, h }) => {
    zeit.current = z;
    lage.current = `${x.toFixed(2)},${tiefe.toFixed(2)},${h.toFixed(3)}`;
    const uebrig = Math.max(0, RUNDE_SEKUNDEN - z);
    setRest(uebrig);
    setWeg(w);
    if (uebrig <= 0 && stand.current.phase === 'laeuft') setPhase('ende');
  }, []);

  // Tastatur: nur während der Runde (Pfeiltasten scrollen sonst die Seite); Esc = Pause
  useEffect(() => {
    const runter = (e) => {
      if (e.code === 'Escape' && (phase === 'laeuft' || phase === 'pause')) { setPhase(phase === 'laeuft' ? 'pause' : 'laeuft'); return; }
      const richtung = TASTEN[e.code];
      if (!richtung || phase !== 'laeuft') return;
      if (e.target.closest?.('input, textarea')) return;
      e.preventDefault();
      eingabe.current[richtung] = true;
    };
    const hoch = (e) => { const richtung = TASTEN[e.code]; if (richtung) eingabe.current[richtung] = false; };
    const los = () => { Object.keys(eingabe.current).forEach((k) => { eingabe.current[k] = false; }); };
    window.addEventListener('keydown', runter);
    window.addEventListener('keyup', hoch);
    window.addEventListener('blur', los);
    return () => { window.removeEventListener('keydown', runter); window.removeEventListener('keyup', hoch); window.removeEventListener('blur', los); };
  }, [phase]);
  // Fenster wechseln → Pause, damit die Zeit nicht unbemerkt abläuft
  useEffect(() => {
    const sichtbar = () => { if (document.hidden && stand.current.phase === 'laeuft') setPhase('pause'); };
    document.addEventListener('visibilitychange', sichtbar);
    return () => document.removeEventListener('visibilitychange', sichtbar);
  }, []);

  function speichern(e) {
    e.preventDefault();
    setBestenliste(bestenlisteEintragen(name.trim() || t('Ohne Namen'), punkte, geliefert));
    setGespeichert(true);
  }

  /** Touch-Knopf: solange gedrückt, ist die Richtung aktiv */
  const knopf = (richtung, symbol, text) => (
    <button type="button" className="spiel-taste" aria-label={text}
            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); eingabe.current[richtung] = true; }}
            onPointerUp={() => { eingabe.current[richtung] = false; }}
            onPointerCancel={() => { eingabe.current[richtung] = false; }}
            onContextMenu={(e) => e.preventDefault()}>
      <i className={`bi ${symbol}`} aria-hidden="true" />
    </button>
  );

  const a = aufgabe ? { maschine: MASCHINEN[aufgabe.maschine], teil: TEILE[aufgabe.teil] } : null;
  const richtigGeladen = aufgabe && geladen === aufgabe.teil;
  const uhr = `${Math.floor(rest / 60)}:${String(Math.floor(rest % 60)).padStart(2, '0')}`;

  const liste = (
    <div className="spiel-bestenliste">
      <h3>{t('Bestenliste auf diesem Gerät')}</h3>
      {bestenliste.length === 0 ? <p className="klein mb-0">{t('Noch keine Einträge – sei die oder der Erste!')}</p> : (
        <ol>
          {bestenliste.map((e, i) => (
            <li key={`${e.datum}-${i}`}>
              <span>{e.name}</span>
              <span className="klein">{t('{n} geliefert', { n: e.geliefert ?? 0 })} · {datum(e.datum, t.sprache)}</span>
              <strong>{e.punkte}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  if (webgl === false) {
    return <section className="karte"><p className="leer mb-0">{t('Das Spiel braucht WebGL (3D im Browser). Dieser Browser kann das leider nicht.')}</p></section>;
  }

  return (
    <section className="karte spiel-karte" style={{ '--i': 1 }}>
      <div className={`spiel-buehne phase-${phase}`} data-phase={phase} data-weg={Math.round(weg)} data-geladen={geladen ?? ''}
           data-lage={lage.current ?? ''} data-ziel={(() => { const z = zielFuer(aufgabe, geladen); return z ? `${z.x},${z.z}` : ''; })()}>
        {webgl && (
          <Halle laeuft={phase === 'laeuft'} neustart={neustart} eingabe={eingabe} aufgabe={aufgabe} geladen={geladen}
                 onEreignis={onEreignis} onStand={onStand} />
        )}

        {/* Anzeige oben: Punkte, Zeit, Lieferungen */}
        {phase !== 'start' && (
          <div className="spiel-hud" aria-live="off">
            <div><span>{t('Punkte')}</span><strong className="spiel-punkte">{punkte}</strong></div>
            <div><span>{t('Zeit')}</span><strong className={rest < 15 ? 'knapp' : ''}>{uhr}</strong></div>
            <div><span>{t('Repariert')}</span><strong>{geliefert}</strong></div>
          </div>
        )}

        {/* Aktueller Auftrag mit zwei Schritten */}
        {a && (phase === 'laeuft' || phase === 'pause') && (
          <div className="spiel-auftrag">
            <div className="spiel-auftrag-kopf"><i className="bi bi-exclamation-octagon-fill" aria-hidden="true" /> {t('Stillstand')}: <strong>{a.maschine.bezeichnung}</strong></div>
            <ol>
              <li className={richtigGeladen ? 'erledigt' : 'aktiv'}>
                {richtigGeladen ? <i className="bi bi-check-circle-fill" aria-hidden="true" /> : <span>1</span>}
                {t('{teil} im Lager holen (Fach {fach})', { teil: a.teil.name, fach: a.teil.fach })}
              </li>
              <li className={richtigGeladen ? 'aktiv' : ''}>
                <span>2</span>{t('Zum gelben Platz vor der Maschine bringen')}
              </li>
            </ol>
          </div>
        )}

        {meldung && <div key={meldung.id} className={`spiel-meldung ${meldung.art}`} role="status">{meldung.text}</div>}

        {/* Knöpfe für Touch-Geräte */}
        {phase === 'laeuft' && (
          <div className="spiel-tasten" aria-hidden="false">
            <div>{knopf('links', 'bi-arrow-left', t('Links lenken'))}{knopf('rechts', 'bi-arrow-right', t('Rechts lenken'))}</div>
            <div>{knopf('zurueck', 'bi-arrow-down', t('Rückwärts'))}{knopf('vor', 'bi-arrow-up', t('Vorwärts'))}</div>
          </div>
        )}

        {/* Start */}
        {phase === 'start' && (
          <div className="spiel-fenster">
            <div className="spiel-fenster-inhalt">
              <h2>{t('Gabelstapler-Einsatz')}</h2>
              <p>{t('In der Halle fallen Maschinen aus. Hol das passende Ersatzteil aus dem Lager und bring es zur Maschine – so schnell wie möglich. Eine Runde dauert 2 Minuten.')}</p>
              <ul className="spiel-regeln">
                <li><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> {t('oder')} <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {t('fahren und lenken')}</li>
                <li><i className="bi bi-signpost-2" aria-hidden="true" /> {t('Der Pfeil über dem Stapler zeigt zum Ziel')}</li>
                <li><i className="bi bi-trophy" aria-hidden="true" /> {t('100 Punkte je Reparatur, bis zu 60 Bonus für Tempo, −10 je Rempler')}</li>
                <li><kbd>Esc</kbd> {t('Pause')}</li>
              </ul>
              <button type="button" className="btn btn-primary btn-gross spiel-start" onClick={starten} disabled={!webgl}>
                <i className="bi bi-play-fill" aria-hidden="true" /> {t('Spiel starten')}
              </button>
              {liste}
            </div>
          </div>
        )}

        {phase === 'pause' && (
          <div className="spiel-fenster">
            <div className="spiel-fenster-inhalt klein-fenster">
              <h2>{t('Pause')}</h2>
              <button type="button" className="btn btn-primary" onClick={() => setPhase('laeuft')}><i className="bi bi-play-fill" aria-hidden="true" /> {t('Weiter')}</button>
              <button type="button" className="btn btn-sekundaer" onClick={() => setPhase('start')}>{t('Abbrechen')}</button>
            </div>
          </div>
        )}

        {phase === 'ende' && (
          <div className="spiel-fenster">
            <div className="spiel-fenster-inhalt">
              <h2>{t('Schicht vorbei!')}</h2>
              <div className="spiel-ergebnis">
                <div><strong>{punkte}</strong><span>{t('Punkte')}</span></div>
                <div><strong>{geliefert}</strong><span>{t('Maschinen repariert')}</span></div>
                <div><strong>{rempler}</strong><span>{t('Rempler')}</span></div>
                <div><strong>{Math.round(weg)} m</strong><span>{t('gefahren')}</span></div>
              </div>
              {!gespeichert ? (
                <form className="spiel-name" onSubmit={speichern}>
                  <label className="form-label" htmlFor="spiel-name">{t('Name für die Bestenliste')}</label>
                  <div className="d-flex gap-2">
                    <input id="spiel-name" className="form-control" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
                    <button type="submit" className="btn btn-sekundaer text-nowrap">{t('Eintragen')}</button>
                  </div>
                </form>
              ) : liste}
              <button type="button" className="btn btn-primary spiel-start" onClick={starten}><i className="bi bi-arrow-repeat" aria-hidden="true" /> {t('Nochmal spielen')}</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
