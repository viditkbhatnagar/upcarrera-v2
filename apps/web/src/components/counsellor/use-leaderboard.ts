import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

// GET /dashboard/leaderboard (DashboardService.getLeaderboard).
// This-month counsellor ranking by achieved points (admissions tiebreaker).
export interface LeaderboardRow {
  consultant_id: number;
  name: string | null;
  employee_code: string | null;
  admissions: number;
  points: number;
  rank: number;
  is_self: boolean;
}

export interface Leaderboard {
  month: string;
  year: number;
  rows: LeaderboardRow[];
  self: { rank: number | null; admissions: number; points: number };
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ["dashboard", "leaderboard"],
    queryFn: () => apiGet<Leaderboard>("/dashboard/leaderboard"),
    staleTime: 60_000,
  });
}
