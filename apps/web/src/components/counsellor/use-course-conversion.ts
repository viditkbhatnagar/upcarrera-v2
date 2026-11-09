import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

// GET /dashboard/consultant/course-conversion (DashboardService.getCourseConversion).
export interface CourseConversionRow {
  course_id: number;
  course: string;
  applications: number;
  converted: number;
  conversion_pct: number;
}

export function useCourseConversion() {
  return useQuery({
    queryKey: ["dashboard", "course-conversion"],
    queryFn: () => apiGet<{ rows: CourseConversionRow[] }>("/dashboard/consultant/course-conversion"),
    staleTime: 60_000,
  });
}
