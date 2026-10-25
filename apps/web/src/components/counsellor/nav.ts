import {
  LayoutDashboard,
  GraduationCap,
  FileText,
  CreditCard,
  BarChart3,
  PlayCircle,
  FolderOpen,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export interface CounsellorNavItem {
  title: string;
  /** Real route path in this app (counsellor screens reuse the shared routes). */
  to: string;
  icon: LucideIcon;
}

// Naji's module list, mapped onto our route tree.
export const COUNSELLOR_NAV: readonly CounsellorNavItem[] = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { title: "Applications", to: "/students/applications", icon: FileText },
  { title: "My Enrollments", to: "/students/students", icon: GraduationCap },
  { title: "Performance", to: "/counsellors/targets", icon: BarChart3 },
  { title: "Courses", to: "/universities/courses", icon: BookOpen },
  { title: "Payments", to: "/payments", icon: CreditCard },
  { title: "Training", to: "/training", icon: PlayCircle },
  { title: "Resources", to: "/resources", icon: FolderOpen },
  { title: "Reports", to: "/reports", icon: BarChart3 },
];

export function isActivePath(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}
