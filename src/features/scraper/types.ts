export type ItsaExhibitor = {
  unternehmensname: string;
  domain: string;
  ansprechpartner: string;
  email: string;
  profilUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type ItsaScanResult = {
  scannedAt: string;
  sourceUrl: string;
  totalFound: number;
  knownBefore: number;
  newCount: number;
  updatedKnownCount: number;
  newExhibitors: ItsaExhibitor[];
  allExhibitors: ItsaExhibitor[];
};

export type ItsaSaveResult = {
  savedCount: number;
  totalKnown: number;
};

export type ItsaPerson = {
  name: string;
  berufsbezeichnung: string;
  firma: string;
  land: string;
  sprache: string;
  branche: string;
  unternehmensbereich: string;
  beruflicheStellung: string;
  teilnahme: string;
  ziele: string;
  passendeZiele: string;
  interessen: string;
  profilUrl: string;
};

export type ItsaPersonScanResult = {
  scannedAt: string;
  sourceUrl: string;
  totalFound: number;
  availableTotal: number;
  people: ItsaPerson[];
};

export type ItsaScanPhase = "queued" | "opening-list" | "waiting-login" | "loading-list" | "scraping-profiles" | "completed" | "failed";

export type ItsaScanJobStatus = {
  jobId: string;
  status: "running" | "completed" | "failed";
  phase: ItsaScanPhase;
  message: string;
  progress: number;
  totalFound: number;
  processedProfiles: number;
  result?: ItsaScanResult;
  error?: string;
};

export type ItsaPersonScanJobStatus = {
  jobId: string;
  status: "running" | "completed" | "failed";
  phase: ItsaScanPhase;
  message: string;
  progress: number;
  totalFound: number;
  result?: ItsaPersonScanResult;
  error?: string;
};

export type ItsaAuthJobStatus = {
  jobId: string;
  status: "running" | "completed" | "failed";
  message: string;
  authenticated: boolean | null;
  error?: string;
};
