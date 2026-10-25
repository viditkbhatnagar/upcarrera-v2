import { Link } from "@tanstack/react-router";
import { User, LogOut, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getUser } from "@/lib/session";
import { logout } from "@/lib/auth";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { GlobalSearch } from "./global-search";
import { ThemeToggle } from "./theme-toggle";

const ROLE_LABEL = "Admission Counsellor";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || "U";
}

export function CounsellorTopbar() {
  const user = getUser();
  const displayName = user?.name ?? user?.username ?? "Counsellor";
  const firstName = displayName.trim().split(/\s+/)[0];
  const initials = initialsOf(displayName);
  const avatarUrl = useAvatarUrl(user?.profile_picture);
  const monthYear = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const handleLogout = () => {
    // Hard navigation so the app remounts clean and the query cache is purged.
    logout();
    window.location.assign("/login");
  };

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30">
      <div className="flex h-full items-center gap-3 px-4 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-semibold tracking-tight truncate">
            Welcome back, {firstName}
          </h1>
          <p className="text-xs text-muted-foreground hidden sm:block">
            Here's your admissions snapshot for {monthYear}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:gap-3">
          <GlobalSearch />
          <ThemeToggle />
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="flex items-center gap-2 cursor-pointer" aria-label="Account menu">
                <Avatar className="h-9 w-9">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                  <AvatarFallback className="bg-primary-soft text-primary-soft-foreground font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start leading-none text-left">
                  <span className="text-sm font-semibold text-foreground">{displayName}</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">{ROLE_LABEL}</span>
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="flex items-center gap-3 px-4 py-4 border-b">
                <Avatar className="h-10 w-10">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                  <AvatarFallback className="bg-primary-soft text-primary-soft-foreground font-semibold text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{displayName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{ROLE_LABEL}</p>
                </div>
              </div>
              {user?.email && (
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                </div>
              )}
              <div className="px-4 py-3 border-t grid grid-cols-2 gap-2">
                <Button asChild variant="outline" size="sm" className="text-xs gap-2">
                  <Link to="/settings">
                    <User className="h-3.5 w-3.5" />
                    Profile
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-2" onClick={handleLogout}>
                  <LogOut className="h-3.5 w-3.5" />
                  Logout
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
