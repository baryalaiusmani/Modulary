# E-Mail Discovery (modulare Erweiterung)

Diese Module erweitern die bestehende Website-/Domain-Suche des Email-Finders,
**ohne** die vorhandene Logik zu veraendern. Der Orchestrator in `index.ts`
kombiniert die Basis-Treffer der Website-Suche mit optionalen Zusatzquellen,
verifiziert (MX), bewertet (Confidence Score) und dedupliziert alles.

## Sicheres Standardverhalten

Ohne Konfiguration ist **nur die MX-Pruefung aktiv**. Alle netzbasierten
Zusatzquellen sind ausgeschaltet, d. h. das Tool findet exakt dieselben
E-Mails wie zuvor -- nur zusaetzlich verifiziert und mit Confidence Score.
Es wird **nie** ein zuvor gefundener Treffer entfernt.

## Aktivierung (Umgebungsvariablen)

In `.env` (oder Deployment-Umgebung) setzen. Werte: `1` / `true` / `on`.

| Variable                     | Standard | Wirkung |
|------------------------------|----------|---------|
| `EMAIL_FINDER_VERIFY_MX`     | an       | Syntax- + MX-Pruefung, Scoring |
| `EMAIL_FINDER_PATTERNS`      | aus      | E-Mail-Muster erkennen + Adressen generieren (klar als "geraten" markiert) |
| `EMAIL_FINDER_SEARCH`        | aus      | Suchmaschinen-Dorks (braucht Such-API-Key, s. u.) |
| `EMAIL_FINDER_DOCUMENTS`     | aus      | PDF/DOCX/PPTX auf der Domain scannen |
| `EMAIL_FINDER_CRT`           | aus      | Subdomains via crt.sh (kostenlos) |
| `EMAIL_FINDER_GITHUB`        | aus      | oeffentliche GitHub-Codesuche (braucht `GITHUB_TOKEN`) |
| `EMAIL_FINDER_WAYBACK`       | aus      | historische Archivstaende (kostenlos) |
| `EMAIL_FINDER_PGP`           | aus      | PGP-Keyserver-Index (kostenlos) |

## API-Keys (nur fuer die jeweilige Quelle noetig)

Der erste konfigurierte Such-Provider wird automatisch verwendet:

| Provider   | Variablen |
|------------|-----------|
| Google CSE | `GOOGLE_CSE_KEY`, `GOOGLE_CSE_ID` |
| Bing       | `BING_SEARCH_KEY` |
| Brave      | `BRAVE_SEARCH_KEY` |
| SerpAPI    | `SERPAPI_KEY` |
| GitHub     | `GITHUB_TOKEN` |

## Module

| Datei | Interface | Zweck |
|-------|-----------|-------|
| `patterns.ts` | `EmailPatternGenerator` | Muster erkennen + Adressen generieren |
| `verifier.ts` | `EmailVerifier` | Syntax + MX-Records |
| `contacts.ts` | `ContactExtractor` | Namen + Rollen aus HTML |
| `dorks.ts` | – | Suchabfragen bauen |
| `search-providers.ts` | `SearchProvider` | Google/Bing/Brave/SerpAPI |
| `sources/crt.ts` | – | Subdomains (Certificate Transparency) |
| `sources/documents.ts` | `DocumentScanner` | Dokumente scannen |
| `sources/github.ts` | `OsintSource` | GitHub-Codesuche |
| `sources/wayback.ts` | `OsintSource` | Archive.org |
| `sources/adapters.ts` | `OsintSource` | PGP-Keyserver, Branchenverzeichnis (Platzhalter) |
| `scoring.ts` | – | Zusammenfuehren + Confidence Score |
| `index.ts` | – | Orchestrator + Config |

## Datenschutz

Es werden ausschliesslich oeffentlich zugaengliche, geschaeftliche Quellen
genutzt. Keine Leaks/kompromittierten Datenbanken, keine login-geschuetzten
Bereiche. Generierte Adressen sind immer als `isGenerated` gekennzeichnet.

## Hinweis zur Dokument-Extraktion

`sources/documents.ts` nutzt eine best-effort-Textextraktion ohne externe
Abhaengigkeit. Fuer vollstaendige/zuverlaessige Extraktion kann in
`extractText()` ein echter Parser (`pdf-parse`, `mammoth`) eingehaengt werden.
