/**
 * app/auftraege/page.js – Auftragsübersicht
 *
 * Listet alle Störmeldungen mit ihrem Wartungsauftrag auf.
 * Filter über die Adresse (damit gefilterte Ansichten als Link teilbar sind):
 *   ?status=     ein Auftragsstatus oder "offen" (= alle außer "erledigt")
 *   ?standort=   ID eines Standorts (Werks)
 *   ?maschine=   ID einer Maschine
 *   ?prioritaet= niedrig / mittel / hoch
 *   ?suche=      Text, der in der Beschreibung vorkommt
 */
import Link from 'next/link';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { STATUS_WERTE, PRIORITAET_WERTE } from '@/lib/konstanten';
import { datumZeit } from '@/lib/format';
import { StatusPill, PrioritaetPill } from '@/components/Pills';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import { gross } from '@/lib/sprache';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('Aufträge');

export default async function AuftraegeSeite({ searchParams }) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const parameter = await searchParams;

  /* ---------- Filterwerte prüfen: ungültige Werte werden ignoriert ---------- */
  const filter = {
    status: String(parameter?.status ?? ''),
    standort: String(parameter?.standort ?? ''),
    maschine: String(parameter?.maschine ?? ''),
    prioritaet: String(parameter?.prioritaet ?? ''),
    suche: String(parameter?.suche ?? '').trim().slice(0, 100),
  };
  if (filter.status !== 'offen' && !STATUS_WERTE.includes(filter.status)) filter.status = '';
  if (!/^\d+$/.test(filter.standort)) filter.standort = '';
  if (!/^\d+$/.test(filter.maschine)) filter.maschine = '';
  if (!PRIORITAET_WERTE.includes(filter.prioritaet)) filter.prioritaet = '';

  /* ---------- Abfrage aus Bausteinen zusammensetzen ----------
   * Jeder Filter fügt eine Bedingung hinzu. Die Werte werden – wie immer –
   * getrennt als Parameter übergeben, nie in den SQL-Text geschrieben.
   * "sql`TRUE`" ist der neutrale Baustein, wenn ein Filter nicht gesetzt ist.
   */
  const bedingungStatus = filter.status === 'offen' ? sql`w.status <> 'erledigt'`
    : filter.status ? sql`w.status = ${filter.status}` : sql`TRUE`;
  const bedingungStandort = filter.standort ? sql`g.standort_id = ${Number(filter.standort)}` : sql`TRUE`;
  const bedingungMaschine = filter.maschine ? sql`s.maschine_id = ${Number(filter.maschine)}` : sql`TRUE`;
  const bedingungPrio = filter.prioritaet ? sql`s.prioritaet = ${filter.prioritaet}` : sql`TRUE`;
  // ILIKE = Groß-/Kleinschreibung egal; % und _ aus der Eingabe werden als normale Zeichen behandelt
  const suchmuster = `%${filter.suche.replace(/[\\%_]/g, (z) => `\\${z}`)}%`;
  const bedingungSuche = filter.suche ? sql`s.beschreibung ILIKE ${suchmuster}` : sql`TRUE`;

  const [standorte, maschinen, auftraege] = await Promise.all([
    sql`SELECT id, name FROM standort ORDER BY name`,
    // Maschinen für die Auswahl – gruppiert nach Standort (siehe <optgroup> unten)
    sql`
      SELECT m.id, m.bezeichnung, m.anlagennummer, st.id AS standort_id, st.name AS standort
      FROM maschine m JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id
      ${filter.standort ? sql`WHERE st.id = ${Number(filter.standort)}` : sql``}
      ORDER BY st.name, m.anlagennummer`,
    sql`
      SELECT w.id AS auftrag_id, w.status,
             s.id AS meldung_id, s.zeitpunkt, s.beschreibung, s.ursache_kategorie, s.prioritaet,
             m.bezeichnung AS maschine, m.anlagennummer, st.stadt, g.kuerzel AS gebaeude, t.name AS techniker
      FROM stoermeldung s
      JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
      JOIN maschine m        ON m.id = s.maschine_id
      JOIN gebaeude g        ON g.id = m.gebaeude_id
      JOIN standort st       ON st.id = g.standort_id
      LEFT JOIN techniker t  ON t.id = w.techniker_id
      WHERE ${bedingungStatus} AND ${bedingungStandort} AND ${bedingungMaschine} AND ${bedingungPrio} AND ${bedingungSuche}
      ORDER BY s.zeitpunkt DESC`,
  ]);

  const filterAktiv = Object.values(filter).some((wert) => wert !== '');

  // Maschinen nach Standort gruppieren: { 'Werk Hamburg': [ … ], … }
  const maschinenNachStandort = {};
  maschinen.forEach((m) => { (maschinenNachStandort[m.standort] ??= []).push(m); });

  return (
    <>
      <div className="seitenkopf d-flex justify-content-between align-items-end flex-wrap gap-3">
        <div>
          <h1>{t('Aufträge')}</h1>
          <p>{auftraege.length === 1 ? t('1 Meldung') : t('{n} Meldungen', { n: auftraege.length })}{filterAktiv ? ` ${t('(gefiltert)')}` : ''}</p>
        </div>
        <Link href="/melden" className="btn btn-primary"><i className="bi bi-plus-lg" aria-hidden="true" /> {t('Neue Störung melden')}</Link>
      </div>

      {/* Filterleiste: ein normales GET-Formular – funktioniert auch ohne JavaScript */}
      <form method="get" className="karte" style={{ '--i': 0 }}>
        <div className="filterleiste">
          <div style={{ flexBasis: 240 }}>
            <label htmlFor="f-suche" className="form-label">{t('Suche')}</label>
            <input id="f-suche" name="suche" type="search" className="form-control" defaultValue={filter.suche}
                   placeholder={t('in der Beschreibung …')} />
          </div>
          <div>
            <label htmlFor="f-status" className="form-label">{t('Status')}</label>
            <select id="f-status" name="status" className="form-select" defaultValue={filter.status}>
              <option value="">{t('Alle')}</option>
              <option value="offen">{t('Alle offenen')}</option>
              {STATUS_WERTE.map((s) => <option key={s} value={s}>{gross(t(s))}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-standort" className="form-label">{t('Standort')}</label>
            <select id="f-standort" name="standort" className="form-select" defaultValue={filter.standort}>
              <option value="">{t('Alle')}</option>
              {standorte.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-maschine" className="form-label">{t('Maschine')}</label>
            <select id="f-maschine" name="maschine" className="form-select" defaultValue={filter.maschine}>
              <option value="">{t('Alle')}</option>
              {Object.entries(maschinenNachStandort).map(([standort, liste]) => (
                <optgroup key={standort} label={standort}>
                  {liste.map((m) => <option key={m.id} value={m.id}>{m.anlagennummer} – {m.bezeichnung}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-prio" className="form-label">{t('Priorität')}</label>
            <select id="f-prio" name="prioritaet" className="form-select" defaultValue={filter.prioritaet}>
              <option value="">{t('Alle')}</option>
              {PRIORITAET_WERTE.map((p) => <option key={p} value={p}>{gross(t(p))}</option>)}
            </select>
          </div>
          <div className="aktionen">
            <button type="submit" className="btn btn-primary"><i className="bi bi-funnel" aria-hidden="true" /> {t('Filtern')}</button>
            {filterAktiv && <Link href="/auftraege" className="btn btn-sekundaer">{t('Zurücksetzen')}</Link>}
          </div>
        </div>
      </form>

      {/* Ergebnisliste */}
      <section className="karte" style={{ '--i': 1 }}>
        {auftraege.length === 0 ? (
          <p className="leer"><i className="bi bi-search text-leise" />{t('Keine Meldungen gefunden. Passen Sie ggf. die Filter an.')}</p>
        ) : (
          <div className="tabelle-rahmen">
            <table className="tabelle">
              <thead>
                <tr>
                  <th className="zahl">{t('Nr.')}</th>
                  <th>{t('Maschine / Ort')}</th>
                  <th className="d-none d-lg-table-cell">{t('Ursache')}</th>
                  <th>{t('Priorität')}</th>
                  <th>{t('Status')}</th>
                  <th className="d-none d-lg-table-cell">{t('Techniker')}</th>
                  <th className="d-none d-md-table-cell">{t('Gemeldet')}</th>
                  <th className="d-none d-md-table-cell" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {auftraege.map((a) => (
                  <tr key={a.auftrag_id} className="klickbar">
                    <td className="zahl klein">{a.meldung_id}</td>
                    <td>
                      <Link className="zeilen-link" prefetch={false} href={`/auftraege/${a.auftrag_id}`}>{a.maschine}</Link>
                      <div className="klein">{a.stadt} · {a.gebaeude} · {a.anlagennummer}</div>
                      <div className="klein text-truncate beschreibung-kurz">{a.beschreibung}</div>
                    </td>
                    <td className="d-none d-lg-table-cell klein">{t(a.ursache_kategorie)}</td>
                    <td><PrioritaetPill prioritaet={a.prioritaet} /></td>
                    <td>
                      <StatusPill status={a.status} />
                      {/* Auf Tablets steht der Techniker unter dem Status statt in eigener Spalte */}
                      {a.techniker && <div className="klein mt-1 d-lg-none">{a.techniker}</div>}
                    </td>
                    <td className="d-none d-lg-table-cell klein">{a.techniker ?? '–'}</td>
                    <td className="d-none d-md-table-cell klein">{datumZeit(a.zeitpunkt, t.sprache)}</td>
                    <td className="d-none d-md-table-cell"><i className="bi bi-chevron-right zeilen-pfeil" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
