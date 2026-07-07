import type { DataRow } from "@/features/excel/types";

export type EmailFinderResultRow = {
  unternehmensname: string;
  domain: string;
  emails: string;
  ansprechpartner: string;
  jobbezeichnung: string;
  quelle: string;
  status: string;
};

export type EmailFinderResult = {
  foundFileName: string;
  updatedFileName: string;
  sheetName: string;
  totalRows: number;
  rowsChecked: number;
  missingEmailRows: number;
  foundCompanies: number;
  foundEmails: number;
  domainColumn: string;
  emailColumn: string;
  companyColumn: string;
  preview: DataRow[];
  foundDownloadBase64: string;
  updatedDownloadBase64: string;
};

export type DomainCheckContact = {
  email: string;
  ansprechpartner: string;
  jobbezeichnung: string;
  quelle: string;
};

export type DomainCheckResult = {
  domain: string;
  checkedAt: string;
  foundEmails: number;
  contacts: DomainCheckContact[];
};
