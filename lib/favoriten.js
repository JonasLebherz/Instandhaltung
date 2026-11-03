'use client';
/**
 * lib/favoriten.js – angepinnte Ansichten der Störungskarte (Favoriten)
 *
 * Angelegt wird ein Favorit nur über den Pin-Knopf in der Karte (components/karten/KartenExplorer.js),
 * angezeigt, umbenannt und entfernt in der Seitenleiste (components/Favoriten.js).
 * Gespeichert im Browser (localStorage "kartenfavoriten"), höchstens 10 Stück.
 *
 * Ein Favorit: { id, name, art: 'welt'|'land'|'werk'|'halle', ansicht: '2d'|'3d', adresse }
 * adresse ist die vollständige Kartenadresse mit Ansicht, z. B. /karte?werk=alb&halle=h1&ansicht=3d.
 * Nach jeder Änderung wird das Ereignis "favoritenwechsel" ausgelöst – Karte und Seitenleiste lesen dann neu.
 */
const SCHLUESSEL = 'kartenfavoriten';
export const MAX_FAVORITEN = 10;
export const FAVORITEN_WECHSEL = 'favoritenwechsel';
// Favorit anklicken, während die Karte offen ist: Die Karte springt selbst dorthin (detail = Adresse)
export const FAVORIT_OEFFNEN = 'kartenfavorit';

export function favoritenLesen() {
  try {
    const liste = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '[]');
    // Nur gültige Einträge übernehmen (der Speicher kann von Hand verändert worden sein)
    return Array.isArray(liste)
      ? liste.filter((f) => f && typeof f.adresse === 'string' && f.adresse.startsWith('/karte') && typeof f.name === 'string').slice(0, MAX_FAVORITEN)
      : [];
  } catch {
    return [];
  }
}

function speichern(liste) {
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(liste)); } catch { /* z. B. privater Modus */ }
  window.dispatchEvent(new Event(FAVORITEN_WECHSEL));
}

/** Gibt { ok: true, favorit } oder { ok: false, grund: 'voll' } zurück. Gleiche Adresse wird nicht doppelt angelegt. */
export function favoritHinzufuegen({ name, art, ansicht, adresse }) {
  const liste = favoritenLesen();
  const vorhanden = liste.find((f) => f.adresse === adresse);
  if (vorhanden) return { ok: true, favorit: vorhanden };
  if (liste.length >= MAX_FAVORITEN) return { ok: false, grund: 'voll' };
  const favorit = { id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, art, ansicht, adresse };
  speichern([...liste, favorit]);
  return { ok: true, favorit };
}

export function favoritEntfernen(id) {
  speichern(favoritenLesen().filter((f) => f.id !== id));
}

export function favoritUmbenennen(id, name) {
  const neu = name.trim().slice(0, 60);
  if (!neu) return;
  speichern(favoritenLesen().map((f) => (f.id === id ? { ...f, name: neu } : f)));
}

/** Symbol je Ebene (Bootstrap Icons) */
export const FAVORIT_SYMBOLE = { welt: 'bi-globe2', land: 'bi-flag', werk: 'bi-buildings', halle: 'bi-box' };
