/**
 * app/auftraege/page.js – Auftragsübersicht
 *
 * Listet alle Störmeldungen mit ihrem Wartungsauftrag auf.
 * Filter über die Adresse (damit gefilterte Ansichten als Link teilbar sind):
 *   ?status=     ein Auftragsstatus oder "offen" (= alle außer "erledigt")
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

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Aufträge' };

export default async function AuftraegeSeite({ searchParams }) {
  await benutzerPflicht();
  const parameter = await searchParams;

  /* ---------- Filterwerte prüfen: ungültige Werte werden ignoriert ---------- */
  const filter = {
    status: String(parameter?.status ?? ''),
    maschine: String(parameter?.maschine ?? ''),
    prioritaet: String(parameter?.prioritaet ?? ''),
    suche: String(parameter?.suche ?? '').trim().slice(0, 100),
  };
  if (filter.status !== 'offen' && !STATUS_WERTE.includes(filter.status)) filter.status = '';
  if (!/^\d+$/.test(filter.maschine)) filter.maschine = '';
  if (!PRIORITAET_WERTE.includes(filter.prioritaet)) filter.prioritaet = '';

  /* ---------- Abfrage aus Bausteinen zusammensetzen ----------
   * Jeder Filter fügt eine Bedingung hinzu. Die Werte werden – wie immer –
   * getrennt als Parameter übergeben, nie in den SQL-Text geschrieben.
   * "sql`TRUE`" ist der neutrale Baustein, wenn ein Filter nicht gesetzt ist.
   */
  const bedingungStatus = filter.status === 'offen' ? sql`w.status <> 'erledigt'`
    : filter.status ? sql`w.status = ${filter.status}` : sql`TRUE`;
  const bedingungMaschine = filter.maschine ? sql`s.maschine_id = ${Number(filter.maschine)}` : sql`TRUE`;
  const bedingungPrio = filter.prioritaet ? sql`s.prioritaet = ${filter.prioritaet}` : sql`TRUE`;
  // ILIKE = Groß-/Kleinschreibung egal; % und _ aus der Eingabe werden als normale Zeichen behandelt
  const suchmuster = `%${filter.suche.replace(/[\\%_]/g, (z) => `\\${z}`)}%`;
  const bedingungSuche = filter.suche ? sql`s.beschreibung ILIKE ${suchmuster}` : sql`TRUE`;

  const [maschinen, auftraege] = await Promise.all([
    sql`SELECT id, bezeichnung FROM maschine ORDER BY bezeichnung`,
    sql`
      SELECT w.id AS auftrag_id, w.status,
             s.id AS meldung_id, s.zeitpunkt, s.beschreibung, s.ursache_kategorie, s.prioritaet,
             m.bezeichnung AS maschine, t.name AS techniker
      FROM stoermeldung s
      JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
      JOIN maschine m        ON m.id = s.maschine_id
      LEFT JOIN techniker t  ON t.id = w.techniker_id
      WHERE ${bedingungStatus} AND ${bedingungMaschine} AND ${bedingungPrio} AND ${bedingungSuche}
      ORDER BY s.zeitpunkt DESC`,
  ]);

  const filterAktiv = Object.values(filter).some((wert) => wert !== '');

  return (
    <>
      <div className="seitenkopf d-flex justify-content-between align-items-end flex-wrap gap-3">
        <div>
          <h1>Aufträge</h1>
          <p>{auftraege.length} {auftraege.length === 1 ? 'Meldung' : 'Meldungen'}{filterAktiv ? ' (gefiltert)' : ''}</p>
        </div>
        <Link href="/melden" className="btn btn-primary"><i className="bi bi-plus-lg" aria-hidden="true" /> Neue Störung melden</Link>
      </div>

      {/* Filterleiste: ein normales GET-Formular – funktioniert auch ohne JavaScript */}
      <form method="get" className="karte" style={{ '--i': 0 }}>
        <div className="filterleiste">
          <div style={{ flexBasis: 240 }}>
            <label htmlFor="f-suche" className="form-label">Suche</label>
            <input id="f-suche" name="suche" type="search" className="form-control" defaultValue={filter.suche}
                   placeholder="in der Beschreibung …" />
          </div>
          <div>
            <label htmlFor="f-status" className="form-label">Status</label>
            <select id="f-status" name="status" className="form-select" defaultValue={filter.status}>
              <option value="">Alle</option>
              <option value="offen">Alle offenen</option>
              {STATUS_WERTE.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-maschine" className="form-label">Maschine</label>
            <select id="f-maschine" name="maschine" className="form-select" defaultValue={filter.maschine}>
              <option value="">Alle</option>
              {maschinen.map((m) => <option key={m.id} value={m.id}>{m.bezeichnung}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-prio" className="form-label">Priorität</label>
            <select id="f-prio" name="prioritaet" className="form-select" defaultValue={filter.prioritaet}>
              <option value="">Alle</option>
              {PRIORITAET_WERTE.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div className="aktionen">
            <button type="submit" className="btn btn-primary"><i className="bi bi-funnel" aria-hidden="true" /> Filtern</button>
            {filterAktiv && <Link href="/auftraege" className="btn btn-sekundaer">Zurücksetzen</Link>}
          </div>
        </div>
      </form>

      {/* Ergebnisliste */}
      <section className="karte" style={{ '--i': 1 }}>
        {auftraege.length === 0 ? (
          <p className="leer"><i className="bi bi-search text-leise" />Keine Meldungen gefunden. Passen Sie ggf. die Filter an.</p>
        ) : (
          <div className="tabelle-rahmen">
            <table className="tabelle">
              <thead>
                <tr>
                  <th className="zahl">Nr.</th>
                  <th>Maschine / Beschreibung</th>
                  <th className="d-none d-lg-table-cell">Ursache</th>
                  <th>Priorität</th>
                  <th>Status</th>
                  <th className="d-none d-lg-table-cell">Techniker</th>
                  <th className="d-none d-md-table-cell">Gemeldet</th>
                  <th className="d-none d-md-table-cell" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {auftraege.map((a) => (
                  <tr key={a.auftrag_id} className="klickbar">
                    <td className="zahl klein">{a.meldung_id}</td>
                    <td>
                      <Link className="zeilen-link" href={`/auftraege/${a.auftrag_id}`}>{a.maschine}</Link>
                      <div className="klein text-truncate beschreibung-kurz">{a.beschreibung}</div>
                    </td>
                    <td className="d-none d-lg-table-cell klein">{a.ursache_kategorie}</td>
                    <td><PrioritaetPill prioritaet={a.prioritaet} /></td>
                    <td>
                      <StatusPill status={a.status} />
                      {/* Auf Tablets steht der Techniker unter dem Status statt in eigener Spalte */}
                      {a.techniker && <div className="klein mt-1 d-lg-none">{a.techniker}</div>}
                    </td>
                    <td className="d-none d-lg-table-cell klein">{a.techniker ?? '–'}</td>
                    <td className="d-none d-md-table-cell klein">{datumZeit(a.zeitpunkt)}</td>
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
