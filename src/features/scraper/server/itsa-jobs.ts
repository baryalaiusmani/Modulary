import { randomUUID } from "node:crypto";
import type { ItsaScanJobStatus } from "@/features/scraper/types";
import { scanItsaExhibitors } from "@/features/scraper/server/itsa-scraper";

const jobs = new Map<string, ItsaScanJobStatus>();

function snapshot(job: ItsaScanJobStatus): ItsaScanJobStatus {
  return { ...job };
}

export function getItsaScanJob(jobId: string) {
  const job = jobs.get(jobId);
  return job ? snapshot(job) : undefined;
}

export function startItsaScanJob(url: string, visibleBrowser = false) {
  const jobId = randomUUID();
  const job: ItsaScanJobStatus = {
    jobId,
    status: "running",
    phase: "queued",
    message: "Scan wurde gestartet.",
    progress: 1,
    totalFound: 0,
    processedProfiles: 0,
  };
  jobs.set(jobId, job);

  void scanItsaExhibitors(url, {
    visibleBrowser,
    onProgress(progress) {
      Object.assign(job, {
        phase: progress.phase,
        message: progress.message,
        progress: progress.progress,
        totalFound: progress.totalFound ?? job.totalFound,
        processedProfiles: progress.processedProfiles ?? job.processedProfiles,
      });
    },
  }).then((result) => {
    Object.assign(job, {
      status: "completed",
      phase: "completed",
      message: "Scan abgeschlossen.",
      progress: 100,
      totalFound: result.totalFound,
      result,
    });
  }).catch((error) => {
    Object.assign(job, {
      status: "failed",
      phase: "failed",
      message: "Scan fehlgeschlagen.",
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return snapshot(job);
}
