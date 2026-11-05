/**
 * app/qr/page.js – QR-Etiketten zum Ausdrucken
 *
 * Jedes Etikett zeigt einen QR-Code mit der Adresse /melden?maschine=<id>. Mit dem Handy
 * gescannt, öffnet sich direkt das Meldeformular für genau diese Maschine.
 * Aufruf: /qr?maschine=12 (ein Etikett), /qr?werk=alb&halle=h1 (alle einer Halle) oder /qr?werk=alb.
 * „Drucken“ öffnet den Druckdialog des Browsers – dort auch „Als PDF speichern“.
 * Beim Drucken sind Seitenleiste und Knöpfe ausgeblendet (@media print in globals.css).
 */
import Link from 'next/link';
import { headers } from 'next/headers';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { uebersetzer, seitentitel } from '@/lib/sprache/server';
import QrCode from '@/components/QrCode';
import Logo, { PRODUKTNAME } from '@/components/Logo';
import { MASCHINEN_SYMBOLE } from '@/lib/konstanten';
import DruckKnopf from './DruckKnopf';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => seitentitel('QR-Etiketten');

export default async function QrSeite({ searchParams }) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const q = await searchParams;
  const maschineId = /^\d+$/.test(q.maschine ?? '') ? Number(q.maschine) : null;
  const werk = typeof q.werk === 'string' ? q.werk.toUpperCase().slice(0, 10) : null;
  const halle = typeof q.halle === 'string' ? q.halle.toUpperCase().slice(0, 10) : null;

  const bedingung = maschineId ? sql`m.id = ${maschineId}`
    : werk && halle ? sql`st.kuerzel = ${werk} AND g.kuerzel = ${halle}`
      : werk ? sql`st.kuerzel = ${werk}` : sql`FALSE`;
  const maschinen = await sql`
    SELECT m.id, m.anlagennummer, m.bezeichnung, m.typ::text AS typ, g.kuerzel AS halle, g.bezeichnung AS gebaeude, st.name AS standort
    FROM maschine m JOIN gebaeude g ON g.id = m.gebaeude_id JOIN standort st ON st.id = g.standort_id
    WHERE ${bedingung}
    ORDER BY m.anlagennummer
    LIMIT 120`;

  // Vollständige Adresse für den QR-Code (Domain der App, z. B. bei Vercel)
  const h = await headers();
  const basis = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;

  return (
    <>
      <div className="seitenkopf nicht-drucken">
        <h1>{t('QR-Etiketten')}</h1>
        <p>{t('Ausdrucken und an die Maschine kleben. Mit dem Handy scannen öffnet direkt „Störung melden“ für diese Maschine.')}</p>
      </div>
      <div className="d-flex gap-2 flex-wrap mb-4 nicht-drucken">
        <DruckKnopf />
        <Link href={maschineId ? `/maschinen/${maschineId}` : '/maschinen'} className="btn btn-sekundaer">{t('Zurück')}</Link>
        <span className="klein align-self-center">{t('Tipp: Im Druckdialog „Als PDF speichern“ wählen.')}</span>
      </div>
      {maschinen.length === 0 ? (
        <p className="leer">{t('Keine Maschinen gefunden.')}</p>
      ) : (
        <div className="qr-etiketten">
          {maschinen.map((m) => (
            // Etikett 90 × 55 mm (beim Drucken): Kopfband, QR-Code, Maschine, Anleitung
            <article key={m.id} className="qr-etikett">
              <header className="qr-band">
                <Logo groesse={18} />
                <span>{PRODUKTNAME}</span>
                <strong>{t('Störung melden')}</strong>
              </header>
              <div className="qr-inhalt">
                <QrCode text={`${basis}/melden?maschine=${m.id}`} titel={t('QR-Code für {name}', { name: m.anlagennummer })} />
                <div className="qr-text">
                  <span className="qr-nummer">{m.anlagennummer}</span>
                  <span className="qr-name">{m.bezeichnung}</span>
                  <span className="qr-typ"><i className={`bi ${MASCHINEN_SYMBOLE[m.typ] ?? 'bi-gear'}`} aria-hidden="true" /> {t(m.typ)}</span>
                  <span className="qr-ort">{m.standort} · {m.halle}</span>
                </div>
              </div>
              <footer className="qr-schritte">
                <span><b>1</b> {t('Kamera öffnen')}</span>
                <span><b>2</b> {t('Code scannen')}</span>
                <span><b>3</b> {t('Störung beschreiben')}</span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
