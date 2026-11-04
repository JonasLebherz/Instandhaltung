'use client';
/**
 * app/maschinen/[id]/MaschinenWartung.js – Wartungspläne dieser Maschine
 *
 * Je Plan: Aufgabe, Intervall, letzte Durchführung, nächste Fälligkeit (rot = überfällig).
 * „Erledigt“ trägt die Wartung heute ein, der Papierkorb schaltet den Plan ab
 * (Server-Aktionen wartungErledigen / wartungsplanEntfernen, danach lädt die Seite neu).
 */
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/SpracheKontext';
import { datum } from '@/lib/format';
import { wartungErledigen, wartungsplanEntfernen } from '@/app/aktionen';

export default function MaschinenWartung({ plaene, darf }) {
  const t = useT();
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [meldung, setMeldung] = useState(null);

  const ausfuehren = (aufgabe) => starte(async () => {
    const antwort = await aufgabe();
    setMeldung(antwort?.fehler ?? null);
    router.refresh();
  });

  const faellig = (p) => (p.tage_bis < 0 ? t('seit {n} Tagen überfällig', { n: -p.tage_bis })
    : p.tage_bis === 0 ? t('heute fällig') : t('fällig am {datum}', { datum: datum(p.faellig, t.sprache) }));

  return (
    <section className="karte h-100" style={{ '--i': 8 }}>
      <div className="karte-kopf">
        <h2 className="abschnitt-titel mb-0">{t('Wartungsplan')}</h2>
        <Link href="/wartung" className="klein">{t('Zum Kalender')}</Link>
      </div>
      {meldung && <div className="hinweis hinweis-fehler mb-2" role="alert"><span className="hinweis-text">{meldung}</span></div>}
      {plaene.length === 0 ? (
        <p className="leer"><i className="bi bi-calendar-x" aria-hidden="true" />{t('Für diese Maschine ist keine Wartung geplant.')}</p>
      ) : (
        <ul className="wartung-eintraege">
          {plaene.map((p) => {
            const art = p.tage_bis < 0 ? 'ueberfaellig' : p.tage_bis <= 7 ? 'faellig' : 'geplant';
            return (
              <li key={p.id} className={`wartung-eintrag art-${art}`}>
                <span className="wartung-text">
                  <strong>{p.aufgabe}</strong>
                  <span className="klein">
                    {t('alle {n} Tage', { n: p.intervall_tage })} · {t('{n} Min.', { n: p.dauer_min })}
                    {p.letzte && <> · {t('zuletzt {datum}', { datum: datum(p.letzte, t.sprache) })}</>}
                  </span>
                  <span className={`wartung-status ${art}`}>{faellig(p)}</span>
                </span>
                {darf && (
                  <>
                    <button type="button" className="rund-knopf wartung-erledigen" disabled={laeuft} onClick={() => ausfuehren(() => wartungErledigen(p.id))}
                            title={t('Als erledigt eintragen')} aria-label={t('{aufgabe} als erledigt eintragen', { aufgabe: p.aufgabe })}>
                      <i className="bi bi-check2" aria-hidden="true" />
                    </button>
                    <button type="button" className="rund-knopf wartung-entfernen" disabled={laeuft}
                            onClick={() => { if (window.confirm(t('Wartungsplan „{aufgabe}“ entfernen?', { aufgabe: p.aufgabe }))) ausfuehren(() => wartungsplanEntfernen(p.id)); }}
                            title={t('Plan entfernen')} aria-label={t('Plan „{aufgabe}“ entfernen', { aufgabe: p.aufgabe })}>
                      <i className="bi bi-trash3" aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
