import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

export const RESOURCE_TYPES = ["Poster", "PDF", "Video", "Presentation", "eBook"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export interface TrainingVideoRow {
  id: number;
  title: string;
  description: string | null;
  category: string;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  sort_order: number;
  status: boolean;
}

export interface TrainingVideoInput {
  title: string;
  description?: string;
  category?: string;
  video_url?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  sort_order?: number;
  status?: boolean;
}

export interface ResourceRow {
  id: number;
  title: string;
  description: string | null;
  type: ResourceType | string;
  file_url: string | null;
  category: string;
  file_size_bytes: number | null;
  sort_order: number;
  status: boolean;
}

export interface ResourceInput {
  title: string;
  description?: string;
  type?: ResourceType;
  file_url?: string;
  category?: string;
  file_size_bytes?: number;
  sort_order?: number;
  status?: boolean;
}

interface ListResult<T> {
  items: T[];
  total: number;
}

export const contentAdminKeys = {
  videos: ["admin", "training-videos"] as const,
  resources: ["admin", "counsellor-resources"] as const,
};

export const listTrainingVideosAdmin = () =>
  apiGet<ListResult<TrainingVideoRow>>("/training-videos/admin");
export const createTrainingVideo = (b: TrainingVideoInput) =>
  apiPost<TrainingVideoRow>("/training-videos", b);
export const updateTrainingVideo = (id: number, b: Partial<TrainingVideoInput>) =>
  apiPatch<TrainingVideoRow>(`/training-videos/${id}`, b);
export const deleteTrainingVideo = (id: number) => apiDelete(`/training-videos/${id}`);

export const listResourcesAdmin = () =>
  apiGet<ListResult<ResourceRow>>("/counsellor-resources/admin");
export const createResource = (b: ResourceInput) => apiPost<ResourceRow>("/counsellor-resources", b);
export const updateResource = (id: number, b: Partial<ResourceInput>) =>
  apiPatch<ResourceRow>(`/counsellor-resources/${id}`, b);
export const deleteResource = (id: number) => apiDelete(`/counsellor-resources/${id}`);

/** True for an absolute http(s) URL — mirrors the backend's @IsUrl options. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
