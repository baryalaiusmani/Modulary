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

export type ItsaScanPhase = "queued" | "opening-list" | "loading-list" | "scraping-profiles" | "completed" | "failed";

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
