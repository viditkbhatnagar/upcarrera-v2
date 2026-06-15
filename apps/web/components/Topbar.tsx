"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";
import Button from "./Button";

/** Top bar: shows the logged-in user's name and a logout action. */
export default function Topbar() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  // Read the cached user on mount (localStorage / JWT payload — client only).
  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const displayName = user?.name || user?.username || "Staff member";
  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-ink/[0.06] bg-surface/80 px-6 backdrop-blur">
      <div className="text-sm text-ink-400">
        Welcome back,{" "}
        <span className="font-medium text-ink">
          {user ? displayName : "…"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-ink/[0.06] text-xs font-semibold text-ink-600">
            {initials || "·"}
          </span>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight text-ink">
              {displayName}
            </p>
            {user?.email && (
              <p className="text-xs leading-tight text-ink-400">{user.email}</p>
            )}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </header>
  );
}
