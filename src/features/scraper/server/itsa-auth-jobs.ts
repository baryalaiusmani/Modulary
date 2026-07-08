import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import type { ItsaAuthJobStatus } from "@/features/scraper/types";
import {
  acceptItsaCookies,
  isItsaAuthenticatedUrl,
  ITSA_BROWSER_PROFILE_DIR,
  ITSA_LOGIN_URL,
  ITSA_PEOPLE_URL,
} from "@/features/scraper/server/itsa-browser";

const DEFAULT_CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const jobs = new Map<string, ItsaAuthJobStatus>();

async function runAuth(action: "check" | "login", job: ItsaAuthJobStatus) {
  const context = await chromium.launchPersistentContext(ITSA_BROWSER_PROFILE_DIR, {
    executablePath: process.env.CHROME_PATH || DEFAULT_CHROME_PATH,
    headless: action === "check",
    locale: "de-DE",
    viewport: { width: 1280, height: 900 },
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    if (action === "check") {
      job.message = "Gespeicherte Anmeldung wird geprueft.";
      await page.goto(ITSA_PEOPLE_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await acceptItsaCookies(page);
      const authenticated = isItsaAuthenticatedUrl(page.url());
      Object.assign(job, {
        status: "completed",
        authenticated,
        message: authenticated
          ? "Die gespeicherte it-sa-Anmeldung ist gueltig."
          : "Die gespeicherte Anmeldung ist abgelaufen oder noch nicht vorhanden.",
      });
      return;
    }

    job.message = "Bitte melden Sie sich im geoeffneten Browser an. Wartezeit: maximal 5 Minuten.";
    await page.goto(ITSA_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await acceptItsaCookies(page);
    await page.waitForURL((url) => isItsaAuthenticatedUrl(url.toString()), { timeout: 5 * 60_000 });
    await page.goto(ITSA_PEOPLE_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await acceptItsaCookies(page);
    Object.assign(job, {
      status: "completed",
      authenticated: true,
      message: "Anmeldung wurde erfolgreich gespeichert.",
    });
  } finally {
    await context.close().catch(() => undefined);
  }
}

export function startItsaAuthJob(action: "check" | "login") {
  const job: ItsaAuthJobStatus = {
    jobId: randomUUID(),
    status: "running",
    message: action === "login" ? "Login-Browser wird geoeffnet." : "Anmeldung wird geprueft.",
    authenticated: null,
  };
  jobs.set(job.jobId, job);

  void runAuth(action, job).catch((error) => {
    Object.assign(job, {
      status: "failed",
      authenticated: false,
      message: "Die Anmeldung konnte nicht geprueft werden.",
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return { ...job };
}

export function getItsaAuthJob(jobId: string) {
  const job = jobs.get(jobId);
  return job ? { ...job } : undefined;
}
