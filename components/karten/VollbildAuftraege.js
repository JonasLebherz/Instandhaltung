'use client';
/**
 * components/karten/VollbildAuftraege.js – rechte Spalte im Vollbildmodus (app/vollbild)
 *
 * Offene Aufträge der Ebene, die die Karte gerade zeigt: weltweit → Land → Werk → Halle.
 * Wie die Liste des Hallen-Monitors, dringendste zuerst (die Daten kommen schon so sortiert).
 */
import Link from 'next/link';
import { useT } from '@/components/SpracheKontext';
import { PrioritaetPill, StatusPill } from '@/components/Pills';
import { datumZeit } from '@/lib/format';

export default function VollbildAuftraege({ offene = [], standorte, land, standort, gebaeude }) {
  const t = useT();
  // Werke des Landes (für die Landesebene), sonst nach Werk bzw. Halle filtern
  const werkeImLand = land ? new Set(standorte.filter((st) => st.land === land.kuerzel).map((st) => st.id)) : null;
  const liste = offene.filter((a) => (gebaeude ? a.gebaeude_id === gebaeude.id
    : standort ? a.standort_id === standort.id
      : werkeImLand ? werkeImLand.has(a.standort_id) : true));
  const ort = gebaeude?.bezeichnung ?? standort?.name ?? land?.name ?? t('Weltweit');
  const werkVon = (id) => standorte.find((st) => st.id === id)?.name ?? '';

  return (
    <section className="karte explorer-seite vollbild-auftraege">
      <h2 className="abschnitt-titel">{t('Offene Aufträge')} · {ort} <span className="text-leise">({liste.length})</span></h2>
      {liste.length === 0 && <p className="leer">{t('Keine offenen Aufträge.')}</p>}
      <ul className="monitor-liste">
        {liste.map((a) => (
          <li key={a.auftrag_id} className={`monitor-zeile vollbild-zeile prio-${a.prioritaet}`}>
            <Link href={`/auftraege/${a.auftrag_id}`} prefetch={false} className="monitor-zeile-text">
              <b>{a.maschine}</b>
              <small>{a.anlagennummer} · {werkVon(a.standort_id)} · {a.gebaeude_kuerzel} · {datumZeit(a.zeitpunkt, t.sprache)}</small>
              <small className="text-truncate">{a.beschreibung}</small>
              <span className="d-flex gap-1 flex-wrap"><PrioritaetPill prioritaet={a.prioritaet} /><StatusPill status={a.status} />{a.techniker && <small>{a.techniker}</small>}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
