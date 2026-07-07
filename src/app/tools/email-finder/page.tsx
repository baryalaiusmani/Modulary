import { EmailFinderWorkspace } from "@/features/email-finder/components/email-finder-workspace";

export default function EmailFinderToolPage() {
  return (
    <main className="page tool-page">
      <div className="tool-heading">
        <span className="eyebrow">Email Suche</span>
        <h1>Fehlende E-Mails finden.<br />Listen automatisch ergaenzen.</h1>
        <p>
          Laden Sie eine Firmenliste hoch. Das Tool sucht fuer Zeilen ohne E-Mail-Adresse
          oeffentlich sichtbare Kontaktdaten auf den Unternehmenswebseiten.
        </p>
      </div>
      <EmailFinderWorkspace />
    </main>
  );
}
