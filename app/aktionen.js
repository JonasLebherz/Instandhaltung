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
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { benutzerPflicht } from '@/lib/auth';
import { uebersetzer } from '@/lib/sprache/server';
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
export async function meldungAnlegen(vorherigerZustand, formular) {
  await benutzerPflicht();
  const t = await uebersetzer();   // Meldungen in der gewählten Sprache

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
      await tx`INSERT INTO wartungsauftrag (stoermeldung_id, status) VALUES (${meldung.id}, 'gemeldet')`;
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

  const [auftrag] = await sql`
    SELECT w.id, s.zeitpunkt FROM wartungsauftrag w
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

  await sql`
    UPDATE wartungsauftrag
    SET techniker_id = ${technikerId},
        status       = ${status},
        start_zeit   = ${startZeit},
        ende_zeit    = ${endeZeit},
        massnahme    = ${eingabe.massnahme !== '' ? eingabe.massnahme : null}
    WHERE id = ${auftragId}`;

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

  const [auftrag] = await sql`SELECT status FROM wartungsauftrag WHERE id = ${auftragId}`;
  if (!auftrag) fehler.allgemein = t('Der Auftrag wurde nicht gefunden.');
  else if (auftrag.status === 'erledigt') fehler.allgemein = t('Auf erledigte Aufträge können keine Teile mehr gebucht werden.');

  if (Object.keys(fehler).length > 0) return { fehler, eingabe };

  let ergebnis;
  try {
    // Alles in einer Transaktion: Bestand prüfen und ändern darf nicht durch
    // eine gleichzeitige Buchung eines Kollegen gestört werden.
    ergebnis = await sql.begin(async (tx) => {
      // Ersatzteil-Zeile sperren (FOR UPDATE), bis die Transaktion endet
      const [teil] = await tx`
        SELECT id, bezeichnung, bestand, mindestbestand FROM ersatzteil WHERE id = ${teilId} FOR UPDATE`;
      if (!teil) return { art: 'unbekannt' };

      if (teil.bestand >= menge) {
        /* --- Fall A: genug auf Lager → buchen --- */
        await tx`UPDATE ersatzteil SET bestand = bestand - ${menge} WHERE id = ${teilId}`;
        // Wurde das Teil schon einmal gebucht, wird die Menge addiert
        // (Primärschlüssel auftrag_id + ersatzteil_id).
        await tx`
          INSERT INTO auftrag_ersatzteil (auftrag_id, ersatzteil_id, menge)
          VALUES (${auftragId}, ${teilId}, ${menge})
          ON CONFLICT (auftrag_id, ersatzteil_id) DO UPDATE SET menge = auftrag_ersatzteil.menge + EXCLUDED.menge`;
        return { art: 'gebucht', teil, neuerBestand: teil.bestand - menge };
      }

      /* --- Fall B: nicht genug auf Lager → warten & bestellen --- */
      await tx`UPDATE wartungsauftrag SET status = 'wartet auf Teil', ende_zeit = NULL,
                      start_zeit = COALESCE(start_zeit, now())
               WHERE id = ${auftragId}`;

      const [offen] = await tx`SELECT id FROM bestellung WHERE ersatzteil_id = ${teilId} AND status = 'bestellt' LIMIT 1`;
      if (offen) return { art: 'schon_bestellt', teil };

      // Bestellmenge: fehlende Menge + Mindestbestand wieder auffüllen
      const bestellmenge = (menge - teil.bestand) + teil.mindestbestand;
      await tx`INSERT INTO bestellung (ersatzteil_id, menge, bestelldatum, status)
               VALUES (${teilId}, ${bestellmenge}, current_date, 'bestellt')`;
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
  if (bestellungId === null) {
    await flash('fehler', t('Ungültige Bestellung.'));
    redirect('/');
  }

  let ergebnis = null;
  try {
    ergebnis = await sql.begin(async (tx) => {
      // Bestellung sperren, damit sie nicht doppelt gebucht wird
      const [bestellung] = await tx`
        SELECT b.id, b.ersatzteil_id, b.menge, b.status, e.bezeichnung
        FROM bestellung b JOIN ersatzteil e ON e.id = b.ersatzteil_id
        WHERE b.id = ${bestellungId}
        FOR UPDATE OF b`;
      if (!bestellung || bestellung.status !== 'bestellt') return null;

      await tx`UPDATE bestellung SET status = 'geliefert', lieferdatum = current_date WHERE id = ${bestellungId}`;
      await tx`UPDATE ersatzteil SET bestand = bestand + ${bestellung.menge} WHERE id = ${bestellung.ersatzteil_id}`;
      return bestellung;
    });
  } catch (fehlerObjekt) {
    console.error(fehlerObjekt);
    await flash('fehler', t('Der Wareneingang konnte nicht gespeichert werden.'));
    redirect('/');
  }

  if (ergebnis) {
    await flash('erfolg', `${t('Wareneingang gebucht: {menge} × {teil}.', { menge: ergebnis.menge, teil: ergebnis.bezeichnung })} `
      + t('Aufträge, die auf dieses Teil warten, können fortgesetzt werden.'));
  } else {
    await flash('fehler', t('Diese Bestellung ist nicht (mehr) offen.'));
  }
  revalidatePath('/', 'layout');
  redirect('/');
}
