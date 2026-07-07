import { chromium, type BrowserContext, type Page } from "playwright-core";
import type { ItsaExhibitor, ItsaScanPhase, ItsaScanResult } from "@/features/scraper/types";
import { exhibitorKey, readKnownExhibitors } from "@/features/scraper/server/itsa-store";

const DEFAULT_CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const LIST_LINK_SELECTOR = 'a[href*="/aussteller/"]';
const MAX_PROFILE_CONCURRENCY = Math.max(1, Number(process.env.ITSA_PROFILE_CONCURRENCY || 4));

type ScanProgress = {
  phase: ItsaScanPhase;
  message: string;
  progress: number;
  totalFound?: number;
  processedProfiles?: number;
};

type ScanOptions = {
  visibleBrowser?: boolean;
  onProgress?: (progress: ScanProgress) => void;
};

function assertItsaUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Bitte geben Sie eine gueltige it-sa-URL ein.");
  }

  if (!url.hostname.endsWith("itsa365.de")) {
    throw new Error("Der Scraper ist aktuell nur fuer it-sa-URLs auf itsa365.de freigeschaltet.");
  }

  return url.toString();
}

function cleanDomain(rawUrl: string | null) {
  if (!rawUrl) return "";
  return rawUrl.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function decodeEmailHref(href: string | null) {
  const value = String(href || "").replace(/^mailto:/i, "").trim();
  if (!value) return "";
  if (value.includes("@")) return decodeURIComponent(value.split("?")[0]);

  try {
    const decoded = Buffer.from(value, "base64").toString("utf8").trim();
    return decoded.includes("@") ? decoded : "";
  } catch {
    return "";
  }
}

function extractContactPerson(bodyText: string) {
  const lines = bodyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labelPattern = /^(ansprechpartner(?:in)?|ansprechperson|kontaktperson)$/i;
  const labelIndex = lines.findIndex((line) => labelPattern.test(line));
  if (labelIndex < 0) return "";

  const candidate = lines[labelIndex + 1] || "";
  return /website|kontakt|e-mail|telefon|halle|stand/i.test(candidate) ? "" : candidate;
}

async function rejectConsentIfVisible(page: Page) {
  const rejectConsent = page.locator(".cmpboxbtnno");
  if ((await rejectConsent.count()) && (await rejectConsent.isVisible())) {
    await rejectConsent.click();
    await page.waitForTimeout(250);
  }
}

async function collectProfileLinks(page: Page, listUrl: string) {
  await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await rejectConsentIfVisible(page);
  await page.locator(LIST_LINK_SELECTOR).first().waitFor({ state: "visible", timeout: 30_000 });

  const bodyText = await page.locator("body").innerText();
  const listedTarget = Number(bodyText.match(/(\d+) Treffer in Ausstellern/)?.[1] || 0);
  let previousCount = 0;
  let stagnantRounds = 0;

  while (true) {
    const links = await page.locator(LIST_LINK_SELECTOR).evaluateAll((anchors) =>
      [...new Set(anchors.map((anchor) => (anchor as HTMLAnchorElement).href).filter(Boolean))],
    );

    if (listedTarget && links.length >= listedTarget) return links.slice(0, listedTarget);

    stagnantRounds = links.length === previousCount ? stagnantRounds + 1 : 0;
    previousCount = links.length;

    const moreButton = page.locator("button.w-full").filter({ hasText: "Mehr anzeigen" });
    if ((await moreButton.count()) === 0 || !(await moreButton.isVisible()) || stagnantRounds >= 3) {
      return links;
    }

    await moreButton.scrollIntoViewIfNeeded();
    await moreButton.click({ timeout: 15_000 });
    await page.waitForFunction(
      (count) => new Set([...document.querySelectorAll('a[href*="/aussteller/"]')].map((anchor) => (anchor as HTMLAnchorElement).href)).size > count,
      previousCount,
      { timeout: 15_000 },
    ).catch(() => page.waitForTimeout(750));
  }
}

async function scrapeProfile(page: Page, profileUrl: string, scannedAt: string): Promise<ItsaExhibitor> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 75_000 });
      await rejectConsentIfVisible(page);

      const title = await page.title();
      const heading = await page.locator("h1,h2").first().innerText().catch(() => "");
      const companyName = title.replace(/\s*\|\s*Unternehmen\s*$/i, "").trim() || heading.trim();
      const websiteLink = page.locator('a[href^="http"]', { hasText: "Website" }).first();
      const website = (await websiteLink.count()) ? await websiteLink.getAttribute("href") : "";
      const emailLink = page.locator('a[href^="mailto:"]', { hasText: /Kontakt per E-Mail/i }).first();
      const emailHref = (await emailLink.count()) ? await emailLink.getAttribute("href") : "";
      const bodyText = await page.locator("body").innerText();

      return {
        unternehmensname: companyName,
        domain: cleanDomain(website),
        ansprechpartner: extractContactPerson(bodyText),
        email: decodeEmailHref(emailHref),
        profilUrl: profileUrl,
        firstSeenAt: scannedAt,
        lastSeenAt: scannedAt,
      };
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(attempt * 800);
    }
  }

  throw lastError;
}

async function scrapeNewProfiles(context: BrowserContext, profileUrls: string[], scannedAt: string, options: ScanOptions = {}) {
  const queue = [...profileUrls];
  const results: ItsaExhibitor[] = [];
  let processed = 0;

  async function worker() {
    const page = await context.newPage();
    try {
      while (queue.length) {
        const profileUrl = queue.shift();
        if (!profileUrl) break;
        results.push(await scrapeProfile(page, profileUrl, scannedAt));
        processed += 1;
        options.onProgress?.({
          phase: "scraping-profiles",
          message: `Profil ${processed} von ${profileUrls.length} wird ausgelesen.`,
          progress: 25 + Math.round((processed / Math.max(profileUrls.length, 1)) * 70),
          processedProfiles: processed,
          totalFound: profileUrls.length,
        });
        await page.waitForTimeout(250);
      }
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_PROFILE_CONCURRENCY, queue.length || 1) }, () => worker()));
  return results;
}

export async function scanItsaExhibitors(rawUrl: string, options: ScanOptions = {}): Promise<ItsaScanResult> {
  const sourceUrl = assertItsaUrl(rawUrl);
  const scannedAt = new Date().toISOString();
  const known = await readKnownExhibitors();
  const knownByKey = new Map(known.map((exhibitor) => [exhibitorKey(exhibitor), exhibitor]));
  const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME_PATH;

  options.onProgress?.({
    phase: "opening-list",
    message: "Browser wird gestartet und it-sa-Liste wird geoeffnet.",
    progress: 5,
  });

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: options.visibleBrowser ? false : process.env.HEADLESS !== "0",
  });
  const context = await browser.newContext({ locale: "de-DE", viewport: { width: 1440, height: 1000 } });

  try {
    const listPage = await context.newPage();
    options.onProgress?.({
      phase: "loading-list",
      message: "Ausstellerlinks werden geladen.",
      progress: 12,
    });
    const profileLinks = await collectProfileLinks(listPage, sourceUrl);
    await listPage.close();

    const unknownProfileLinks = profileLinks.filter((profileUrl) => !knownByKey.has(exhibitorKey({ unternehmensname: "", profilUrl: profileUrl })));
    options.onProgress?.({
      phase: "scraping-profiles",
      message: `${profileLinks.length} Aussteller gefunden. ${unknownProfileLinks.length} neue Profile werden ausgelesen.`,
      progress: 25,
      totalFound: profileLinks.length,
      processedProfiles: 0,
    });
    const scrapedNew = await scrapeNewProfiles(context, unknownProfileLinks, scannedAt, options);
    const scrapedByKey = new Map(scrapedNew.map((exhibitor) => [exhibitorKey(exhibitor), exhibitor]));

    const allExhibitors = profileLinks.map((profileUrl) => {
      const key = exhibitorKey({ unternehmensname: "", profilUrl: profileUrl });
      const knownRecord = knownByKey.get(key);
      const scrapedRecord = scrapedByKey.get(key);
      if (scrapedRecord) return scrapedRecord;
      if (knownRecord) return { ...knownRecord, lastSeenAt: scannedAt };
      return {
        unternehmensname: profileUrl.split("/").pop() || profileUrl,
        domain: "",
        ansprechpartner: "",
        email: "",
        profilUrl: profileUrl,
        firstSeenAt: scannedAt,
        lastSeenAt: scannedAt,
      };
    });

    const result = {
      scannedAt,
      sourceUrl,
      totalFound: profileLinks.length,
      knownBefore: known.length,
      newCount: scrapedNew.length,
      updatedKnownCount: known.length + scrapedNew.length,
      newExhibitors: scrapedNew.sort((left, right) => left.unternehmensname.localeCompare(right.unternehmensname, "de")),
      allExhibitors,
    };
    options.onProgress?.({
      phase: "completed",
      message: "Scan abgeschlossen.",
      progress: 100,
      totalFound: profileLinks.length,
      processedProfiles: unknownProfileLinks.length,
    });
    return result;
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
