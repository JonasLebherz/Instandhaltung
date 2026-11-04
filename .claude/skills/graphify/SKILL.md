---
name: graphify
description: >
  Baut aus einem Ordner (Code, Doku, PDFs, Bilder) einen Wissensgraphen mit interaktiver HTML-Ansicht und Bericht
  (graphify-out/). Verwenden, wenn der Nutzer "/graphify" schreibt oder einen Wissensgraphen bzw. eine Übersicht,
  wie die Teile des Projekts zusammenhängen, haben möchte.
argument-hint: "[pfad] [--mode deep] [--update] [query \"frage\"]"
---

# graphify (Starter)

Dieser Projekt-Skill lädt das eigentliche Werkzeug **graphify** (https://github.com/Graphify-Labs/graphify,
Python-Paket `graphifyy`) erst beim Aufruf. Die Anleitung des Originals liegt nicht im Repository
(keine Lizenzangabe im Original), sie wird bei der Installation aus dem Paket geholt.

## Ablauf beim Aufruf

1. Installieren, falls noch nicht da (Cloud-Sitzungen starten jedes Mal frisch):
   ```bash
   python3 -c "import graphify" 2>/dev/null || pip install graphifyy -q --break-system-packages
   graphify install
   ```
   `graphify install` legt die vollständige Anleitung unter `~/.claude/skills/graphify/SKILL.md` ab.
2. Diese Datei lesen und **genau ihren Schritten folgen** (sie nutzt parallele Unteragenten über das Agent-Werkzeug –
   das ist hier ausdrücklich gewünscht, weil der Nutzer graphify aufgerufen hat).
3. Ohne Pfad: `.` (Projektordner). `node_modules`, `.next`, `tests/screenshots` und `graphify-out` auslassen.
4. Ausgabe landet in `graphify-out/` (steht in `.gitignore`, wird nicht committet). Dem Nutzer am Ende auf Deutsch
   in wenigen Sätzen sagen, was der Graph zeigt, und `graphify-out/graph.html` als Datei schicken.
