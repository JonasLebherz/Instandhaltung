/**
 * lib/sprache/server.js – aktuelle Sprache auf dem Server
 *
 * Die gewählte Sprache steht im Cookie "sprache" ('de' oder 'en').
 * Gesetzt wird es im Browser über die Seitenleiste bzw. die Login-Seite.
 *
 *     const t = await uebersetzer();
 *     t('Übersicht')   // "Overview" oder "Übersicht"
 */
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { spracheAus, uebersetzerFuer } from './index';

/** 'de' oder 'en' – pro Anfrage nur einmal gelesen (cache) */
export const aktuelleSprache = cache(async () => spracheAus((await cookies()).get('sprache')?.value));

/** Übersetzungsfunktion für die aktuelle Anfrage */
export async function uebersetzer() {
  return uebersetzerFuer(await aktuelleSprache());
}

/** Seitentitel in der aktuellen Sprache – für generateMetadata() der Seiten */
export async function seitentitel(text) {
  const t = await uebersetzer();
  return { title: t(text) };
}
