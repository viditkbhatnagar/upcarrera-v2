import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { cn } from "@/lib/utils";

/** Up to two initials from a display name; `fallback` when the name is empty. */
export function initialsFrom(name: string | null | undefined, fallback = "U"): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? "").slice(0, 2).toUpperCase() || fallback;
}

interface UserAvatarProps {
  /** users.profile_picture storage path (auth-gated); null/empty shows initials. */
  picture: string | null | undefined;
  name: string | null | undefined;
  /** Initials shown when there is no name. */
  fallback?: string;
  className?: string;
  fallbackClassName?: string;
}

/**
 * Shared avatar: renders the user's profile photo (fetched with the Bearer
 * token via useAvatarUrl) and falls back to initials when there is no photo or
 * it fails to load.
 */
export function UserAvatar({
  picture,
  name,
  fallback,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const url = useAvatarUrl(picture?.trim() ? picture : null);
  return (
    <Avatar className={className}>
      {url && <AvatarImage src={url} alt={name ?? ""} className="object-cover" />}
      <AvatarFallback
        className={cn("bg-primary/10 font-semibold text-primary", fallbackClassName)}
      >
        {initialsFrom(name, fallback)}
      </AvatarFallback>
    </Avatar>
  );
}
