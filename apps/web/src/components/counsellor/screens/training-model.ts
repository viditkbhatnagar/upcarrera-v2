// Shapes + helpers for the counsellor Training Center (GET /training-videos).

export interface TrainingVideo {
  id: number;
  title: string;
  description: string | null;
  category: string;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  completed: boolean;
  completed_at: string | null;
}

export interface TrainingResponse {
  items: TrainingVideo[];
  categories: { name: string; count: number }[];
  total: number;
  completed: number;
}

/** Playable source resolved from a stored video_url. */
export type VideoSource =
  | { kind: "embed"; src: string; thumb: string | null }
  | { kind: "file"; src: string; thumb: null }
  | { kind: "none"; thumb: null };

const YOUTUBE_ID = /^[\w-]{11}$/;

/** Resolves a YouTube / Vimeo page link or a direct http(s) file into something we can play. */
export function resolveVideoSource(url: string | null | undefined): VideoSource {
  if (!url) return { kind: "none", thumb: null };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: "none", thumb: null };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { kind: "none", thumb: null };
  const host = u.hostname.replace(/^www\.|^m\./, "");

  let ytId: string | null = null;
  if (host === "youtu.be") ytId = u.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    ytId = u.searchParams.get("v") ?? (["embed", "shorts", "live"].includes(parts[0] ?? "") ? (parts[1] ?? null) : null);
  }
  if (ytId && YOUTUBE_ID.test(ytId)) {
    return {
      kind: "embed",
      src: `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&autoplay=1`,
      thumb: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
    };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean).find((p) => /^\d+$/.test(p));
    if (id) return { kind: "embed", src: `https://player.vimeo.com/video/${id}?autoplay=1`, thumb: null };
  }

  return { kind: "file", src: url, thumb: null };
}

/** 83 -> "01:23"; 3725 -> "1:02:05". */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const GRADIENTS = [
  "from-indigo-500 via-purple-500 to-pink-500",
  "from-sky-500 via-cyan-500 to-emerald-500",
  "from-amber-500 via-orange-500 to-rose-500",
  "from-emerald-500 via-teal-500 to-cyan-600",
  "from-fuchsia-500 via-pink-500 to-rose-500",
  "from-blue-600 via-indigo-600 to-violet-700",
  "from-yellow-500 via-amber-500 to-orange-600",
  "from-teal-500 via-emerald-600 to-green-600",
];

/** Placeholder thumbnail gradient, stable per video. */
export const gradientFor = (id: number): string => GRADIENTS[Math.abs(id) % GRADIENTS.length] as string;

export const thumbnailFor = (v: TrainingVideo): string | null =>
  v.thumbnail_url ?? resolveVideoSource(v.video_url).thumb;

const CATEGORY_ICONS: Record<string, string> = {
  "Admission Process": "🎓",
  "Product Training": "📦",
  "LMS Training": "💻",
  "Sales Training": "📈",
  "Communication Skills": "💬",
  "Compliance Training": "🛡️",
};
export const categoryIcon = (name: string): string => CATEGORY_ICONS[name] ?? "🎬";
