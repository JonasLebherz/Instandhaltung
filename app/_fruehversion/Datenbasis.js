/**
 * app/_fruehversion/Datenbasis.js – rudimentäre Datenbasis (Versionen 2 und 3):
 * Verbindungsstatus und alle Tabellen mit Spalten und Zahl der Datensätze, live aus der Datenbank.
 * Ohne Zugangsdaten. 2 Abfragen.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import Rahmen from './Rahmen';

export default async function Datenbasis({ version }) {
  await benutzerPflicht();
  const start = Date.now();
  const [[info], tabellen] = await Promise.all([
    sql`SELECT current_setting('server_version') AS version, now() AS zeit`,
    // Zahl der Datensätze: Schätzung aus der Statistik (reltuples) wäre ungenau – deshalb exakt per Unterabfrage
    sql`SELECT c.relname AS name, obj_description(c.oid) AS kommentar,
               (xpath('/row/n/text()', query_to_xml(format('SELECT COUNT(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::int AS anzahl,
               (SELECT string_agg(a.attname, ', ' ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS spalten
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`,
  ]);
  const ms = Date.now() - start;
  return (
    <Rahmen version={version} titel="Datenbasis" emoji="🗄️">
      <p id="fv-db-status">Datenbank: <b className="fv-gruen">verbunden</b> (PostgreSQL {info.version.split(' ')[0]}, Antwort in {ms} ms)</p>
      <div className="fv-breit">
        <table className="fv-tabelle" id="fv-tabellen">
          <thead><tr><th>Tabelle</th><th>Beschreibung</th><th>Datensätze</th><th>Spalten</th></tr></thead>
          <tbody>
            {tabellen.map((t) => (
              <tr key={t.name}><td><code>{t.name}</code></td><td>{t.kommentar ?? ''}</td><td>{t.anzahl}</td><td className="fv-klein-text">{t.spalten}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Rahmen>
  );
}
