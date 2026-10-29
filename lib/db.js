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
    // Wenige Verbindungen pro Server-Instanz: Vercel startet bei Bedarf mehrere
    // Instanzen, und der Supabase-Pooler hat im kostenlosen Tarif nur wenige Plätze.
    // Sind alle belegt, warten neue Anfragen – die Seite "lädt ewig".
    max: 3,
    // Auf Vercel werden Instanzen zwischendurch "eingefroren". Ungenutzte
    // Verbindungen deshalb nach 5 s schließen und keine länger als 5 min behalten,
    // damit keine Plätze im Pooler blockiert bleiben und nichts an toten Verbindungen hängt.
    idle_timeout: 5,
    max_lifetime: 60 * 5,
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
