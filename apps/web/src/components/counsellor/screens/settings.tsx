import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Briefcase, Camera, Eye, EyeOff, KeyRound, Lock, Save, Shield, User } from "lucide-react";
import { apiGet, apiPatch, apiPost, apiUpload, ApiError } from "@/lib/api";
import { getUser, getToken, setSession } from "@/lib/session";
import { useAccess } from "@/components/applications/use-access";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Me {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  role_id: number | null;
  profile_picture?: string | null;
}

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "U";

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Keep the cached session snapshot (topbar name / avatar) in step with a profile change. */
function patchSessionUser(patch: Partial<NonNullable<ReturnType<typeof getUser>>>) {
  const user = getUser();
  const token = getToken();
  if (user && token) setSession(token, { ...user, ...patch });
}

/**
 * Profile + Settings (Naji's profile and settings screens, merged: the topbar Profile
 * link and the sidebar Settings both land here). Wired to:
 *   GET /auth/me, PATCH /users/me          -> personal details
 *   POST /files/avatar                      -> profile photo
 *   POST /users/me/change-password          -> password
 *   GET /auth/me/access                     -> role and record-access scope
 * Notification / 2FA / login-history panels from the design have no backing API and are omitted.
 */
export function CounsellorSettings() {
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<Me>("/auth/me"),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Profile &amp; Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, photo and account security.</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-4 w-4" /> Profile</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><Shield className="h-4 w-4" /> Security</TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5"><Briefcase className="h-4 w-4" /> System Info</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6 space-y-6">
          {me.isLoading ? (
            <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
          ) : (
            <ProfileSection me={me.data} />
          )}
        </TabsContent>
        <TabsContent value="security" className="mt-6 space-y-6">
          <SecuritySection />
        </TabsContent>
        <TabsContent value="system" className="mt-6 space-y-6">
          <SystemSection me={me.data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileSection({ me }: { me: Me | undefined }) {
  const qc = useQueryClient();
  const cached = getUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(cached?.profile_picture ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarUrl = useAvatarUrl(photo);

  useEffect(() => {
    setName(me?.name ?? "");
    setEmail(me?.email ?? "");
    setPhone(me?.phone ?? "");
  }, [me?.id, me?.name, me?.email, me?.phone]);

  const save = useMutation({
    mutationFn: () =>
      apiPatch("/users/me", {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      }),
    onSuccess: () => {
      patchSessionUser({ name: name.trim(), email: email.trim() || null, phone: phone.trim() || null });
      void qc.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(errText(e, "Couldn't update your profile.")),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return apiUpload<{ profile_picture: string }>("/files/avatar", body);
    },
    onSuccess: (res) => {
      setPhoto(res.profile_picture);
      patchSessionUser({ profile_picture: res.profile_picture });
      toast.success("Profile photo updated");
    },
    onError: (e) => toast.error(errText(e, "Couldn't upload the photo.")),
  });

  const onSave = () => {
    if (name.trim() === "") return toast.error("Name can't be empty.");
    if (email.trim() !== "" && !EMAIL_RE.test(email.trim())) return toast.error("Enter a valid email address.");
    save.mutate();
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
    setCropSrc(URL.createObjectURL(file));
  };

  const closeCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const display = name || me?.username || "Counsellor";

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="relative w-fit">
            <Avatar className="h-24 w-24 ring-4 ring-primary-soft">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={display} className="object-cover" />}
              <AvatarFallback className="bg-[image:var(--gradient-primary)] text-primary-foreground text-2xl font-bold">
                {initialsOf(display)}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors border-2 border-card disabled:opacity-60"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{display}</h2>
            <p className="text-sm text-muted-foreground">Admission Counsellor</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {me?.username && <Badge variant="outline" className="text-xs">User ID: {me.username}</Badge>}
              <Badge variant="secondary" className="text-xs">Active</Badge>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cs-name">Full Name</Label>
            <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cs-user">User ID</Label>
            <Input id="cs-user" value={me?.username ?? ""} disabled readOnly className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cs-email">Email</Label>
            <Input id="cs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@upcarrera.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cs-phone">Phone</Label>
            <Input id="cs-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={save.isPending} className="gap-1.5">
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </Card>

      <ImageCropDialog
        src={cropSrc}
        aspect={1}
        title="Crop your photo"
        fileName="profile-photo.jpg"
        onCancel={closeCrop}
        onCropped={(file) => {
          closeCrop();
          upload.mutate(file);
        }}
      />
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function SecuritySection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: () => apiPost("/users/me/change-password", { current_password: current, password: next }),
    onSuccess: () => {
      toast.success("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e) => toast.error(errText(e, "Couldn't change your password.")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return toast.error("Enter your current password.");
    if (next.length < MIN_PASSWORD) return toast.error(`New password must be at least ${MIN_PASSWORD} characters.`);
    if (next !== confirm) return toast.error("Passwords do not match.");
    change.mutate();
  };

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Change Password</h3>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <PasswordField id="cs-cur" label="Current Password" value={current} onChange={setCurrent} placeholder="Enter current password" autoComplete="current-password" />
          </div>
          <PasswordField id="cs-new" label="New Password" value={next} onChange={setNext} placeholder={`At least ${MIN_PASSWORD} characters`} autoComplete="new-password" />
          <PasswordField id="cs-conf" label="Confirm New Password" value={confirm} onChange={setConfirm} placeholder="Re-enter new password" autoComplete="new-password" />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={change.isPending} className="gap-1.5">
            <Lock className="h-4 w-4" /> {change.isPending ? "Saving…" : "Update Password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

const SCOPE_LABEL: Record<string, string> = {
  all: "All records",
  owners: "Your own records",
  stages: "Records by stage",
};

function SystemSection({ me }: { me: Me | undefined }) {
  const access = useAccess();
  const a = access.data;
  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Role &amp; Access</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReadOnly label="Role" value={a?.role_key ? a.role_key.replace(/_/g, " ") : "—"} />
        <ReadOnly label="Record access" value={a ? (SCOPE_LABEL[a.scope] ?? String(a.scope)) : "—"} />
        <ReadOnly label="User ID" value={me?.username ?? "—"} />
        <ReadOnly label="Email" value={me?.email ?? "—"} />
      </div>
    </Card>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} disabled readOnly className="bg-muted capitalize" />
    </div>
  );
}
