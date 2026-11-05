'use client';
/**
 * components/Favoriten.js – angepinnte Kartenansichten in der Seitenleiste (unter „Störungskarte“)
 *
 *  - Eigener, leicht abgesetzter Bereich mit Stern in der Überschrift.
 *  - Ganz oben (falls eine Person gewählt ist) „Mein Werk“: das Werk der Person, standardmäßig in 3D.
 *    Wird aus der Person berechnet (lib/favoriten.js → personFavorit), zählt nicht zu den 10 und ist nicht löschbar.
 *  - Angelegt werden die übrigen nur über den Pin-Knopf in der Karte.
 *  - Je Eintrag ein „…“-Knopf mit Menü: Umbenennen (direkt in der Zeile), In 2D/3D öffnen, Entfernen.
 *  - Der Favorit, dessen Ansicht die Karte gerade zeigt, ist markiert (Ereignis "kartenadresse").
 *  - Eingeklappte Leiste: nur das Symbol, der Name als Sprechblase; das Menü öffnet sich daneben.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useT } from './SpracheKontext';
import { personSpeichern } from './PersonWahl';
import {
  favoritenLesen, favoritEntfernen, favoritUmbenennen, favoritAnsichtSetzen, personFavorit, personAnsichtSetzen,
  FAVORITEN_WECHSEL, FAVORIT_OEFFNEN, FAVORIT_SYMBOLE, MAX_FAVORITEN, KARTEN_ADRESSE,
} from '@/lib/favoriten';

/** 3D-Teil der Karte im Voraus laden (der Browser merkt sich das Modul – mehrfacher Aufruf kostet nichts) */
function vorladen3D() { import('./karten/raum/Werk3D'); }

export default function Favoriten({ onOeffnen, person }) {
  const t = useT();
  const pfad = usePathname();
  const [liste, setListe] = useState([]);
  const [eigenes, setEigenes] = useState(null);           // „Mein Werk“ der gewählten Person
  const [bearbeiten, setBearbeiten] = useState(null);     // ID des Favoriten, der gerade umbenannt wird
  const [bearbeitenOben, setBearbeitenOben] = useState(0); // Höhe im Fenster (eingeklappte Leiste: Feld liegt fest daneben)
  const [menue, setMenue] = useState(null);               // { id, links, oben } des offenen Menüs
  const [neu, setNeu] = useState(null);                   // ID des zuletzt angepinnten Favoriten
  const [kartenAdresse, setKartenAdresse] = useState(null);
  const bekannt = useRef(null);
  const bereichRef = useRef(null);

  // Ältere Personen-Cookies ohne Werk einmal ergänzen (das Werk kommt aus /api/personen)
  const [personDaten, setPersonDaten] = useState(person);
  useEffect(() => {
    setPersonDaten(person);
    if (!person || person.werk) return undefined;
    let aktuell = true;
    fetch('/api/personen').then((a) => (a.ok ? a.json() : null)).then((d) => {
      const p = d?.personen?.find((x) => x.id === person.id);
      if (!aktuell || !p?.werk) return;
      personSpeichern(p);
      setPersonDaten({ ...person, werk: p.werk, werkname: p.standort });
    }).catch(() => {});
    return () => { aktuell = false; };
  }, [person]);

  useEffect(() => {
    const lesen = () => {
      const l = favoritenLesen();
      // Neuer Eintrag (nicht beim ersten Lesen): kurz hervorheben
      if (bekannt.current) {
        const hinzu = l.find((f) => !bekannt.current.has(f.id));
        if (hinzu) setNeu(hinzu.id);
      }
      bekannt.current = new Set(l.map((f) => f.id));
      setListe(l);
      setEigenes(personFavorit(personDaten));
    };
    lesen();
    window.addEventListener(FAVORITEN_WECHSEL, lesen);
    window.addEventListener('storage', lesen);   // Änderungen in einem anderen Tab
    return () => { window.removeEventListener(FAVORITEN_WECHSEL, lesen); window.removeEventListener('storage', lesen); };
  }, [personDaten]);

  // Aktuelle Ansicht der Karte – der passende Favorit wird markiert
  useEffect(() => {
    const merken = (e) => setKartenAdresse(e.detail);
    setKartenAdresse(window.kartenAdresse ?? null);
    window.addEventListener(KARTEN_ADRESSE, merken);
    return () => window.removeEventListener(KARTEN_ADRESSE, merken);
  }, []);

  // Menü schließen: Klick daneben oder Escape
  useEffect(() => {
    if (!menue) return undefined;
    const zu = () => setMenue(null);
    window.addEventListener('resize', zu);
    const klick = (e) => { if (!e.target.closest?.('.favorit-menue, .favorit-mehr')) setMenue(null); };
    const taste = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenue(null); } };
    document.addEventListener('mousedown', klick);
    document.addEventListener('keydown', taste);
    return () => { document.removeEventListener('mousedown', klick); document.removeEventListener('keydown', taste); window.removeEventListener('resize', zu); };
  }, [menue]);

  // Menü rechts neben dem Eintrag öffnen (feste Lage im Fenster, damit die Leiste nichts abschneidet)
  function menueUmschalten(e, f) {
    if (menue?.id === f.id) { setMenue(null); return; }
    const eintrag = e.currentTarget.closest('.favorit').getBoundingClientRect();
    const leiste = e.currentTarget.closest('.seitenleiste')?.getBoundingClientRect();
    setMenue({ id: f.id, links: Math.round((leiste?.right ?? eintrag.right) + 10), oben: Math.round(Math.min(eintrag.top - 6, window.innerHeight - 230)) });
  }

  // Ist die Karte schon offen, springt sie selbst (mit kurzer Überblendung) in die Ansicht des Favoriten –
  // ohne Neuladen. Sonst normaler Seitenwechsel auf die Adresse.
  function oeffnen(e, f) {
    onOeffnen?.();
    if (pfad === '/karte') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(FAVORIT_OEFFNEN, { detail: f.adresse }));
    }
  }

  function ansichtWechseln(f) {
    const andere = f.ansicht === '3d' ? '2d' : '3d';
    if (f.person) personAnsichtSetzen(andere); else favoritAnsichtSetzen(f.id, andere);
    setMenue(null);
  }

  const alle = [...(eigenes ? [eigenes] : []), ...liste];
  const aktivId = pfad === '/karte' ? alle.find((f) => f.adresse === kartenAdresse)?.id : null;

  return (
    <li className="favoriten" data-favoriten-ziel="" ref={bereichRef}>
      <div className="favoriten-titel">
        <span><i className="bi bi-star-fill" aria-hidden="true" /> {t('Favoriten')}</span>
        {liste.length > 0 && <span className="favoriten-anzahl">{liste.length}/{MAX_FAVORITEN}</span>}
      </div>
      {alle.length === 0 ? (
        <p className="favoriten-leer">
          <i className="bi bi-pin-angle" aria-hidden="true" /> {t('Ansicht in der Karte mit dem Pin anheften')}
        </p>
      ) : (
        <ul>
          {alle.map((f) => {
            const aktiv = f.id === aktivId;
            const titel = f.person ? t('Mein Werk: {name}', { name: f.name }) : f.name;
            return (
              <li key={f.id} data-favorit-id={f.id}
                  className={`favorit${f.id === neu ? ' favorit-neu' : ''}${f.person ? ' favorit-eigenes' : ''}${menue?.id === f.id ? ' menue-offen' : ''}`}>
                {bearbeiten === f.id ? (
                  <form className="favorit-bearbeiten" style={{ '--oben': `${bearbeitenOben}px` }} onSubmit={(e) => { e.preventDefault(); favoritUmbenennen(f.id, e.currentTarget.elements.name.value); setBearbeiten(null); }}>
                    <span className="leiste-symbol">
                      <span className="favorit-symbol"><i className={`bi ${FAVORIT_SYMBOLE[f.art] ?? 'bi-pin-angle'}`} aria-hidden="true" /></span>
                    </span>
                    <input name="name" defaultValue={f.name} maxLength={60} autoFocus aria-label={t('Neuer Name')}
                           onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setBearbeiten(null); } }}
                           onBlur={(e) => { favoritUmbenennen(f.id, e.target.value); setBearbeiten(null); }} />
                  </form>
                ) : (
                  <>
                    <Link href={f.adresse} className={`leiste-link favorit-link${aktiv ? ' aktiv' : ''}`} onClick={(e) => oeffnen(e, f)}
                          // 3D-Favorit: three.js schon beim Darüberfahren laden (die Szene steht dann schneller)
                          onPointerEnter={f.ansicht === '3d' ? vorladen3D : undefined}
                          aria-current={aktiv ? 'page' : undefined}
                          aria-label={`${titel} (${f.ansicht === '3d' ? '3D' : '2D'})`}>
                      <span className="leiste-symbol">
                        <span className="favorit-symbol">
                          <i className={`bi ${f.person ? 'bi-house-door-fill' : FAVORIT_SYMBOLE[f.art] ?? 'bi-pin-angle'}`} aria-hidden="true" />
                        </span>
                      </span>
                      <span className="leiste-text">
                        {/* „Werk · Halle“ zweizeilig: Werk klein oben, Halle darunter – sonst wäre nur „Stammwerk …“ zu lesen */}
                        <span className="favorit-name">
                          {f.person ? <small>{t('Mein Werk')}</small> : f.name.includes(' · ') && <small>{f.name.split(' · ')[0]}</small>}
                          {f.person ? f.name : f.name.split(' · ').slice(-1)[0]}
                        </span>
                        <span className="favorit-ansicht">{f.ansicht === '3d' ? '3D' : '2D'}</span>
                      </span>
                    </Link>
                    <button type="button" className="favorit-mehr" aria-haspopup="menu" aria-expanded={menue?.id === f.id}
                            aria-label={t('Optionen für „{name}“', { name: f.name })} title={t('Optionen')}
                            onClick={(e) => menueUmschalten(e, f)}>
                      <i className="bi bi-three-dots" aria-hidden="true" />
                    </button>
                    {menue?.id === f.id && (
                      <div className="aufklapp-menue favorit-menue" role="menu" style={{ left: menue.links, top: Math.max(8, menue.oben) }}>
                        <div className="menue-titel">{titel}</div>
                        {!f.person && (
                          <button type="button" role="menuitem" onClick={() => { setBearbeitenOben(menue.oben + 25); setMenue(null); setBearbeiten(f.id); }}>
                            <i className="bi bi-pencil" /> {t('Umbenennen')}
                          </button>
                        )}
                        <button type="button" role="menuitem" onClick={() => ansichtWechseln(f)}>
                          <i className={`bi ${f.ansicht === '3d' ? 'bi-map' : 'bi-box'}`} /> {f.ansicht === '3d' ? t('In 2D öffnen') : t('In 3D öffnen')}
                        </button>
                        {f.person ? (
                          <div className="menue-info"><small>{t('Werk der gewählten Person – wechselt mit der Person.')}</small></div>
                        ) : (
                          <>
                            <div className="menue-trenner" />
                            <button type="button" role="menuitem" className="text-gefahr" onClick={() => { setMenue(null); favoritEntfernen(f.id); }}>
                              <i className="bi bi-trash3" /> {t('Entfernen')}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
