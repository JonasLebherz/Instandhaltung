/**
 * app/datenbasis/page.js – Datenbasis: Verbindungen, Datenmodell und Daten
 *
 * Drei Teile:
 *  1. Verbindungen (Verbindungen.js): Wie hängen Claude/Codex, GitHub, Vercel,
 *     Supabase und Power BI zusammen – und funktioniert jede Verbindung gerade?
 *  2. Datenmodell (Datenmodell.js): alle Tabellen mit Spalten, Schlüsseln und
 *     Beziehungen als Diagramm, dazu Views und Wertelisten
 *  3. Tabelle anklicken: Spalten im Detail und die Datensätze als Vorschau
 *
 * Der Aufbau wird live aus der Datenbank gelesen (lib/datenbasis.js) – kommt
 * eine Tabelle oder Spalte dazu, erscheint sie hier automatisch.
 */
import { benutzerPflicht } from '@/lib/auth';
import { datenbankAufbau } from '@/lib/datenbasis';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import { zahl } from '@/lib/format';
import Kennzahl from '@/components/Kennzahl';
import Verbindungen from './Verbindungen';
import Datenmodell from './Datenmodell';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Datenbasis');

export default async function DatenbasisSeite() {
  await benutzerPflicht();
  const t = await uebersetzer();
  const { info, tabellen, wertelisten } = await datenbankAufbau();

  const nurTabellen = tabellen.filter((x) => x.art === 'tabelle');
  const datensaetze = nurTabellen.reduce((summe, x) => summe + (x.anzahl ?? 0), 0);

  return (
    <>
      <div className="seitenkopf">
        <h1>{t('Datenbasis')}</h1>
        <p>{t('Wie die Anwendung aufgebaut ist: Verbindungen, Tabellen, Beziehungen und Daten – live aus der Datenbank.')}</p>
      </div>

      <div className="row g-4 mb-2">
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Tabellen')} wert={nurTabellen.length} zusatz={t('mit Zeilensicherheit (RLS)')} symbol="bi-table" i={0} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Datensätze')} wert={datensaetze} zusatz={t('in allen Tabellen')} symbol="bi-collection" i={1} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Views')} wert={tabellen.length - nurTabellen.length} zusatz={t('für Power BI')} symbol="bi-eye" i={2} />
        </div>
        <div className="col-6 col-lg-3">
          <Kennzahl titel={t('Größe')} wert={info.groesse / 1024 / 1024} nachkomma={1} einheit="MB"
                    zusatz={`PostgreSQL ${info.version.split(' ')[0]}`} symbol="bi-hdd-stack" i={3} />
        </div>
      </div>

      <Verbindungen />

      <Datenmodell tabellen={tabellen} wertelisten={wertelisten} />

      <p className="klein mt-2">
        {t('Datenbank „{name}“ · {n} Datensätze · Stand beim Laden der Seite', { name: info.name, n: zahl(datensaetze, 0, t.sprache) })}
      </p>
    </>
  );
}
