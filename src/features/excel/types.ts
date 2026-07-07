export type CellValue = string | number | boolean | null;
export type DataRow = Record<string, CellValue>;

export type ExcelOperation =
  | { type: "sort"; column: string; direction: "asc" | "desc" }
  | { type: "deduplicate"; column?: string }
  | { type: "filter"; column: string; operator: "gt" | "gte" | "lt" | "lte" | "eq" | "contains"; value: string | number }
  | { type: "group"; column: string }
  | { type: "normalize"; column: string }
  | { type: "domainDuplicateWorkflow"; column: string }
  | { type: "compareCompaniesWithList"; column?: string };

export type ProcessSummary = {
  duplicateDomains?: number;
  markedRows?: number;
  processedDomains?: number;
  matchingCompanies?: number;
  comparedCompanies?: number;
};

export type ProcessResult = {
  fileName: string;
  sheetName: string;
  originalRowCount: number;
  resultRowCount: number;
  columns: string[];
  before: DataRow[];
  after: DataRow[];
  highlightedAfterRows: number[];
  operations: string[];
  summary: ProcessSummary;
  downloadBase64: string;
};

export type ListCompareResult = {
  fileName: string;
  oldMarkedFileName: string;
  oldSheetName: string;
  newSheetName: string;
  compareColumns: string[];
  comparePairs: Array<{ oldColumn: string; newColumn: string }>;
  sharedColumns: string[];
  columns: string[];
  informativeColumns: string[];
  oldRowCount: number;
  newRowCount: number;
  existingRowCount: number;
  newOnlyRowCount: number;
  combinedRowCount: number;
  oldRows: DataRow[];
  newRows: DataRow[];
  newOnlyRows: DataRow[];
  existingRows: DataRow[];
  newOnlyPreview: DataRow[];
  existingPreview: DataRow[];
  combinedPreview: DataRow[];
  downloadBase64: string;
  oldMarkedDownloadBase64: string;
};
