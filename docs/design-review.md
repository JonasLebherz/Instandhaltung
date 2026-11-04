# Design-Prüfung: Instandhaltung (Web-App)

Geprüft mit dem Skill `apple-design` (`.claude/skills/apple-design/`) gegen Apples Human Interface Guidelines.
Stand: November 2026. Geprüft wurden der Code (`app/globals.css`, Komponenten) und Bildschirmfotos
bei 1440 px, 1280 px und 390 px Breite, hell und dunkel. Vorher/Nachher der Übersicht: `docs/design-vorher-nachher.jpg`.

**Geltungsbereich:** Es ist eine Web-App, keine native Apple-App. Deshalb gelten Apples Grundsätze und
Grundlagen (Barrierefreiheit, Farbe, Schrift, Layout, Texte), aber nicht die Mac- bzw. iPhone-Konventionen
wie Menüleiste oder Tab-Leiste.

**Gelesene Richtlinien:** `accessibility.md`, `layout.md`, `typography.md`, `color.md`,
`designing-for-macos.md`, `cross-platform.md`, `liquid-glass.md`, `sidebars.md`, `buttons.md`,
`motion.md`, `dark-mode.md`.

## Zusammenfassung

**Bewertung vorher: Needs work. Nach der Überarbeitung: Good.**

Die App hat eine klare Aufgabe: Störungen schnell sehen, melden und abarbeiten. Ihr Erkennungszeichen
ist die Störungskarte, die von der Welt bis in die Halle in 3D führt, dazu das neue 3D-Lager.
Die Oberfläche drumherum war solide, hatte aber drei Schwächen:

- Grauer Text, Links und Statusfarben lagen auf durchsichtigen Karten teils unter dem Mindestkontrast.
- Es gab zu viel Glas auf Inhalten.
- Die Kennzahlen-Kacheln sahen nach Vorlage aus.

Alle drei Punkte sind behoben. Glas-Optik, Petrol und „Morgendunst“ bleiben erhalten.

## Kritisch (behoben)

### Kontrast von grauem Text, Links und Statusfarben

- **Was:** Die Karten waren nur zu 42 % deckend weiß. In der kühlen Ecke des Hintergrunds (unten
  rechts) ergab das für die Karte die Farbe `#cfd8e3`. Darauf hatten diese Farben zu wenig Kontrast:

  | Farbe | Kontrast |
  | --- | --- |
  | grauer Text `#6e6e73` | 3,5:1 |
  | Link `#1f7a80` | 3,5:1 |
  | Orange `#b25000` | 3,6:1 |
  | Grün `#1a7f37` | 3,5:1 |

  Der Untertitel im Seitenkopf stand direkt auf dem Hintergrund und kam auf 4,1:1, in der kühlen
  Ecke sogar nur auf 2,6:1.
- **Warum:** `accessibility.md › Vision`: „Text size up to 17 pts … Minimum contrast ratio 4.5:1“.
- **Lösung:**
  - Die Karten sind jetzt zu 74 % deckend (`--karte`).
  - Neue Farben: grauer Text `#5f5f64`, Petrol `#1b7076`, Orange `#a64a00`, Grün `#17722f`.
  - Die kühle Ecke des Hintergrunds ist etwas schwächer (`--umgebung-kuehl` von 0,75 auf 0,5).
  - Die neuen Werte auf Karten, im schlechtesten Fall: grauer Text 5,5:1, Petrol 5,0:1, Orange 5,1:1,
    Grün 5,2:1. Seitenkopf: 5,1:1.

### Weiße Schrift auf Petrol-Knöpfen im Dunkelmodus

- **Was:** Weiß auf `#2a9aa1` ergibt nur 3,4:1, bei Schriftstärke 500.
- **Warum:** Wie oben, 4,5:1 für normalen Text.
- **Lösung:** Neue Variable `--akzent-flaeche` für gefüllte Flächen mit weißer Schrift. Im Dunkelmodus
  ist sie `#1c7f85` (4,8:1). Links behalten das hellere `#2a9aa1`, das auf dunklen Karten 4,9:1 erreicht.

### Schrift unter 11 px

- **Was:** 17 Stellen waren kleiner als 11 px: `.55rem` (8,8 px), `.58rem`, `.62rem` und `.64rem`.
  Betroffen waren Abzeichen, die Zeitachse, Beschriftungen im Lageplan und das „Ich“-Abzeichen.
- **Warum:** `typography.md › Ensuring legibility`: Mindestgröße 11 pt auf iPhone/iPad und 10 pt am Mac.
- **Lösung:**
  - Alles ist jetzt mindestens `.6875rem` (11 px).
  - Die winzigen Lageplan-Beschriftungen fallen auf dem Handy weg (`display: none`), statt unleserlich
    zu sein.

## Verbesserungen

- **High · Glas nur auf der Bedien-Ebene.**
  - Zitat: `liquid-glass.md › Where the material belongs`: „Don't use Liquid Glass in the content
    layer.“
  - Vorher waren alle Inhaltskarten so durchsichtig wie die Seitenleiste.
  - Jetzt gibt es zwei Ebenen:
    - `--glas` (42 %) für die Seitenleiste, Menüs und Fenster.
    - `--karte` (74 %) für Inhalte.
  - Die Karten behalten Lichtkante und Haarlinie, das Glas wirkt so ruhiger. Bei „Transparenz
    reduzieren“ sind beide deckend.
- **High · Ein Hauptknopf je Bereich.**
  - Zitat: `buttons.md › Best practices`: „Keep the number of prominent buttons to one or two per view.“
  - Auf der Übersicht waren „Neue Störung melden“ und „Person wählen …“ beide gefüllt.
  - „Person wählen …“ ist jetzt ein zweitrangiger Knopf.
- **Medium · Flache Hauptknöpfe.**
  - Vorher hatten sie einen Verlauf von hell nach Petrol und einen farbigen Schein (8–22 px). Das
    passt nicht zu Apples „prominent“-Stil (eine Farbfläche) und wirkte nach Vorlage.
  - Jetzt: flache Fläche `--akzent-flaeche`, feine Lichtkante, Schriftstärke 600.
  - Beim Überfahren und Drücken wird der Knopf dunkler (`buttons.md`: „Always include a press state“).
- **Medium · Akzentfarbe nur für Bedienbares.**
  - Zitat: `color.md › Best practices`: „using the same or similar color to stylize noninteractive text
    is confusing.“
  - Die Überzeile „Guten Abend, …“ war Petrol, ist aber kein Link. Jetzt ist sie grau.
  - Symbole der Kennzahlen haben keine Petrol-Kacheln mehr.
- **Medium · Bewegung kurz halten.**
  - Zitat: `motion.md`: „In apps, generally avoid adding motion to UI interactions that occur
    frequently.“
  - Bei jedem Seitenwechsel lief vorher ein Einblenden über 0,5 s. Dazu glitt jede Karte 0,6 s herein,
    um je 70 ms versetzt. Bei 8 Karten dauerte das über eine Sekunde.
  - Jetzt: Die Seite blendet 0,2 s ein, jede Karte 0,32 s mit 6 px Weg. Der Versatz beträgt 30 ms,
    höchstens 6 Stufen.
- **Medium · Lange Liste in Stufen.**
  - Zitat: `layout.md › Visual hierarchy`: „Use progressive disclosure…“
  - „Aufträge“ lud vorher alle über 1.000 Meldungen auf einmal. Die Seite war über 90.000 px lang und
    langsam.
  - Jetzt werden 50 Zeilen gezeigt, dazu „50 von 1.015 angezeigt“ und „Weitere 50 anzeigen“.
    Die Filter bleiben dabei erhalten.
  - Die Gesamtzahl steht weiter oben (`COUNT(*) OVER ()`).
- **Medium · Segment-Schalter groß genug.**
  - Zitat: `accessibility.md › Mobility`: mindestens 28 × 28 pt.
  - Die Knöpfe waren etwa 26 px hoch. Jetzt sind sie mindestens 28 px hoch, auf Touch-Geräten 34 px.
- **Medium · Handy-Tabelle der Übersicht.**
  - Status und Techniker wurden rechts abgeschnitten.
  - Auf dem Handy steht die Priorität jetzt unter der Maschine statt in einer eigenen Spalte.
- **Low · Einheitliche Ansprache.**
  - Zitat: `writing.md`: einheitlicher Ton.
  - Überall wird geduzt. Zwei Texte siezten noch: „Bitte prüfen Sie …“ und „Passen Sie ggf. …“.
    Beide sind angepasst.
- **Low · App-eigene Hell/Dunkel-Wahl.**
  - Zitat: `dark-mode.md`: „Avoid offering an app-specific appearance setting.“
  - Bleibt bewusst, mit „Automatisch“ als Standard. In der Halle laufen oft geteilte Rechner, deren
    Systemeinstellung niemand ändern darf.

## Handwerk

- **High · Kennzahlen-Kacheln weniger nach Vorlage.**
  - Vorher: große Zahl unter kleiner Bezeichnung, daneben ein Symbol in einer bunten Kachel (Petrol,
    Rot, Orange, Grün). Das ist das typische Dashboard aus Vorlagen.
  - Jetzt steht ein kleines Symbol in Textfarbe vor der Bezeichnung, darunter die Zahl (650 statt 700,
    etwas kleiner).
  - Farbe gibt es nur noch, wenn sie etwas bedeutet: Orange für Warnungen, Rot und Grün für das Symbol.
- **Medium · Keine Versalien bei Tabellenköpfen und Bereichstiteln.**
  - „MASCHINE · PRIORITÄT · STATUS“ und „ÜBERBLICK“ in gesperrten Großbuchstaben wirken wie ein
    Zeitungslayout.
  - Mac-Seitenleisten und Apple-Tabellen schreiben Überschriften normal, in grauer, halbfetter Schrift.
  - Das gilt jetzt auch hier: Tabellenköpfe, Seitenleiste, Favoriten und Regal-Titel.
- **Erkennungszeichen:** Die Störungskarte (Welt → Halle in 3D) und das 3D-Lager. Diese Stellen
  dürfen auffallen. Alles andere bleibt ruhig, damit sie wirken.
- **Was weggelassen wurde:** die bunten Symbol-Kacheln, der Verlauf und Schein der Knöpfe, die
  Versalien und die lange Einblend-Kaskade.

## Was gut ist (beibehalten)

- **Ampel-Logik:** überall gleich (grün läuft, orange Störung, rot Stillstand). Immer mit Text und
  Form, nie nur Farbe. Rot blinkt zusätzlich.
- **Pills:** Status und Priorität stehen immer als Text, die Farbe kommt nur dazu.
- **Fokus:** Fokusrahmen in Petrol (`:focus-visible`).
- **Betriebssystem-Einstellungen:** „Bewegung reduzieren“ und „Transparenz reduzieren“ werden beachtet.
- **Dunkelmodus:** gedämpft, nicht schwarz-bunt.
- **Seitenleiste:**
  - Sie lässt sich einklappen und hat höchstens zwei Ebenen (`sidebars.md`).
  - Konto und Sprache bleiben bei niedrigen Fenstern sichtbar.
- **Lager:** 3D-Regal von vorn, fehlende Teile als rote „Geister“. Die Liste als Alternative ist
  zugänglich, denn alle Fächer sind auch Knöpfe mit Beschriftung.

## Neue Regeln (auch in CLAUDE.md)

1. **Inhalt und Bedienung trennen:**
   - Inhalte stehen auf `--karte` (fast deckend).
   - Seitenleiste, Menüs und Fenster sind `--glas` bzw. `--karte-erhoeht` mit Unschärfe.
2. **Kontrast:** Text mindestens 4,5:1, auch in der kühlen Ecke des Hintergrunds. Neue Farben mit dem
   Skript prüfen, nicht schätzen.
3. **Gefüllte Petrol-Flächen mit weißer Schrift:** immer `--akzent-flaeche`, nie `--akzent`.
4. **Schriftgröße:** mindestens 11 px (`.6875rem`).
5. **Hauptknöpfe:** höchstens ein bis zwei gefüllte (`btn-primary`) je Seite, sonst `btn-sekundaer`.
6. **Schreibweise:** keine Versalien für Überschriften und Tabellenköpfe.
7. **Bewegung:** kurz (unter 0,35 s) und ohne lange Kaskaden.
