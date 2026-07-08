import { randomUUID } from "node:crypto";
import type { ItsaPersonScanJobStatus } from "@/features/scraper/types";
import { scanItsaPeople } from "@/features/scraper/server/itsa-person-scraper";

const jobs = new Map<string, ItsaPersonScanJobStatus>();

export function getItsaPersonScanJob(jobId: string) {
  const job = jobs.get(jobId);
  return job ? { ...job } : undefined;
}

export function startItsaPersonScanJob(visibleBrowser = false, limit?: number) {
  const jobId = randomUUID();
  const job: ItsaPersonScanJobStatus = {
    jobId,
    status: "running",
    phase: "queued",
    message: "Personen-Scan wurde gestartet.",
    progress: 1,
    totalFound: 0,
  };
  jobs.set(jobId, job);

  void scanItsaPeople({
    visibleBrowser,
    limit,
    onProgress(progress) {
      Object.assign(job, {
        phase: progress.phase,
        message: progress.message,
        progress: progress.progress,
        totalFound: progress.totalFound ?? job.totalFound,
      });
    },
  }).then((result) => {
    Object.assign(job, {
      status: "completed",
      phase: "completed",
      message: "Personen-Scan abgeschlossen.",
      progress: 100,
      totalFound: result.totalFound,
      result,
    });
  }).catch((error) => {
    Object.assign(job, {
      status: "failed",
      phase: "failed",
      message: "Personen-Scan fehlgeschlagen.",
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return { ...job };
}
