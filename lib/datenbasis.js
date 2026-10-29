/**
 * lib/datenbasis.js – Aufbau der Datenbank auslesen (für die Seite "Datenbasis")
 *
 * PostgreSQL beschreibt sich selbst: In pg_catalog und information_schema
 * stehen alle Tabellen, Spalten, Schlüssel und Wertelisten. Diese Abfragen
 * lesen nur – sie ändern nichts.
 */
import 'server-only';
import { sql } from '@/lib/db';

/** Alle Tabellen und Views im Schema "public" (Name, Art, Beschreibung, RLS) */
export function tabellenListe() {
  return sql`
    SELECT c.relname AS name,
           CASE c.relkind WHEN 'v' THEN 'view' ELSE 'tabelle' END AS art,
           obj_description(c.oid, 'pg_class') AS beschreibung,
           c.relrowsecurity AS rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v')
    ORDER BY c.relkind, c.relname`;
}

/** Nur die Namen – zum Prüfen, ob eine angefragte Tabelle wirklich existiert */
export async function tabellenNamen() {
  return (await tabellenListe()).map((z) => z.name);
}

export async function datenbankAufbau() {
  const [tabellen, spalten, schluessel, wertelisten, [info]] = await Promise.all([
    tabellenListe(),

    // Spalten mit Datentyp; bei eigenen Typen (ENUM) steht der Name in udt_name
    sql`
      SELECT table_name AS tabelle, column_name AS name, ordinal_position AS position,
             CASE WHEN data_type = 'USER-DEFINED' THEN udt_name
                  WHEN data_type = 'character varying' THEN 'varchar(' || character_maximum_length || ')'
                  WHEN data_type = 'timestamp with time zone' THEN 'timestamptz'
                  WHEN data_type = 'double precision' THEN 'double'
                  ELSE data_type END AS typ,
             is_nullable = 'YES' AS optional
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,

    // Primär-, Fremd- und eindeutige Schlüssel
    sql`
      SELECT tc.table_name AS tabelle, kcu.column_name AS spalte, tc.constraint_type AS art,
             ccu.table_name AS ziel_tabelle, ccu.column_name AS ziel_spalte
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND tc.constraint_type = 'FOREIGN KEY'
      WHERE tc.table_schema = 'public' AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')`,

    // Wertelisten (ENUM-Typen) in ihrer Reihenfolge
    sql`
      SELECT t.typname AS typ, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS werte
      FROM pg_type t
      JOIN pg_enum e      ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname`,

    sql`SELECT current_database() AS name, current_setting('server_version') AS version,
               pg_database_size(current_database())::bigint AS groesse`,
  ]);

  // Anzahl Datensätze je Tabelle in einer Abfrage (Tabellennamen kommen aus der
  // Datenbank selbst und werden mit sql(name) sicher als Bezeichner eingesetzt)
  const nurTabellen = tabellen.filter((z) => z.art === 'tabelle').map((z) => z.name);
  const zaehlungen = nurTabellen.length === 0 ? [] : await nurTabellen
    .map((name) => sql`SELECT ${name}::text AS tabelle, COUNT(*)::int AS anzahl FROM ${sql(name)}`)
    .reduce((summe, teil) => sql`${summe} UNION ALL ${teil}`);
  const anzahlVon = Object.fromEntries(zaehlungen.map((z) => [z.tabelle, z.anzahl]));

  return {
    info: { ...info, groesse: Number(info.groesse) },
    wertelisten,
    tabellen: tabellen.map((tab) => ({
      ...tab,
      anzahl: anzahlVon[tab.name] ?? null,
      spalten: spalten.filter((s) => s.tabelle === tab.name).map((s) => {
        const schl = schluessel.filter((k) => k.tabelle === tab.name && k.spalte === s.name);
        const fk = schl.find((k) => k.art === 'FOREIGN KEY');
        return {
          name: s.name, typ: s.typ, optional: s.optional,
          pk: schl.some((k) => k.art === 'PRIMARY KEY'),
          eindeutig: schl.some((k) => k.art === 'UNIQUE'),
          fk: fk ? { tabelle: fk.ziel_tabelle, spalte: fk.ziel_spalte } : null,
        };
      }),
    })),
  };
}
