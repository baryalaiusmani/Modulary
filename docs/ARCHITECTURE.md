# Architektur und Erweiterung

## Grundentscheidung

Die Anwendung verwendet eine Feature-orientierte Architektur. Ein Feature besitzt seine UI, serverseitige Logik und Typen in einem eigenen Verzeichnis. Globale Komponenten kennen nur den kleinen `FeatureDefinition`-Vertrag aus `src/features/types.ts`.

Damit kann ein neues Werkzeug unabhängig entwickelt werden, ohne die Excel-Logik zu verändern.

## Excel-Feature

Der Request läuft in folgenden Schritten:

1. `ExcelWorkspace` sammelt Datei und Anweisung.
2. `/api/features/excel/process` validiert den HTTP-Request.
3. `processor.ts` prüft Datei, liest das erste Tabellenblatt und erzeugt Datensätze.
4. Ein `PromptInterpreter` übersetzt Text in typisierte Operationen.
5. Die Operationen werden serverseitig ausgeführt.
6. Vorschau und Excel-Download werden an den Browser zurückgegeben.

Der `RuleBasedPromptInterpreter` ist eine lokale, nachvollziehbare Standardimplementierung. Die Schnittstelle ist absichtlich austauschbar. Für eine echte semantische KI-Interpretation kann später ein selbst gehostetes Open-Source-Modell, etwa über Ollama oder vLLM, eine strukturierte Liste von `ExcelOperation`-Objekten erzeugen. Diese Ausgabe muss weiterhin mit Zod validiert werden, bevor sie ausgeführt wird.

## Neues Feature hinzufügen

Beispiel: ein Text-Assistent.

1. Neues Verzeichnis anlegen:

```text
src/features/text-assistant/
├── components/text-workspace.tsx
├── server/text-processor.ts
└── types.ts
```

2. Eine Seite unter `src/app/tools/text/page.tsx` erstellen.
3. Falls nötig, einen isolierten API-Endpunkt unter `src/app/api/features/text/...` ergänzen.
4. Das Feature in `src/features/registry.ts` registrieren:

```ts
{
  id: "text-assistant",
  name: "Text Assistant",
  description: "Texte analysieren und überarbeiten.",
  href: "/tools/text",
  icon: MessageSquareText,
  status: "available",
  accent: "violet",
}
```

Navigation und Dashboard übernehmen das neue Feature automatisch.

## Wichtige Entscheidungen

- **Serverseitige Excel-Verarbeitung:** Verhindert, dass große Bibliotheken und Verarbeitungslogik unnötig in den Browser-Bundle gelangen.
- **Typisierte Operationen:** Natürliche Sprache wird nicht direkt ausgeführt. Das reduziert Risiken und macht Ergebnisse testbar.
- **Keine persistente Speicherung:** Für den lokalen Start bleiben sensible Dateien im Arbeitsspeicher.
- **Zentrale Registry:** Dashboard und Navigation bleiben bei neuen Plugins konsistent.
- **CSS-Variablen:** Light- und Dark-Mode teilen ein kleines Designsystem ohne zusätzliche UI-Abhängigkeit.

## Weg in Produktion

Die Next.js-Anwendung kann als Node.js-Service, Docker-Container oder auf einer Cloud-Plattform betrieben werden. Für produktive Nutzung sind typischerweise folgende Ergänzungen sinnvoll:

- Reverse Proxy mit TLS
- Authentifizierung und rollenbasierte Rechte
- Rate-Limiting und Audit-Logging
- Virenscan für Uploads
- Object Storage für große Dateien
- Queue und Worker für lange Verarbeitung
- Datenbank für Nutzer, Jobs und Metadaten
- Beobachtbarkeit mit OpenTelemetry
