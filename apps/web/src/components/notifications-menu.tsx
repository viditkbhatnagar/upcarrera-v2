import { Bell, Check } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiGet, apiPatch } from "@/lib/api";
import { cn } from "@/lib/utils";

const FEED_LIMIT = 20;
const REFRESH_MS = 60_000;
const QUERY_KEY = ["notifications", "mine"] as const;

interface NotificationItem {
  id: number;
  title: string | null;
  description: string | null;
  created_at: string | null;
}

interface NotificationsResponse {
  items: NotificationItem[];
  total: number;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Bell + feed backed by GET /notifications/mine (the user's own, role and
 * broadcast notifications). Marking one read (PATCH /notifications/:id/read)
 * soft-deletes it, so the badge is simply the remaining total. Shared by the
 * admin header and the counsellor topbar.
 */
export function NotificationsMenu({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiGet<NotificationsResponse>("/notifications/mine", { limit: FEED_LIMIT }),
    refetchInterval: REFRESH_MS,
  });
  const markRead = useMutation({
    mutationFn: (id: number) => apiPatch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={total > 0 ? `Notifications (${total})` : "Notifications"}
          className={cn(
            "relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-foreground transition hover:bg-muted",
            className,
          )}
        >
          <Bell className="h-[18px] w-[18px]" />
          {total > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">Notifications</div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title || "Notification"}</p>
                  {n.description && (
                    <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{n.description}</p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                </div>
                <button
                  type="button"
                  aria-label="Mark as read"
                  title="Mark as read"
                  disabled={markRead.isPending}
                  onClick={() => markRead.mutate(n.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <Check className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
