/**
 * app/v1/Rahmen.js – gemeinsamer Rahmen der Seiten von „Version 1“
 *
 * Version 1 ist der frühe, bewusst schlichte Stand der Anwendung: reines HTML, Daten direkt aus der
 * Datenbank, keine Gestaltung (die Schrift und die Knöpfe kommen vom Browser). Sie läuft neben der
 * aktuellen App und greift auf dieselbe Datenbank zu.
 *
 * Besonderheiten gegenüber dem Rest des Projekts (Absicht, siehe CLAUDE.md „Version 1“):
 *  - Texte nur auf Deutsch (keine Übersetzung über t())
 *  - normale Links <a href> statt <Link>: jeder Klick lädt die ganze Seite neu – wie früher
 *  - Auswahlfelder als natives <select>
 */

/** Kopf mit Titel und Navigation, darunter der Inhalt, unten eine Fußzeile */
export default function Rahmen({ titel, children }) {
  return (
    <div className="v1">
      <h1>Instandhaltung</h1>
      <p>
        <b>Company database</b> – Digital Production · Version 1
      </p>
      <p className="v1-nav">
        [ <a href="/v1">Startseite</a> ] [ <a href="/v1/maschinen">Maschinen</a> ] [ <a href="/v1/meldungen">Störmeldungen</a> ] [{' '}
        <a href="/v1/melden">Störung melden</a> ]
      </p>
      <hr />
      <h2>{titel}</h2>
      {children}
      <hr />
      <p>
        <small>
          Version 1 – Grundgerüst mit Datenbankanbindung · <a href="/">zur aktuellen Version</a>
        </small>
      </p>
    </div>
  );
}
