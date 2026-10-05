import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api";
import {
  Plus,
  Search,
  Pencil,
  Eye,
  MapPin,
  CheckCircle2,
  Globe,
  Mail,
  Phone,
  RefreshCcw,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/universities/universities")({
  head: () => ({ meta: [{ title: "Universities — upCarrera" }] }),
  component: UniversitiesPage,
});

type UniRow = {
  /** The real university.id — what every /universities/:id API call needs. */
  id: number;
  /**
   * Display-only code (`UNI-028`), derived from `id`. The `universities` table
   * has no `code` column, so this is never sent to or read from the API.
   */
  code: string;
  name: string;
  category: string;
  location: string;
  /**
   * Trimmed `country_id` — a `countries.country_id` (e.g. "99"), NOT a name.
   * Not rendered as-is anywhere; the form resolves it through GET /countries.
   */
  country: string;
  state: string;
  address: string;
  website: string;
  email: string;
  phone: string;
  courses: number;
  intakes: number;
  status: "Active" | "Inactive";
  initials: string;
  color: string;
  /**
   * ---- Raw server values, carried verbatim alongside the display values ----
   *
   * Everything above is COERCED for rendering and filtering: a NULL title shows
   * as `University #28`, a NULL/unknown category shows as "Private University",
   * a NULL status shows as "Active". That is fine for a badge; it is data loss
   * the moment it is fed back into a PATCH. The Edit dialog therefore seeds
   * itself from `raw`, never from the display fields, so that opening Edit and
   * saving cannot stamp a derived default over a NULL in the database.
   */
  raw: RawUniversity;
};

/** The subset of the API row the Edit form actually writes back, untouched. */
type RawUniversity = {
  title: string | null;
  category: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  country_id: string | null;
  state: string | null;
  address: string | null;
  status: string | null;
};

// ---- Live API wiring (GET /api/universities) ----
// Each list item is a raw `universities` row decorated server-side with
// aggregate counts (tagged_courses_count / intakes_count). We map each into the
// new design's `UniRow` shape, filling fields the API lacks with "—"/0.
interface ApiUniversity {
  id: number;
  title: string | null;
  country_id?: string | null;
  category?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  state?: string | null;
  status?: string | number | null;
  // Server-decorated aggregates (GET /api/universities):
  tagged_courses_count?: number | null;
  intakes_count?: number | null;
}

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-indigo-100 text-indigo-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-lime-100 text-lime-700",
  "bg-cyan-100 text-cyan-700",
];

const KNOWN_CATEGORIES = [
  "Private University",
  "Deemed University",
  "State University",
  "Skill University",
  "International University",
] as const;

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "UN";
  return (
    words
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "UN"
  );
}

/** Normalize the free-form legacy `category` text onto the new design's set. */
function deriveCategory(category: string | null | undefined): string {
  if (!category) return "Private University";
  const lower = category.toLowerCase();
  const match = KNOWN_CATEGORIES.find((c) =>
    lower.includes(c.replace(" University", "").toLowerCase()),
  );
  return match ?? "Private University";
}

function deriveLocation(
  state: string | null | undefined,
  address: string | null | undefined,
): string {
  return state?.trim() || address?.trim() || "—";
}

/** Legacy `status` is CHAR(1): "1"/Active, "0"/Inactive. */
function deriveStatus(
  status: string | number | null | undefined,
): "Active" | "Inactive" {
  const normalized = String(status ?? "").toLowerCase().trim();
  if (normalized === "0" || normalized === "inactive" || normalized === "false")
    return "Inactive";
  return "Active";
}

function mapApiUniversity(u: ApiUniversity): UniRow {
  const name = u.title?.trim() || `University #${u.id}`;
  const state = u.state?.trim() ?? "";
  return {
    id: u.id,
    code: `UNI-${String(u.id).padStart(3, "0")}`,
    name,
    category: deriveCategory(u.category),
    location: deriveLocation(u.state, u.address),
    // `country_id` holds a countries.country_id (Text, possibly a list); there
    // is no separate `city` column at all (city lives inside `address`).
    country: u.country_id?.trim() || "—",
    state,
    address: u.address?.trim() ?? "",
    website: u.website?.trim() ?? "",
    email: u.email?.trim() ?? "",
    phone: u.phone?.trim() ?? "",
    // Server-decorated aggregates from GET /api/universities.
    courses: u.tagged_courses_count ?? 0,
    intakes: u.intakes_count ?? 0,
    status: deriveStatus(u.status),
    initials: deriveInitials(name),
    color: AVATAR_COLORS[u.id % AVATAR_COLORS.length],
    // Verbatim — no trim, no `|| fallback`, no normalisation. This is what the
    // Edit form seeds from and what the "did the user change it?" diff compares
    // against. See the UniRow.raw comment above.
    raw: {
      title: u.title ?? null,
      category: u.category ?? null,
      website: u.website ?? null,
      email: u.email ?? null,
      phone: u.phone ?? null,
      country_id: u.country_id ?? null,
      state: u.state ?? null,
      address: u.address ?? null,
      status: u.status === null || u.status === undefined ? null : String(u.status),
    },
  };
}

const CATEGORY_STYLE: Record<string, string> = {
  "Private University": "bg-sky-50 text-sky-700 ring-sky-200",
  "Deemed University": "bg-violet-50 text-violet-700 ring-violet-200",
  "State University": "bg-amber-50 text-amber-700 ring-amber-200",
  "Skill University": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "International University": "bg-rose-50 text-rose-700 ring-rose-200",
};

/* ---------------- Shared university form: shape, validation, payload ----------------
 *
 * Both dialogs below drive the same set of columns on `model university`, so the
 * form shape, the validation rules and the DTO mapping live here once instead of
 * being copy-pasted (they previously drifted between Add and Edit).
 *
 * Fields deliberately ABSENT because the API has no column for them:
 *   - University Code  -> derived from `id` server-side (`UNI-0NN`), never stored
 *   - University Type  -> no payer-type column on `model university`
 *   - City             -> no column; the legacy app folds it into `address`
 * `whitelist: true` on the API's global ValidationPipe would have stripped them
 * silently, so collecting them would have been a lie to the user.
 */

interface UniversityForm {
  name: string;
  category: string;
  website: string;
  email: string;
  phone: string;
  country: string;
  state: string;
  address: string;
  /**
   * "Active" | "Inactive" in the normal case, but deliberately a plain string:
   * it also has to be able to hold `""` (nothing stored — the column is
   * nullable) and any unrecognised CHAR(1) already in the database, so that
   * Edit can SHOW what is stored instead of snapping it to "Active".
   */
  status: string;
}

const EMPTY_UNIVERSITY_FORM: UniversityForm = {
  name: "",
  category: "",
  website: "",
  email: "",
  phone: "",
  country: "",
  state: "",
  address: "",
  status: "Active",
};

/**
 * Column widths from CreateUniversityDto / schema.prisma. Enforced client-side
 * so the user gets an inline message instead of a 400 from class-validator.
 */
const FIELD_MAX = {
  name: 160,
  category: 255,
  website: 60,
  phone: 15,
  email: 30,
  state: 255,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Accepts `example.edu`, `www.example.edu`, `https://example.edu/x` — rejects `ab`. */
function isValidWebsite(value: string): boolean {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    return false;
  }
  // Require a dotted host with a plausible TLD; `new URL` alone accepts "ab".
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(
    host,
  );
}

/** Tolerates spaces, dashes, parens and a leading `+`; 10–15 digits. */
function isValidPhone(value: string): boolean {
  const compact = value.replace(/[\s\-().]/g, "");
  return /^\+?\d{10,15}$/.test(compact);
}

function validateUniversityForm(form: UniversityForm): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) errors.name = "University name is required";
  else if (form.name.trim().length > FIELD_MAX.name)
    errors.name = `University name must be ${FIELD_MAX.name} characters or fewer`;

  if (!form.category) errors.category = "University category is required";
  // The picker only ever yields numeric ids; this guards the raw-id fallback
  // input (shown when GET /countries fails or is empty) against a typed
  // country NAME. Edit validates touched fields only, so a legacy stored value
  // never blocks an unrelated save.
  if (!form.country.trim()) errors.country = "Country is required";
  else if (!COUNTRY_ID_RE.test(form.country.trim()))
    errors.country = "Enter a numeric country ID (e.g. 99), or several separated by commas";

  if (!form.state.trim()) errors.state = "State is required";
  else if (form.state.trim().length > FIELD_MAX.state)
    errors.state = `State must be ${FIELD_MAX.state} characters or fewer`;

  if (form.email) {
    if (!EMAIL_RE.test(form.email.trim()))
      errors.email = "Enter a valid email address";
    else if (form.email.trim().length > FIELD_MAX.email)
      errors.email = `Email must be ${FIELD_MAX.email} characters or fewer`;
  }

  if (form.website) {
    if (!isValidWebsite(form.website.trim()))
      errors.website = "Enter a valid website URL, e.g. https://university.edu";
    else if (form.website.trim().length > FIELD_MAX.website)
      errors.website = `Website must be ${FIELD_MAX.website} characters or fewer`;
  }

  if (form.phone) {
    if (!isValidPhone(form.phone.trim()))
      errors.phone = "Enter a valid phone number (10–15 digits)";
    else if (form.phone.trim().length > FIELD_MAX.phone)
      errors.phone = `Phone must be ${FIELD_MAX.phone} characters or fewer`;
  }

  return errors;
}

/**
 * Legacy CHAR(1): "1" Active / "0" Inactive. Anything else in the column is
 * passed through byte-for-byte rather than being folded into "1" — a value we
 * do not recognise is not ours to rewrite.
 */
function statusToColumn(status: string): string {
  if (status === "Active") return "1";
  if (status === "Inactive") return "0";
  return status.trim();
}

/** Inverse of `statusToColumn`, for seeding the form from the stored value. */
function columnToStatus(raw: string | null): string {
  const v = (raw ?? "").trim();
  if (v === "") return ""; // NULL / empty — "not set", NOT "Active"
  if (v === "1") return "Active";
  if (v === "0") return "Inactive";
  return v; // unrecognised: surfaced verbatim as an extra Select option
}

/** Map the form onto the snake_case columns Create/UpdateUniversityDto accept. */
function toUniversityPayload(form: UniversityForm) {
  return {
    title: form.name.trim(),
    category: form.category.trim(),
    website: form.website.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    // Legacy free-form Text column — the detail page writes it the same way.
    country_id: form.country.trim(),
    state: form.state.trim(),
    address: form.address.trim(),
    status: statusToColumn(form.status),
  };
}

type UniversityPayload = ReturnType<typeof toUniversityPayload>;

/**
 * Seed an Edit form from the RAW server row — never from the display row.
 *
 * `UniRow.name`/`.category`/`.status`/`.country` are coerced for rendering
 * (`University #28`, "Private University", "Active", "—"). Seeding from them
 * and PATCHing back is what silently rewrites master data, so none of them are
 * read here.
 */
function seedUniversityForm(raw: RawUniversity): UniversityForm {
  return {
    name: raw.title ?? "",
    category: raw.category ?? "",
    website: raw.website ?? "",
    email: raw.email ?? "",
    phone: raw.phone ?? "",
    country: raw.country_id ?? "",
    state: raw.state ?? "",
    address: raw.address ?? "",
    status: columnToStatus(raw.status),
  };
}

/** The form fields the user actually edited, compared trim-insensitively. */
function changedFields(
  seeded: UniversityForm,
  current: UniversityForm,
): (keyof UniversityForm)[] {
  return (Object.keys(current) as (keyof UniversityForm)[]).filter(
    (k) => current[k].trim() !== seeded[k].trim(),
  );
}

/**
 * Build the PATCH body by diffing the submitted form against the values it was
 * seeded with, omitting every untouched column.
 *
 * This is the real safety net, independent of the seeding: a column the
 * operator never touched is simply not in the request, so the server cannot
 * overwrite it — not with a derived default, not with a trimmed variant, not
 * with anything. Keys are omitted entirely; no `undefined` is sent.
 */
function diffUniversityPayload(
  seeded: UniversityForm,
  current: UniversityForm,
): Partial<UniversityPayload> {
  const before = toUniversityPayload(seeded) as Record<string, string>;
  const after = toUniversityPayload(current) as Record<string, string>;
  const body: Record<string, string> = {};
  for (const column of Object.keys(after)) {
    if (after[column] !== before[column]) body[column] = after[column];
  }
  return body as Partial<UniversityPayload>;
}

/**
 * A stored value that is not one of the known options has to be offered as an
 * extra option, otherwise the Select renders blank and the first save snaps it
 * to a default the operator never chose.
 *
 * The comparison and the returned option are EXACT, not trimmed: the Select is
 * seeded with the verbatim stored value, so a padded `"Private University "`
 * only renders in the trigger if a SelectItem carries that same padded value.
 * Trimming it here produced an item (`"Private University"`) the seeded value
 * did not match, and the trigger fell back to its placeholder.
 */
function extraSelectOptions(
  value: string,
  known: readonly string[],
): string[] {
  if (!value.trim() || known.includes(value)) return [];
  return [value];
}

/* ---------------- Country / State lookups ----------------
 *
 * `university.country_id` is a Text column holding `countries.country_id`
 * (India is 99) — and, per the legacy DTO, possibly a comma-separated list of
 * them. It is never a country name, so it is rendered through GET /countries
 * and edited with a picker valued by id. `states.country` is a VarChar holding
 * the country NAME, so the state suggestions are filtered by name, not id.
 */

interface ApiCountry {
  country_id: number;
  country: string;
}

interface ApiState {
  id: number;
  country: string;
  state_name: string;
}

/** Both lookup endpoints default to 20 rows; these are small reference tables. */
const LOOKUP_LIMIT = 1000;
const LOOKUP_STALE_MS = 5 * 60_000;

function useCountries() {
  return useQuery({
    queryKey: ["countries", { page: 1, limit: LOOKUP_LIMIT }],
    queryFn: () =>
      apiGet<{ items: ApiCountry[]; total: number }>("/countries", {
        page: 1,
        limit: LOOKUP_LIMIT,
      }),
    staleTime: LOOKUP_STALE_MS,
  });
}

/** id (as the string stored in `country_id`) -> country name. */
function countryNameMap(countries: ApiCountry[] | undefined): Map<string, string> {
  return new Map((countries ?? []).map((c) => [String(c.country_id), c.country]));
}

/** A `country_id` value the picker / API can accept: one id or an id list. */
const COUNTRY_ID_RE = /^\d+(\s*,\s*\d+)*$/;

/**
 * Human label for a stored `country_id`, which may be a comma-separated list.
 * Only an all-digit token is labelled "Country ID n"; an earlier free-text UI
 * let some rows store a country NAME here, and that is shown verbatim rather
 * than as the nonsensical "Country ID India".
 */
function describeCountryIds(raw: string, names: Map<string, string>): string {
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => names.get(id) ?? (/^\d+$/.test(id) ? `Country ID ${id}` : id))
    .join(", ");
}

/**
 * Country NAME for state suggestions: a listed id resolves through the lookup;
 * a single non-numeric stored value (a legacy name) is used as the name itself.
 */
function countryNameFor(
  countryId: string,
  names: Map<string, string>,
): string | undefined {
  const token = countryId.trim();
  if (!token) return undefined;
  const resolved = names.get(token);
  if (resolved) return resolved;
  return /^\d+$/.test(token) || token.includes(",") ? undefined : token;
}

function UniversitiesPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<UniRow | null>(null);
  const pageSize = 10;

  // Live list (GET /api/universities). Mirrors the wired ref: fetch a wide page
  // and refine on the client. `total` drives the KPI card.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["universities", { page: 1, limit: 100 }],
    queryFn: () =>
      apiGet<{ items: ApiUniversity[]; total: number; page: number; limit: number }>(
        "/universities",
        { page: 1, limit: 100 },
      ),
  });

  // The server query is the single source of truth. There is deliberately no
  // local `universities` state to append to: the Add/Edit dialogs invalidate
  // ["universities"] and the row appears because the server says it exists.
  const universities = useMemo(
    () => (data?.items ?? []).map(mapApiUniversity),
    [data],
  );

  const resetFilters = () => {
    setQuery("");
    setCategory("all");
    setStatus("all");
    setPage(1);
  };

  const filtered = useMemo(() => {
    return universities.filter((u) => {
      if (category !== "all" && u.category !== category) return false;
      if (status !== "all" && u.status !== status) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !u.name.toLowerCase().includes(q) &&
          !u.code.toLowerCase().includes(q) &&
          !u.location.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [query, category, status, universities]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = filtered.slice((page - 1) * pageSize, page * pageSize);

  const activeCount = universities.filter((u) => u.status === "Active").length;
  const inactiveCount = universities.length - activeCount;
  const totalCourses = universities.reduce((a, u) => a + u.courses, 0);
  const totalIntakes = universities.reduce((a, u) => a + u.intakes, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Universities
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage university profiles.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The Export button that used to sit here was removed: it had no
              click handler, and there is no universities-export endpoint on the
              API (the only CSV exports live under /api/reports/*). A dead
              control is worse than no control — reinstate this the moment an
              export endpoint exists. */}
          <Button
            onClick={() => setAddOpen(true)}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            Add University
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Universities", value: data?.total ?? universities.length, hint: "Onboarded partners" },
          { label: "Active", value: activeCount, hint: `${inactiveCount} inactive` },
          { label: "Tagged Courses", value: totalCourses, hint: "Across all universities" },
          { label: "Active Intakes", value: totalIntakes, hint: "Currently open" },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border bg-card p-5 shadow-sm"
          >
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {k.label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {k.value}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Filters + Table */}
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, code, location"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Private University">Private University</SelectItem>
                <SelectItem value="Deemed University">Deemed University</SelectItem>
                <SelectItem value="State University">State University</SelectItem>
                <SelectItem value="Skill University">Skill University</SelectItem>
                <SelectItem value="International University">International University</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RefreshCcw className="mr-1 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40">
              <TableRow>
                <TableHead className="px-4 w-16">Sl No</TableHead>
                <TableHead>University Code</TableHead>
                <TableHead>University Name</TableHead>
                {/* This column has always rendered the category pill; the
                    header said "Type", which was the (non-existent) payer-type
                    field. Renamed to match what the cell actually shows. */}
                <TableHead>Category</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Tagged Courses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-4">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading universities…
                    </div>
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-sm text-red-500">
                      <AlertTriangle className="h-5 w-5" />
                      Failed to load universities. Please try again.
                    </div>
                  </TableCell>
                </TableRow>
              ) : current.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No universities match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                current.map((u, i) => (
                  <TableRow key={u.code} className="hover:bg-muted/40">
                    {/* Page-offset, not the index inside the sliced page — the
                        Sl No used to restart at 1 on every page. */}
                    <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                      {(page - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-xs font-medium text-muted-foreground">
                      {u.code}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-semibold ring-1 ring-black/5 ${u.color}`}>
                          {u.initials}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {u.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Online Programs
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${CATEGORY_STYLE[u.category] || "bg-zinc-50 text-zinc-700 ring-zinc-200"}`}>
                        {u.category}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5 text-sm text-foreground">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {u.location}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      {/* Was a styled <button> with no handler. The tagged
                          courses live on the university detail page's Courses
                          tab; that route takes the numeric id, same as View. */}
                      <Link
                        to="/universities/universities/$code"
                        params={{ code: String(u.id) }}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {u.courses} {u.courses === 1 ? "Course" : "Courses"}
                      </Link>
                    </TableCell>
                    <TableCell className="py-3">
                      {u.status === "Active" ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-zinc-100 text-zinc-600">
                          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-zinc-400" />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="View">
                          {/* The detail route resolves this param as the university id
                              (see universities.universities_.$code.tsx:96) — passing the
                              display code made every View 400 with "numeric string is
                              expected". */}
                          <Link to="/universities/universities/$code" params={{ code: String(u.id) }}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit"
                          onClick={() => setEditing(u)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t p-4 sm:flex-row">
          <div className="text-xs text-muted-foreground">
            Showing {(current.length === 0 ? 0 : (page - 1) * pageSize + 1)}–
            {(page - 1) * pageSize + current.length} of {filtered.length}
          </div>
          <Pagination className="m-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={(e) => {
                    e.preventDefault();
                    setPage((p) => Math.max(1, p - 1));
                  }}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }).map((_, i) => (
                <PaginationItem key={i}>
                  <PaginationLink
                    isActive={page === i + 1}
                    onClick={(e) => {
                      e.preventDefault();
                      setPage(i + 1);
                    }}
                  >
                    {i + 1}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  onClick={(e) => {
                    e.preventDefault();
                    setPage((p) => Math.min(totalPages, p + 1));
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>

      <AddUniversityDialog open={addOpen} onClose={() => setAddOpen(false)} />
      {editing && (
        <EditUniversityDialog
          // Keyed by row id so the dialog remounts (and re-snapshots the raw
          // seed values) if it is ever opened for a different university
          // without unmounting in between.
          key={editing.id}
          university={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}


const CATEGORIES = [
  "Private University",
  "State University",
  "Deemed University",
  "Skill University",
  "International University",
];

/* ---------------- Shared dialog chrome ---------------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-full">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h4>
      <div className="mt-1 h-px bg-border" />
    </div>
  );
}

/**
 * Server-error banner.
 *
 * We also `toast.error`, matching the house style on the university detail
 * page. `<Toaster />` is now mounted in __root.tsx so the toast does render;
 * this banner stays because it keeps the failure pinned next to the Save
 * button the user just pressed, rather than in a corner that auto-dismisses.
 */
function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiError ? error.message : "Something went wrong";
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/* ---------------- Shared form body ----------------
 *
 * Identical field set for Add and Edit, because both drive the same columns.
 */

function UniversityFormFields({
  idPrefix,
  form,
  errors,
  disabled,
  update,
  extraCategories = [],
  extraStatuses = [],
  storedCountry = "",
  showStoredHints = false,
}: {
  idPrefix: string;
  form: UniversityForm;
  errors: Record<string, string>;
  disabled: boolean;
  update: <K extends keyof UniversityForm>(
    field: K,
    value: UniversityForm[K],
  ) => void;
  /**
   * Values already stored on this row that are not in the standard option
   * lists. They are rendered as additional options so the operator can see
   * what is actually in the database instead of the Select silently falling
   * back to a default.
   */
  extraCategories?: string[];
  extraStatuses?: string[];
  /**
   * Edit only: the verbatim `country_id` the row was opened with. If it is not
   * exactly one id from GET /countries (a padded value, a comma-separated list,
   * an id with no countries row) it is offered as its own option, so the
   * picker shows what is stored instead of a blank.
   */
  storedCountry?: string;
  /**
   * Edit only: show "nothing is stored for this column" hints. On Add an empty
   * Select just means the user has not picked yet, which needs no commentary.
   */
  showStoredHints?: boolean;
}) {
  return (
    <>
      {/* Basic Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
        <SectionTitle>Basic Information</SectionTitle>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-name`}>
            University Name <span className="text-accent">*</span>
          </Label>
          <Input
            id={`${idPrefix}-name`}
            placeholder="e.g. Amity University Online"
            maxLength={FIELD_MAX.name}
            disabled={disabled}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className={cn(errors.name && "border-red-400 focus-visible:ring-red-300")}
          />
          {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>
            University Category <span className="text-accent">*</span>
          </Label>
          <Select
            value={form.category}
            disabled={disabled}
            onValueChange={(v) => update("category", v)}
          >
            <SelectTrigger
              className={cn(errors.category && "border-red-400 focus:ring-red-300")}
            >
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
              {extraCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && (
            <p className="text-xs text-red-500">{errors.category}</p>
          )}
          {extraCategories.length > 0 && (
            <p className="text-xs text-muted-foreground">
              “{extraCategories[0]}” is the value currently stored for this
              university. It is not one of the standard categories — it is kept
              as-is unless you pick a different one.
            </p>
          )}
          {showStoredHints && !form.category && (
            <p className="text-xs text-muted-foreground">
              No category is stored for this university.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={form.status}
            disabled={disabled}
            onValueChange={(v) => update("status", v)}
          >
            <SelectTrigger>
              {/* The placeholder is what a NULL `status` looks like. It used to
                  render as "Active", which is a claim the database never made. */}
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
              {extraStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s} (stored value)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showStoredHints && !form.status && (
            <p className="text-xs text-muted-foreground">
              No status is stored for this university.
            </p>
          )}
        </div>
      </div>

      {/* Contact Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
        <SectionTitle>Contact Information</SectionTitle>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-website`}>Website</Label>
          <div className="relative">
            <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`${idPrefix}-website`}
              placeholder="https://university.edu"
              maxLength={FIELD_MAX.website}
              disabled={disabled}
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
              className={cn(
                "pl-9",
                errors.website && "border-red-400 focus-visible:ring-red-300",
              )}
            />
          </div>
          {errors.website && (
            <p className="text-xs text-red-500">{errors.website}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-email`}>Official Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`${idPrefix}-email`}
              type="email"
              placeholder="contact@university.edu"
              maxLength={FIELD_MAX.email}
              disabled={disabled}
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className={cn(
                "pl-9",
                errors.email && "border-red-400 focus-visible:ring-red-300",
              )}
            />
          </div>
          {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-phone`}>Official Phone</Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`${idPrefix}-phone`}
              placeholder="+91 12345 67890"
              maxLength={FIELD_MAX.phone}
              disabled={disabled}
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className={cn(
                "pl-9",
                errors.phone && "border-red-400 focus-visible:ring-red-300",
              )}
            />
          </div>
          {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
        </div>
      </div>

      {/* Location */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
        <SectionTitle>Location</SectionTitle>

        <CountryField
          id={`${idPrefix}-country`}
          value={form.country}
          storedValue={storedCountry}
          error={errors.country}
          disabled={disabled}
          onChange={(v) => update("country", v)}
        />

        <StateField
          id={`${idPrefix}-state`}
          value={form.state}
          countryId={form.country}
          error={errors.state}
          disabled={disabled}
          onChange={(v) => update("state", v)}
        />

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-address`}>Address (including city)</Label>
          <Textarea
            id={`${idPrefix}-address`}
            placeholder="e.g. Sector 125, Noida, Uttar Pradesh 201313"
            rows={3}
            disabled={disabled}
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            There is no separate City field — a university record stores its
            city as part of this address, so include it here.
          </p>
        </div>
      </div>
    </>
  );
}

/**
 * Country picker, valued by `countries.country_id`.
 *
 * Seeded with the verbatim stored `country_id`; `toUniversityPayload` trims it
 * and `diffUniversityPayload` only sends it when it differs from the seed, so
 * opening Edit and saving never rewrites the column. If the lookup is
 * unavailable (request failed, or the countries table is empty) it degrades to
 * the raw id input rather than a dropdown with nothing in it.
 */
function CountryField({
  id,
  value,
  storedValue,
  error,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  storedValue: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { data, isLoading, isError } = useCountries();
  const countries = data?.items ?? [];
  const names = countryNameMap(countries);
  const storedIsExtra = storedValue.trim() !== "" && !names.has(storedValue);
  const lookupUnavailable = !isLoading && (isError || countries.length === 0);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Country <span className="text-accent">*</span>
      </Label>
      {lookupUnavailable ? (
        <>
          <Input
            id={id}
            placeholder="Country ID, e.g. 99"
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(error && "border-red-400 focus-visible:ring-red-300")}
          />
          <p className="text-xs text-muted-foreground">
            {isError
              ? "The country list could not be loaded"
              : "No countries are set up yet"}{" "}
            — enter the country ID directly.
          </p>
        </>
      ) : (
        <Select
          value={value}
          disabled={disabled || isLoading}
          onValueChange={onChange}
        >
          <SelectTrigger
            id={id}
            className={cn(error && "border-red-400 focus:ring-red-300")}
          >
            {/* While loading, a seeded id has no SelectItem yet to render, so
                the trigger would be blank rather than showing the placeholder. */}
            {isLoading ? (
              <span className="text-muted-foreground">Loading countries…</span>
            ) : (
              <SelectValue placeholder="Select country" />
            )}
          </SelectTrigger>
          <SelectContent>
            {countries.map((c) => (
              <SelectItem key={c.country_id} value={String(c.country_id)}>
                {c.country}
              </SelectItem>
            ))}
            {storedIsExtra && (
              <SelectItem value={storedValue}>
                {describeCountryIds(storedValue, names)} (stored value)
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {!lookupUnavailable && storedIsExtra && value === storedValue && (
        <p className="text-xs text-muted-foreground">
          This is the value currently stored for this university (
          <span className="font-mono">{storedValue.trim()}</span>). It is kept
          as-is unless you pick a different country.
        </p>
      )}
    </div>
  );
}

/**
 * State: free text (the column is a plain VarChar and many countries have no
 * rows in `states`), with suggestions from GET /states for the chosen country.
 */
function StateField({
  id,
  value,
  countryId,
  error,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  countryId: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { data: countries } = useCountries();
  // states.country holds the NAME; a multi-id or unknown id has none.
  const countryName = countryNameFor(countryId, countryNameMap(countries?.items));
  const { data: states } = useQuery({
    queryKey: ["states", { country: countryName, limit: LOOKUP_LIMIT }],
    queryFn: () =>
      apiGet<{ items: ApiState[]; total: number }>("/states", {
        country: countryName,
        page: 1,
        limit: LOOKUP_LIMIT,
      }),
    enabled: Boolean(countryName),
    staleTime: LOOKUP_STALE_MS,
  });
  const suggestions = countryName ? (states?.items ?? []) : [];
  const listId = `${id}-options`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        State <span className="text-accent">*</span>
      </Label>
      <Input
        id={id}
        placeholder="e.g. Uttar Pradesh"
        maxLength={FIELD_MAX.state}
        disabled={disabled}
        value={value}
        list={suggestions.length > 0 ? listId : undefined}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className={cn(error && "border-red-400 focus-visible:ring-red-300")}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((st) => (
            <option key={st.id} value={st.state_name} />
          ))}
        </datalist>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {!error && suggestions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Type to pick from the states on file for {countryName}, or enter one.
        </p>
      )}
    </div>
  );
}

/** Shared controlled-form state + error clearing for both dialogs. */
function useUniversityForm(initial: UniversityForm) {
  const [form, setForm] = useState<UniversityForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = <K extends keyof UniversityForm>(
    field: K,
    value: UniversityForm[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field as string]) return prev;
      const next = { ...prev };
      delete next[field as string];
      return next;
    });
  };

  /**
   * Returns the validated form, or null when there are errors to show.
   *
   * `only` narrows validation to the fields the user actually edited. Edit
   * passes it so that a row whose stored `title`/`category` is NULL can still
   * have an unrelated field corrected: the required-field rules exist to stop
   * the operator SUBMITTING a blank, not to force them to invent a value for a
   * column they are not touching and that the PATCH will not include anyway.
   * Add passes nothing, so every rule applies there.
   */
  const validated = (only?: (keyof UniversityForm)[]): UniversityForm | null => {
    const all = validateUniversityForm(form);
    const next = only
      ? Object.fromEntries(
          Object.entries(all).filter(([field]) =>
            only.includes(field as keyof UniversityForm),
          ),
        )
      : all;
    setErrors(next);
    return Object.keys(next).length === 0 ? form : null;
  };

  const reset = (to: UniversityForm) => {
    setForm(to);
    setErrors({});
  };

  return { form, errors, update, validated, reset };
}

/* ---------------- Edit University Dialog ---------------- */

function EditUniversityDialog({
  university,
  onClose,
}: {
  university: UniRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  /*
   * Captured ONCE when the dialog opens, from the raw server row —
   * `university.name`/`.category`/`.status`/`.country` are display coercions
   * and are deliberately not read here. The lazy `useState` initialiser keeps
   * this snapshot stable for the lifetime of the dialog, so the diff below
   * always compares against what the form was actually opened with. (The
   * dialog is keyed by row id at the call site, so switching rows remounts it
   * and re-snapshots.)
   */
  const [seeded] = useState(() => seedUniversityForm(university.raw));
  const { form, errors, update, validated } = useUniversityForm(seeded);

  // Stored values outside the standard option sets, surfaced as extra options
  // so the operator sees what is really in the column.
  const extraCategories = extraSelectOptions(seeded.category, CATEGORIES);
  const extraStatuses = extraSelectOptions(seeded.status, [
    "Active",
    "Inactive",
  ]);

  // Edit University -> PATCH /universities/:id. The body is a partial: only
  // the columns the user changed are present (UpdateUniversityDto is a
  // PartialType, so omitted columns are left alone server-side).
  const editMut = useMutation({
    mutationFn: (body: Partial<UniversityPayload>) =>
      apiPatch(`/universities/${university.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["universities"] });
      qc.invalidateQueries({ queryKey: ["university", String(university.id)] });
      toast.success("University updated");
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const save = () => {
    const touched = changedFields(seeded, form);

    // Nothing was edited: send nothing. A no-op PATCH is exactly how derived
    // defaults used to get written over real NULLs.
    if (touched.length === 0) {
      toast.info("No changes to save");
      onClose();
      return;
    }

    // Validate only what the user touched — see `validated`'s comment.
    const valid = validated(touched);
    if (!valid) return;

    editMut.mutate(diffUniversityPayload(seeded, valid));
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !editMut.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-3xl p-0 overflow-hidden max-h-[85vh]">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-xl font-semibold">Edit University</DialogTitle>
          <DialogDescription>
            Update the university profile details.{" "}
            <span className="font-mono">{university.code}</span> is derived from
            the record id and cannot be changed. Only the fields you edit are
            saved — everything you leave alone is left exactly as stored.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          <UniversityFormFields
            idPrefix="edit-uni"
            form={form}
            errors={errors}
            disabled={editMut.isPending}
            update={update}
            extraCategories={extraCategories}
            extraStatuses={extraStatuses}
            storedCountry={seeded.country}
            showStoredHints
          />
        </div>

        <div className="space-y-3 border-t border-border bg-muted/30 px-6 py-4">
          <MutationError error={editMut.error} />
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={editMut.isPending}>
              Cancel
            </Button>
            <Button
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover"
              onClick={save}
              disabled={editMut.isPending}
            >
              {editMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editMut.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Add University Dialog ---------------- */

interface AddUniversityDialogProps {
  open: boolean;
  onClose: () => void;
}

/** The `data` POST /universities echoes back — we only need id/title. */
interface CreatedUniversity {
  id: number;
  title?: string | null;
  category?: string | null;
  status?: string | number | null;
}

function AddUniversityDialog({ open, onClose }: AddUniversityDialogProps) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"form" | "success">("form");
  const [createdUni, setCreatedUni] = useState<CreatedUniversity | null>(null);
  const { form, errors, update, validated, reset } =
    useUniversityForm(EMPTY_UNIVERSITY_FORM);

  // Add University -> POST /universities. The success screen is rendered only
  // from the server's response, never optimistically.
  const createMut = useMutation({
    mutationFn: (body: ReturnType<typeof toUniversityPayload>) =>
      apiPost<CreatedUniversity>("/universities", body),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["universities"] });
      setCreatedUni(created);
      setStep("success");
      toast.success("University created");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const resetAll = () => {
    setStep("form");
    setCreatedUni(null);
    reset(EMPTY_UNIVERSITY_FORM);
    createMut.reset();
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleSave = () => {
    const valid = validated();
    if (!valid) return;
    createMut.mutate(toUniversityPayload(valid));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !createMut.isPending) handleClose();
      }}
    >
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        {step === "form" ? (
          <>
            <DialogHeader className="px-6 pt-6 pb-0">
              <DialogTitle className="text-xl font-semibold">Add New University</DialogTitle>
              <DialogDescription>
                Create a new university profile. Fields marked with{" "}
                <span className="text-accent">*</span> are required. The
                university code is assigned automatically on save.
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <UniversityFormFields
                idPrefix="uni"
                form={form}
                errors={errors}
                disabled={createMut.isPending}
                update={update}
              />
            </div>

            {/* Footer actions */}
            <div className="space-y-3 border-t border-border bg-muted/30 px-6 py-4">
              <MutationError error={createMut.error} />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={createMut.isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover"
                  onClick={handleSave}
                  disabled={createMut.isPending}
                >
                  {createMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {createMut.isPending ? "Saving…" : "Save University"}
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Success State — reached only after the API confirmed the insert. */
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <DialogTitle className="text-xl font-semibold">University Created Successfully</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              New university profile has been added to the system.
            </DialogDescription>

            {createdUni && (
              <div className="mt-6 w-full max-w-md space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">University Code</span>
                  <span className="font-mono font-semibold text-foreground">
                    UNI-{String(createdUni.id).padStart(3, "0")}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">University Name</span>
                  <span className="font-semibold text-foreground">
                    {createdUni.title?.trim() || `University #${createdUni.id}`}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">Category</span>
                  <span className="font-semibold text-foreground">
                    {createdUni.category?.trim() || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {deriveStatus(createdUni.status)}
                  </span>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-2">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover"
                onClick={resetAll}
              >
                <Plus className="h-4 w-4" />
                Add Another
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
