/**
 * components/Kennzahl.js – Karte mit einer großen Kennzahl
 *
 * Beispiel:
 *   <Kennzahl titel="Offene Meldungen" wert={12} zusatz="noch nicht erledigt"
 *             symbol="bi-exclamation-circle" link="/auftraege?status=offen" i={0} />
 *
 * art: '' (Standard), 'warnung', 'rot' oder 'gruen' – färbt Symbol bzw. Zahl
 * i:   Position für die versetzte Einblend-Animation
 */
import Link from 'next/link';
import Zaehler from '@/components/Zaehler';

export default function Kennzahl({ titel, wert, nachkomma = 0, einheit, zusatz, symbol, link, art = '', i = 0 }) {
  const inhalt = (
    <>
      <div className="kennzahl-kopf">
        <div className="kennzahl-label">{titel}</div>
        {symbol && <span className="kennzahl-symbol" aria-hidden="true"><i className={`bi ${symbol}`} /></span>}
      </div>
      <div className="kennzahl-wert">
        <Zaehler wert={wert} nachkomma={nachkomma} />
        {einheit && <span className="kennzahl-einheit">{einheit}</span>}
      </div>
      {zusatz && <div className="kennzahl-zusatz">{zusatz}</div>}
    </>
  );

  const klasse = `karte kennzahl${art ? ` kennzahl-${art}` : ''}`;
  return link
    ? <Link href={link} className={klasse} style={{ '--i': i }}>{inhalt}</Link>
    : <div className={klasse} style={{ '--i': i }}>{inhalt}</div>;
}
