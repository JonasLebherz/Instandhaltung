/**
 * components/Feldfehler.js – Fehlermeldung direkt unter einem Formularfeld
 *
 * Gegenstück zu fehlerklasse(): markiert das Feld rot (Bootstrap "is-invalid").
 */
export function fehlerklasse(fehler, name) {
  return fehler?.[name] ? ' is-invalid' : '';
}

export default function Feldfehler({ fehler, name }) {
  if (!fehler?.[name]) return null;
  return <div className="invalid-feedback d-block" id={`fehler-${name}`}>{fehler[name]}</div>;
}
