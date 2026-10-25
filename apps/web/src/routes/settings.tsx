import { createFileRoute } from "@tanstack/react-router";
import { useIsCounsellor } from "@/components/counsellor/use-is-counsellor";
import { CounsellorSettings } from "@/components/counsellor/screens/settings";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Save, KeyRound, User } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});

interface Me {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  role_id: number | null;
}

function SettingsPage() {
  const { data: me, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<Me>("/auth/me"),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile and password.
        </p>
      </header>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          Loading…
        </div>
      ) : (
        <div className="space-y-6">
          <ProfileCard me={me} />
          <PasswordCard />
        </div>
      )}
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ProfileCard({ me }: { me: Me | undefined }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(me?.name ?? "");
    setEmail(me?.email ?? "");
    setPhone(me?.phone ?? "");
  }, [me?.id, me?.name, me?.email, me?.phone]);

  const save = async () => {
    if (name.trim() === "") {
      toast.error("Name can't be empty.");
      return;
    }
    if (email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      toast.error("Enter a valid email address.");
      return;
    }
    setSaving(true);
    try {
      await apiPatch("/users/me", {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      toast.success("Profile updated. Sign in again to refresh your session details.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Profile" icon={User}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Row label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </Row>
        <Row label="User ID">
          <Input value={me?.username ?? ""} disabled readOnly />
        </Row>
        <Row label="Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@upcarrera.com" />
        </Row>
        <Row label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
        </Row>
      </div>
      <div className="mt-5 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (current === "") {
      toast.error("Enter your current password.");
      return;
    }
    if (next.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/users/me/change-password", { current_password: current, password: next });
      toast.success("Password changed.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't change your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Change password" icon={KeyRound}>
      <div className="space-y-4">
        <Row label="Current password">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="pr-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide passwords" : "Show passwords"}
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Row>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Row label="New password">
            <Input
              type={show ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </Row>
          <Row label="Confirm new password">
            <Input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
            />
          </Row>
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4" />
          {saving ? "Saving…" : "Change password"}
        </button>
      </div>
    </Card>
  );
}

function SettingsRoute() {
  const isCounsellor = useIsCounsellor();
  return isCounsellor ? <CounsellorSettings /> : <SettingsPage />;
}
