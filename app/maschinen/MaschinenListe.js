'use client';
/**
 * app/maschinen/MaschinenListe.js – Suche, Filter und Sortierung der Maschinenliste (im Browser)
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useT } from '@/components/SpracheKontext';
import Auswahl from '@/components/Auswahl';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import { ampelZustand, AMPEL_TEXT } from '@/lib/karten/ampel';
import { T } from '@/lib/sprache';

const SORTIERUNGEN = [
  { wert: 'stoerungen', text: T('Meiste Störungen (12 Monate)') },
  { wert: 'offen', text: T('Meiste offene Störungen') },
  { wert: 'alter', text: T('Älteste zuerst') },
  { wert: 'nummer', text: T('Anlagennummer') },
];

export default function MaschinenListe({ maschinen }) {
  const t = useT();
  const [suche, setSuche] = useState('');
  const [ort, setOrt] = useState('');
  const [typ, setTyp] = useState('');
  const [zustand, setZustand] = useState('');
  const [sortierung, setSortierung] = useState('stoerungen');

  // Land- und Werk-Filter in einer Auswahl, gruppiert nach Land
  const orte = useMemo(() => {
    const laender = [...new Map(maschinen.map((m) => [m.land, m.land_name])).entries()];
    return [{ wert: '', text: t('Alle Werke') }, ...laender.map(([land, name]) => ({
      gruppe: t(name),
      optionen: [{ wert: `land-${land}`, text: t('Ganz {land}', { land: t(name) }) },
        ...[...new Map(maschinen.filter((m) => m.land === land).map((m) => [m.standort_id, m.standort])).entries()]
          .map(([id, name]) => ({ wert: `werk-${id}`, text: name }))],
    }))];
  }, [maschinen, t]);
  const typen = [{ wert: '', text: t('Alle Typen') }, ...[...new Set(maschinen.map((m) => m.typ))].sort().map((x) => ({ wert: x, text: t(x) }))];
  const zustaende = [{ wert: '', text: t('Alle Zustände') }, ...['gruen', 'orange', 'rot'].map((z) => ({ wert: z, text: t(AMPEL_TEXT[z]) }))];

  const liste = maschinen
    .filter((m) => !suche || `${m.bezeichnung} ${m.anlagennummer} ${m.standort}`.toLowerCase().includes(suche.toLowerCase()))
    .filter((m) => !ort || (ort.startsWith('land-') ? m.land === ort.slice(5) : String(m.standort_id) === ort.slice(5)))
    .filter((m) => !typ || m.typ === typ)
    .filter((m) => !zustand || ampelZustand(m) === zustand)
    .sort({
      stoerungen: (a, b) => b.stoerungen_12m - a.stoerungen_12m || b.offen - a.offen,
      offen: (a, b) => b.offen - a.offen || b.stoerungen_12m - a.stoerungen_12m,
      alter: (a, b) => a.baujahr - b.baujahr,
      nummer: (a, b) => a.anlagennummer.localeCompare(b.anlagennummer),
    }[sortierung]);

  return (
    <section className="karte" style={{ '--i': 1 }}>
      <div className="filterleiste mb-3">
        <div>
          <label className="form-label" htmlFor="maschinen-suche">{t('Suche')}</label>
          <input id="maschinen-suche" type="search" className="form-control" value={suche} onChange={(e) => setSuche(e.target.value)}
                 placeholder={t('Name, Anlagennummer, Werk …')} />
        </div>
        <div><label className="form-label" htmlFor="maschinen-ort">{t('Land / Werk')}</label><Auswahl id="maschinen-ort" optionen={orte} wert={ort} onAendern={setOrt} /></div>
        <div><label className="form-label" htmlFor="maschinen-typ">{t('Typ')}</label><Auswahl id="maschinen-typ" optionen={typen} wert={typ} onAendern={setTyp} /></div>
        <div><label className="form-label" htmlFor="maschinen-zustand">{t('Zustand')}</label><Auswahl id="maschinen-zustand" optionen={zustaende} wert={zustand} onAendern={setZustand} /></div>
        <div><label className="form-label" htmlFor="maschinen-sortierung">{t('Sortierung')}</label>
          <Auswahl id="maschinen-sortierung" optionen={SORTIERUNGEN.map((x) => ({ ...x, text: t(x.text) }))} wert={sortierung} onAendern={setSortierung} /></div>
      </div>
      <p className="klein" aria-live="polite">{t('{n} Maschinen', { n: liste.length })}</p>
      <div className="tabelle-rahmen">
        <table className="tabelle maschinen-tabelle">
          <thead>
            <tr>
              <th>{t('Maschine')}</th>
              <th className="d-none d-md-table-cell">{t('Werk')}</th>
              <th className="d-none d-lg-table-cell">{t('Baujahr')}</th>
              <th>{t('Zustand')}</th>
              <th className="zahl">{t('Störungen 12 Mon.')}</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((m) => {
              const z = ampelZustand(m);
              return (
                <tr key={m.id}>
                  <td>
                    <Link href={`/maschinen/${m.id}`} className="maschinen-link">
                      <i className={`bi ${MASCHINEN_SYMBOLE[m.typ] ?? 'bi-gear'} text-leise`} aria-hidden="true" />
                      <span><strong>{m.bezeichnung}</strong><span className="klein d-block">{m.anlagennummer} · {t(m.typ)}</span></span>
                    </Link>
                  </td>
                  <td className="d-none d-md-table-cell">{m.standort} · {m.gebaeude_kuerzel}</td>
                  <td className="d-none d-lg-table-cell">{m.baujahr}</td>
                  <td><span className={`ampel-punkt ampel-${z}`} aria-hidden="true" /> {t(AMPEL_TEXT[z])}{m.offen > 0 && ` (${m.offen})`}</td>
                  <td className="zahl">{m.stoerungen_12m}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
