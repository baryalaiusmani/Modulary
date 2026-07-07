export type DomainFormatMode = "https-www" | "www" | "plain";

export type DomainFormatResult = {
  fileName: string;
  sheetName: string;
  domainColumn: string;
  totalRows: number;
  changedRows: number;
  unchangedRows: number;
  emptyRows: number;
  before: Array<Record<string, string | number | boolean | null>>;
  after: Array<Record<string, string | number | boolean | null>>;
  downloadBase64: string;
};
