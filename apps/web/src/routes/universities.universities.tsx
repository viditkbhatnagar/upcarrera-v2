import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  Building2,
  Download,
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
  Edit3,
} from "lucide-react";
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

type UniType = "Private" | "Deemed" | "State" | "Central" | "Foreign";

type UniRow = {
  code: string;
  name: string;
  type: UniType;
  location: string;
  courses: number;
  intakes: number;
  status: "Active" | "Inactive";
  initials: string;
  color: string;
};

const TYPE_STYLE: Record<UniRow["type"], string> = {
  Private: "bg-sky-50 text-sky-700 ring-sky-200",
  Deemed: "bg-violet-50 text-violet-700 ring-violet-200",
  State: "bg-amber-50 text-amber-700 ring-amber-200",
  Central: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Foreign: "bg-rose-50 text-rose-700 ring-rose-200",
};

// ---- Live API wiring (GET /api/universities) ----

interface ApiUniversity {
  id: number;
  title: string | null;
  country_id?: string | null;
  category?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  year_established?: string | null;
  ranking?: string | null;
  intakes?: string | null;
  address?: string | null;
  state?: string | null;
  status?: string | number | null;
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

const VALID_TYPES: UniType[] = ["Private", "Deemed", "State", "Central", "Foreign"];

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "UN";
  return words
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "UN";
}

function deriveType(category: string | null | undefined): UniType {
  if (!category) return "Private";
  const match = VALID_TYPES.find((t) => category.toLowerCase().includes(t.toLowerCase()));
  return match ?? "Private";
}

function deriveLocation(state: string | null | undefined, address: string | null | undefined): string {
  return state?.trim() || address?.trim() || "—";
}

function deriveStatus(status: string | number | null | undefined): "Active" | "Inactive" {
  const normalized = String(status ?? "").toLowerCase().trim();
  if (normalized === "0" || normalized === "inactive" || normalized === "false") return "Inactive";
  return "Active";
}

// Count active intakes from the comma/line-separated intakes blob.
function countIntakes(intakes: string | null | undefined): number {
  if (!intakes) return 0;
  return intakes
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function mapApiUniversity(u: ApiUniversity): UniRow {
  const name = u.title?.trim() || `University #${u.id}`;
  return {
    code: `UNI-${String(u.id).padStart(3, "0")}`,
    name,
    type: deriveType(u.category),
    location: deriveLocation(u.state, u.address),
    // No per-university course count is exposed by the list endpoint.
    courses: 0,
    intakes: countIntakes(u.intakes),
    status: deriveStatus(u.status),
    initials: deriveInitials(name),
    color: AVATAR_COLORS[u.id % AVATAR_COLORS.length],
  };
}

function UniversitiesPage() {
  // TODO(api): no endpoint returns a per-university tagged-course count; the
  // "Tagged Courses" column + KPI render 0 until /api/universities exposes it
  // (or /api/courses is aggregated by university_id client-side).
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const pageSize = 10;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["universities", { page: 1, limit: 100 }],
    queryFn: () =>
      apiGet<{ items: ApiUniversity[]; total: number; page: number; limit: number }>(
        "/universities",
        { page: 1, limit: 100 },
      ),
  });

  const universities = useMemo<UniRow[]>(
    () => (data?.items ?? []).map(mapApiUniversity),
    [data],
  );

  const filtered = useMemo(() => {
    return universities.filter((u) => {
      if (type !== "all" && u.type !== type) return false;
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
  }, [universities, query, type, status]);

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
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
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
            <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Private">Private</SelectItem>
                <SelectItem value="Deemed">Deemed</SelectItem>
                <SelectItem value="State">State</SelectItem>
                <SelectItem value="Central">Central</SelectItem>
                <SelectItem value="Foreign">Foreign</SelectItem>
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
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40">
              <TableRow>
                <TableHead className="px-4">University Code</TableHead>
                <TableHead>University Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Tagged Courses</TableHead>
                <TableHead>Active Intakes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-4">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    Loading universities…
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-red-500">
                    Failed to load universities. Please try again.
                  </TableCell>
                </TableRow>
              ) : current.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No universities match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                current.map((u) => (
                  <TableRow key={u.code} className="hover:bg-muted/40">
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
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${TYPE_STYLE[u.type]}`}>
                        {u.type}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5 text-sm text-foreground">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {u.location}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <button className="text-sm font-medium text-primary hover:underline">
                        {u.courses} Courses
                      </button>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-sm text-foreground">
                        {u.intakes} Active {u.intakes === 1 ? "Intake" : "Intakes"}
                      </span>
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
                          <Link to="/universities/universities/$code" params={{ code: u.code }}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit">
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
    </div>
  );
}

/* ---------------- Add University Dialog ---------------- */

interface AddUniversityDialogProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  "Private University",
  "State University",
  "Deemed University",
  "Skill University",
  "International University",
];

function AddUniversityDialog({ open, onClose }: AddUniversityDialogProps) {
  const [step, setStep] = useState<"form" | "success">("form");
  const [codeLocked, setCodeLocked] = useState(true);
  const [createdUni, setCreatedUni] = useState<{
    name: string;
    code: string;
    type: string;
    category: string;
    status: string;
  } | null>(null);

  const [form, setForm] = useState({
    name: "",
    code: "",
    type: "",
    category: "",
    website: "",
    email: "",
    phone: "",
    country: "",
    state: "",
    city: "",
    address: "",
    status: "Active",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setStep("form");
    setCodeLocked(true);
    setCreatedUni(null);
    setForm({
      name: "",
      code: "",
      type: "",
      category: "",
      website: "",
      email: "",
      phone: "",
      country: "",
      state: "",
      city: "",
      address: "",
      status: "Active",
    });
    setErrors({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const generateCode = (name: string) => {
    if (!name.trim()) return "";
    const words = name.trim().split(/\s+/);
    const initials = words
      .filter((w) => w.length > 0 && !/^(University|College|Institute|of|the|and|&)$/i.test(w))
      .map((w) => w[0].toUpperCase())
      .slice(0, 3)
      .join("");
    const num = String(Math.floor(Math.random() * 900) + 100);
    return `UNI-${initials}${num}`;
  };

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "name" && codeLocked) {
        next.code = generateCode(value);
      }
      return next;
    });
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "University name is required";
    if (!form.code.trim()) next.code = "University code is required";
    if (!form.type) next.type = "University type is required";
    if (!form.category) next.category = "University category is required";
    if (!form.country.trim()) next.country = "Country is required";
    if (!form.state.trim()) next.state = "State is required";
    if (!form.city.trim()) next.city = "City is required";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = "Invalid email address";
    if (form.website && !/^(https?:\/\/)?[^\s$.?#].[^\s]*$/i.test(form.website))
      next.website = "Invalid website URL";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    setCreatedUni({
      name: form.name,
      code: form.code,
      type: form.type,
      category: form.category,
      status: form.status,
    });
    setStep("success");
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="col-span-full">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h4>
      <div className="mt-1 h-px bg-border" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        {step === "form" ? (
          <>
            <DialogHeader className="px-6 pt-6 pb-0">
              <DialogTitle className="text-xl font-semibold">Add New University</DialogTitle>
              <DialogDescription>
                Create a new university profile. Fields marked with <span className="text-accent">*</span> are required.
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                <SectionTitle>Basic Information</SectionTitle>

                {/* University Name */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="uni-name">University Name <span className="text-accent">*</span></Label>
                  <Input
                    id="uni-name"
                    placeholder="e.g. Amity University Online"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    className={cn(errors.name && "border-red-400 focus-visible:ring-red-300")}
                  />
                  {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                </div>

                {/* University Code */}
                <div className="space-y-1.5">
                  <Label htmlFor="uni-code">University Code <span className="text-accent">*</span></Label>
                  <div className="flex gap-2">
                    <Input
                      id="uni-code"
                      placeholder="UNI-XXX"
                      value={form.code}
                      onChange={(e) => update("code", e.target.value)}
                      disabled={codeLocked}
                      className={cn(
                        "font-mono",
                        codeLocked && "bg-muted/50 text-muted-foreground",
                        errors.code && "border-red-400 focus-visible:ring-red-300"
                      )}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => {
                        setCodeLocked((l) => {
                          const next = !l;
                          if (!next) {
                            // unlocked → regenerate from current name
                            setForm((prev) => ({
                              ...prev,
                              code: generateCode(prev.name),
                            }));
                          }
                          return next;
                        });
                      }}
                      title={codeLocked ? "Unlock to edit" : "Lock auto-generated code"}
                    >
                      {codeLocked ? <Edit3 className="h-4 w-4" /> : <RefreshCcw className="h-4 w-4" />}
                    </Button>
                  </div>
                  {errors.code && <p className="text-xs text-red-500">{errors.code}</p>}
                  {!errors.code && codeLocked && (
                    <p className="text-xs text-muted-foreground">Auto-generated from university name. Click the lock to edit.</p>
                  )}
                </div>

                {/* University Type */}
                <div className="space-y-1.5">
                  <Label>University Type <span className="text-accent">*</span></Label>
                  <Select value={form.type} onValueChange={(v) => update("type", v)}>
                    <SelectTrigger className={cn(errors.type && "border-red-400 focus:ring-red-300")}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Type 1 – Student Pays University">Type 1 – Student Pays University</SelectItem>
                      <SelectItem value="Type 2 – Student Pays upCarrera">Type 2 – Student Pays upCarrera</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.type && <p className="text-xs text-red-500">{errors.type}</p>}
                </div>

                {/* University Category */}
                <div className="space-y-1.5">
                  <Label>University Category <span className="text-accent">*</span></Label>
                  <Select value={form.category} onValueChange={(v) => update("category", v)}>
                    <SelectTrigger className={cn(errors.category && "border-red-400 focus:ring-red-300")}>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.category && <p className="text-xs text-red-500">{errors.category}</p>}
                </div>

                {/* Status */}
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => update("status", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                <SectionTitle>Contact Information</SectionTitle>

                {/* Website */}
                <div className="space-y-1.5">
                  <Label htmlFor="uni-website">Website</Label>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="uni-website"
                      placeholder="https://university.edu"
                      value={form.website}
                      onChange={(e) => update("website", e.target.value)}
                      className={cn("pl-9", errors.website && "border-red-400 focus-visible:ring-red-300")}
                    />
                  </div>
                  {errors.website && <p className="text-xs text-red-500">{errors.website}</p>}
                </div>

                {/* Official Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="uni-email">Official Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="uni-email"
                      type="email"
                      placeholder="contact@university.edu"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      className={cn("pl-9", errors.email && "border-red-400 focus-visible:ring-red-300")}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                </div>

                {/* Official Phone */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="uni-phone">Official Phone</Label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="uni-phone"
                      placeholder="+91 12345 67890"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4">
                <SectionTitle>Location</SectionTitle>

                <div className="space-y-1.5">
                  <Label htmlFor="uni-country">Country <span className="text-accent">*</span></Label>
                  <Input
                    id="uni-country"
                    placeholder="India"
                    value={form.country}
                    onChange={(e) => update("country", e.target.value)}
                    className={cn(errors.country && "border-red-400 focus-visible:ring-red-300")}
                  />
                  {errors.country && <p className="text-xs text-red-500">{errors.country}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="uni-state">State <span className="text-accent">*</span></Label>
                  <Input
                    id="uni-state"
                    placeholder="Uttar Pradesh"
                    value={form.state}
                    onChange={(e) => update("state", e.target.value)}
                    className={cn(errors.state && "border-red-400 focus-visible:ring-red-300")}
                  />
                  {errors.state && <p className="text-xs text-red-500">{errors.state}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="uni-city">City <span className="text-accent">*</span></Label>
                  <Input
                    id="uni-city"
                    placeholder="Noida"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                    className={cn(errors.city && "border-red-400 focus-visible:ring-red-300")}
                  />
                  {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
                </div>

                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="uni-address">Full Address</Label>
                  <Textarea
                    id="uni-address"
                    placeholder="Enter complete postal address"
                    rows={3}
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:bg-accent-hover"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save University
              </button>
            </div>
          </>
        ) : (
          /* Success State */
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
                  <span className="font-mono font-semibold text-foreground">{createdUni.code}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">University Name</span>
                  <span className="font-semibold text-foreground">{createdUni.name}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-semibold text-foreground">{createdUni.type}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">Category</span>
                  <span className="font-semibold text-foreground">{createdUni.category}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {createdUni.status}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">Created On</span>
                  <span className="font-semibold text-foreground">
                    {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-2">
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Close
              </button>
              <button
                onClick={() => {
                  reset();
                  setStep("form");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:bg-accent-hover"
              >
                <Plus className="h-4 w-4" />
                Add Another
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
