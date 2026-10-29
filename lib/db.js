/**
 * lib/db.js – Verbindung zur Datenbank (PostgreSQL bei Supabase)
 *
 * Stellt "sql" bereit, mit dem überall in der Anwendung Abfragen gestellt werden:
 *
 *     const zeilen = await sql`SELECT * FROM maschine WHERE id = ${id}`;
 *
 * WICHTIG – Schutz vor SQL-Injection:
 * Die Werte in ${…} werden NICHT in den SQL-Text eingesetzt, sondern getrennt
 * als Parameter an die Datenbank geschickt (wie Prepared Statements mit "?").
 * Benutzereingaben können die Abfrage dadurch nicht verändern.
 *
 * Diese Datei darf nur auf dem Server verwendet werden ("server-only"),
 * damit die Zugangsdaten nie im Browser landen.
 */
import 'server-only';
import postgres from 'postgres';

function verbindungAufbauen() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL ist nicht gesetzt. Lokal in .env.local eintragen, auf Vercel unter ' +
      'Settings → Environment Variables (siehe .env.example und README).'
    );
  }

  const lokal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

  return postgres(url, {
    // Supabase verlangt verschlüsselte Verbindungen, lokal ist das nicht nötig
    ssl: lokal ? false : 'require',
    // Der Supabase-"Transaction pooler" unterstützt keine dauerhaft gespeicherten
    // Prepared Statements. Die Werte werden trotzdem getrennt als Parameter übertragen.
    prepare: false,
    // Wenige Verbindungen pro Server-Instanz reichen (Vercel startet bei Bedarf mehrere)
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Während der Entwicklung lädt Next.js Dateien bei jeder Änderung neu.
// Damit dabei nicht jedes Mal eine neue Verbindung entsteht, wird sie global gemerkt.
const globalerSpeicher = globalThis;
export const sql = globalerSpeicher.__instandhaltungSql ?? verbindungAufbauen();
if (process.env.NODE_ENV !== 'production') {
  globalerSpeicher.__instandhaltungSql = sql;
}
