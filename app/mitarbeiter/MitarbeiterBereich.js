'use client';
/**
 * app/mitarbeiter/MitarbeiterBereich.js – Teamliste (Suche, Filter, Sortierung im Browser) und Chat daneben
 *
 * „Nachricht“ in einer Zeile öffnet rechts den Chat mit dieser Person (auf schmalen Bildschirmen
 * wird dorthin gescrollt). Die eigene Person ist markiert und hat keinen Nachricht-Knopf.
 */
import { useMemo, useRef, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import Auswahl from '@/components/Auswahl';
import { RollenAbzeichen, ROLLEN } from '@/components/PersonWahl';
import { zahl } from '@/lib/format';
import { T } from '@/lib/sprache';
import Chat from './Chat';

const SORTIERUNGEN = [
  { wert: 'werk', text: T('Werk') },
  { wert: 'offen', text: T('Meiste offene Aufträge') },
  { wert: 'erledigt', text: T('Meiste erledigte Aufträge') },
  { wert: 'name', text: T('Name') },
];

export default function MitarbeiterBereich({ personen, ich }) {
  const t = useT();
  const [suche, setSuche] = useState('');
  const [ort, setOrt] = useState('');
  const [rolle, setRolle] = useState('');
  const [sortierung, setSortierung] = useState('werk');
  const [mit, setMit] = useState(null);           // Chat-Partner (ID)
  const chatRef = useRef(null);

  // Werk-Filter gruppiert nach Land (wie bei den Maschinen)
  const orte = useMemo(() => {
    const laender = [...new Map(personen.filter((p) => p.land).map((p) => [p.land, p.land_name])).entries()];
    return [{ wert: '', text: t('Alle Werke') }, ...laender.map(([land, name]) => ({
      gruppe: t(name),
      optionen: [{ wert: `land-${land}`, text: t('Ganz {land}', { land: t(name) }) },
        ...[...new Map(personen.filter((p) => p.land === land).map((p) => [p.standort_id, p.standort])).entries()]
          .map(([id, name]) => ({ wert: `werk-${id}`, text: name }))],
    }))];
  }, [personen, t]);
  const rollen = [{ wert: '', text: t('Alle Rollen') }, ...ROLLEN.map((r) => ({ wert: r.wert, text: t(r.text) }))];

  const liste = personen
    .filter((p) => !suche || `${p.name} ${p.standort ?? ''} ${p.qualifikation ?? ''}`.toLowerCase().includes(suche.toLowerCase()))
    .filter((p) => !ort || (ort.startsWith('land-') ? p.land === ort.slice(5) : String(p.standort_id) === ort.slice(5)))
    .filter((p) => !rolle || p.rolle === rolle)
    .sort({
      werk: () => 0,   // Reihenfolge der Abfrage: Hauptsitz zuerst, dann Werk, Rolle, Name
      offen: (a, b) => b.offen - a.offen || b.erledigt - a.erledigt,
      erledigt: (a, b) => b.erledigt - a.erledigt,
      name: (a, b) => a.name.localeCompare(b.name),
    }[sortierung]);
  // Für die Balken: höchste Zahl offener Aufträge
  const maxOffen = Math.max(1, ...personen.map((p) => p.offen));

  function schreiben(id) {
    setMit(id);
    // Auf schmalen Bildschirmen steht der Chat unter der Liste
    if (window.matchMedia('(max-width: 1199.98px)').matches) chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="row g-4">
      <div className="col-xl-8">
        <section className="karte" style={{ '--i': 4 }}>
          <h2 className="abschnitt-titel">{t('Team')}</h2>
          <div className="filterleiste mb-3">
            <div>
              <label className="form-label" htmlFor="mitarbeiter-suche">{t('Suche')}</label>
              <input id="mitarbeiter-suche" type="search" className="form-control" value={suche} onChange={(e) => setSuche(e.target.value)}
                     placeholder={t('Name, Werk, Qualifikation …')} />
            </div>
            <div>
              <label className="form-label" htmlFor="mitarbeiter-ort">{t('Werk')}</label>
              <Auswahl id="mitarbeiter-ort" optionen={orte} wert={ort} onAendern={setOrt} />
            </div>
            <div>
              <label className="form-label" htmlFor="mitarbeiter-rolle">{t('Rolle')}</label>
              <Auswahl id="mitarbeiter-rolle" optionen={rollen} wert={rolle} onAendern={setRolle} />
            </div>
            <div>
              <label className="form-label" htmlFor="mitarbeiter-sort">{t('Sortierung')}</label>
              <Auswahl id="mitarbeiter-sort" optionen={SORTIERUNGEN.map((s) => ({ wert: s.wert, text: t(s.text) }))} wert={sortierung} onAendern={setSortierung} />
            </div>
          </div>
          <p className="klein mb-2">{t('{n} Personen', { n: liste.length })}</p>

          <div className="tabelle-rahmen">
            <table className="tabelle mitarbeiter-tabelle">
              <thead>
                <tr>
                  <th>{t('Name')}</th>
                  <th className="d-none d-md-table-cell">{t('Werk')}</th>
                  <th className="zahl">{t('Offen')}</th>
                  <th className="zahl d-none d-sm-table-cell">{t('Erledigt')}</th>
                  <th className="zahl d-none d-lg-table-cell">{t('MTTR')}</th>
                  <th><span className="visually-hidden">{t('Nachricht')}</span></th>
                </tr>
              </thead>
              <tbody>
                {liste.map((p) => {
                  const technik = p.rolle === 'Instandhaltung';
                  return (
                    <tr key={p.id} className={`${p.id === ich?.id ? 'ich' : ''}${p.id === mit ? ' im-chat' : ''}`}>
                      <td>
                        <div className="mitarbeiter-name">
                          <span className="avatar" aria-hidden="true">{p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                          <span>
                            <strong>{p.name}</strong>{p.id === ich?.id && <span className="ich-marke">{t('Du')}</span>}
                            <span className="d-flex flex-wrap gap-1 align-items-center mt-1">
                              <RollenAbzeichen rolle={p.rolle} />
                              {p.qualifikation && <span className="klein d-none d-xxl-inline">{p.qualifikation}</span>}
                            </span>
                            <span className="klein d-md-none">{p.standort}</span>
                          </span>
                        </div>
                      </td>
                      <td className="d-none d-md-table-cell">{p.standort ?? '–'}{p.schicht && <small className="d-block text-leise">{t(p.schicht)}</small>}</td>
                      <td className="zahl">
                        {technik ? (
                          <span className="mitarbeiter-offen">
                            {p.offen}
                            <span className="mini-balken" aria-hidden="true"><span style={{ width: `${(p.offen / maxOffen) * 100}%` }} /></span>
                          </span>
                        ) : '–'}
                      </td>
                      <td className="zahl d-none d-sm-table-cell">{technik ? p.erledigt : '–'}</td>
                      <td className="zahl d-none d-lg-table-cell">{technik && p.mttr_min !== null ? `${zahl(p.mttr_min / 60, 1, t.sprache)} h` : '–'}</td>
                      <td className="text-end">
                        {p.id !== ich?.id && (
                          <button type="button" className="rund-knopf mitarbeiter-schreiben" onClick={() => schreiben(p.id)}
                                  aria-label={t('Nachricht an {name}', { name: p.name })} title={t('Nachricht schreiben')}>
                            <i className="bi bi-chat-dots" aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {liste.length === 0 && <p className="leer">{t('Keine Personen gefunden.')}</p>}
          </div>
          <p className="klein mt-2 mb-0">{t('Offen, Erledigt (12 Monate) und MTTR gelten für Personen der Instandhaltung (Aufträge ihres Technikers).')}</p>
        </section>
      </div>

      <div className="col-xl-4" ref={chatRef}>
        <Chat key={ich?.id ?? 'keine'} ich={ich} personen={personen} mit={mit} onMit={setMit} />
      </div>
    </div>
  );
}
