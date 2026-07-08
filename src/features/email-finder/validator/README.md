# EmailValidator

Prüft, ob eine E-Mail-Adresse technisch zustellbar ist – **ohne falsche
Sicherheit vorzutäuschen**. Nicht eindeutig entscheidbare Fälle werden als
`riskant` oder `unbekannt` (verdict `manuell_prüfen`) ausgegeben, niemals als
`gültig`. Es wird **keine echte E-Mail versendet** (die SMTP-Konversation endet
nach `RCPT TO`, es folgt kein `DATA`).

## Nutzung

- **UI:** Tool „Email Suche" → Tab „E-Mail prüfen" → Option A (einzeln) oder
  Option B (Liste hochladen).
- **API einzeln:** `POST /api/features/email-validator/validate`
  Body: `{ "email": "name@firma.de", "smtp": true, "domainSignals": true }`
- **API Bulk:** `POST /api/features/email-validator/bulk`
  Multipart: `file` (`.xlsx` / `.xls*` / `.csv` / `.txt`), optional `smtp=true`.
  *(Legacy-`.xls`-Binärformat wird nicht geparst → bitte als `.xlsx`/`.csv` speichern.)*

## Prüfungen

| Bereich | Umsetzung |
|--------|-----------|
| Normalisierung | Trim, Domain klein, Original + normalisiert getrennt |
| Syntax | praktische RFC-5322-Teilmenge, ungültige TLD-Erkennung |
| Tippfehler | `did_you_mean` via Levenshtein gegen gängige Domains |
| Gibberish | Heuristik über den local-part |
| DNS | MX, A-Record-Fallback, Domainexistenz |
| SMTP | Erreichbarkeit, `RCPT TO`, Catch-all, Postfach-voll (Port 25) |
| Adresstyp | Disposable, Free/Webmail, Role-based |
| Risiko | High-Risk-Domain, TLD-Risiko, Subdomain-Mailer, immature (RDAP) |
| Domain-Health | SPF, DKIM (gängige Selektoren), DMARC, MTA-STS |
| Sichtbarkeit | öffentliche Quellen (nur mit konfiguriertem Such-Provider) |

Signale ohne Datenquelle (z. B. Aktivität/Engagement, externe Spamtrap-Feeds)
werden ehrlich als `null` (= unbekannt) geführt.

## Statuslogik

- `final_status = gültig` – SMTP akzeptiert, kein Catch-all.
- `final_status = ungültig` – Syntax/Domain/DNS/MX/SMTP schließen Zustellung aus.
- `final_status = riskant` – Catch-all, Postfach voll, Disposable, Role-based,
  High-Risk-/TLD-Signale u. Ä.
- `final_status = unbekannt` – Timeout, Greylisting, SMTP-Blockade, keine
  eindeutige Antwort.
- `verdict_simple` = `gültig` / `ungültig` / `manuell_prüfen` (riskant + unbekannt).

## Konfiguration (optional, ENV)

| Variable | Zweck |
|----------|-------|
| `EMAIL_VALIDATOR_HELO_DOMAIN` | HELO-/EHLO-Name für SMTP (Default `mail.example.com`) |
| `EMAIL_VALIDATOR_MAIL_FROM` | Absender bei `MAIL FROM` (Default `verify@<HELO_DOMAIN>`) |
| `EMAIL_VALIDATOR_MAX_ROWS` | max. Zeilen pro Bulk-Datei (Default `5000`) |

Für die optionale Prüfung öffentlicher Quellen wird ein konfigurierter
Such-Provider aus der Discovery genutzt (z. B. `BRAVE_SEARCH_KEY`).

## Module

`normalize.ts` (rein/testbar) · `dns.ts` · `smtp.ts` · `rdap.ts` · `data.ts`
(Listen) · `validate.ts` (Orchestrator + Statuslogik) · `bulk.ts` (Datei +
Zusammenfassung) · `types.ts`.
