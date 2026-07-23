export type ImportJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface SkippedActivityDetail {
  externalActivityId: string | number | null;
  activityName: string | null;
  reason: string;
}

export interface ImportJobStatusResponse {
  id: string;
  status: ImportJobStatus;
  totalActivities: number | null;
  processedActivities: number;
  importedCount: number;
  skippedCount: number;
  skippedDetails: SkippedActivityDetail[] | null;
  errorMessage: string | null;
}
