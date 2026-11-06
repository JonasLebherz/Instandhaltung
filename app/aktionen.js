'use server';
/**
 * app/aktionen.js – alle Aktionen, die Daten verändern (Server-Aktionen)
 *
 * Server-Aktionen laufen ausschließlich auf dem Server. Formulare im Browser
 * rufen sie auf; Next.js schützt sie dabei automatisch gegen Aufrufe von
 * fremden Webseiten (ähnlich einem CSRF-Token).
 *
 * Ablauf jeder Aktion:
 *   1. Ist jemand angemeldet?           → benutzerPflicht()
 *   2. Eingaben prüfen                  → bei Fehlern { fehler, eingabe } zurückgeben
 *   3. Speichern (bei Bedarf in einer Transaktion)
 *   4. Hinweis merken (flash) und weiterleiten
 *
 * Aktionen:
 *   meldungAnlegen   – neue Störmeldung + Wartungsauftrag
 *   auftragSpeichern – Techniker, Status, Zeiten, Maßnahme
 *   teilBuchen       – Ersatzteil buchen bzw. automatisch bestellen
 *   lieferungBuchen  – Wareneingang einer Bestellung
 *   nachrichtSenden, nachrichtenGelesen – Chat zwischen Personen (Seite „Mitarbeiter“, ohne Weiterleitung)
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { uebersetzer } from '@/lib/sprache/server';
import { aktuellePerson, darfBearbeiten } from '@/lib/person';
import { flash } from '@/lib/flash';
import { berlinZuDate, datumZeit } from '@/lib/format';
import { URSACHEN_LISTE, PRIORITAET_WERTE, STATUS_WERTE } from '@/lib/konstanten';

/** Text aus einem Formularfeld, ohne Leerzeichen am Anfang und Ende */
const feld = (formular, name) => String(formular.get(name) ?? '').trim();

/** Ganze Zahl aus einem Formularfeld oder null */
function ganzzahl(text) {
  return /^\d+$/.test(text) ? Number(text) : null;
}

/* =====================================================================
 * Störmeldung anlegen
 * ================================================================== */
/* =====================================================================
 * Fotos prüfen (Störmeldung): höchstens 3, je höchstens 1,5 MB, nur JPEG/PNG/WebP.
 * Der Typ wird an den ersten Bytes erkannt, nicht an der Dateiendung.
 * Gibt { fotos: [{ daten, mime }] } oder { fehler } zurück.
 * ================================================================== */
const MAX_FOTOS = 3;
async function fotosPruefen(formular, t, vorhanden = 0) {
  const dateien = formular.getAll('fotos').filter((d) => typeof d === 'object' && d.size > 0);
  if (dateien.length + vorhanden > MAX_FOTOS) return { fehler: t('Höchstens {n} Fotos je Meldung.', { n: MAX_FOTOS }) };
  const fotos = [];
  for (const datei of dateien) {
    if (datei.size > 1500000) return { fehler: t('Ein Foto ist zu groß (höchstens 1,5 MB).') };
    const daten = Buffer.from(await datei.arrayBuffer());
    const mime = daten[0] === 0xff && daten[1] === 0xd8 ? 'image/jpeg'
      : daten.subarray(0, 4).toString('hex') === '89504e47' ? 'image/png'
        : daten.subarray(0, 4).toString() === 'RIFF' && daten.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!mime) return { fehler: t('Nur Fotos im Format JPEG, PNG oder WebP.') };
    fotos.push({ daten, mime });
  }
  return { fotos };
}

export async function meldungAnlegen(vorherigerZustand, formular) {
  await benutzerPflicht();
  const t = await uebersetzer();   // Meldungen in der gewählten Sprache
  const person = await aktuellePerson();   // für den Verlauf: wer meldet

  const eingabe = {
    maschine_id: feld(formular, 'maschine_id'),
    gemeldet_von: feld(formular, 'gemeldet_von'),
    zeitpunkt: feld(formular, 'zeitpunkt'),
    beschreibung: feld(formular, 'beschreibung'),
    ursache_kategorie: feld(formular, 'ursache_kategorie'),
    prioritaet: feld(formular, 'prioritaet'),
  };
  const fehler = {};

  // Maschine: muss eine existierende Maschine sein
  const maschineId = ganzzahl(eingabe.maschine_id);
  if (eingabe.maschine_id === '') {
    fehler.maschine_id = t('Bitte eine Maschine auswählen.');
  } else {
    const [treffer] = maschineId ? await sql`SELECT id FROM maschine WHERE id = ${maschineId}` : [];
    if (!treffer) fehler.maschine_id = t('Die gewählte Maschine existiert nicht.');
  }

  // Name der meldenden Person
  if (eingabe.gemeldet_von === '') fehler.gemeldet_von = t('Bitte Ihren Namen angeben.');
  else if (eingabe.gemeldet_von.length > 100) fehler.gemeldet_von = t('Der Name darf höchstens 100 Zeichen lang sein.');

  // Zeitpunkt: gültig und nicht in der Zukunft (5 Minuten Toleranz)
  const zeitpunkt = berlinZuDate(eingabe.zeitpunkt);
  if (!zeitpunkt) fehler.zeitpunkt = t('Bitte einen gültigen Zeitpunkt angeben.');
  else if (zeitpunkt.getTime() > Date.now() + 5 * 60000) fehler.zeitpunkt = t('Der Zeitpunkt darf nicht in der Zukunft liegen.');

  // Beschreibung: aussagekräftig, aber nicht endlos
  const laenge = eingabe.beschreibung.length;
  if (laenge === 0) fehler.beschreibung = t('Bitte die Störung beschreiben.');
  else if (laenge < 10) fehler.beschreibung = t('Die Beschreibung ist zu kurz (mindestens 10 Zeichen).');
  else if (laenge > 1000) fehler.beschreibung = t('Die Beschreibung darf höchstens 1000 Zeichen lang sein.');

  // Ursache und Priorität: nur Werte aus den festen Listen
  if (!URSACHEN_LISTE.includes(eingabe.ursache_kategorie)) fehler.ursache_kategorie = t('Bitte eine Ursache auswählen.');
  if (!PRIORITAET_WERTE.includes(eingabe.prioritaet)) fehler.prioritaet = t('Bitte eine Priorität auswählen.');

  // Fotos (optional)
  const fotoPruefung = await fotosPruefen(formular, t);
  if (fotoPruefung.fehler) fehler.fotos = fotoPruefung.fehler;

  if (Object.keys(fehler).length > 0) {
    return { fehler, eingabe };
  }

  // Meldung und Auftrag gehören zusammen → gemeinsam in einer Transaktion speichern.
  // Schlägt ein Schritt fehl, wird automatisch alles zurückgenommen.
  let meldungId;
  try {
    meldungId = await sql.begin(async (tx) => {
      const [meldung] = await tx`
        INSERT INTO stoermeldung (maschine_id, gemeldet_von, zeitpunkt, beschreibung, ursache_kategorie, prioritaet)
        VALUES (${maschineId}, ${eingabe.gemeldet_von}, ${zeitpunkt}, ${eingabe.beschreibung},
                ${eingabe.ursache_kategorie}, ${eingabe.prioritaet})
        RETURNING id`;
      // Zu jeder Meldung gehört genau ein Wartungsauftrag
      const [auftrag] = await tx`INSERT INTO wartungsauftrag (stoermeldung_id, status) VALUES (${meldung.id}, 'gemeldet') RETURNING id`;
      // Verlauf: wer hat gemeldet (gewählte Person, falls vorhanden)
      await tx`INSERT INTO auftrag_verlauf (auftrag_id, person_id, aktion) VALUES (${auftrag.id}, ${person?.id ?? null}, 'gemeldet')`;
      for (const foto of fotoPruefung.fotos) {
        await tx`INSERT INTO stoermeldung_foto (stoermeldung_id, datei, mime, person_id) VALUES (${meldung.id}, ${foto.daten}, ${foto.mime}, ${person?.id ?? null})`;
      }
      return meldung.id;
    });
  } catch (fehlerObjekt) {
    console.error(fehlerObjekt);
    return { fehler: { allgemein: t('Die Meldung konnte nicht gespeichert werden. Bitte erneut versuchen.') }, eingabe };
  }

  await flash('erfolg', t('Störmeldung Nr. {n} wurde erfasst. Die Instandhaltung ist informiert.', { n: meldungId }));
  revalidatePath('/', 'layout');
  redirect('/');
}

/* =====================================================================
 * Auftrag speichern (Techniker, Status, Zeiten, Maßnahme)
 *
 * Regeln:
 *  - Ab Status "zugewiesen" muss ein Techniker eingetragen sein.
 *  - Techniker eingetragen und Status noch "gemeldet" → automatisch "zugewiesen".
 *  - Ab "in Arbeit" wird der Arbeitsbeginn automatisch gesetzt (falls leer).
 *  - Für "erledigt" sind Maßnahme, Arbeitsbeginn und Endzeit Pflicht.
 * ================================================================== */
export async function auftragSpeichern(auftragId, vorherigerZustand, formular) {
  await benutzerPflicht();
  const t = await uebersetzer();   // Meldungen in der gewählten Sprache

  const eingabe = {
    techniker_id: feld(formular, 'techniker_id'),
    status: feld(formular, 'status'),
    start_zeit: feld(formular, 'start_zeit'),
    ende_zeit: feld(formular, 'ende_zeit'),
    massnahme: feld(formular, 'massnahme'),
  };
  const fehler = {};

  // Produktion darf melden, aber keine Aufträge bearbeiten
  const person = await aktuellePerson();
  if (!darfBearbeiten(person)) {
    return { fehler: { allgemein: t('Als Person aus der Produktion kannst du Störungen melden, aber keine Aufträge bearbeiten.') }, eingabe };
  }

  const [auftrag] = await sql`
    SELECT w.id, w.techniker_id, w.status, w.start_zeit, w.ende_zeit, w.massnahme, s.zeitpunkt
    FROM wartungsauftrag w
    JOIN stoermeldung s ON s.id = w.stoermeldung_id
    WHERE w.id = ${auftragId}`;
  if (!auftrag) return { fehler: { allgemein: t('Der Auftrag wurde nicht gefunden.') }, eingabe };

  // Techniker: leer oder ein existierender Techniker
  let technikerId = null;
  if (eingabe.techniker_id !== '') {
    const id = ganzzahl(eingabe.techniker_id);
    const [treffer] = id ? await sql`SELECT id FROM techniker WHERE id = ${id}` : [];
    if (treffer) technikerId = id;
    else fehler.techniker_id = t('Der gewählte Techniker existiert nicht.');
  }

  // Status: nur erlaubte Werte
  let status = eingabe.status;
  if (!STATUS_WERTE.includes(status)) fehler.status = t('Ungültiger Status.');

  // Automatik: Techniker eingetragen, Status noch "gemeldet" → "zugewiesen"
  if (technikerId !== null && status === 'gemeldet') {
    status = 'zugewiesen';
    eingabe.status = status;
  }

  // Ab "zugewiesen" wird ein Techniker benötigt
  if (status !== 'gemeldet' && technikerId === null && !fehler.techniker_id) {
    fehler.techniker_id = t('Für diesen Status muss ein Techniker zugewiesen sein.');
  }

  // Arbeitsbeginn
  let startZeit = null;
  if (eingabe.start_zeit !== '') {
    startZeit = berlinZuDate(eingabe.start_zeit);
    if (!startZeit) fehler.start_zeit = t('Bitte einen gültigen Zeitpunkt angeben.');
    else if (startZeit < auftrag.zeitpunkt) {
      fehler.start_zeit = t('Der Arbeitsbeginn kann nicht vor der Störmeldung liegen ({zeit}).', { zeit: datumZeit(auftrag.zeitpunkt, t.sprache) });
    }
  } else if (status === 'in Arbeit' || status === 'wartet auf Teil') {
    startZeit = new Date();   // Arbeit beginnt jetzt
  }

  // Endzeit und Maßnahme – nur beim Abschluss relevant
  let endeZeit = null;
  if (status === 'erledigt') {
    if (startZeit === null && !fehler.start_zeit) fehler.start_zeit = t('Bitte den Arbeitsbeginn angeben.');

    endeZeit = berlinZuDate(eingabe.ende_zeit);
    if (eingabe.ende_zeit === '') fehler.ende_zeit = t('Bitte die Endzeit der Reparatur angeben.');
    else if (!endeZeit) fehler.ende_zeit = t('Bitte einen gültigen Zeitpunkt angeben.');
    else if (endeZeit.getTime() > Date.now() + 5 * 60000) fehler.ende_zeit = t('Die Endzeit darf nicht in der Zukunft liegen.');
    else if (startZeit && endeZeit < startZeit) fehler.ende_zeit = t('Die Endzeit muss nach dem Arbeitsbeginn liegen.');

    if (eingabe.massnahme.length < 5) {
      fehler.massnahme = t('Bitte die durchgeführte Maßnahme beschreiben (mindestens 5 Zeichen).');
    }
  } else {
    eingabe.ende_zeit = '';   // Auftrag (wieder) offen → keine Endzeit
  }
  if (eingabe.massnahme.length > 2000) fehler.massnahme = t('Die Maßnahme darf höchstens 2000 Zeichen lang sein.');

  if (Object.keys(fehler).length > 0) {
    return { fehler, eingabe };
  }

  // Was hat sich geändert? → Einträge für den Verlauf
  const neuerTechniker = technikerId !== auftrag.techniker_id;
  const neuerStatus = status !== auftrag.status;
  const massnahme = eingabe.massnahme !== '' ? eingabe.massnahme : null;
  const sonstiges = massnahme !== auftrag.massnahme
    || String(startZeit?.getTime() ?? '') !== String(auftrag.start_zeit?.getTime() ?? '')
    || String(endeZeit?.getTime() ?? '') !== String(auftrag.ende_zeit?.getTime() ?? '');

  // Auftrag und Verlauf zusammen speichern
  await sql.begin(async (tx) => {
    await tx`
      UPDATE wartungsauftrag
      SET techniker_id   = ${technikerId},
          status         = ${status},
          start_zeit     = ${startZeit},
          ende_zeit      = ${endeZeit},
          massnahme      = ${massnahme},
          -- Wer den Techniker zugewiesen hat, merken (nur bei einer neuen Zuweisung)
          zugewiesen_von = ${neuerTechniker ? (technikerId === null ? null : person?.id ?? null) : sql`zugewiesen_von`}
      WHERE id = ${auftragId}`;
    const personId = person?.id ?? null;
    if (neuerTechniker && technikerId !== null) {
      const [tech] = await tx`SELECT name FROM techniker WHERE id = ${technikerId}`;
      await tx`INSERT INTO auftrag_verlauf (auftrag_id, person_id, aktion, details) VALUES (${auftragId}, ${personId}, 'zugewiesen', ${tech.name})`;
      // Chat: Die zuweisende Person schreibt dem Techniker automatisch eine Nachricht mit dem Auftrag
      // (nur mit gewählter Person und nicht an sich selbst – Nachrichten haben immer einen Absender)
      const [empfaenger] = await tx`SELECT id FROM person WHERE techniker_id = ${technikerId}`;
      if (personId && empfaenger && empfaenger.id !== personId) {
        const [info] = await tx`
          SELECT m.anlagennummer, m.bezeichnung, s.beschreibung FROM wartungsauftrag w
          JOIN stoermeldung s ON s.id = w.stoermeldung_id JOIN maschine m ON m.id = s.maschine_id WHERE w.id = ${auftragId}`;
        const text = t('Neuer Auftrag für dich: {maschine} ({nummer}) – {beschreibung}', {
          maschine: info.bezeichnung, nummer: info.anlagennummer,
          beschreibung: info.beschreibung.length > 120 ? `${info.beschreibung.slice(0, 117)}…` : info.beschreibung,
        });
        await tx`INSERT INTO nachricht (von_id, an_id, text, auftrag_id) VALUES (${personId}, ${empfaenger.id}, ${text}, ${auftragId})`;
      }
    }
    if (neuerStatus) {
      await tx`INSERT INTO auftrag_verlauf (auftrag_id, person_id, aktion, details) VALUES (${auftragId}, ${personId}, 'status', ${status})`;
    }
    if (!neuerTechniker && !neuerStatus && sonstiges) {
      await tx`INSERT INTO auftrag_verlauf (auftrag_id, person_id, aktion) VALUES (${auftragId}, ${personId}, 'bearbeitet')`;
    }
  });

  await flash('erfolg', status === 'erledigt' ? t('Auftrag abgeschlossen. Danke!') : t('Änderungen gespeichert. Status: {status}.', { status: t(status) }));
  revalidatePath('/', 'layout');
  redirect(`/auftraege/${auftragId}`);
}

/* =====================================================================
 * Ersatzteil buchen
 *  - Genug auf Lager:   Bestand reduzieren, Teil dem Auftrag zuordnen.
 *  - Nicht genug Lager: nichts buchen, Auftrag → "wartet auf Teil",
 *                       Bestellung anlegen (falls noch keine offen ist).
 * ================================================================== */
export async function teilBuchen(auftragId, vorherigerZustand, formular) {
  await benutzerPflicht();
  const t = await uebersetzer();   // Meldungen in der gewählten Sprache

  const eingabe = { ersatzteil_id: feld(formular, 'ersatzteil_id'), menge: feld(formular, 'menge') };
  const fehler = {};

  const teilId = ganzzahl(eingabe.ersatzteil_id);
  const menge = ganzzahl(eingabe.menge);
  if (teilId === null) fehler.ersatzteil_id = t('Bitte ein Ersatzteil auswählen.');
  if (menge === null || menge < 1 || menge > 999) fehler.menge = t('Bitte eine Menge zwischen 1 und 999 angeben.');

  const person = await aktuellePerson();
  if (!darfBearbeiten(person)) {
    fehler.allgemein = t('Als Person aus der Produktion kannst du Störungen melden, aber keine Aufträge bearbeiten.');
  }

  // Gebucht wird aus dem Lager des Werks, in dem die Maschine des Auftrags steht
  const [auftrag] = await sql`
    SELECT w.status, g.standort_id FROM wartungsauftrag w
    JOIN stoermeldung s ON s.id = w.stoermeldung_id JOIN maschine m ON m.id = s.maschine_id JOIN gebaeude g ON g.id = m.gebaeude_id
    WHERE w.id = ${auftragId}`;
  if (!auftrag) fehler.allgemein = t('Der Auftrag wurde nicht gefunden.');
  else if (auftrag.status === 'erledigt' && !fehler.allgemein) fehler.allgemein = t('Auf erledigte Aufträge können keine Teile mehr gebucht werden.');

  if (Object.keys(fehler).length > 0) return { fehler, eingabe };

  let ergebnis;
  try {
    // Alles in einer Transaktion: Bestand prüfen und ändern darf nicht durch
    // eine gleichzeitige Buchung eines Kollegen gestört werden.
    ergebnis = await sql.begin(async (tx) => {
      const werk = auftrag.standort_id;
      const [katalog] = await tx`SELECT id, bezeichnung FROM ersatzteil WHERE id = ${teilId}`;
      if (!katalog) return { art: 'unbekannt' };
      // Lagerzeile des Werks anlegen, falls das Teil dort noch nie geführt wurde, und sperren (FOR UPDATE)
      await tx`INSERT INTO lagerbestand (standort_id, ersatzteil_id) VALUES (${werk}, ${teilId}) ON CONFLICT DO NOTHING`;
      const [lager] = await tx`
        SELECT bestand, mindestbestand FROM lagerbestand WHERE standort_id = ${werk} AND ersatzteil_id = ${teilId} FOR UPDATE`;
      const teil = { ...katalog, ...lager };

      if (teil.bestand >= menge) {
        /* --- Fall A: genug auf Lager → buchen --- */
        await tx`UPDATE lagerbestand SET bestand = bestand - ${menge} WHERE standort_id = ${werk} AND ersatzteil_id = ${teilId}`;
        // Wurde das Teil schon einmal gebucht, wird die Menge addiert
        // (Primärschlüssel auftrag_id + ersatzteil_id).
        await tx`
          INSERT INTO auftrag_ersatzteil (auftrag_id, ersatzteil_id, menge)
          VALUES (${auftragId}, ${teilId}, ${menge})
          ON CONFLICT (auftrag_id, ersatzteil_id) DO UPDATE SET menge = auftrag_ersatzteil.menge + EXCLUDED.menge`;
        await tx`INSERT INTO auftrag_verlauf (auftrag_id, person_id, aktion, details)
                 VALUES (${auftragId}, ${person?.id ?? null}, 'teil', ${`${menge} × ${teil.bezeichnung}`})`;
        return { art: 'gebucht', teil, neuerBestand: teil.bestand - menge };
      }

      /* --- Fall B: nicht genug auf Lager → warten & bestellen --- */
      await tx`UPDATE wartungsauftrag SET status = 'wartet auf Teil', ende_zeit = NULL,
                      start_zeit = COALESCE(start_zeit, now())
               WHERE id = ${auftragId}`;
      if (auftrag.status !== 'wartet auf Teil') {
        await tx`INSERT INTO auftrag_verlauf (auftrag_id, person_id, aktion, details)
                 VALUES (${auftragId}, ${person?.id ?? null}, 'status', 'wartet auf Teil')`;
      }

      const [offen] = await tx`SELECT id FROM bestellung WHERE standort_id = ${werk} AND ersatzteil_id = ${teilId} AND status = 'bestellt' LIMIT 1`;
      if (offen) return { art: 'schon_bestellt', teil };

      // Bestellmenge: fehlende Menge + Mindestbestand wieder auffüllen
      const bestellmenge = (menge - teil.bestand) + teil.mindestbestand;
      await tx`INSERT INTO bestellung (ersatzteil_id, standort_id, menge, bestelldatum, status)
               VALUES (${teilId}, ${werk}, ${bestellmenge}, current_date, 'bestellt')`;
      return { art: 'bestellt', teil, bestellmenge };
    });
  } catch (fehlerObjekt) {
    console.error(fehlerObjekt);
    return { fehler: { allgemein: t('Die Buchung konnte nicht gespeichert werden.') }, eingabe };
  }

  const { teil } = ergebnis;
  switch (ergebnis.art) {
    case 'unbekannt':
      return { fehler: { ersatzteil_id: t('Das Ersatzteil existiert nicht.') }, eingabe };
    case 'gebucht':
      await flash('erfolg', t('{menge} × {teil} gebucht.', { menge, teil: teil.bezeichnung }));
      if (ergebnis.neuerBestand < teil.mindestbestand) {
        await flash('hinweis', t('Achtung: {teil} ist jetzt unter dem Mindestbestand ({bestand} von {mindest}).', { teil: teil.bezeichnung, bestand: ergebnis.neuerBestand, mindest: teil.mindestbestand }));
      }
      break;
    case 'schon_bestellt':
      await flash('hinweis', `${t('{teil} ist nicht ausreichend auf Lager (Bestand: {bestand}).', { teil: teil.bezeichnung, bestand: teil.bestand })} `
        + t('Es läuft bereits eine Bestellung. Der Auftrag wartet jetzt auf das Teil.'));
      break;
    case 'bestellt':
      await flash('hinweis', `${t('{teil} ist nicht ausreichend auf Lager (Bestand: {bestand}).', { teil: teil.bezeichnung, bestand: teil.bestand })} `
        + `${t('Es wurde eine Bestellung über {n} Stück angelegt.', { n: ergebnis.bestellmenge })} `
        + t('Der Auftrag wartet jetzt auf das Teil – bitte nach Lieferung erneut buchen.'));
      break;
    default:
  }
  revalidatePath('/', 'layout');
  redirect(`/auftraege/${auftragId}`);
}

/* =====================================================================
 * Wareneingang einer Bestellung buchen
 *  1. Bestellung als "geliefert" markieren, Lieferdatum = heute
 *  2. Lagerbestand um die Bestellmenge erhöhen
 * ================================================================== */
export async function lieferungBuchen(formular) {
  await benutzerPflicht();
  const t = await uebersetzer();   // Meldungen in der gewählten Sprache

  const bestellungId = ganzzahl(feld(formular, 'bestellung_id'));
  // Zurück zur Seite, von der gebucht wurde (Übersicht oder Lager) – nur feste Ziele, keine fremden Adressen
  const zurueck = feld(formular, 'zurueck');
  const ziel = /^\/lager(\?werk=\d+(&teil=\d+)?)?$/.test(zurueck) ? zurueck : '/';
  if (bestellungId === null) {
    await flash('fehler', t('Ungültige Bestellung.'));
    redirect(ziel);
  }

  let ergebnis = null;
  try {
    ergebnis = await sql.begin(async (tx) => {
      // Bestellung sperren, damit sie nicht doppelt gebucht wird
      const [bestellung] = await tx`
        SELECT b.id, b.ersatzteil_id, b.standort_id, b.menge, b.status, e.bezeichnung
        FROM bestellung b JOIN ersatzteil e ON e.id = b.ersatzteil_id
        WHERE b.id = ${bestellungId}
        FOR UPDATE OF b`;
      if (!bestellung || bestellung.status !== 'bestellt') return null;

      await tx`UPDATE bestellung SET status = 'geliefert', lieferdatum = current_date WHERE id = ${bestellungId}`;
      // Wareneingang ins Lager des Werks, für das bestellt wurde
      await tx`
        INSERT INTO lagerbestand (standort_id, ersatzteil_id, bestand) VALUES (${bestellung.standort_id}, ${bestellung.ersatzteil_id}, ${bestellung.menge})
        ON CONFLICT (standort_id, ersatzteil_id) DO UPDATE SET bestand = lagerbestand.bestand + EXCLUDED.bestand`;
      return bestellung;
    });
  } catch (fehlerObjekt) {
    console.error(fehlerObjekt);
    await flash('fehler', t('Der Wareneingang konnte nicht gespeichert werden.'));
    redirect(ziel);
  }

  if (ergebnis) {
    await flash('erfolg', `${t('Wareneingang gebucht: {menge} × {teil}.', { menge: ergebnis.menge, teil: ergebnis.bezeichnung })} `
      + t('Aufträge, die auf dieses Teil warten, können fortgesetzt werden.'));
  } else {
    await flash('fehler', t('Diese Bestellung ist nicht (mehr) offen.'));
  }
  revalidatePath('/', 'layout');
  redirect(ziel);
}

/* =====================================================================
 * Ersatzteil nachbestellen (Lager-Seite) – höchstens eine offene Bestellung je Teil
 * ================================================================== */
export async function teilNachbestellen(formular) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const person = await aktuellePerson();
  if (!darfBearbeiten(person)) {
    await flash('fehler', t('Als Person aus der Produktion kannst du keine Teile bestellen.'));
    redirect('/lager');
  }
  const teilId = ganzzahl(feld(formular, 'ersatzteil_id'));
  const werk = ganzzahl(feld(formular, 'standort_id'));
  const menge = ganzzahl(feld(formular, 'menge'));
  const zurueck = `/lager?werk=${werk ?? ''}&teil=${teilId ?? ''}`;
  if (teilId === null || werk === null || menge === null || menge < 1 || menge > 999) {
    await flash('fehler', t('Bitte eine Menge zwischen 1 und 999 angeben.'));
    redirect(zurueck);
  }
  // Höchstens eine offene Bestellung je Werk und Teil
  const [neu] = await sql`
    INSERT INTO bestellung (ersatzteil_id, standort_id, menge, bestelldatum, status)
    SELECT e.id, st.id, ${menge}, current_date, 'bestellt' FROM ersatzteil e, standort st
    WHERE e.id = ${teilId} AND st.id = ${werk}
      AND NOT EXISTS (SELECT 1 FROM bestellung b WHERE b.ersatzteil_id = e.id AND b.standort_id = st.id AND b.status = 'bestellt')
    RETURNING id`;
  if (neu) await flash('erfolg', t('Nachbestellung angelegt: {menge} Stück.', { menge }));
  else await flash('fehler', t('Für dieses Teil gibt es schon eine offene Bestellung.'));
  revalidatePath('/', 'layout');
  redirect(zurueck);
}

/* =====================================================================
 * Chat zwischen Personen (Seite „Mitarbeiter“)
 *
 * Anders als die übrigen Aktionen ohne Weiterleitung: Der Chat bleibt offen
 * und lädt den Verlauf selbst neu (/api/nachrichten). Absender ist immer die
 * gewählte Person – die ID wird mit der Datenbank abgeglichen, nie aus dem
 * Formular übernommen.
 * ================================================================== */
export async function nachrichtSenden(anId, text) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const ich = await aktuellePerson();
  if (!ich) return { fehler: t('Bitte zuerst eine Person wählen.') };
  const inhalt = String(text ?? '').trim();
  if (!inhalt) return { fehler: t('Bitte eine Nachricht eingeben.') };
  if (inhalt.length > 1000) return { fehler: t('Höchstens 1000 Zeichen.') };
  const an = Number(anId);
  if (!Number.isInteger(an) || an === ich.id) return { fehler: t('Empfänger ungültig.') };
  const [empfaenger] = await sql`SELECT id FROM person WHERE id = ${an}`;
  if (!empfaenger) return { fehler: t('Empfänger ungültig.') };
  await sql`INSERT INTO nachricht (von_id, an_id, text) VALUES (${ich.id}, ${an}, ${inhalt})`;
  return { ok: true };
}

/** Alle Nachrichten von „mitId“ an mich als gelesen markieren */
export async function nachrichtenGelesen(mitId) {
  await benutzerPflicht();
  const ich = await aktuellePerson();
  const mit = Number(mitId);
  if (!ich || !Number.isInteger(mit)) return { ok: false };
  await sql`UPDATE nachricht SET gelesen_am = now() WHERE an_id = ${ich.id} AND von_id = ${mit} AND gelesen_am IS NULL`;
  return { ok: true };
}

/* =====================================================================
 * Wartungsplan (Seite „Wartungsplan“ und Maschinen-Seite)
 *
 *  wartungErledigen     – geplante Wartung heute als erledigt eintragen (ohne Weiterleitung)
 *  wartungPlanen        – neuer Plan für eine Maschine (Formular mit useActionState, ohne Weiterleitung)
 *  wartungsplanEntfernen – Plan abschalten (bleibt für den Verlauf erhalten)
 * Produktion darf keine Wartungen eintragen oder planen (wie bei den Aufträgen).
 * ================================================================== */
export async function wartungErledigen(planId, notiz = '') {
  await benutzerPflicht();
  const t = await uebersetzer();
  const person = await aktuellePerson();
  if (!darfBearbeiten(person)) return { fehler: t('Als Person aus der Produktion kannst du keine Wartungen eintragen.') };
  const id = Number(planId);
  if (!Number.isInteger(id)) return { fehler: t('Ungültiger Wartungsplan.') };
  const text = String(notiz ?? '').trim().slice(0, 300) || null;
  // Höchstens einmal pro Tag und Plan (doppelte Klicks)
  const [neu] = await sql`
    INSERT INTO wartung_durchfuehrung (plan_id, datum, person_id, notiz)
    SELECT p.id, current_date, ${person?.id ?? null}, ${text} FROM wartungsplan p
    WHERE p.id = ${id} AND p.aktiv
      AND NOT EXISTS (SELECT 1 FROM wartung_durchfuehrung d WHERE d.plan_id = p.id AND d.datum = current_date)
    RETURNING id`;
  revalidatePath('/', 'layout');
  return neu ? { ok: true } : { fehler: t('Diese Wartung ist heute schon eingetragen.') };
}

export async function wartungPlanen(vorherigerZustand, formular) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const eingabe = {
    maschine_id: feld(formular, 'maschine_id'),
    aufgabe: feld(formular, 'aufgabe'),
    intervall_tage: feld(formular, 'intervall_tage'),
    dauer_min: feld(formular, 'dauer_min'),
    start_datum: feld(formular, 'start_datum'),
  };
  const person = await aktuellePerson();
  if (!darfBearbeiten(person)) return { fehler: { allgemein: t('Als Person aus der Produktion kannst du keine Wartungen planen.') }, eingabe };

  const fehler = {};
  const maschineId = ganzzahl(eingabe.maschine_id);
  const [maschine] = maschineId ? await sql`SELECT id FROM maschine WHERE id = ${maschineId}` : [];
  if (!maschine) fehler.maschine_id = t('Bitte eine Maschine auswählen.');
  if (eingabe.aufgabe.length < 3) fehler.aufgabe = t('Bitte die Aufgabe beschreiben (mindestens 3 Zeichen).');
  else if (eingabe.aufgabe.length > 150) fehler.aufgabe = t('Höchstens 150 Zeichen.');
  const intervall = ganzzahl(eingabe.intervall_tage);
  if (intervall === null || intervall < 1 || intervall > 1095) fehler.intervall_tage = t('Bitte ein Intervall zwischen 1 und 1095 Tagen angeben.');
  const dauer = ganzzahl(eingabe.dauer_min);
  // Bis 4800 Min. = 10 Arbeitstage à 8 h (z. B. Generalüberholung über mehrere Tage)
  if (dauer === null || dauer < 5 || dauer > 4800) fehler.dauer_min = t('Bitte eine Dauer zwischen 5 und 4800 Minuten (10 Arbeitstage) angeben.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eingabe.start_datum) || Number.isNaN(Date.parse(eingabe.start_datum))) {
    fehler.start_datum = t('Bitte ein gültiges Datum angeben.');
  }
  if (Object.keys(fehler).length > 0) return { fehler, eingabe };

  await sql`
    INSERT INTO wartungsplan (maschine_id, aufgabe, intervall_tage, dauer_min, start_datum)
    VALUES (${maschineId}, ${eingabe.aufgabe}, ${intervall}, ${dauer}, ${eingabe.start_datum})`;
  revalidatePath('/', 'layout');
  // Ohne Weiterleitung: Das Fenster schließt sich, der Kalender lädt neu und zeigt die Meldung
  return { fehler: {}, eingabe, ok: t('Wartung geplant: {aufgabe} alle {n} Tage.', { aufgabe: eingabe.aufgabe, n: intervall }) };
}

export async function wartungsplanEntfernen(planId) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const person = await aktuellePerson();
  if (!darfBearbeiten(person)) return { fehler: t('Als Person aus der Produktion kannst du keine Wartungen planen.') };
  const id = Number(planId);
  if (!Number.isInteger(id)) return { fehler: t('Ungültiger Wartungsplan.') };
  await sql`UPDATE wartungsplan SET aktiv = false WHERE id = ${id}`;
  revalidatePath('/', 'layout');
  return { ok: true };
}

/* =====================================================================
 * Fotos nachträglich zu einer Störmeldung hinzufügen (Auftragsseite) – ohne Weiterleitung.
 * Fotos darf jede Person ergänzen (auch Produktion: Sie hat die Störung ja gesehen).
 * ================================================================== */
export async function fotosHinzufuegen(meldungId, vorherigerZustand, formular) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const person = await aktuellePerson();
  const id = Number(meldungId);
  const [meldung] = Number.isInteger(id) ? await sql`
    SELECT s.id, (SELECT COUNT(*)::int FROM stoermeldung_foto f WHERE f.stoermeldung_id = s.id) AS anzahl
    FROM stoermeldung s WHERE s.id = ${id}` : [];
  if (!meldung) return { fehler: t('Die Störmeldung wurde nicht gefunden.') };
  const pruefung = await fotosPruefen(formular, t, meldung.anzahl);
  if (pruefung.fehler) return { fehler: pruefung.fehler };
  if (pruefung.fotos.length === 0) return { fehler: t('Bitte ein Foto auswählen.') };
  for (const foto of pruefung.fotos) {
    await sql`INSERT INTO stoermeldung_foto (stoermeldung_id, datei, mime, person_id) VALUES (${id}, ${foto.daten}, ${foto.mime}, ${person?.id ?? null})`;
  }
  revalidatePath('/', 'layout');
  return { ok: Date.now() };
}

/* =====================================================================
 * Checkliste am Auftrag: einen Prüfpunkt (Nummer) abhaken bzw. zurücknehmen – ohne Weiterleitung.
 * Gespeichert als JSON-Liste der abgehakten Nummern in wartungsauftrag.checkliste.
 * ================================================================== */
export async function checklistePunkt(auftragId, nummer, erledigt) {
  await benutzerPflicht();
  const t = await uebersetzer();
  const person = await aktuellePerson();
  if (!darfBearbeiten(person)) return { fehler: t('Als Person aus der Produktion kannst du Störungen melden, aber keine Aufträge bearbeiten.') };
  const id = Number(auftragId);
  const nr = Number(nummer);
  if (!Number.isInteger(id) || !Number.isInteger(nr) || nr < 0 || nr > 20) return { fehler: t('Ungültiger Prüfpunkt.') };
  // Atomar in der Datenbank: Nummer hinzufügen bzw. entfernen, ohne Doppelte
  await sql`
    UPDATE wartungsauftrag
    SET checkliste = (
      SELECT COALESCE(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb)
      FROM (SELECT jsonb_array_elements(checkliste)::int AS x
            UNION SELECT ${nr}::int WHERE ${Boolean(erledigt)}) n
      WHERE x <> ${nr} OR ${Boolean(erledigt)})
    WHERE id = ${id} AND status <> 'erledigt'`;
  revalidatePath(`/auftraege/${id}`);
  return { ok: true };
}
