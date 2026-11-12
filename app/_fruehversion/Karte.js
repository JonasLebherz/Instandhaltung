/**
 * app/_fruehversion/Karte.js – Störungskarte der Versionen 2 und 3
 *
 * Funktion wie die Karte der App, nur ohne Zoom-Animation: Werk → Halle → Maschinen per Link
 * (?werk=<id>&halle=<id>), an jeder Stelle die Zahl offener Störungen.
 *  - Version 2: eingebettete Google-Karte (iframe, ohne Schlüssel) mit dem gewählten Werk
 *  - Version 3: eigene SVG-Karte von Deutschland mit Punkten je Werk (Größe/Farbe nach Störungen),
 *    Auslandswerke als Liste daneben
 * 3 Abfragen.
 */
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { idAus } from '@/lib/eingabe';
import { DEUTSCHLAND_PFAD, KARTE_BREITE, KARTE_HOEHE, projizieren } from '@/lib/karten/deutschland';
import Rahmen, { pfad, LeereZeile } from './Rahmen';
import { ZUSTAND } from './Maschinen';

/** Offene Störungen und höchste offene Priorität, für Werk (st), Halle (g) bzw. Maschine (m) */
const OFFEN = sql`COUNT(w.id) FILTER (WHERE w.status <> 'erledigt')::int AS offen, MAX(s.prioritaet) FILTER (WHERE w.status <> 'erledigt')::text AS hoechste`;

export default async function Karte({ version, searchParams }) {
  await benutzerPflicht();
  const q = await searchParams;
  const werkId = idAus(q.werk);
  const halleId = idAus(q.halle);
  const [werke, hallen, maschinen] = await Promise.all([
    sql`SELECT st.id, st.name, st.stadt, st.land_kuerzel AS land, st.breitengrad, st.laengengrad, ${OFFEN}
        FROM standort st LEFT JOIN gebaeude g ON g.standort_id = st.id LEFT JOIN maschine m ON m.gebaeude_id = g.id
        LEFT JOIN stoermeldung s ON s.maschine_id = m.id LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
        GROUP BY st.id ORDER BY st.land_kuerzel <> 'DE', st.land_kuerzel, st.name`,
    werkId ? sql`SELECT g.id, g.kuerzel, g.bezeichnung, ${OFFEN}
        FROM gebaeude g LEFT JOIN maschine m ON m.gebaeude_id = g.id
        LEFT JOIN stoermeldung s ON s.maschine_id = m.id LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
        WHERE g.standort_id = ${werkId} GROUP BY g.id ORDER BY g.kuerzel` : [],
    halleId ? sql`SELECT m.id, m.anlagennummer, m.bezeichnung, m.typ::text AS typ, ${OFFEN}
        FROM maschine m LEFT JOIN stoermeldung s ON s.maschine_id = m.id LEFT JOIN wartungsauftrag w ON w.stoermeldung_id = s.id
        WHERE m.gebaeude_id = ${halleId} GROUP BY m.id ORDER BY m.anlagennummer` : [],
  ]);
  const werk = werke.find((w) => w.id === werkId) ?? null;
  const halle = hallen.find((h) => h.id === halleId) ?? null;
  const v3 = version === 'v3';
  const kartenWerk = werk ?? werke[0];

  return (
    <Rahmen version={version} titel="Störungskarte" emoji="🗺️">
      <p>
        <a href={pfad(version, '/karte')}>Alle Werke</a>
        {werk && <> » <a href={pfad(version, `/karte?werk=${werk.id}`)}>{werk.name}</a></>}
        {halle && <> » {halle.bezeichnung}</>}
      </p>

      <div className="fv-spalten">
        <div>
          {v3 ? (
            // Eigene Karte: Umriss Deutschland, Punkt je deutschem Werk (rot bei hoher Priorität, Größe nach Anzahl)
            <svg className="fv-svg-karte" viewBox={`0 0 ${KARTE_BREITE} ${KARTE_HOEHE}`} role="img" aria-label="Karte der Werke in Deutschland">
              <path d={DEUTSCHLAND_PFAD} className="fv-land" />
              {werke.filter((w) => w.land === 'DE').map((w) => {
                const p = projizieren(w.breitengrad, w.laengengrad);
                return (
                  <a key={w.id} href={pfad(version, `/karte?werk=${w.id}`)}>
                    <circle cx={p.x} cy={p.y} r={10 + Math.min(w.offen, 10) * 2} className={`fv-punkt fv-punkt-${w.hoechste ?? 'keine'}${w.id === werkId ? ' fv-punkt-aktiv' : ''}`} />
                    <text x={p.x} y={p.y + 5} textAnchor="middle" className="fv-punkt-zahl">{w.offen}</text>
                    <title>{`${w.name}: ${w.offen} offen`}</title>
                  </a>
                );
              })}
            </svg>
          ) : (
            // Version 2: Google Maps eingebettet (ohne API-Schlüssel), zeigt das gewählte bzw. erste Werk
            <iframe className="fv-google" title={`Karte: ${kartenWerk.name}`} loading="lazy" referrerPolicy="no-referrer"
                    src={`https://maps.google.com/maps?q=${kartenWerk.breitengrad},${kartenWerk.laengengrad}&z=15&output=embed`} />
          )}
        </div>

        <div>
          {!werk && (
            <table className="fv-tabelle" id="fv-werke">
              <thead><tr><th>Land</th><th>Werk</th><th>Stadt</th><th>Offen</th></tr></thead>
              <tbody>
                {werke.map((w) => (
                  <tr key={w.id}>
                    <td>{w.land}</td><td><a href={pfad(version, `/karte?werk=${w.id}`)}>{w.name}</a></td><td>{w.stadt}</td>
                    <td><span className={`fv-badge fv-prio-${w.hoechste ?? 'keine'}`}>{w.offen}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {werk && !halle && (
            <table className="fv-tabelle" id="fv-hallen">
              <thead><tr><th>Gebäude</th><th>Bezeichnung</th><th>Offen</th></tr></thead>
              <tbody>
                {hallen.length === 0 && <LeereZeile spalten={3} />}
                {hallen.map((h) => (
                  <tr key={h.id}>
                    <td>{h.kuerzel}</td><td><a href={pfad(version, `/karte?werk=${werk.id}&halle=${h.id}`)}>{h.bezeichnung}</a></td>
                    <td><span className={`fv-badge fv-prio-${h.hoechste ?? 'keine'}`}>{h.offen}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {halle && (
            <table className="fv-tabelle" id="fv-hallen-maschinen">
              <thead><tr><th>Anlage</th><th>Maschine</th><th>Zustand</th><th>Offen</th></tr></thead>
              <tbody>
                {maschinen.map((m) => (
                  <tr key={m.id}>
                    <td><a href={pfad(version, `/maschinen/${m.id}`)}>{m.anlagennummer}</a></td><td>{m.bezeichnung}</td>
                    <td><span className={`fv-badge fv-prio-${m.hoechste ?? 'keine'}`}>{ZUSTAND[m.hoechste] ?? 'läuft'}</span></td><td>{m.offen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Rahmen>
  );
}
