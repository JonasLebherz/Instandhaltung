/**
 * lib/statistikInfo.js – Woher kommt jeder Wert der Statistik, und wie wird er berechnet?
 *
 * Wird vom „i“-Knopf (components/InfoKnopf.js) neben jeder Kennzahl, jedem Diagramm und jeder
 * Auswertung auf /statistik angezeigt. Je Eintrag:
 *   tabellen:   Tabellen der Datenbank, aus denen die Werte stammen (wie auf der Seite „Datenbasis“)
 *   berechnung: Erklärung in einem Satz (deutsch, mit T() markiert – beim Anzeigen t(text))
 *   formel:     Kurzform mit den Spaltennamen (sprachneutral, wird nicht übersetzt)
 *
 * Die Definitionen sind dieselben wie in app/statistik/StatistikExplorer.js und in den Views
 * (v_mttr_maschine, v_ausfallzeit_maschine …). Wer dort etwas ändert, passt den Text hier an.
 */
import { T } from './sprache/index.js';

// Gilt für alle Werte: Grundmenge der Auswertung
export const STATISTIK_GRUNDLAGE = T('Ausgewertet werden alle Störmeldungen, deren Meldezeitpunkt (stoermeldung.zeitpunkt) im gewählten Zeitraum liegt – und nur Maschinen der gewählten Ebene (maschine → gebaeude → standort → land). Zu jeder Meldung gehört genau ein Wartungsauftrag.');

const S = 'stoermeldung';
const W = 'wartungsauftrag';
const M = 'maschine';

export const STATISTIK_INFO = {
  mttr: {
    tabellen: [W, S],
    berechnung: T('Mittlere Reparaturdauer: Durchschnitt aus Arbeitsende minus Arbeitsbeginn über alle erledigten Aufträge.'),
    formel: "AVG(ende_zeit − start_zeit) WHERE status = 'erledigt'",
  },
  ausfallzeit: {
    tabellen: [S, W, M],
    berechnung: T('Summe der Zeit von der Meldung bis zum Ende der Reparatur über alle erledigten Aufträge, in Stunden. Ausfallkosten = Ausfallstunden × Kosten pro Stunde der jeweiligen Maschine.'),
    formel: "SUM(wartungsauftrag.ende_zeit − stoermeldung.zeitpunkt)\n€ = SUM(Stunden × maschine.kosten_pro_stunde)",
  },
  stoerungen: {
    tabellen: [S],
    berechnung: T('Anzahl der Störmeldungen im Zeitraum.'),
    formel: 'COUNT(stoermeldung.id)',
  },
  offen: {
    tabellen: [S, W],
    berechnung: T('Störmeldungen im Zeitraum, deren Auftrag noch nicht erledigt ist.'),
    formel: "COUNT(*) WHERE wartungsauftrag.status <> 'erledigt'",
  },
  jeMaschine: {
    tabellen: [S, M],
    berechnung: T('Störungen geteilt durch die Zahl der Maschinen dieser Ebene (auch Maschinen ohne Störung zählen mit).'),
    formel: 'COUNT(stoermeldung) / COUNT(maschine)',
  },
  mtbf: {
    tabellen: [S],
    berechnung: T('Mittlere Zeit zwischen zwei Störungen dieser Maschine: Tage im Zeitraum geteilt durch die Zahl der Störungen.'),
    formel: 'Tage im Zeitraum / COUNT(stoermeldung)',
  },
  ausfallJeStoerung: {
    tabellen: [S, W],
    berechnung: T('Gesamte Ausfallzeit geteilt durch die Zahl der erledigten Aufträge.'),
    formel: "SUM(ende_zeit − zeitpunkt) / COUNT(*) WHERE status = 'erledigt'",
  },
  anteilHoch: {
    tabellen: [S],
    berechnung: T('Anteil der Störungen mit Priorität „hoch“ an allen Störungen.'),
    formel: "COUNT(*) WHERE prioritaet = 'hoch' / COUNT(*) × 100",
  },
  erledigungsquote: {
    tabellen: [S, W],
    berechnung: T('Anteil der erledigten Aufträge an allen Störungen im Zeitraum.'),
    formel: "COUNT(*) WHERE status = 'erledigt' / COUNT(*) × 100",
  },
  verfuegbarkeit: {
    tabellen: [S, W, M],
    berechnung: T('Anteil der Zeit, in der die Maschinen liefen: 100 % minus Ausfallzeit geteilt durch die mögliche Laufzeit aller Maschinen der Ebene im Zeitraum.'),
    formel: '100 % − SUM(Ausfallzeit) / (COUNT(maschine) × Tage × 24 h)',
  },
  reaktion: {
    tabellen: [S, W],
    berechnung: T('Durchschnittliche Zeit von der Meldung bis zum Arbeitsbeginn – nur Aufträge, an denen schon gearbeitet wurde.'),
    formel: 'AVG(wartungsauftrag.start_zeit − stoermeldung.zeitpunkt) WHERE start_zeit IS NOT NULL',
  },
  wiederholung: {
    tabellen: [S],
    berechnung: T('Anteil der Störungen, die höchstens 7 Tage nach der vorherigen Störung an derselben Maschine gemeldet wurden.'),
    formel: 'COUNT(zeitpunkt − vorheriger zeitpunkt ≤ 7 Tage, gleiche maschine_id) / COUNT(*) × 100',
  },
  proWoche: {
    tabellen: [S],
    berechnung: T('Störungen im Zeitraum geteilt durch die Zahl der Wochen im Zeitraum.'),
    formel: 'COUNT(stoermeldung) / (Tage / 7)',
  },
  vergleich: {
    tabellen: [S, W, M, 'gebaeude', 'standort', 'land'],
    berechnung: T('Dieselben Werte je Land, Werk, Gebäude bzw. Maschine: Anzahl der Störungen, MTTR und Ausfallzeit wie oben, „offen“ = nicht erledigte Aufträge. Sortiert nach Ausfallzeit, der Balken zeigt die Ausfallzeit im Vergleich.'),
    formel: 'GROUP BY land | standort | gebaeude | maschine',
  },
  maschinenListe: {
    tabellen: [S, W],
    berechnung: T('Die neuesten 15 Störmeldungen dieser Maschine im Zeitraum mit Priorität und Status des Auftrags.'),
    formel: 'ORDER BY stoermeldung.zeitpunkt DESC LIMIT 15',
  },
  proMonat: {
    tabellen: [S],
    berechnung: T('Störmeldungen je Kalendermonat des Meldezeitpunkts (deutsche Zeit). Monate ohne Störung zählen als 0.'),
    formel: "COUNT(*) GROUP BY to_char(zeitpunkt AT TIME ZONE 'Europe/Berlin', 'YYYY-MM')",
  },
  mttrMonat: {
    tabellen: [W, S],
    berechnung: T('MTTR wie oben, getrennt nach dem Monat der Meldung, in Stunden.'),
    formel: "AVG(ende_zeit − start_zeit) WHERE status = 'erledigt' GROUP BY Monat",
  },
  ursachen: {
    tabellen: [S],
    berechnung: T('Anzahl der Störmeldungen je Ursache, die beim Melden ausgewählt wurde.'),
    formel: 'COUNT(*) GROUP BY stoermeldung.ursache_kategorie',
  },
  prioritaeten: {
    tabellen: [S],
    berechnung: T('Anzahl der Störmeldungen je Priorität und ihr Anteil an allen Störungen.'),
    formel: 'COUNT(*) GROUP BY stoermeldung.prioritaet',
  },
  schichten: {
    tabellen: [S],
    berechnung: T('Störmeldungen nach der Uhrzeit der Meldung (deutsche Zeit): Frühschicht 6–14 Uhr, Spätschicht 14–22 Uhr, Nachtschicht 22–6 Uhr.'),
    formel: "EXTRACT(HOUR FROM zeitpunkt AT TIME ZONE 'Europe/Berlin')",
  },
  verfuegbarkeitMonat: {
    tabellen: [S, W, M],
    berechnung: T('Verfügbarkeit wie oben, je Monat: Ausfallzeit der in diesem Monat gemeldeten Störungen geteilt durch die mögliche Laufzeit aller Maschinen in den Tagen des Monats, die im Zeitraum liegen.'),
    formel: '100 % − SUM(Ausfallzeit im Monat) / (COUNT(maschine) × Tage im Monat × 24 h)',
  },
  reaktionPrio: {
    tabellen: [S, W],
    berechnung: T('Ø Reaktionszeit wie oben, getrennt nach Priorität der Meldung.'),
    formel: 'AVG(start_zeit − zeitpunkt) GROUP BY prioritaet',
  },
  pareto: {
    tabellen: [S, W, M],
    berechnung: T('Ausfallzeit je Maschine aufsummiert, die 10 Maschinen mit der meisten Ausfallzeit. Rechts der kumulierte Anteil an der gesamten Ausfallzeit (Pareto-Prinzip: wenige Maschinen verursachen den Großteil).'),
    formel: 'SUM(Ausfallzeit) GROUP BY maschine_id ORDER BY 1 DESC LIMIT 10',
  },
  ausfallTyp: {
    tabellen: [S, W, M],
    berechnung: T('Ausfallzeit je Maschinentyp aufsummiert, in Stunden.'),
    formel: 'SUM(Ausfallzeit) GROUP BY maschine.typ',
  },
  alter: {
    tabellen: [S, W],
    berechnung: T('Für jeden noch offenen Auftrag: Zeit seit der Meldung bis jetzt, gezählt in Altersstufen.'),
    formel: "now() − stoermeldung.zeitpunkt WHERE status <> 'erledigt'",
  },
  maschinenalter: {
    tabellen: [M, S],
    berechnung: T('Alter der Maschine = aktuelles Jahr minus Baujahr. Je Altersstufe: Störungen geteilt durch die Zahl der Maschinen dieser Stufe.'),
    formel: 'COUNT(stoermeldung) / COUNT(maschine) GROUP BY (Jahr − maschine.baujahr)',
  },
  techniker: {
    tabellen: ['techniker', W, S],
    berechnung: T('Aufträge je zugewiesenem Techniker: Anzahl, davon erledigt und MTTR wie oben. Die 8 Techniker mit den meisten Aufträgen.'),
    formel: 'COUNT(*), AVG(ende_zeit − start_zeit) GROUP BY wartungsauftrag.techniker_id',
  },
  ersatzteile: {
    tabellen: ['auftrag_ersatzteil', 'ersatzteil', W, S],
    berechnung: T('Summe der gebuchten Mengen je Ersatzteil für die Aufträge der Störungen im Zeitraum, die 8 häufigsten.'),
    formel: 'SUM(auftrag_ersatzteil.menge) GROUP BY ersatzteil_id',
  },
};
