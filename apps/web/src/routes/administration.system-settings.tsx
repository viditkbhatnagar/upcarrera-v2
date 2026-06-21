import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiUpload, ApiError } from "@/lib/api";
import { getUser, setSession, getToken, type SessionUser } from "@/lib/session";
import { useAvatarUrl } from "@/hooks/use-avatar-url";
import { toast } from "sonner";
import {
  Camera,
  Loader2,
  AlertTriangle,
  Mail,
  Phone,
  User,
  Shield,
  IdCard,
  AtSign,
  CalendarDays,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/administration/system-settings")({
  head: () => ({ meta: [{ title: "Settings — upCarrera" }] }),
  component: SettingsPage,
});

/* ----------------------------------------------------------------------------
 * Settings — two tabs only: Profile + Security.
 *
 * Profile  : editable avatar (uploads to POST /files/avatar, persists
 *            users.profile_picture, and syncs the cached session user) and a
 *            READ-ONLY "Personal Information" card hydrated from GET /auth/me
 *            (falls back to the cached session user for any missing field).
 * Security : a single "Change Password" form -> PATCH /users/:id/password
 *            ({ password }). New === Confirm and min length validated client-side.
 *
 * No System Info / Preferences / Integrations / Notifications / Branding /
 * Two-Factor / Login History — by product-owner spec.
 * -------------------------------------------------------------------------- */

const EMPTY = "—";
const MIN_PASSWORD_LENGTH = 6;

/** Shape returned by GET /auth/me (the JWT user snapshot). Any field may widen
 *  over time, so extra optional columns are read defensively. */
interface MeResponse {
  id: number;
  role_id: number | null;
  name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  profile_picture: string | null;
  // Optional columns the snapshot may grow to include — rendered when present.
  code?: number | string | null;
  role?: string | null;
  role_name?: string | null;
  doj?: string | null;
  date_of_joining?: string | null;
}

function asText(value: string | number | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

function formatDate(value: string | number | null | undefined): string {
  if (value == null || String(value).trim() === "") return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function initialsOf(name: string | null | undefined): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "U";
}

function SettingsPage() {
  const sessionUser = useMemo<SessionUser | null>(() => getUser(), []);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<MeResponse>("/auth/me"),
  });

  // Merge: prefer live /auth/me values, fall back to the cached session user.
  const profile = useMemo(() => {
    const me = meQuery.data;
    const pick = <T,>(a: T | null | undefined, b: T | null | undefined) =>
      a != null && String(a).trim() !== "" ? a : b;
    return {
      id: me?.id ?? sessionUser?.id ?? null,
      name: pick(me?.name, sessionUser?.name) ?? null,
      email: pick(me?.email, sessionUser?.email) ?? null,
      phone: pick(me?.phone, sessionUser?.phone) ?? null,
      username: pick(me?.username, sessionUser?.username) ?? null,
      profilePicture:
        pick(me?.profile_picture, sessionUser?.profile_picture) ?? null,
      employeeId: me?.code ?? null,
      role: me?.role ?? me?.role_name ?? null,
      roleId: me?.role_id ?? sessionUser?.role_id ?? null,
      dateOfJoining: me?.doj ?? me?.date_of_joining ?? null,
    };
  }, [meQuery.data, sessionUser]);

  return (
    <div className="space-y-6">
      {/* Header — matches the admin screens' header pattern. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your profile &amp; account security.
          </p>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* ----------------------------- PROFILE ----------------------------- */}
        <TabsContent value="profile" className="space-y-5">
          <ProfileTab
            loading={meQuery.isLoading}
            error={meQuery.error}
            onRetry={() => meQuery.refetch()}
            name={profile.name}
            email={profile.email}
            phone={profile.phone}
            username={profile.username}
            profilePicture={profile.profilePicture}
            employeeId={profile.employeeId}
            role={profile.role}
            roleId={profile.roleId}
            dateOfJoining={profile.dateOfJoining}
          />
        </TabsContent>

        {/* ----------------------------- SECURITY ---------------------------- */}
        <TabsContent value="security" className="space-y-5">
          <SecurityTab userId={profile.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ PROFILE TAB =============================== */

interface ProfileTabProps {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  profilePicture: string | null;
  employeeId: number | string | null;
  role: string | null;
  roleId: number | null;
  dateOfJoining: string | null;
}

function ProfileTab(props: ProfileTabProps) {
  const {
    loading,
    error,
    onRetry,
    name,
    email,
    phone,
    username,
    profilePicture,
    employeeId,
    role,
    roleId,
    dateOfJoining,
  } = props;

  const queryClient = useQueryClient();

  // Local preview of the just-picked file (shown instantly while/after upload).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Revoke the object URL when it changes / on unmount to avoid leaks.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Saved avatar (auth-gated) — used when there is no fresh local preview.
  const savedAvatarUrl = useAvatarUrl(profilePicture);

  const handlePickPhoto = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    // Show the picked image immediately as a local preview.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await apiUpload<{ profile_picture: string }>(
        "/files/avatar",
        fd,
      );
      toast.success("Profile photo updated");
      // Persist into the cached session so the whole app sees the new photo.
      const token = getToken();
      const cached = getUser();
      if (token && cached) {
        setSession(token, {
          ...cached,
          profile_picture: result.profile_picture,
        });
      }
      // Re-read GET /auth/me so this page reflects the saved value.
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't update photo",
      );
      // Drop the optimistic preview so we fall back to the saved/initials avatar.
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setUploading(false);
    }
  };

  const avatarSrc = previewUrl ?? savedAvatarUrl ?? undefined;

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  // Role label prefers a human name; falls back to "Role #<id>" when only an id
  // is available, and "—" when nothing is known.
  const roleLabel =
    role && String(role).trim() !== ""
      ? String(role)
      : roleId != null
        ? `Role #${roleId}`
        : EMPTY;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Profile picture block (editable preview) */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Profile Photo</CardTitle>
          <CardDescription>Your avatar across upCarrera.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar className="h-28 w-28 border border-border shadow-card">
              {avatarSrc ? (
                <AvatarImage src={avatarSrc} alt={asText(name)} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-2xl font-semibold text-primary">
                {loading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                ) : (
                  initialsOf(name)
                )}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={handlePickPhoto}
              disabled={uploading}
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-card transition hover:bg-muted disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="text-center">
            <div className="text-base font-semibold text-foreground">
              {loading ? "Loading…" : asText(name)}
            </div>
            <div className="text-sm text-muted-foreground">{asText(email)}</div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handlePickPhoto}
            disabled={uploading}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Camera className="mr-2 h-4 w-4" />
                Change photo
              </>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            JPG or PNG, up to 5MB
          </p>
        </CardContent>
      </Card>

      {/* Personal Information — READ-ONLY */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Your account details. Contact an administrator to make changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <ReadOnlyField icon={User} label="Full Name" value={asText(name)} loading={loading} />
            <ReadOnlyField icon={Mail} label="Email" value={asText(email)} loading={loading} />
            <ReadOnlyField icon={Phone} label="Phone" value={asText(phone)} loading={loading} />
            <ReadOnlyField icon={Shield} label="Role" value={roleLabel} loading={loading} />
            <ReadOnlyField
              icon={IdCard}
              label="Employee ID"
              value={asText(employeeId)}
              loading={loading}
            />
            <ReadOnlyField
              icon={AtSign}
              label="Username"
              value={asText(username)}
              loading={loading}
            />
            <ReadOnlyField
              icon={CalendarDays}
              label="Date of Joining"
              value={formatDate(dateOfJoining)}
              loading={loading}
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

interface ReadOnlyFieldProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  loading: boolean;
}

function ReadOnlyField({ icon: Icon, label, value, loading }: ReadOnlyFieldProps) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="mt-1.5 truncate text-sm font-medium text-foreground">
        {loading ? (
          <span className="inline-block h-4 w-24 animate-pulse rounded bg-muted align-middle" />
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/* ============================ SECURITY TAB ============================== */

interface SecurityTabProps {
  userId: number | null;
}

interface PasswordErrors {
  current?: string;
  next?: string;
  confirm?: string;
}

function SecurityTab({ userId }: SecurityTabProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrors({});
    setShow({ current: false, next: false, confirm: false });
  };

  const validate = (): PasswordErrors => {
    const next: PasswordErrors = {};
    if (!currentPassword) next.current = "Enter your current password.";
    if (!newPassword) {
      next.next = "Enter a new password.";
    } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
      next.next = `Must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    } else if (newPassword === currentPassword) {
      next.next = "New password must differ from the current one.";
    }
    if (!confirmPassword) {
      next.confirm = "Re-enter the new password.";
    } else if (newPassword !== confirmPassword) {
      next.confirm = "Passwords do not match.";
    }
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    if (userId == null) {
      toast.error("Could not determine your account. Please log in again.");
      return;
    }

    setSubmitting(true);
    try {
      // Backend body is { password } (optional username). Current password is
      // collected for UX confirmation; the API resets the hash directly.
      await apiPatch(`/users/${userId}/password`, { password: newPassword });
      toast.success("Password updated successfully.");
      reset();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to update password.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          Change Password
        </CardTitle>
        <CardDescription>
          Use a strong password you don&apos;t use elsewhere.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <PasswordField
            id="current-password"
            label="Current Password"
            value={currentPassword}
            visible={show.current}
            onToggle={() => setShow((s) => ({ ...s, current: !s.current }))}
            onChange={(v) => {
              setCurrentPassword(v);
              if (errors.current) setErrors((p) => ({ ...p, current: undefined }));
            }}
            error={errors.current}
            autoComplete="current-password"
          />
          <PasswordField
            id="new-password"
            label="New Password"
            value={newPassword}
            visible={show.next}
            onToggle={() => setShow((s) => ({ ...s, next: !s.next }))}
            onChange={(v) => {
              setNewPassword(v);
              if (errors.next) setErrors((p) => ({ ...p, next: undefined }));
            }}
            error={errors.next}
            autoComplete="new-password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          />
          <PasswordField
            id="confirm-password"
            label="Confirm New Password"
            value={confirmPassword}
            visible={show.confirm}
            onToggle={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}
            onChange={(v) => {
              setConfirmPassword(v);
              if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined }));
            }}
            error={errors.confirm}
            autoComplete="new-password"
          />

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              disabled={submitting}
            >
              Clear
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
  hint?: string;
}

function PasswordField(props: PasswordFieldProps) {
  const { id, label, value, visible, onToggle, onChange, error, autoComplete, hint } =
    props;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          className={cn("pr-10", error && "border-destructive focus-visible:ring-destructive")}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* ============================== SHARED ================================= */

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message =
    error instanceof ApiError ? error.message : "Something went wrong.";
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            Couldn&apos;t load your profile
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <Button variant="outline" onClick={onRetry}>
          <Loader2 className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
