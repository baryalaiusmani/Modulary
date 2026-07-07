import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const LIST_URL = "https://www.itsa365.de/de-de/companies/companies-finden?state%5BrefinementList%5D%5BisExhibitor%5D%5B0%5D=Ja";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUTPUT_DIR = path.resolve("data/itsa-2026");
const CHECKPOINT_PATH = path.join(OUTPUT_DIR, "checkpoint.json");
const LINKS_PATH = path.join(OUTPUT_DIR, "profile-links.json");
const RESULTS_PATH = path.join(OUTPUT_DIR, "companies.json");
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 5));
const HEADLESS = process.env.HEADLESS !== "0";
const REQUESTED_TARGET = Number(process.env.TARGET_COUNT || 0);

function cleanDomain(rawUrl) {
  if (!rawUrl) return "";
  const withoutProtocol = rawUrl.trim().replace(/^https?:\/\//i, "");
  return withoutProtocol.replace(/\/$/, "");
}

function decodeEmailHref(href) {
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

function extractContactPerson(bodyText) {
  const lines = bodyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labelPattern = /^(ansprechpartner(?:in)?|ansprechperson|kontaktperson)$/i;
  const labelIndex = lines.findIndex((line) => labelPattern.test(line));
  if (labelIndex < 0) return "";
  const candidate = lines[labelIndex + 1] || "";
  return /website|kontakt|e-mail|telefon|halle|stand/i.test(candidate) ? "" : candidate;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function collectProfileLinks(page) {
  await page.goto(LIST_URL, { waitUntil: "networkidle", timeout: 90_000 });
  const rejectConsent = page.locator(".cmpboxbtnno");
  if ((await rejectConsent.count()) && (await rejectConsent.isVisible())) {
    await rejectConsent.click();
    await page.waitForTimeout(350);
  }
  await page.locator('a[href*="/aussteller/"]').first().waitFor({ state: "visible", timeout: 30_000 });
  const bodyText = await page.locator("body").innerText();
  const listedTarget = Number(bodyText.match(/(\d+) Treffer in Ausstellern/)?.[1] || 0);
  const target = REQUESTED_TARGET || listedTarget;
  let previousCount = 0;
  let stagnantRounds = 0;

  while (true) {
    const links = await page.locator('a[href*="/aussteller/"]').evaluateAll((anchors) =>
      [...new Set(anchors.map((anchor) => anchor.href).filter(Boolean))],
    );
    process.stdout.write(`\rProfile geladen: ${links.length}/${target || "?"}`);
    if (target && links.length >= target) {
      process.stdout.write("\n");
      return links.slice(0, target);
    }

    stagnantRounds = links.length === previousCount ? stagnantRounds + 1 : 0;
    previousCount = links.length;
    const moreButton = page.locator("button.w-full").filter({ hasText: "Mehr anzeigen" });
    if ((await moreButton.count()) === 0 || !(await moreButton.isVisible()) || stagnantRounds >= 3) {
      process.stdout.write("\n");
      return links;
    }
    await moreButton.scrollIntoViewIfNeeded();
    await moreButton.click({ timeout: 15_000 });
    await page.waitForFunction(
      (count) => new Set([...document.querySelectorAll('a[href*="/aussteller/"]')].map((anchor) => anchor.href)).size > count,
      previousCount,
      { timeout: 15_000 },
    ).catch(() => page.waitForTimeout(750));
  }
}

async function scrapeProfile(page, profileUrl) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(profileUrl, { waitUntil: "networkidle", timeout: 75_000 });
      const title = await page.title();
      const companyName = title.replace(/\s*\|\s*Unternehmen\s*$/i, "").trim()
        || (await page.locator("h1,h2").first().innerText()).trim();
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
      };
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(attempt * 800);
    }
  }
  throw lastError;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: HEADLESS, executablePath: CHROME_PATH });
  const context = await browser.newContext({ locale: "de-DE", viewport: { width: 1440, height: 1000 } });

  try {
    let profileLinks = await readJson(LINKS_PATH, []);
    if (!profileLinks.length || REQUESTED_TARGET) {
      const listPage = await context.newPage();
      profileLinks = await collectProfileLinks(listPage);
      await fs.writeFile(LINKS_PATH, JSON.stringify(profileLinks, null, 2));
      await listPage.close();
    }

    const saved = await readJson(CHECKPOINT_PATH, []);
    const records = new Map(saved.filter((record) => !record.fehler).map((record) => [record.profilUrl, record]));
    const queue = profileLinks.filter((url) => !records.has(url));
    let completed = records.size;
    let failures = 0;
    let writeChain = Promise.resolve();

    async function checkpoint() {
      const ordered = profileLinks.map((url) => records.get(url)).filter(Boolean);
      writeChain = writeChain.then(async () => {
        let lastError;
        for (let attempt = 1; attempt <= 6; attempt += 1) {
          try {
            await fs.writeFile(CHECKPOINT_PATH, JSON.stringify(ordered, null, 2));
            return;
          } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, attempt * 300));
          }
        }
        throw lastError;
      });
      await writeChain;
    }

    async function worker(workerId) {
      let page = await context.newPage();
      let processedByWorker = 0;
      while (queue.length) {
        const profileUrl = queue.shift();
        if (!profileUrl) break;
        try {
          const record = await scrapeProfile(page, profileUrl);
          records.set(profileUrl, record);
        } catch (error) {
          failures += 1;
          records.set(profileUrl, {
            unternehmensname: "",
            domain: "",
            ansprechpartner: "",
            email: "",
            profilUrl: profileUrl,
            fehler: error instanceof Error ? error.message : String(error),
          });
          await page.close().catch(() => undefined);
          page = await context.newPage();
          await page.waitForTimeout(1_500);
        }
        completed += 1;
        processedByWorker += 1;
        console.log(`[${completed}/${profileLinks.length}] Worker ${workerId} | Fehler: ${failures} | ${profileUrl}`);
        if (completed % 10 === 0) await checkpoint();
        if (processedByWorker % 40 === 0) {
          await page.close();
          page = await context.newPage();
        }
        await page.waitForTimeout(350 + Math.floor(Math.random() * 350));
      }
      await page.close();
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, (_, index) => worker(index + 1)));
    await checkpoint();
    const ordered = profileLinks.map((url) => records.get(url)).filter(Boolean);
    await fs.writeFile(RESULTS_PATH, JSON.stringify(ordered, null, 2));

    const complete = ordered.filter((record) => !record.fehler).length;
    const withDomain = ordered.filter((record) => record.domain).length;
    const withEmail = ordered.filter((record) => record.email).length;
    const withContact = ordered.filter((record) => record.ansprechpartner).length;
    console.log(JSON.stringify({ total: ordered.length, complete, failures, withDomain, withEmail, withContact }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
