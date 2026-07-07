import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve("../..");
const dataPath = path.join(root, "data/itsa-2026/companies.json");
const outputDir = path.join(root, "outputs/itsa-2026");
const outputPath = path.join(outputDir, "it-sa-2026-aussteller-588.xlsx");
const records = JSON.parse(await fs.readFile(dataPath, "utf8"));

if (records.length !== 588) throw new Error(`Expected 588 records, received ${records.length}`);
if (records.some((record) => /^https?:\/\//i.test(record.domain || ""))) {
  throw new Error("At least one domain still contains a protocol");
}

const workbook = Workbook.create();
const overview = workbook.worksheets.add("Übersicht");
const exhibitors = workbook.worksheets.add("Aussteller");

overview.showGridLines = false;
overview.getRange("A1:F2").merge();
overview.getRange("A1").values = [["it-sa Expo&Congress 2026 · Ausstellerliste"]];
overview.getRange("A1:F2").format = {
  fill: "#10104F",
  font: { bold: true, color: "#FFFFFF", size: 20 },
  verticalAlignment: "center",
  horizontalAlignment: "left",
};
overview.getRange("A4:B4").merge();
overview.getRange("C4:D4").merge();
overview.getRange("E4:F4").merge();
overview.getRange("A5:B6").merge();
overview.getRange("C5:D6").merge();
overview.getRange("E5:F6").merge();
overview.getRange("A4:F4").values = [["Aussteller", null, "Mit Domain", null, "Mit E-Mail", null]];
overview.getRange("A5").formulas = [["=COUNTA(Aussteller!A4:A591)"]];
overview.getRange("C5").formulas = [["=COUNTIF(Aussteller!B4:B591,\"<>\")"]];
overview.getRange("E5").formulas = [["=COUNTIF(Aussteller!D4:D591,\"<>\")"]];
overview.getRange("A4:F4").format = {
  fill: "#DCEBFA",
  font: { bold: true, color: "#10104F", size: 11 },
  horizontalAlignment: "center",
};
overview.getRange("A5:F6").format = {
  fill: "#F5F8FC",
  font: { bold: true, color: "#101828", size: 22 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#CAD5E2" },
};
overview.getRange("A8:F8").merge();
overview.getRange("A8").values = [["Hinweise zur Datenerhebung"]];
overview.getRange("A8:F8").format = { fill: "#0784C1", font: { bold: true, color: "#FFFFFF", size: 12 } };
overview.getRange("A9:F12").merge();
overview.getRange("A9").values = [[
  "Quelle: öffentliche Ausstellerprofile auf it-sa 365. Scan vom 21.06.2026. Domains wurden ohne http:// bzw. https:// gespeichert; vorhandene Pfade bleiben erhalten. Ansprechpartner werden nur eingetragen, wenn sie im Profil ausdrücklich veröffentlicht sind. Bei den 588 Profilen war kein Ansprechpartnername als eigenes Feld vorhanden.",
]];
overview.getRange("A9:F12").format = {
  fill: "#F5F8FC",
  font: { color: "#344054", size: 10 },
  wrapText: true,
  verticalAlignment: "top",
  borders: { preset: "outside", style: "thin", color: "#CAD5E2" },
};
overview.getRange("A14:B14").values = [["Quelle", "https://www.itsa365.de/de-de/companies/companies-finden?state%5BrefinementList%5D%5BisExhibitor%5D%5B0%5D=Ja"]];
overview.getRange("A14").format = { font: { bold: true, color: "#10104F" } };
overview.getRange("A:F").format.columnWidth = 18;
overview.getRange("A:A").format.columnWidth = 16;
overview.getRange("B:F").format.columnWidth = 20;

exhibitors.showGridLines = false;
exhibitors.getRange("A1:E2").merge();
exhibitors.getRange("A1").values = [["Alle 588 it-sa-Aussteller"]];
exhibitors.getRange("A1:E2").format = {
  fill: "#10104F",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  verticalAlignment: "center",
};
const headers = [["Unternehmensname", "Domain", "Ansprechpartner", "E-Mail-Adresse", "Quelle (it-sa Profil)"]];
exhibitors.getRange("A3:E3").values = headers;
const rows = records.map((record) => [
  record.unternehmensname || "",
  record.domain || "",
  record.ansprechpartner || "",
  record.email || "",
  record.profilUrl || "",
]);
exhibitors.getRange(`A4:E${rows.length + 3}`).values = rows;
exhibitors.getRange("A3:E3").format = {
  fill: "#0784C1",
  font: { bold: true, color: "#FFFFFF", size: 10 },
  verticalAlignment: "center",
  wrapText: true,
};
exhibitors.getRange(`A4:E${rows.length + 3}`).format = {
  font: { color: "#25344A", size: 9 },
  verticalAlignment: "center",
  borders: { preset: "inside", style: "thin", color: "#E4EAF1" },
};
exhibitors.getRange(`A4:A${rows.length + 3}`).format.font = { bold: true, color: "#101828", size: 9 };
exhibitors.getRange("A:A").format.columnWidth = 38;
exhibitors.getRange("B:B").format.columnWidth = 34;
exhibitors.getRange("C:C").format.columnWidth = 24;
exhibitors.getRange("D:D").format.columnWidth = 34;
exhibitors.getRange("E:E").format.columnWidth = 52;
exhibitors.getRange(`A4:E${rows.length + 3}`).format.rowHeight = 19;
exhibitors.freezePanes.freezeRows(3);
const table = exhibitors.tables.add(`A3:E${rows.length + 3}`, true, "ItsaAussteller");
table.style = "TableStyleMedium2";
table.showFilterButton = true;

await fs.mkdir(outputDir, { recursive: true });
const overviewPreview = await workbook.render({ sheetName: "Übersicht", range: "A1:F14", scale: 1.5, format: "png" });
await fs.writeFile(path.join(outputDir, "preview-overview.png"), new Uint8Array(await overviewPreview.arrayBuffer()));
const listPreview = await workbook.render({ sheetName: "Aussteller", range: "A1:E18", scale: 1.2, format: "png" });
await fs.writeFile(path.join(outputDir, "preview-aussteller.png"), new Uint8Array(await listPreview.arrayBuffer()));

const inspect = await workbook.inspect({
  kind: "table",
  range: "Aussteller!A1:E12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 5,
});
console.log(inspect.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, records: records.length }, null, 2));
