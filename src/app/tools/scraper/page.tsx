import { ItsaScraperWorkspace } from "@/features/scraper/components/itsa-scraper-workspace";

export default function ScraperToolPage() {
  return (
    <main className="page tool-page">
      <div className="tool-heading">
        <span className="eyebrow">it-sa Scraper</span>
        <h1>Neue Aussteller.<br />Automatisch erkennen.</h1>
        <p>
          Geben Sie eine it-sa-URL ein, scannen Sie die aktuelle Ausstellerliste
          und vergleichen Sie sie mit den bereits gespeicherten Firmen.
        </p>
      </div>
      <ItsaScraperWorkspace />
    </main>
  );
}
