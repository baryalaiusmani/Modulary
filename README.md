# Modulary AI Workspace

Eine moderne, modular aufgebaute Webplattform für KI-gestützte Business-Tools. Das erste Feature ist ein Excel-Werkzeug, das `.xlsx`- und `.csv`-Dateien anhand natürlichsprachlicher Anweisungen verarbeitet.

## Technologie

- Next.js mit App Router
- React und TypeScript
- Node.js Runtime für serverseitige Dateiverarbeitung
- ExcelJS für offene Excel-Verarbeitung
- Zod für Eingabevalidierung
- Lucide React für Open-Source-Icons
- Reines CSS mit Light- und Dark-Mode

Alle verwendeten Bibliotheken sind Open Source. Die Anwendung benötigt für den lokalen Betrieb keinen proprietären KI-Dienst und überträgt keine hochgeladenen Dateien an Dritte.

## Lokaler Start

Voraussetzungen:

- Node.js 20 oder neuer
- npm 10 oder neuer
- Git

Installation und Entwicklung:

```bash
npm install
npm run dev
```

Danach ist die Anwendung unter [http://localhost:3000](http://localhost:3000) erreichbar.

Produktions-Build:

```bash
npm run typecheck
npm run lint
npm run build
npm start
```

## Projektstruktur

```text
src/
├── app/
│   ├── api/features/excel/process/route.ts  # Excel-HTTP-Endpunkt
│   ├── tools/excel/page.tsx                 # Excel-Tool-Seite
│   ├── globals.css                          # Designsystem und responsive Layouts
│   ├── layout.tsx                           # Globales Layout
│   └── page.tsx                             # Dashboard
├── components/
│   ├── dashboard/                           # Feature-unabhängige Dashboard-Komponenten
│   ├── layout/                              # Navigation und App Shell
│   └── theme/                               # Light-/Dark-Mode
└── features/
    ├── excel/
    │   ├── components/                      # UI des Excel-Plugins
    │   ├── server/                          # Parser und Verarbeitung, nur serverseitig
    │   └── types.ts                         # Feature-Verträge
    ├── registry.ts                          # Zentrale Feature-Registrierung
    └── types.ts                             # Gemeinsamer Feature-Vertrag
```

Weitere Details stehen in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Unterstützte Excel-Anweisungen

Der lokale Interpreter erkennt aktuell unter anderem:

- `Sortiere nach Nachname alphabetisch.`
- `Entferne doppelte Einträge.`
- `Gruppiere nach Abteilung.`
- `Filtere alle Datensätze mit Umsatz über 10.000 Euro.`
- `Fasse ähnliche Kategorien zusammen.`
- `Entferne http:// und https:// aus der Spalte Domainname des Unternehmens, markiere doppelte Domains rot und verschiebe sie nach oben.`
- `Vergleiche die Firmen in der ersten Liste mit der zweiten Liste und markiere gleiche Firmen in der ersten Liste rot.`

Die Anweisung muss bei spaltenbezogenen Aktionen den exakten oder sinngemäß gleichen Spaltennamen enthalten.

Der Domain-Workflow entfernt ausschließlich die Protokolle `http://` und `https://`. Pfade und weitere URL-Bestandteile bleiben erhalten. Doppelte Domains werden nicht gelöscht, sondern als vollständige Zeilen rot markiert und stabil an den Tabellenanfang verschoben.

Für Firmenvergleiche kann eine zweite Datei hochgeladen werden. Die erste Liste ist immer die Ergebnisdatei. Die zweite Liste wird nur als Vergleichsquelle genutzt. Passende Firmen werden in der ersten Liste als vollständige Zeilen rot markiert.

## Werkzeug „Email Suche"

Das E-Mail-Werkzeug bündelt drei Modi in einer Oberfläche (`/tools/email-finder`).

### 1. E-Mail-Suche & Domain-Check

Findet öffentlich sichtbare Firmen-E-Mails über Website-Crawling (Startseite,
Kontakt, Impressum, Team, Sitemap; dekodiert u. a. Cloudflare-/mailto-
Verschleierung). Entweder per Domain-Eingabe oder über eine hochgeladene
Excel-/CSV-Liste, für die fehlende E-Mails ergänzt werden.

### 2. Discovery (modulare OSINT-Anreicherung)

Ergänzt die Website-Suche um verifizierbare Zusatzsignale und weitere Quellen.
Details und alle Schalter: [`src/features/email-finder/discovery/README.md`](src/features/email-finder/discovery/README.md).

- Standardmäßig ist nur die **MX-Verifizierung + Confidence Score** aktiv; die
  bestehende Suche bleibt unverändert. Es wird nie ein Treffer entfernt.
- Zusatzquellen (Suchmaschinen-Dorks, crt.sh, Dokumente, GitHub, Wayback, PGP,
  Muster-Generierung) werden über Umgebungsvariablen (`EMAIL_FINDER_*`) einzeln
  aktiviert.
- Generierte Adressen sind immer als `isGenerated` gekennzeichnet und werden
  nie mit sicher gefundenen Adressen vermischt.

### 3. EmailValidator (Tab „E-Mail prüfen")

Prüft, ob eine Adresse technisch zustellbar ist – ohne falsche Sicherheit
vorzutäuschen. Details: [`src/features/email-finder/validator/README.md`](src/features/email-finder/validator/README.md).

- **Option A – einzelne E-Mail** und **Option B – Liste** (`.xlsx`, `.csv`,
  `.txt`; E-Mail-Spalte wird automatisch erkannt, alle Originalspalten bleiben
  erhalten, Ergebnisdatei + Zusammenfassung zum Download).
- Prüfungen: Normalisierung, Syntax, Tippfehler-Vorschlag, Gibberish, DNS/MX/
  A-Fallback, SMTP (bis `RCPT TO`, **keine echte Mail**), Catch-all, Disposable/
  Free/Role, TLD-/Risiko-Signale, WHOIS via RDAP, SPF/DKIM/DMARC/MTA-STS.
- **Statuslogik:** `gültig` nur bei eindeutiger Zustellbarkeit; `ungültig` bei
  klarem Ausschluss; `riskant` bei Catch-all/Disposable/Role/Qualitätsrisiko;
  `unbekannt` bei Timeout/Greylisting/Blockade. Zusätzlich `verdict_simple`
  (gültig / ungültig / manuell_prüfen). Catch-all und unbekannte Fälle gelten
  nie automatisch als gültig.

Hinweis: SMTP-Prüfungen laufen über Port 25, der in vielen Netzen blockiert
ist. In dem Fall ist das Ergebnis ehrlich `blocked`/`timeout` → „unbekannt".

### API-Endpunkte

```text
POST /api/features/email-finder/domain-check   { "domain": "example.com" }
POST /api/features/email-finder/process         (multipart: file = .xlsx/.csv)
POST /api/features/email-validator/validate      { "email": "name@firma.de" }
POST /api/features/email-validator/bulk          (multipart: file, smtp=true|false)
```

## Tests

```bash
npm run test        # Vitest (reine Logik: Muster, Extraktion, Validierung, Scoring)
```

## Sicherheit und Skalierung

- Uploads werden auf Dateiendung, Größe und Inhalt geprüft.
- Dateien werden nur im Arbeitsspeicher verarbeitet und nicht dauerhaft gespeichert.
- Die Verarbeitungslogik läuft ausschließlich in der Node.js-Runtime.
- Es werden keine Formeln ausgeführt und kein dynamischer Code evaluiert.
- API, UI und Prompt-Interpretation sind voneinander getrennt.
- Für größere Dateien sollte später ein Object Store plus Queue/Worker ergänzt werden.
- Authentifizierung, Rate-Limits und Malware-Scanning sollten vor einem öffentlichen Betrieb ergänzt werden.

## Git

Das Projekt ist für Git vorbereitet:

```bash
git add .
git commit -m "Initial modular AI workspace"
```
