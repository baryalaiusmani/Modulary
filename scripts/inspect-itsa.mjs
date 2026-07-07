import { chromium } from "playwright-core";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const listUrl = "https://www.itsa365.de/de-de/companies/companies-finden?state%5BrefinementList%5D%5BisExhibitor%5D%5B0%5D=Ja";

const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const page = await browser.newPage({ locale: "de-DE", viewport: { width: 1440, height: 1000 } });

try {
  await page.goto(listUrl, { waitUntil: "networkidle", timeout: 90_000 });
  const body = await page.locator("body").innerText();
  console.log("TITLE", await page.title());
  console.log("COUNT", body.match(/\d+ Treffer in Ausstellern/)?.[0] ?? "not found");

  const links = await page.locator('a[href*="/aussteller/"]').evaluateAll((anchors) =>
    anchors.slice(0, 20).map((anchor) => ({ text: anchor.textContent?.trim(), href: anchor.href })),
  );
  console.log("LIST_LINKS", JSON.stringify(links, null, 2));
  console.log("MORE_BUTTONS", JSON.stringify(await page.locator("button").evaluateAll((buttons) =>
    buttons.filter((button) => /Mehr anzeigen/i.test(button.textContent || "")).map((button) => ({
      text: button.textContent?.trim(),
      testid: button.getAttribute("data-testid"),
      className: button.className,
      parentTestid: button.parentElement?.getAttribute("data-testid"),
    })),
  ), null, 2));
  console.log("CONSENT_BUTTONS", JSON.stringify(await page.locator("#cmpbox button, #cmpbox a").evaluateAll((elements) =>
    elements.map((element) => ({ text: element.textContent?.trim(), id: element.id, className: element.className })),
  ), null, 2));

  const profileUrl = process.env.PROFILE_URL || links.find((link) => link.href)?.href;
  if (!profileUrl) throw new Error("No exhibitor profile found");
  await page.goto(profileUrl, { waitUntil: "networkidle", timeout: 90_000 });
  const relevantLinks = await page.locator("a[href]").evaluateAll((anchors) =>
    anchors
      .map((anchor) => ({ text: anchor.textContent?.trim(), href: anchor.getAttribute("href"), absolute: anchor.href }))
      .filter((link) => /website|kontakt|e-mail|mail|@/i.test(`${link.text} ${link.href}`)),
  );
  console.log("PROFILE", profileUrl);
  console.log("PROFILE_TITLE", await page.title());
  console.log("H1", await page.locator("h1").allTextContents());
  console.log("HEADINGS", await page.locator("h1,h2,h3,h4").allTextContents());
  const profileBody = await page.locator("body").innerText();
  const contactIndex = profileBody.indexOf("Kontaktinformation");
  console.log("CONTACT_TEXT", profileBody.slice(Math.max(0, contactIndex - 300), contactIndex + 1200));
  console.log("RELEVANT_LINKS", JSON.stringify(relevantLinks, null, 2));
} finally {
  await browser.close();
}
