import { DomainFormatterWorkspace } from "@/features/domain-formatter/components/domain-formatter-workspace";

export default function DomainFormatterToolPage() {
  return (
    <main className="page tool-page">
      <div className="tool-heading">
        <span className="eyebrow">Domain Formatter</span>
        <h1>Domains vereinheitlichen.<br />Zuordnung behalten.</h1>
        <p>
          Laden Sie eine Liste hoch, waehlen Sie ein Domain-Format und erhalten Sie
          dieselbe Tabelle mit unveraenderter Firmenzuordnung zurueck.
        </p>
      </div>
      <DomainFormatterWorkspace />
    </main>
  );
}
