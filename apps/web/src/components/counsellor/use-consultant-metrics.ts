import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

// GET /dashboard/consultant (DashboardService.getConsultantMetrics).
export interface ConsultantMetrics {
  year: number;
  target_point: number;
  achieved_points: number;
  achievement_percentage: number;
  admissions_count: number;
  trends: {
    months: string[];
    achieved_points: number[];
    target_points: number[];
    admissions: number[];
    revenue: number[];
  };
}

export function useConsultantMetrics() {
  return useQuery({
    queryKey: ["dashboard", "consultant"],
    queryFn: () => apiGet<ConsultantMetrics>("/dashboard/consultant"),
    staleTime: 60_000,
  });
}
