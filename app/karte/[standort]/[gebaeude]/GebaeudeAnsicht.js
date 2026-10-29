'use client';
/**
 * app/karte/[standort]/[gebaeude]/GebaeudeAnsicht.js – Grundriss mit Seitenleiste
 *
 * Links der Grundriss, rechts Details zur angeklickten Maschine: offene
 * Störungen (mit Link zum Auftrag), Kennzahlen und "Störung melden".
 * Ohne Auswahl zeigt die Seitenleiste alle Maschinen mit offenen Störungen.
 */
import Link from 'next/link';
import { useState } from 'react';
import Grundriss from '@/components/karten/Grundriss';
import { Legende, stufe, offenText } from '@/components/karten/stufe';
import { StatusPill, PrioritaetPill } from '@/components/Pills';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';

export default function GebaeudeAnsicht({ gebaeude, maschinen, offene, vorauswahl }) {
  const [auswahlId, setAuswahlId] = useState(vorauswahl);
  const auswahl = maschinen.find((m) => m.id === auswahlId) ?? null;
  const offeneDerAuswahl = auswahl ? offene.filter((a) => a.maschine_id === auswahl.id) : [];
  const gestoert = maschinen.filter((m) => m.offen > 0).sort((a, b) => b.offen - a.offen);

  // Nochmals klicken hebt die Auswahl wieder auf
  const waehle = (m) => setAuswahlId(auswahlId === m.id ? null : m.id);

  return (
    <div className="row g-4">
      <div className="col-xl-8">
        <section className="karte" style={{ '--i': 0 }}>
          <div className="karte-kopf">
            <h2 className="abschnitt-titel">Grundriss</h2>
            <span className="klein">Maschine anklicken für Details</span>
          </div>
          <Grundriss gebaeude={gebaeude} maschinen={maschinen} auswahlId={auswahlId} onWaehle={waehle} />
          <Legende />
        </section>
      </div>

      <div className="col-xl-4">
        {auswahl ? (
          <section className={`karte stufe-${stufe(auswahl.offen, auswahl.hoechste_prioritaet)}`} style={{ '--i': 1 }} key={auswahl.id}>
            <div className="detail-kopf">
              <span className="detail-symbol" aria-hidden="true"><i className={`bi ${MASCHINEN_SYMBOLE[auswahl.typ] ?? 'bi-gear'}`} /></span>
              <div className="flex-grow-1">
                <h2 className="abschnitt-titel mb-0">{auswahl.bezeichnung}</h2>
                <div className="klein">{auswahl.anlagennummer} · {auswahl.typ} · Baujahr {auswahl.baujahr}</div>
              </div>
              <button type="button" className="rund-knopf" onClick={() => setAuswahlId(null)} aria-label="Auswahl schließen">
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div className="mini-kennzahlen">
              <div><strong>{auswahl.offen}</strong><span>offen</span></div>
              <div><strong>{auswahl.stoerungen_12m}</strong><span>Störungen 12 Mon.</span></div>
              <div><strong>{new Date().getFullYear() - auswahl.baujahr}</strong><span>Jahre alt</span></div>
            </div>

            <h3 className="h6 fw-semibold mb-2">{offenText(auswahl.offen)}</h3>
            {offeneDerAuswahl.length === 0 ? (
              <p className="text-leise"><i className="bi bi-check-circle me-1" style={{ color: 'var(--gruen)' }} />Die Maschine läuft störungsfrei.</p>
            ) : (
              <ul className="ort-liste mb-3">
                {offeneDerAuswahl.map((a) => (
                  <li key={a.auftrag_id}>
                    <Link href={`/auftraege/${a.auftrag_id}`}>
                      <span className="flex-grow-1">
                        <span className="ort-titel">{a.beschreibung}</span>
                        <span className="d-flex gap-2 mt-1 flex-wrap"><PrioritaetPill prioritaet={a.prioritaet} /><StatusPill status={a.status} /></span>
                      </span>
                      <i className="bi bi-chevron-right text-leise" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/melden?maschine=${auswahl.id}`} className="btn btn-primary w-100">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" /> Störung an dieser Maschine melden
            </Link>
          </section>
        ) : (
          <section className="karte" style={{ '--i': 1 }}>
            <h2 className="abschnitt-titel">Maschinen mit Störungen</h2>
            {gestoert.length === 0 ? (
              <p className="leer"><i className="bi bi-check-circle" />Alle Maschinen in diesem Gebäude laufen.</p>
            ) : (
              <ul className="ort-liste">
                {gestoert.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => waehle(m)} className={`stufe-${stufe(m.offen, m.hoechste_prioritaet)}`}>
                      <i className={`bi ${MASCHINEN_SYMBOLE[m.typ] ?? 'bi-gear'} text-leise`} aria-hidden="true" />
                      <span>
                        <span className="ort-titel">{m.bezeichnung}</span>
                        <span className="ort-unter">{m.anlagennummer}</span>
                      </span>
                      <span className="ort-zahl">{m.offen}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
