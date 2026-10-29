'use client';
/**
 * components/AnsichtWahl.js – Einstellung "Ansicht" im Konto-Menü der Seitenleiste
 *
 * Zwei Auswahlfelder: Land und Werk. Standard ist "Alle". Die Wahl landet im
 * Cookie "ansicht" (ein Jahr) und wird auf dem Server von lib/ansicht.js gelesen.
 * Danach lädt die Seite ihre Daten neu (router.refresh).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from './SpracheKontext';

function ansichtSpeichern(land, werk) {
  const wert = land || werk ? encodeURIComponent(JSON.stringify({ land: land || null, werk: werk ? Number(werk) : null })) : '';
  document.cookie = `ansicht=${wert}; path=/; max-age=${wert ? 31536000 : 0}; samesite=lax`;
}

export default function AnsichtWahl({ ansicht }) {
  const t = useT();
  const router = useRouter();
  const [standorte, setStandorte] = useState([]);
  const [land, setLand] = useState(ansicht?.land ?? '');
  const [werk, setWerk] = useState(ansicht?.standortId ? String(ansicht.standortId) : '');

  useEffect(() => {
    fetch('/api/standorte', { cache: 'no-store' }).then((a) => a.json()).then((d) => setStandorte(d.standorte ?? [])).catch(() => {});
  }, []);

  // Länder aus den Werken (Reihenfolge wie geliefert: Hauptsitz zuerst)
  const laender = [...new Map(standorte.map((st) => [st.land, st.land_name])).entries()];
  const werke = standorte.filter((st) => !land || st.land === land);

  function aendern(neuesLand, neuesWerk) {
    setLand(neuesLand);
    setWerk(neuesWerk);
    ansichtSpeichern(neuesLand, neuesWerk);
    router.refresh();
  }

  return (
    <div className="ansicht-wahl">
      <label className="visually-hidden" htmlFor="ansicht-land">{t('Land')}</label>
      <select id="ansicht-land" className="form-select form-select-sm" value={land}
              onChange={(e) => aendern(e.target.value, '')}>
        <option value="">{t('Alle Länder')}</option>
        {laender.map(([kuerzel, name]) => <option key={kuerzel} value={kuerzel}>{t(name)}</option>)}
      </select>
      <label className="visually-hidden" htmlFor="ansicht-werk">{t('Werk')}</label>
      <select id="ansicht-werk" className="form-select form-select-sm" value={werk}
              onChange={(e) => {
                const st = standorte.find((x) => String(x.id) === e.target.value);
                aendern(st ? st.land : land, e.target.value);
              }}>
        <option value="">{t('Alle Werke')}</option>
        {werke.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
      </select>
    </div>
  );
}
