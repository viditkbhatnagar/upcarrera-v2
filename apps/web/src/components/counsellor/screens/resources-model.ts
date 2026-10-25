// Shapes + helpers for the counsellor Resources screens (GET /counsellor-resources).
import {
  FileText,
  FileVideo,
  FileImage,
  Presentation,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export type ResourceType = "Poster" | "PDF" | "Video" | "Presentation" | "eBook";

export interface ResourceItem {
  id: number;
  title: string;
  description: string | null;
  type: string;
  file_url: string | null;
  category: string;
  file_size_bytes: number | null;
  updated_at: string | null;
}

export interface ResourceFolder {
  name: string;
  count: number;
  updated_at: string | null;
}

export interface ResourcesResponse {
  items: ResourceItem[];
  folders: ResourceFolder[];
  total: number;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  PDF: FileText,
  Poster: FileImage,
  Video: FileVideo,
  Presentation,
  eBook: BookOpen,
};
export const iconForType = (type: string): LucideIcon => TYPE_ICONS[type] ?? FileText;

// Folder look (Naji's gradient chip + emoji). Known folder names keep the
// design's icon; anything else gets a stable gradient from its name.
const FOLDER_LOOKS: Record<string, { icon: string; color: string }> = {
  Brochures: { icon: "📘", color: "from-indigo-500 to-violet-500" },
  "Course Brochures": { icon: "📘", color: "from-indigo-500 to-violet-500" },
  "Sales Kit": { icon: "📈", color: "from-amber-500 to-orange-500" },
  "Policies & SOPs": { icon: "🛡️", color: "from-slate-500 to-zinc-600" },
  "Fee Structures": { icon: "💰", color: "from-emerald-500 to-teal-500" },
  "Marketing Assets": { icon: "🎨", color: "from-pink-500 to-rose-500" },
  "Compliance Docs": { icon: "📜", color: "from-sky-500 to-cyan-500" },
};
const FALLBACK_COLORS = [
  "from-indigo-500 to-violet-500",
  "from-amber-500 to-orange-500",
  "from-emerald-500 to-teal-500",
  "from-pink-500 to-rose-500",
  "from-sky-500 to-cyan-500",
  "from-slate-500 to-zinc-600",
];

export function folderLook(name: string): { icon: string; color: string } {
  const known = FOLDER_LOOKS[name];
  if (known) return known;
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { icon: "📁", color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length] as string };
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export const fmtUpdated = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Only http(s) links are ever opened; anything else is treated as "no file". */
export function safeFileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
