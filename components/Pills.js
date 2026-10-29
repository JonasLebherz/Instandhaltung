'use client';
/**
 * components/Pills.js – farbige "Pills" für Status und Priorität
 *
 * Die Farbe ist nur eine zusätzliche Hilfe – der Text steht immer dabei,
 * damit die Information auch ohne Farbsehen eindeutig ist.
 * Der Wert kommt deutsch aus der Datenbank und wird für die Anzeige übersetzt.
 */
import { STATUS_LISTE, PRIORITAET_LISTE } from '@/lib/konstanten';
import { gross } from '@/lib/sprache';
import { useT } from './SpracheKontext';

export function StatusPill({ status }) {
  const t = useT();
  return <span className={`pill pill-${STATUS_LISTE[status] ?? 'grau'}`}>{t(status)}</span>;
}

export function PrioritaetPill({ prioritaet }) {
  const t = useT();
  const text = gross(t(prioritaet));
  return <span className={`pill pill-${PRIORITAET_LISTE[prioritaet] ?? 'grau'}`}>{text}</span>;
}
