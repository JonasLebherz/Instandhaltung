/**
 * lib/karten/ortszeit.js – Uhrzeit und Tageszeit am Standort (für den Tag-Nacht-Wechsel in 3D)
 *
 * Jedes Werk zeigt die echte Ortszeit: In Detroit kann es Nacht sein, während in Albstadt
 * die Sonne scheint. Zeitzone je Stadt (USA hat zwei Zeitzonen), sonst je Land.
 * Einfache Einteilung ohne Jahreszeiten:
 *   Nacht 21–6 Uhr · Dämmerung 6–7:30 und 19:30–21 Uhr · sonst Tag
 */
const JE_STADT = { Detroit: 'America/Detroit', Houston: 'America/Chicago' };
const JE_LAND = {
  DE: 'Europe/Berlin', FR: 'Europe/Paris', PL: 'Europe/Warsaw', RU: 'Europe/Moscow',
  US: 'America/New_York', MX: 'America/Mexico_City', CN: 'Asia/Shanghai', IN: 'Asia/Kolkata',
};

export function zeitzone(standort) {
  return JE_STADT[standort.stadt] ?? JE_LAND[standort.land] ?? 'Europe/Berlin';
}

/** { text: '14:05', phase: 'tag' | 'daemmerung' | 'nacht' } für den Standort zum Zeitpunkt jetzt */
export function ortszeit(standort, jetzt = new Date()) {
  const teile = new Intl.DateTimeFormat('de-DE', { timeZone: zeitzone(standort), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(jetzt);
  const stunde = Number(teile.find((x) => x.type === 'hour').value);
  const minute = Number(teile.find((x) => x.type === 'minute').value);
  const h = stunde + minute / 60;
  const phase = h < 6 || h >= 21 ? 'nacht' : h < 7.5 || h >= 19.5 ? 'daemmerung' : 'tag';
  return { text: `${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, phase };
}
