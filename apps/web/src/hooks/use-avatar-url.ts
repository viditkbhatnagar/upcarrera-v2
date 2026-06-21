import { useEffect, useState } from "react";
import { apiFileBlobUrl } from "@/lib/api";

/**
 * Resolve an auth-gated profile photo into an <img>-usable object URL.
 *
 * `profilePicture` is the relative storage path stored on users.profile_picture.
 * The image is fetched (with the Bearer token) via GET /files/serve?item=<base64>
 * and returned as an object URL. The previous object URL is revoked whenever the
 * path changes and on unmount. Returns null while loading or on error so callers
 * can fall back to initials.
 */
export function useAvatarUrl(
  profilePicture: string | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!profilePicture) {
      setUrl(null);
      return;
    }

    let item: string;
    try {
      item = btoa(profilePicture);
    } catch {
      setUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    apiFileBlobUrl("/files/serve", { item })
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [profilePicture]);

  return url;
}
