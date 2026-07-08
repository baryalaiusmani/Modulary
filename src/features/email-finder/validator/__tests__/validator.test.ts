import { describe, it, expect } from "vitest";
import { normalizeEmail, checkSyntax, suggestCorrection, isGibberish, classify } from "../normalize";
import { detectEmailColumn } from "../bulk";
import { validateEmail } from "../validate";

describe("normalizeEmail", () => {
  it("trimmt und schreibt die Domain klein", () => {
    const n = normalizeEmail("  Max.Mustermann@Firma.DE ");
    expect(n.normalized).toBe("Max.Mustermann@firma.de");
    expect(n.local).toBe("Max.Mustermann");
    expect(n.domain).toBe("firma.de");
  });
});

describe("checkSyntax", () => {
  const ok = (e: string) => checkSyntax(normalizeEmail(e));
  it("akzeptiert gueltige Adressen", () => expect(ok("name@firma.de").ok).toBe(true));
  it("lehnt fehlendes @ ab", () => expect(ok("namefirma.de").ok).toBe(false));
  it("lehnt doppelte Punkte ab", () => expect(ok("a..b@firma.de").ok).toBe(false));
  it("lehnt ungueltige Zeichen ab", () => expect(ok("a b@firma.de").ok).toBe(false));
  it("markiert fehlende TLD", () => expect(ok("name@localhost").invalidTld).toBe(true));
});

describe("suggestCorrection", () => {
  it("schlaegt bekannte Domain bei Tippfehler vor", () => {
    expect(suggestCorrection(normalizeEmail("max@gmai.com"))).toBe("max@gmail.com");
  });
  it("schlaegt nichts vor bei korrekter Domain", () => {
    expect(suggestCorrection(normalizeEmail("max@gmail.com"))).toBeNull();
  });
});

describe("isGibberish", () => {
  it("erkennt zufaellige Zeichenketten", () => expect(isGibberish("xkcdqzptr")).toBe(true));
  it("laesst echte Namen durch", () => expect(isGibberish("max.mustermann")).toBe(false));
  it("ist bei sehr kurzen Localparts vorsichtig", () => expect(isGibberish("info")).toBe(false));
});

describe("classify", () => {
  it("erkennt Free-Webmail, Disposable, Role und TLD-Risiko", () => {
    expect(classify(normalizeEmail("a@gmail.com")).free_or_webmail).toBe(true);
    expect(classify(normalizeEmail("a@mailinator.com")).disposable).toBe(true);
    expect(classify(normalizeEmail("info@firma.de")).role_based).toBe(true);
    expect(classify(normalizeEmail("a@firma.tk")).tld_risk).toBe(true);
  });
});

describe("detectEmailColumn", () => {
  it("waehlt die exakte E-Mail-Spalte", () => {
    expect(detectEmailColumn(["Name", "E-Mail", "Stadt"]).column).toBe("E-Mail");
  });
  it("erkennt Varianten case-insensitive", () => {
    expect(detectEmailColumn(["EMAIL"]).column).toBe("EMAIL");
  });
  it("wirft bei fehlender Spalte", () => {
    expect(() => detectEmailColumn(["Name", "Stadt"])).toThrow();
  });
});

describe("validateEmail - Statuslogik (offline, ungueltige Syntax)", () => {
  it("wertet Syntaxfehler eindeutig als ungueltig", async () => {
    const r = await validateEmail("keine-email", { smtp: false, domainSignals: false });
    expect(r.syntax_ok).toBe(false);
    expect(r.final_status).toBe("ungültig");
    expect(r.verdict_simple).toBe("ungültig");
    expect(r.reason_codes).toContain("SYNTAX_INVALID");
  });

  it("wertet unbekannte Faelle nie als gueltig", async () => {
    // Reiner Struktur-Check des Vertrags: verdict_simple ist nie 'gültig',
    // solange final_status nicht 'gültig' ist.
    const r = await validateEmail("x y@firma.de", { smtp: false, domainSignals: false });
    expect(r.verdict_simple).not.toBe("gültig");
  });
});
