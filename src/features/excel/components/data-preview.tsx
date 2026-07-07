import type { DataRow } from "@/features/excel/types";

export function DataPreview({
  title,
  rows,
  columns,
  highlightedRows = [],
}: {
  title: string;
  rows: DataRow[];
  columns: string[];
  highlightedRows?: number[];
}) {
  return (
    <div className="preview-card">
      <div className="preview-header"><h3>{title}</h3><span>Max. 8 Zeilen</span></div>
      <div className="table-wrap">
        <table>
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr className={highlightedRows.includes(index) ? "highlighted-row" : ""} key={index}>
                {columns.map((column) => <td key={column}>{String(row[column] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
