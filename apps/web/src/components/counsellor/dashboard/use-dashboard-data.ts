import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { listApplications, type Stage } from "@/lib/api/applications";

// Every query below is auto-scoped server-side to the signed-in counsellor.

const RECENT_APPLICATIONS = 6;
const COURSE_SAMPLE_SIZE = 100;
export const PIPELINE_TAB_ROWS = 10;

/** Counts + the newest applications: drives the KPI row and the activity feed. */
export function useApplicationsSummary() {
  return useQuery({
    queryKey: ["counsellor", "dashboard", "applications-summary"],
    queryFn: () => listApplications({ page: 1, limit: RECENT_APPLICATIONS }),
    staleTime: 60_000,
  });
}

/** Applications in one pipeline stage (the Recent tables tabs). */
export function useApplicationsByStage(stage: Stage) {
  return useQuery({
    queryKey: ["counsellor", "dashboard", "applications-stage", stage],
    queryFn: () => listApplications({ page: 1, limit: PIPELINE_TAB_ROWS, stage }),
    staleTime: 60_000,
  });
}

export interface StudentRow {
  id: number | string;
  course_title: string | null;
  university_title: string | null;
}

interface StudentsResponse {
  items: StudentRow[];
  total: number;
  counts: { total: number; by_status: Record<string, number> };
}

/** Enrolled students: total, status breakdown, and a sample for course mix. */
export function useStudentsSummary() {
  return useQuery({
    queryKey: ["counsellor", "dashboard", "students-summary"],
    queryFn: () => apiGet<StudentsResponse>("/students", { page: 1, limit: COURSE_SAMPLE_SIZE }),
    staleTime: 60_000,
  });
}

export const COURSE_SAMPLE_LIMIT = COURSE_SAMPLE_SIZE;
