import { describe, it, expect, beforeAll } from "vitest";
import { runDiscovery } from "../index";
import { asciiFold, splitName, extractEmailsFromText, normalizeDomain } from "../text";
import { detectPattern, inferPatterns, generateForName, DefaultEmailPatternGenerator } from "../patterns";
import { RegexContactExtractor } from "../contacts";
import { inferPersonName, inferRole, inferPersonAndRole } from "../name-role";
import { buildDorks } from "../dorks";
import { mergeFindings, scoreFinding } from "../scoring";
import type { Contact, EmailFinding } from "../types";

describe("text helpers", () => {
  it("faltet Umlaute in ASCII", () => {
    expect(asciiFold("Müller")).toBe("mueller");
    expect(asciiFold("Weiß")).toBe("weiss");
    expect(asciiFold("Jörg")).toBe("joerg");
  });

  it("zerlegt Namen in Vor- und Nachname", () => {
    expect(splitName("Anna Schmidt")).toEqual({ first: "anna", last: "schmidt" });
    expect(splitName("Hans Peter Müller")).toEqual({ first: "hans", last: "mueller" });
    expect(splitName("Einzelwort")).toBeNull();
  });

  it("extrahiert E-Mails und filtert Rauschen", () => {
    const text = "Kontakt: info@firma.de, test@example.com, logo@bild.png und max@firma.de";
    const emails = extractEmailsFromText(text);
    expect(emails).toContain("info@firma.de");
    expect(emails).toContain("max@firma.de");
    expect(emails).not.toContain("test@example.com"); // example wird gefiltert
    expect(emails).not.toContain("logo@bild.png"); // Bilddatei wird gefiltert
  });

  it("normalisiert Domains", () => {
    expect(normalizeDomain("https://www.Firma.de/kontakt")).toBe("firma.de");
    expect(normalizeDomain("WWW.Beispiel.COM")).toBe("beispiel.com");
  });
});

describe("pattern detection", () => {
  it("erkennt firstname.lastname", () => {
    expect(detectPattern("anna.schmidt@firma.de", "Anna Schmidt")).toBe("firstname.lastname");
  });

  it("erkennt firstinitiallastname", () => {
    expect(detectPattern("aschmidt@firma.de", "Anna Schmidt")).toBe("firstinitiallastname");
  });

  it("leitet das haeufigste Muster ab", () => {
    const patterns = inferPatterns([
      { email: "anna.schmidt@firma.de", name: "Anna Schmidt" },
      { email: "max.mustermann@firma.de", name: "Max Mustermann" },
    ]);
    expect(patterns[0]).toBe("firstname.lastname");
  });

  it("generiert Adressen fuer einen Namen", () => {
    const emails = generateForName("Anna Schmidt", "firma.de", ["firstname.lastname"]);
    expect(emails).toContain("anna.schmidt@firma.de");
  });

  it("markiert generierte Adressen als unsicher und mischt sie nicht mit echten", () => {
    const contacts: Contact[] = [{ name: "Anna Schmidt", role: "CEO", sourceUrl: "https://firma.de/team", evidenceText: "" }];
    const generated = new DefaultEmailPatternGenerator().generate("firma.de", ["max.mustermann@firma.de"], contacts);
    expect(generated.length).toBeGreaterThan(0);
    for (const finding of generated) {
      expect(finding.isGenerated).toBe(true);
      expect(finding.sourceType).toBe("pattern_generated");
      expect(finding.confidenceScore).toBeLessThan(50);
    }
    // echte Adresse darf nie generiert werden
    expect(generated.map((f) => f.email)).not.toContain("max.mustermann@firma.de");
  });
});

describe("contact extraction", () => {
  it("erkennt Name + Rolle aus HTML", () => {
    const html = `<div><h3>Anna Schmidt</h3><p>Geschäftsführerin</p></div><div><h3>Max Mustermann</h3><p>Head of Sales</p></div>`;
    const contacts = new RegexContactExtractor().extract(html, "https://firma.de/team");
    const names = contacts.map((c) => c.name);
    expect(names).toContain("Anna Schmidt");
    expect(names).toContain("Max Mustermann");
    expect(contacts.find((c) => c.name === "Max Mustermann")?.role).toMatch(/Sales/);
  });
});

describe("name + role (echte Team-Seite mit Navigation)", () => {
  // Nachgebildeter Seitentext: erst Navigation/Seitenleiste (Rollen-Woerter!),
  // dann der eigentliche Personeninhalt.
  const page = [
    "Aktuelles Forschung Buecher Studienangebot Service Downloads Ueber uns Suche",
    "Das Institut Allgemeine Informationen Team Die aktuellen Mitarbeiter",
    "Institutsleitung Stellvertretende Institutsleitung Wissenschaftlicher Koordinator",
    "Teloeken Sofie Sofie Teloeken Wissenschaftliche Mitarbeiterin",
    "Aufgaben Aktive Forschung in Deep Learning Projekt KISSHome",
    "E-Mail teloeken@internet-sicherheit.de Raum A4.UG.03",
  ].join(" ");

  it("ignoriert Navigations-Woerter und findet den echten Namen ueber die E-Mail", () => {
    expect(inferPersonName(page, "teloeken@internet-sicherheit.de")).toBe("Sofie Teloeken");
  });

  it("erkennt firstname.lastname direkt aus dem Localpart", () => {
    expect(inferPersonName(page, "kevin.wollowski@internet-sicherheit.de")).toBe("Kevin Wollowski");
  });

  it("liefert keinen Namen fuer generische Postfaecher", () => {
    expect(inferPersonName(page, "info@internet-sicherheit.de")).toBe("");
    expect(inferPersonName(page, "kontakt@internet-sicherheit.de")).toBe("");
  });

  it("liest die Rolle hinter dem Namen, nicht aus der Navigation", () => {
    const { name, role } = inferPersonAndRole(page, "E-Mail teloeken@internet-sicherheit.de Raum", "teloeken@internet-sicherheit.de");
    expect(name).toBe("Sofie Teloeken");
    expect(role).toMatch(/Mitarbeiterin/);
    expect(role).not.toMatch(/Institutsleitung/);
  });

  it("erkennt gaengige Rollen-Phrasen", () => {
    expect(inferRole("... Anna Schmidt Geschäftsführerin der Firma")).toMatch(/Gesch/);
    expect(inferRole("... Head of Sales bei uns")).toMatch(/Head of Sales/);
  });
});

describe("dorks", () => {
  it("baut site- und filetype-Abfragen", () => {
    const queries = buildDorks("firma.de").map((d) => d.query);
    expect(queries).toContain(`site:firma.de "@firma.de"`);
    expect(queries.some((q) => q.includes("filetype:pdf"))).toBe(true);
  });
});

describe("orchestrator (runDiscovery)", () => {
  // Netzunabhaengig: MX-Pruefung und alle Zusatzquellen aus.
  beforeAll(() => {
    process.env.EMAIL_FINDER_VERIFY_MX = "false";
    process.env.EMAIL_FINDER_PATTERNS = "false";
  });

  it("behaelt bestehende Treffer und reichert sie an, ohne welche zu verlieren", async () => {
    const base = [
      { email: "info@firma.de", name: "", jobTitle: "", source: "https://firma.de/impressum" },
      { email: "anna.schmidt@firma.de", name: "Anna Schmidt", jobTitle: "CEO", source: "https://firma.de/team" },
    ];
    const { findings, log } = await runDiscovery("https://www.firma.de", base);

    const emails = findings.map((f) => f.email);
    // Kein bestehender Treffer geht verloren.
    expect(emails).toContain("info@firma.de");
    expect(emails).toContain("anna.schmidt@firma.de");
    // Jeder Treffer hat jetzt einen Confidence Score.
    for (const finding of findings) {
      expect(finding.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(finding.confidenceScore).toBeLessThanOrEqual(100);
    }
    // Die Website-Suche ist im Log dokumentiert.
    expect(log.find((entry) => entry.method === "website-crawl")?.count).toBe(2);
  });
});

describe("scoring", () => {
  const base = (over: Partial<EmailFinding>): EmailFinding => ({
    email: "a@firma.de",
    domain: "firma.de",
    sourceUrl: "https://firma.de",
    sourceType: "website",
    foundOn: new Date().toISOString(),
    confidenceScore: 0,
    isVerified: false,
    isGenerated: false,
    relatedPersonName: "",
    relatedPersonRole: "",
    evidenceText: "",
    discoveryMethod: "website-crawl",
    ...over,
  });

  it("bevorzugt bestaetigte Quelle gegen generierte beim Merge", () => {
    const merged = mergeFindings([
      base({ email: "a@firma.de", sourceType: "pattern_generated", isGenerated: true }),
      base({ email: "a@firma.de", sourceType: "website" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].isGenerated).toBe(false);
    expect(merged[0].occurrences).toBe(2);
  });

  it("erhoeht den Score bei gueltigem MX und Rolle", () => {
    const withMx = scoreFinding(
      { ...base({ relatedPersonRole: "CEO" }), occurrences: 1 },
      { domain: "firma.de", syntaxOk: true, hasMx: true, mxHosts: ["mx.firma.de"], isCatchAll: null },
    );
    const withoutMx = scoreFinding(
      { ...base({}), occurrences: 1 },
      { domain: "firma.de", syntaxOk: true, hasMx: false, mxHosts: [], isCatchAll: null },
    );
    expect(withMx.confidenceScore).toBeGreaterThan(withoutMx.confidenceScore);
    expect(withMx.isVerified).toBe(true);
  });

  it("haelt generierte Adressen im unteren Score-Bereich", () => {
    const scored = scoreFinding(
      { ...base({ sourceType: "pattern_generated", isGenerated: true, relatedPersonRole: "CEO" }), occurrences: 3 },
      { domain: "firma.de", syntaxOk: true, hasMx: true, mxHosts: ["mx"], isCatchAll: null },
    );
    expect(scored.confidenceScore).toBeLessThanOrEqual(45);
    expect(scored.isVerified).toBe(false);
  });
});
