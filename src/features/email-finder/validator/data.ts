// Statische Listen und Heuristik-Daten fuer den EmailValidator.
// Bewusst kuratiert und erweiterbar. Keine Anspruch auf Vollstaendigkeit -
// unbekannte Faelle werden im Ergebnis ehrlich als "unbekannt" gefuehrt.

// Bekannte Wegwerf-/Temp-Mail-Domains (Auszug der gaengigsten).
export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamailblock.com", "sharklasers.com",
  "10minutemail.com", "10minutemail.net", "temp-mail.org", "tempmail.com", "tempmailo.com",
  "trashmail.com", "trashmail.de", "yopmail.com", "getnada.com", "nada.email",
  "dispostable.com", "maildrop.cc", "mohmal.com", "throwawaymail.com", "fakeinbox.com",
  "mailnesia.com", "mytemp.email", "spam4.me", "grr.la", "mailcatch.com", "moakt.com",
  "emailondeck.com", "tempinbox.com", "mailsac.com", "burnermail.io", "einrot.com",
]);

// Domains, die eher langfristig als Wegwerf genutzt werden (weichere Kategorie).
export const LONG_TERM_DISPOSABLE_DOMAINS = new Set([
  "simplelogin.io", "anonaddy.com", "addy.io", "33mail.com", "spamgourmet.com", "duck.com",
]);

// Kostenlose Webmail-Anbieter.
export const FREE_WEBMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.de", "ymail.com", "rocketmail.com",
  "outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "gmx.de", "gmx.net", "gmx.com", "web.de",
  "t-online.de", "freenet.de", "mail.com", "zoho.com", "protonmail.com", "proton.me",
  "yandex.com", "yandex.ru", "mail.ru", "posteo.de", "mailbox.org",
]);

// Rollen-/Funktions-Localparts.
export const ROLE_LOCALPARTS = new Set([
  "info", "sales", "support", "contact", "kontakt", "admin", "office", "hello", "hallo",
  "help", "service", "billing", "accounts", "accounting", "buchhaltung", "rechnung",
  "marketing", "press", "presse", "jobs", "career", "careers", "karriere", "bewerbung",
  "hr", "team", "mail", "email", "no-reply", "noreply", "postmaster", "webmaster", "abuse",
  "security", "legal", "datenschutz", "finance", "vertrieb", "empfang", "zentrale",
  "newsletter", "news", "enquiries", "enquiry", "anfrage", "bestellung", "order",
]);

// Bekannte Domains fuer Tippfehler-Vorschlaege (did_you_mean).
export const COMMON_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.de", "hotmail.com", "hotmail.de",
  "outlook.com", "outlook.de", "live.com", "icloud.com", "gmx.de", "gmx.net", "web.de",
  "t-online.de", "aol.com", "protonmail.com", "proton.me", "mail.com",
];

// TLDs mit erhoehtem Missbrauchsrisiko (Auszug).
export const RISKY_TLDS = new Set([
  "tk", "ml", "ga", "cf", "gq", "top", "work", "click", "link", "country", "kim",
  "science", "party", "gdn", "review", "stream", "download", "loan", "racing", "win",
  "bid", "date", "faith", "cricket", "accountant", "men", "mom", "xyz", "rest", "zip", "mov",
]);

// Bekannte Provider anhand von MX-Hostmustern.
export const MX_PROVIDERS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /google\.com$|googlemail\.com$|aspmx\.l\.google/i, name: "Google Workspace / Gmail" },
  { pattern: /outlook\.com$|protection\.outlook|office365|microsoft/i, name: "Microsoft 365 / Outlook" },
  { pattern: /yahoodns\.net$|yahoo/i, name: "Yahoo" },
  { pattern: /icloud\.com$|apple/i, name: "Apple iCloud" },
  { pattern: /\.gmx\.|gmx\.net$/i, name: "GMX" },
  { pattern: /web\.de$|1und1|ionos|kundenserver|united-internet/i, name: "IONOS / United Internet" },
  { pattern: /zoho/i, name: "Zoho" },
  { pattern: /protonmail|proton\.me/i, name: "Proton" },
  { pattern: /mailgun|sendgrid|amazonses|mailchimp|mandrill/i, name: "Transaktions-/Mailservice" },
  { pattern: /mimecast|proofpoint|barracuda|messagelabs|fireeye/i, name: "Mail-Security-Gateway" },
];
