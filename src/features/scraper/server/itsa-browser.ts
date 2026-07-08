import path from "node:path";
import type { Page } from "playwright-core";

export const ITSA_LOGIN_URL = "https://www.itsa365.de/auth/login?ui_locales=de&returnTo=de-de";
export const ITSA_PEOPLE_URL = "https://www.itsa365.de/de-de/community/personen-finden";
export const ITSA_BROWSER_PROFILE_DIR = path.join(process.cwd(), "data", "itsa-scraper", "browser-profile");

export function isItsaAuthenticatedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.hostname.endsWith("itsa365.de")
      && !url.hostname.includes("identity.")
      && !url.pathname.includes("/auth/login");
  } catch {
    return false;
  }
}

export async function acceptItsaCookies(page: Page) {
  const selectors = [
    ".cmpboxbtnyes",
    'button:has-text("Alle akzeptieren")',
    'button:has-text("Akzeptieren")',
    '[data-testid="uc-accept-all-button"]',
  ];

  for (const selector of selectors) {
    const button = page.locator(selector);
    if ((await button.count()) === 1 && (await button.isVisible())) {
      await button.click({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(250);
      return true;
    }
  }
  return false;
}
