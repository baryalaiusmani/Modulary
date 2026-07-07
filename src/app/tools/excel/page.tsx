import { ExcelWorkspace } from "@/features/excel/components/excel-workspace";

export default function ExcelToolPage() {
  return (
    <main className="page tool-page">
      <div className="tool-heading">
        <span className="eyebrow">Excel Intelligence</span>
        <h1>Listen vergleichen.<br />Neue Daten erkennen.</h1>
        <p>
          Laden Sie eine alte und eine neue Excel-Liste hoch. Das Tool erkennt,
          welche Datensaetze bereits vorhanden sind und welche neu dazugekommen sind.
        </p>
      </div>
      <ExcelWorkspace />
    </main>
  );
}
