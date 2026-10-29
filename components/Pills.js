/**
 * components/Pills.js – farbige "Pills" für Status und Priorität
 *
 * Die Farbe ist nur eine zusätzliche Hilfe – der Text steht immer dabei,
 * damit die Information auch ohne Farbsehen eindeutig ist.
 */
import { STATUS_LISTE, PRIORITAET_LISTE } from '@/lib/konstanten';

export function StatusPill({ status }) {
  return <span className={`pill pill-${STATUS_LISTE[status] ?? 'grau'}`}>{status}</span>;
}

export function PrioritaetPill({ prioritaet }) {
  const text = prioritaet.charAt(0).toUpperCase() + prioritaet.slice(1);
  return <span className={`pill pill-${PRIORITAET_LISTE[prioritaet] ?? 'grau'}`}>{text}</span>;
}
