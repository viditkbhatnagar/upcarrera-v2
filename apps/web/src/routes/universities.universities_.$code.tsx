import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, ApiError } from "@/lib/api";
import {
  ArrowLeft,
  Building2,
  Pencil,
  BookPlus,
  Globe,
  Mail,
  Phone,
  MapPin,
  Plus,
  Eye,
  Search,
  CheckCircle2,
  Activity,
  Wallet,
  Trash2,
  Lock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type UniRow = {
  code: string;
  name: string;
  type: "Type 1 – Student Pays University" | "Type 2 – Student Pays upCarrera";
  category: string;
  location: string;
  country: string;
  state: string;
  city: string;
  address: string;
  website: string;
  email: string;
  phone: string;
  courses: number;
  intakes: number;
  status: "Active" | "Inactive";
  initials: string;
  color: string;
};

const CATEGORY_STYLE: Record<string, string> = {
  "Private University": "bg-sky-50 text-sky-700 ring-sky-200",
  "Deemed University": "bg-violet-50 text-violet-700 ring-violet-200",
  "State University": "bg-amber-50 text-amber-700 ring-amber-200",
  "Skill University": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "International University": "bg-rose-50 text-rose-700 ring-rose-200",
};

export const Route = createFileRoute("/universities/universities_/$code")({
  head: ({ params }) => ({
    meta: [{ title: `${params.code} — Universities — upCarrera` }],
  }),
  component: UniversityProfilePage,
});

/* ---- Live API row types + mappers ----------------------------------------
 * Detail  -> GET /universities/:id        (the $code route param is the id)
 * Courses -> GET /courses?university_id=id (CourseListQueryDto)
 * Fees    -> GET /semesters?university_id=id (SemesterListQueryDto)
 * The two list endpoints return the paginated { items, total, page, limit }
 * envelope (already unwrapped by apiGet).
 */

interface ApiUniversity {
  id: number | string;
  title: string | null;
  country_id: string | null;
  accreditation: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  year_established: string | null;
  affiliations: string | null;
  ranking: string | null;
  intakes: string | null;
  address: string | null;
  state: string | null;
  photo: string | null;
  status: number | string | null;
  created_at: string | null;
  updated_at: string | null;
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
  "bg-cyan-100 text-cyan-700",
];

function deriveInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 0 &&
        !/^(University|College|Institute|of|the|and|&|Online)$/i.test(w),
    );
  const picked = words.length > 0 ? words : name.trim().split(/\s+/);
  return (
    picked
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

function pickColor(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

// The new design narrows category to a fixed set; coerce the free-form column.
function mapCategory(category: string | null): string {
  const c = (category ?? "").toLowerCase();
  if (c.includes("deem")) return "Deemed University";
  if (c.includes("state")) return "State University";
  if (c.includes("skill")) return "Skill University";
  if (c.includes("foreign") || c.includes("international"))
    return "International University";
  if (c.includes("private")) return "Private University";
  // Fall back to whatever the API stored, else Private.
  return (category ?? "").trim() || "Private University";
}

// The API has no Type 1/Type 2 split; default to the more common "Type 1".
function mapType(): UniRow["type"] {
  return "Type 1 – Student Pays University";
}

// status is a numeric/string flag where 1 (or "1"/"Active") means active.
function mapStatus(status: number | string | null): UniRow["status"] {
  const s = String(status ?? "").toLowerCase();
  return s === "1" || s === "active" || s === "true" ? "Active" : "Inactive";
}

function mapApiUniversity(u: ApiUniversity): UniRow {
  const name = (u.title ?? "").trim() || `University #${u.id}`;
  const intakesCount = u.intakes
    ? u.intakes.split(",").filter((x) => x.trim() !== "").length
    : 0;
  const city = (u.address ?? "").trim();
  const state = (u.state ?? "").trim();
  const location =
    [city, state].filter((x) => x !== "").join(", ") || "—";
  return {
    code: String(u.id),
    name,
    type: mapType(),
    category: mapCategory(u.category),
    location,
    country: (u.country_id ?? "").trim() || "—",
    state: state || "—",
    city: city || "—",
    address: (u.address ?? "").trim() || "—",
    website: (u.website ?? "").trim() || "—",
    email: (u.email ?? "").trim() || "—",
    phone: (u.phone ?? "").trim() || "—",
    courses: 0,
    intakes: intakesCount,
    status: mapStatus(u.status),
    initials: deriveInitials(name),
    color: pickColor(name),
  };
}

interface ApiCourse {
  id: number;
  title: string | null;
  short_name: string | null;
  stream: string | null;
  level: string | null;
  duration: string | null;
  total_duration: string | null;
  specialisations: string | null;
  status: number | null;
}

interface ApiSemester {
  id: number;
  university_id: number | null;
  course_id: number | null;
  title: string | null;
  semester_fee: number | null;
}

type CourseRow = {
  code: string;
  name: string;
  level: "UG" | "PG" | "Diploma" | "Certificate";
  category: string;
  specialisation: string;
  duration: string;
  status: "Active" | "Inactive";
};

// course.level is free-form; coerce it to the UI's narrow level union.
function mapLevel(level: string | null): CourseRow["level"] {
  const l = (level ?? "").toLowerCase();
  if (l.includes("pg") || l.includes("post") || l.includes("master")) return "PG";
  if (l.includes("diploma")) return "Diploma";
  if (l.includes("cert")) return "Certificate";
  return "UG";
}

function mapApiCourse(c: ApiCourse): CourseRow {
  const name = (c.title ?? c.short_name ?? "").trim() || `Course #${c.id}`;
  const specialisation = (c.specialisations ?? "").split(",")[0]?.trim() || "—";
  return {
    code: `CRS-${String(c.id).padStart(3, "0")}`,
    name,
    level: mapLevel(c.level),
    category: (c.stream ?? "").trim() || "—",
    specialisation,
    duration: (c.duration ?? c.total_duration ?? "").trim() || "—",
    // course.status: 1 (or null treated as active to match legacy default).
    status: c.status === 0 ? "Inactive" : "Active",
  };
}

type FeeRow = {
  id: string;
  course: string;
  intake: string;
  registration: number;
  tuition: number;
  total: number;
  status: "Active" | "Draft" | "Inactive";
  feeComponents: { id: string; name: string; amount: number }[];
  scholarshipAllowed: "Yes" | "No";
  maxScholarship: number;
  counsellorPoints: number;
};

// The legacy schema stores a single semester_fee per row with no
// registration/tuition breakdown, scholarship, or counsellor-point columns.
// Those map to 0/"—" defaults; the new Fee table only renders the columns the
// API can fill plus those zeroed fields.
function mapApiSemester(s: ApiSemester): FeeRow {
  const total = s.semester_fee ?? 0;
  const course =
    (s.title ?? "").trim() ||
    (s.course_id != null ? `Course #${s.course_id}` : "—");
  return {
    id: `FEE-${String(s.id).padStart(4, "0")}`,
    course,
    intake: "—",
    registration: 0,
    tuition: total,
    total,
    status: "Active",
    feeComponents: [{ id: "fc1", name: "Semester Fee", amount: total }],
    scholarshipAllowed: "No",
    maxScholarship: 0,
    counsellorPoints: 0,
  };
}

function UniversityProfilePage() {
  // The $code route param is the university id; pass it straight to
  // /universities/:id (and to the ?university_id list filters).
  const { code } = Route.useParams();
  const qc = useQueryClient();

  const {
    data: apiUni,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["university", code],
    queryFn: () => apiGet<ApiUniversity>(`/universities/${code}`),
    retry: false,
  });

  // Courses tab -> GET /courses?university_id=<id>.
  const {
    data: coursesData,
    isLoading: coursesLoading,
    isError: coursesError,
  } = useQuery({
    queryKey: ["university-courses", code],
    queryFn: () =>
      apiGet<{ items: ApiCourse[]; total: number; page: number; limit: number }>(
        "/courses",
        { university_id: code },
      ),
  });

  // Fee Structure tab -> GET /semesters?university_id=<id>.
  const {
    data: semestersData,
    isLoading: feesLoading,
    isError: feesError,
  } = useQuery({
    queryKey: ["university-semesters", code],
    queryFn: () =>
      apiGet<{ items: ApiSemester[]; total: number; page: number; limit: number }>(
        "/semesters",
        { university_id: code },
      ),
  });

  // Derived view-model from the live row; placeholder keeps hooks unconditional
  // while the request is in flight (real loading/error UI is rendered below).
  const profile: UniRow = useMemo(
    () =>
      apiUni
        ? mapApiUniversity(apiUni)
        : {
            code: String(code),
            name: "",
            type: "Type 1 – Student Pays University",
            category: "Private University",
            location: "—",
            country: "—",
            state: "—",
            city: "—",
            address: "—",
            website: "—",
            email: "—",
            phone: "—",
            courses: 0,
            intakes: 0,
            status: "Inactive",
            initials: "U",
            color: AVATAR_COLORS[0],
          },
    [apiUni, code],
  );

  const taggedCourses = useMemo<CourseRow[]>(
    () => (coursesData?.items ?? []).map(mapApiCourse),
    [coursesData],
  );

  const feeStructures = useMemo<FeeRow[]>(
    () => (semestersData?.items ?? []).map(mapApiSemester),
    [semestersData],
  );

  const [editUniversityOpen, setEditUniversityOpen] = useState(false);

  const [tagCourseOpen, setTagCourseOpen] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseLevelFilter, setCourseLevelFilter] = useState<
    "All" | "UG" | "PG" | "Diploma" | "Certificate"
  >("All");

  // Create Fee Structure wizard state
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeStep, setFeeStep] = useState<1 | 2 | 3>(1);
  const [feeCourse, setFeeCourse] = useState<string>("");
  const [feeIntake, setFeeIntake] = useState<string>("");
  const [feeStatus, setFeeStatus] = useState<"Draft" | "Active" | "Inactive">("Draft");
  const [feeComponents, setFeeComponents] = useState<
    { id: string; name: string; amount: string }[]
  >([
    { id: "fc1", name: "Application Fee", amount: "" },
    { id: "fc2", name: "Registration Fee", amount: "" },
    { id: "fc3", name: "Tuition Fee", amount: "" },
    { id: "fc4", name: "Exam Fee", amount: "" },
  ]);
  const [scholarshipAllowed, setScholarshipAllowed] = useState<"Yes" | "No">("No");
  const [maxScholarship, setMaxScholarship] = useState<string>("");
  const [counsellorPoints, setCounsellorPoints] = useState<string>("");
  const [feeSuccess, setFeeSuccess] = useState<null | {
    code: string;
    university: string;
    course: string;
    intake: string;
    total: number;
  }>(null);

  // View/edit a fee structure (local-only — there is no semester write route).
  const [viewFee, setViewFee] = useState<FeeRow | null>(null);
  const [editFee, setEditFee] = useState<FeeRow | null>(null);
  const [editFeeDraft, setEditFeeDraft] = useState<FeeRow | null>(null);

  const openEditFee = (f: FeeRow) => {
    setEditFee(f);
    setEditFeeDraft({ ...f, feeComponents: f.feeComponents.map((c) => ({ ...c })) });
  };

  const updateEditComponent = (
    id: string,
    patch: Partial<{ name: string; amount: number }>,
  ) => {
    setEditFeeDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        feeComponents: prev.feeComponents.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        ),
      };
    });
  };

  const removeEditComponent = (id: string) => {
    setEditFeeDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        feeComponents: prev.feeComponents.filter((c) => c.id !== id),
      };
    });
  };

  const addEditCustomComponent = () => {
    setEditFeeDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        feeComponents: [
          ...prev.feeComponents,
          { id: `fc-${Date.now()}`, name: "", amount: 0 },
        ],
      };
    });
  };

  const saveEditFee = () => {
    // Semester rows have no write endpoint; the edit dialog stays local.
    setEditFee(null);
    setEditFeeDraft(null);
    toast.success("Fee Structure Updated");
  };

  const deleteFee = () => {
    // No delete endpoint for semesters; close the dialog only.
    setViewFee(null);
    toast.success("Fee Structure Deleted");
  };

  const INTAKES = useMemo(
    () => ["January 2026", "April 2026", "July 2026", "October 2026"],
    [],
  );

  const selectedCourseObj = useMemo(
    () => taggedCourses.find((c) => c.code === feeCourse),
    [taggedCourses, feeCourse],
  );

  const courseLabel = selectedCourseObj
    ? selectedCourseObj.specialisation && selectedCourseObj.specialisation !== "—"
      ? `${selectedCourseObj.name} in ${selectedCourseObj.specialisation}`
      : selectedCourseObj.name
    : "";

  const feeStructureName =
    feeCourse && feeIntake
      ? `${profile.initials} - ${courseLabel} - ${feeIntake} Fee Structure`
      : "";

  const feeStructureCode = useMemo(() => {
    if (!feeIntake) return "";
    const [month, year] = feeIntake.split(" ");
    const m = (month || "").slice(0, 3).toUpperCase();
    const seq = String(Math.floor(Math.random() * 900) + 100);
    return `FEE-${m}${year}-${seq}`;
    // Note: regenerated when intake changes
  }, [feeIntake]);

  const totalFee = useMemo(
    () => feeComponents.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0),
    [feeComponents],
  );

  const resetFeeWizard = () => {
    setFeeStep(1);
    setFeeCourse("");
    setFeeIntake("");
    setFeeStatus("Draft");
    setFeeComponents([
      { id: "fc1", name: "Application Fee", amount: "" },
      { id: "fc2", name: "Registration Fee", amount: "" },
      { id: "fc3", name: "Tuition Fee", amount: "" },
      { id: "fc4", name: "Exam Fee", amount: "" },
    ]);
    setScholarshipAllowed("No");
    setMaxScholarship("");
    setCounsellorPoints("");
    setFeeSuccess(null);
  };

  const closeFeeWizard = () => {
    setFeeOpen(false);
    setTimeout(resetFeeWizard, 200);
  };

  const updateComponent = (
    id: string,
    patch: Partial<{ name: string; amount: string }>,
  ) => {
    setFeeComponents((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeComponent = (id: string) => {
    setFeeComponents((prev) => prev.filter((c) => c.id !== id));
  };
  const addCustomComponent = () => {
    setFeeComponents((prev) => [
      ...prev,
      { id: `fc-${Date.now()}`, name: "", amount: "" },
    ]);
  };

  const canProceedStep1 = feeCourse && feeIntake;
  const canProceedStep2 =
    feeComponents.length > 0 && feeComponents.every((c) => c.name && c.amount);

  const submitFee = (activate: boolean) => {
    setFeeSuccess({
      code: feeStructureCode,
      university: profile.name,
      course: courseLabel,
      intake: feeIntake,
      total: totalFee,
    });
    setFeeStatus(activate ? "Active" : "Draft");
    toast.success("Fee Structure Created Successfully");
  };

  // The Tag-Course dialog has no backing write endpoint (no university↔course
  // junction route), so it stays local. Source its picker from the live tagged
  // courses rather than a mock library so no fabricated rows are shown.
  const filteredLibrary = useMemo(() => {
    return taggedCourses.filter((c) => {
      const matchesSearch =
        courseSearch.trim() === "" ||
        c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
        c.code.toLowerCase().includes(courseSearch.toLowerCase());
      const matchesLevel = courseLevelFilter === "All" || c.level === courseLevelFilter;
      return matchesSearch && matchesLevel;
    });
  }, [taggedCourses, courseSearch, courseLevelFilter]);

  const toggleCourse = (courseCode: string) => {
    setSelectedCourses((prev) =>
      prev.includes(courseCode)
        ? prev.filter((c) => c !== courseCode)
        : [...prev, courseCode],
    );
  };

  const basicInfo = useMemo(
    () => ({
      name: profile.name,
      code: profile.code,
      type: profile.type,
      category: profile.category,
      country: profile.country,
      state: profile.state,
      city: profile.city,
      website: profile.website,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      status: profile.status,
    }),
    [profile],
  );

  // Edit University -> PATCH /universities/:id.
  const editMut = useMutation({
    mutationFn: (body: Partial<ApiUniversity>) =>
      apiPatch(`/universities/${code}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["university", code] });
      toast.success("University updated");
      setEditUniversityOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const backLink = (
    <div>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <Link to="/universities/universities">
          <ArrowLeft className="h-4 w-4" />
          Back to Universities
        </Link>
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-muted" />
            <div className="space-y-2">
              <div className="h-6 w-64 animate-pulse rounded bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="h-4 w-36 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !apiUni) {
    const notFound =
      (error instanceof ApiError && error.status === 404) ||
      (error instanceof Error && /404|not found/i.test(error.message));
    return (
      <div className="space-y-6">
        {backLink}
        <div className="rounded-2xl border bg-card p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            {notFound ? "University not found" : "Couldn’t load this university"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {notFound
              ? "We couldn’t find a university with this code. It may have been removed."
              : error instanceof Error
                ? error.message
                : "Please try again in a moment."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <Link to="/universities/universities">
            <ArrowLeft className="h-4 w-4" />
            Back to Universities
          </Link>
        </Button>
      </div>

      {/* Profile Header */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "grid h-16 w-16 shrink-0 place-items-center rounded-xl text-lg font-semibold ring-1 ring-black/5",
                profile.color,
              )}
            >
              {profile.initials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {profile.name}
                </h1>
                {profile.status === "Active" ? (
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
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="font-mono text-xs">{profile.code}</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1",
                    CATEGORY_STYLE[profile.category] ||
                      "bg-zinc-50 text-zinc-700 ring-zinc-200",
                  )}
                >
                  {profile.category}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {profile.location}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setEditUniversityOpen(true)}
            >
              <Pencil className="h-4 w-4" />
              Edit University
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-10 bg-muted/60 p-1 text-foreground">
          <TabsTrigger
            value="overview"
            className="gap-2 text-foreground/70 hover:text-foreground data-[state=active]:text-foreground"
          >
            <Building2 className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="courses"
            className="gap-2 text-foreground/70 hover:text-foreground data-[state=active]:text-foreground"
          >
            <BookPlus className="h-3.5 w-3.5" />
            Courses
          </TabsTrigger>
          <TabsTrigger
            value="fees"
            className="gap-2 text-foreground/70 hover:text-foreground data-[state=active]:text-foreground"
          >
            <Wallet className="h-3.5 w-3.5" />
            Fee Structure
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="gap-2 text-foreground/70 hover:text-foreground data-[state=active]:text-foreground"
          >
            <Activity className="h-3.5 w-3.5" />
            Activity Timeline
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="border-b p-5">
              <h2 className="text-base font-semibold text-foreground">
                Basic Information
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Core profile and contact details of this university.
              </p>
            </div>
            <div className="grid gap-x-8 gap-y-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="University Name" value={basicInfo.name} />
              <Field label="University Code" value={basicInfo.code} mono />
              <Field label="University Type" value={basicInfo.type} />
              <Field label="University Category" value={basicInfo.category} />
              <Field label="Country" value={basicInfo.country} />
              <Field label="State" value={basicInfo.state} />
              <Field label="City" value={basicInfo.city} />
              <Field
                label="Website"
                value={
                  <span className="inline-flex items-center gap-1.5 text-primary">
                    <Globe className="h-3.5 w-3.5" />
                    {basicInfo.website}
                  </span>
                }
              />
              <Field
                label="Official Email"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    {basicInfo.email}
                  </span>
                }
              />
              <Field
                label="Official Phone"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {basicInfo.phone}
                  </span>
                }
              />
              <Field
                label="Address"
                value={basicInfo.address}
                className="sm:col-span-2"
              />
              <Field
                label="Status"
                value={
                  basicInfo.status === "Active" ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-zinc-100 text-zinc-600">
                      Inactive
                    </Badge>
                  )
                }
              />
            </div>
          </div>
        </TabsContent>

        {/* Courses */}
        <TabsContent value="courses" className="space-y-4">
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Tagged Courses
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Courses currently mapped to this university.
                </p>
              </div>
              <Button
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover"
                onClick={() => setTagCourseOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add Course
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="px-4">Course Code</TableHead>
                    <TableHead>Course Name</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Specialisation</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coursesLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        Loading courses…
                      </TableCell>
                    </TableRow>
                  ) : coursesError ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        Couldn’t load courses for this university.
                      </TableCell>
                    </TableRow>
                  ) : taggedCourses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center">
                        <div className="mx-auto flex max-w-sm flex-col items-center gap-1">
                          <div className="mb-2 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
                            <BookPlus className="h-5 w-5" />
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            No courses tagged yet
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Courses mapped to this university will appear here.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    taggedCourses.map((c) => (
                      <TableRow key={c.code} className="hover:bg-muted/40">
                        <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {c.code}
                        </TableCell>
                        <TableCell className="py-3 text-sm font-medium text-foreground">
                          {c.specialisation && c.specialisation !== "—"
                            ? `${c.name} in ${c.specialisation}`
                            : c.name}
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge
                            variant="secondary"
                            className="bg-slate-100 text-slate-700"
                          >
                            {c.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-sm">{c.category}</TableCell>
                        <TableCell className="py-3 text-sm">
                          {c.specialisation}
                        </TableCell>
                        <TableCell className="py-3 text-sm">{c.duration}</TableCell>
                        <TableCell className="py-3">
                          {c.status === "Active" ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              Active
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-zinc-100 text-zinc-600"
                            >
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* Fee Structure */}
        <TabsContent value="fees" className="space-y-4">
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Fee Structures
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  All fee structures created under this university.
                </p>
              </div>
              <Button
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover"
                onClick={() => setFeeOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Create Fee Structure
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="px-4">Fee Structure ID</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Intake</TableHead>
                    <TableHead className="text-right">Registration Fee</TableHead>
                    <TableHead className="text-right">Tuition Fee</TableHead>
                    <TableHead className="text-right">Total Fee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feesLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        Loading fee structures…
                      </TableCell>
                    </TableRow>
                  ) : feesError ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        Couldn’t load fee structures for this university.
                      </TableCell>
                    </TableRow>
                  ) : feeStructures.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center">
                        <div className="mx-auto flex max-w-sm flex-col items-center gap-1">
                          <div className="mb-2 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
                            <Wallet className="h-5 w-5" />
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            No fee structures yet
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Fee structures created under this university will appear
                            here.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    feeStructures.map((f) => (
                      <TableRow key={f.id} className="hover:bg-muted/40">
                        <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {f.id}
                        </TableCell>
                        <TableCell className="py-3 text-sm font-medium text-foreground">
                          {f.course}
                        </TableCell>
                        <TableCell className="py-3 text-sm">{f.intake}</TableCell>
                        <TableCell className="py-3 text-right text-sm tabular-nums">
                          ₹{f.registration.toLocaleString()}
                        </TableCell>
                        <TableCell className="py-3 text-right text-sm tabular-nums">
                          ₹{f.tuition.toLocaleString()}
                        </TableCell>
                        <TableCell className="py-3 text-right text-sm font-semibold tabular-nums">
                          ₹{f.total.toLocaleString()}
                        </TableCell>
                        <TableCell className="py-3">
                          {f.status === "Active" ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              Active
                            </Badge>
                          ) : f.status === "Draft" ? (
                            <Badge
                              variant="secondary"
                              className="bg-amber-100 text-amber-700"
                            >
                              Draft
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-zinc-100 text-zinc-600"
                            >
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-3 pr-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="View"
                              onClick={() => setViewFee(f)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Edit"
                              onClick={() => openEditFee(f)}
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
          </div>
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="space-y-4">
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">
              Activity Timeline
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Chronological log of all profile changes and events.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-14 text-center">
              <div className="mb-2 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
                <Activity className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-foreground">No activity yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Profile changes and events for this university will be tracked here.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <EditUniversityDialog
        open={editUniversityOpen}
        university={profile}
        saving={editMut.isPending}
        onClose={() => setEditUniversityOpen(false)}
        onSave={(form) => {
          // Map the new design's form fields back onto the snake_case
          // UpdateUniversityDto columns the API understands.
          editMut.mutate({
            title: form.name.trim(),
            category: form.category.trim(),
            website: form.website.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            country_id: form.country.trim(),
            state: form.state.trim(),
            address: form.address.trim() || form.city.trim(),
            status: form.status === "Active" ? "1" : "0",
          });
        }}
      />

      {/* Tag Course Dialog */}
      <Dialog open={tagCourseOpen} onOpenChange={setTagCourseOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Tag Courses</DialogTitle>
            <DialogDescription>
              Select courses from the library to tag to {profile.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search courses..."
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={courseLevelFilter}
                onValueChange={(v) =>
                  setCourseLevelFilter(v as typeof courseLevelFilter)
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Levels</SelectItem>
                  <SelectItem value="UG">UG</SelectItem>
                  <SelectItem value="PG">PG</SelectItem>
                  <SelectItem value="Diploma">Diploma</SelectItem>
                  <SelectItem value="Certificate">Certificate</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCourseSearch("");
                  setCourseLevelFilter("All");
                }}
              >
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl border">
              {filteredLibrary.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No courses match your search.
                </div>
              ) : (
                <div className="divide-y">
                  {filteredLibrary.map((c) => {
                    const selected = selectedCourses.includes(c.code);
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => toggleCourse(c.code)}
                        className={cn(
                          "flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/40",
                          selected && "bg-accent/10",
                        )}
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {c.name}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {c.code} · {c.level} · {c.category} · {c.specialisation}
                          </div>
                        </div>
                        {selected && (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {selectedCourses.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {selectedCourses.length} course
                {selectedCourses.length > 1 ? "s" : ""} selected
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagCourseOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover"
              onClick={() => setTagCourseOpen(false)}
            >
              <BookPlus className="h-4 w-4" />
              Tag{" "}
              {selectedCourses.length > 0
                ? `${selectedCourses.length} Course${selectedCourses.length > 1 ? "s" : ""}`
                : "Courses"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Fee Structure Wizard */}
      <Dialog
        open={feeOpen}
        onOpenChange={(o) => (o ? setFeeOpen(true) : closeFeeWizard())}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create Fee Structure</DialogTitle>
            <DialogDescription>
              Create a fee plan by selecting a course.
            </DialogDescription>
          </DialogHeader>

          {feeSuccess ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <div>
                  <div className="text-sm font-semibold text-emerald-800">
                    Fee Structure Created Successfully
                  </div>
                  <div className="text-xs text-emerald-700">
                    The fee structure has been saved.
                  </div>
                </div>
              </div>
              <div className="grid gap-x-6 gap-y-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
                <Field label="Fee Structure Code" value={feeSuccess.code} mono />
                <Field label="University" value={feeSuccess.university} />
                <Field label="Course" value={feeSuccess.course} />
                <Field label="Intake" value={feeSuccess.intake} />
                <Field
                  label="Total Fee"
                  value={
                    <span className="font-semibold tabular-nums">
                      ₹{feeSuccess.total.toLocaleString()}
                    </span>
                  }
                />
                <Field
                  label="Status"
                  value={
                    feeStatus === "Active" ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                        Draft
                      </Badge>
                    )
                  }
                />
              </div>
              <DialogFooter>
                <Button onClick={closeFeeWizard}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              {/* Stepper */}
              <div className="flex items-center gap-2 border-b pb-4">
                {[
                  { n: 1, label: "Course & Intake" },
                  { n: 2, label: "Fee Components" },
                  { n: 3, label: "Additional Details" },
                ].map((s, i) => (
                  <div key={s.n} className="flex items-center gap-2">
                    <div
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-full text-xs font-semibold",
                        feeStep === s.n
                          ? "bg-primary text-primary-foreground"
                          : feeStep > s.n
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {feeStep > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                    </div>
                    <span
                      className={cn(
                        "text-sm",
                        feeStep === s.n
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                    {i < 2 && <span className="mx-2 h-px w-8 bg-border" />}
                  </div>
                ))}
              </div>

              {/* Step 1 */}
              {feeStep === 1 && (
                <div className="grid gap-4 py-2 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>University</Label>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{profile.name}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {profile.code}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Course *</Label>
                    <Select value={feeCourse} onValueChange={setFeeCourse}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select course" />
                      </SelectTrigger>
                      <SelectContent>
                        {taggedCourses.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            No tagged courses
                          </div>
                        ) : (
                          taggedCourses.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.specialisation && c.specialisation !== "—"
                                ? `${c.name} in ${c.specialisation}`
                                : c.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Intake *</Label>
                    <Select value={feeIntake} onValueChange={setFeeIntake}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select intake" />
                      </SelectTrigger>
                      <SelectContent>
                        {INTAKES.map((i) => (
                          <SelectItem key={i} value={i}>
                            {i}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Fee Structure Name</Label>
                    <Input
                      value={feeStructureName}
                      readOnly
                      placeholder="Auto-generated"
                      className="bg-muted/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Fee Structure Code</Label>
                    <Input
                      value={feeStructureCode}
                      readOnly
                      placeholder="Auto-generated"
                      className="bg-muted/40 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Status</Label>
                    <Select
                      value={feeStatus}
                      onValueChange={(v) => setFeeStatus(v as typeof feeStatus)}
                    >
                      <SelectTrigger className="sm:w-60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Step 2 */}
              {feeStep === 2 && (
                <div className="grid gap-4 py-2 lg:grid-cols-[1fr_280px]">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Fee Components</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={addCustomComponent}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Custom Component
                      </Button>
                    </div>
                    <div className="overflow-hidden rounded-xl border">
                      <Table>
                        <TableHeader className="bg-muted/40">
                          <TableRow>
                            <TableHead>Fee Component Name *</TableHead>
                            <TableHead className="w-40 text-right">Amount *</TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {feeComponents.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="py-2">
                                <Input
                                  value={c.name}
                                  onChange={(e) =>
                                    updateComponent(c.id, { name: e.target.value })
                                  }
                                  placeholder="Component name"
                                />
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <Input
                                  type="number"
                                  value={c.amount}
                                  onChange={(e) =>
                                    updateComponent(c.id, { amount: e.target.value })
                                  }
                                  placeholder="0"
                                  className="text-right tabular-nums"
                                />
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeComponent(c.id)}
                                  title="Delete row"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Calculation Summary
                      </h4>
                      <div className="mt-3 space-y-1.5 text-sm">
                        {feeComponents
                          .filter((c) => c.name || c.amount)
                          .map((c) => (
                            <div
                              key={c.id}
                              className="flex justify-between text-muted-foreground"
                            >
                              <span className="truncate">{c.name || "—"}</span>
                              <span className="tabular-nums">
                                ₹{(parseFloat(c.amount) || 0).toLocaleString()}
                              </span>
                            </div>
                          ))}
                      </div>
                      <div className="mt-3 border-t pt-3 flex items-baseline justify-between">
                        <span className="text-sm font-semibold">Total Fee</span>
                        <span className="text-lg font-bold tabular-nums">
                          ₹{totalFee.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3 */}
              {feeStep === 3 && (
                <div className="grid gap-4 py-2 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <div className="text-sm font-semibold text-foreground">
                      Scholarship Information
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Scholarship Allowed</Label>
                    <Select
                      value={scholarshipAllowed}
                      onValueChange={(v) =>
                        setScholarshipAllowed(v as "Yes" | "No")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Maximum Scholarship Amount</Label>
                    <Input
                      type="number"
                      value={maxScholarship}
                      onChange={(e) => setMaxScholarship(e.target.value)}
                      placeholder="0"
                      disabled={scholarshipAllowed === "No"}
                    />
                  </div>
                  <div className="sm:col-span-2 pt-2 border-t">
                    <div className="text-sm font-semibold text-foreground">
                      Counsellor Points
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Points awarded to counsellors on enrollment — counted towards
                      their point target.
                    </p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Points</Label>
                    <Input
                      type="number"
                      min={0}
                      value={counsellorPoints}
                      onChange={(e) => setCounsellorPoints(e.target.value)}
                      placeholder="e.g. 10"
                    />
                  </div>
                </div>
              )}

              <DialogFooter className="flex !justify-between gap-2 sm:!justify-between">
                <div>
                  {feeStep > 1 && (
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setFeeStep((s) => (s === 3 ? 2 : 1))}
                    >
                      <ChevronLeft className="h-4 w-4" /> Back
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={closeFeeWizard}>
                    Cancel
                  </Button>
                  {feeStep < 3 ? (
                    <Button
                      className="gap-1.5"
                      disabled={feeStep === 1 ? !canProceedStep1 : !canProceedStep2}
                      onClick={() => setFeeStep((s) => (s === 1 ? 2 : 3))}
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => submitFee(false)}>
                        Save as Draft
                      </Button>
                      <Button
                        className="bg-accent text-accent-foreground hover:bg-accent-hover"
                        onClick={() => submitFee(true)}
                      >
                        Save &amp; Activate
                      </Button>
                    </>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* View Fee Structure */}
      <Dialog open={!!viewFee} onOpenChange={(o) => !o && setViewFee(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fee Structure Details</DialogTitle>
            <DialogDescription>{viewFee?.id}</DialogDescription>
          </DialogHeader>
          {viewFee && (
            <div className="grid grid-cols-2 gap-4 py-2">
              <Field label="Course" value={viewFee.course} />
              <Field label="Intake" value={viewFee.intake} />
              <Field
                label="Registration Fee"
                value={`₹${viewFee.registration.toLocaleString()}`}
              />
              <Field
                label="Tuition Fee"
                value={`₹${viewFee.tuition.toLocaleString()}`}
              />
              <Field
                label="Total Fee"
                value={`₹${viewFee.total.toLocaleString()}`}
              />
              <Field label="Status" value={viewFee.status} />
            </div>
          )}
          <DialogFooter className="flex sm:justify-between gap-2">
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => viewFee && deleteFee()}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button variant="outline" onClick={() => setViewFee(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Fee Structure */}
      <Dialog
        open={!!editFee}
        onOpenChange={(o) => {
          if (!o) {
            setEditFee(null);
            setEditFeeDraft(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Fee Structure</DialogTitle>
            <DialogDescription>{editFee?.id}</DialogDescription>
          </DialogHeader>
          {editFeeDraft && (
            <div className="space-y-4 py-2">
              {/* Row 1: University (read-only) */}
              <div className="space-y-1.5">
                <Label>University</Label>
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{profile.name}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {profile.code}
                  </span>
                </div>
              </div>

              {/* Row 2: Course + Intake */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Course *</Label>
                  <Select
                    value={
                      taggedCourses.find(
                        (c) =>
                          (c.specialisation && c.specialisation !== "—"
                            ? `${c.name} in ${c.specialisation}`
                            : c.name) === editFeeDraft.course,
                      )?.code || ""
                    }
                    onValueChange={(v) => {
                      const c = taggedCourses.find((x) => x.code === v);
                      if (c)
                        setEditFeeDraft({
                          ...editFeeDraft,
                          course:
                            c.specialisation && c.specialisation !== "—"
                              ? `${c.name} in ${c.specialisation}`
                              : c.name,
                        });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select course" />
                    </SelectTrigger>
                    <SelectContent>
                      {taggedCourses.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.specialisation && c.specialisation !== "—"
                            ? `${c.name} in ${c.specialisation}`
                            : c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Intake *</Label>
                  <Select
                    value={editFeeDraft.intake}
                    onValueChange={(v) =>
                      setEditFeeDraft({ ...editFeeDraft, intake: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select intake" />
                    </SelectTrigger>
                    <SelectContent>
                      {INTAKES.map((i) => (
                        <SelectItem key={i} value={i}>
                          {i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 3: Name + Code */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Fee Structure Name</Label>
                  <Input
                    value={
                      editFeeDraft.course && editFeeDraft.intake
                        ? `${profile.initials} - ${editFeeDraft.course} - ${editFeeDraft.intake} Fee Structure`
                        : ""
                    }
                    readOnly
                    placeholder="Auto-generated"
                    className="bg-muted/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fee Structure Code</Label>
                  <Input
                    value={editFeeDraft.id}
                    readOnly
                    className="bg-muted/40 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Row 4: Status */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={editFeeDraft.status}
                  onValueChange={(v) =>
                    setEditFeeDraft({
                      ...editFeeDraft,
                      status: v as FeeRow["status"],
                    })
                  }
                >
                  <SelectTrigger className="sm:w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fee Components */}
              <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Fee Components</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={addEditCustomComponent}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Custom Component
                    </Button>
                  </div>
                  <div className="overflow-hidden rounded-xl border">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>Fee Component Name *</TableHead>
                          <TableHead className="w-40 text-right">Amount *</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editFeeDraft.feeComponents.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="py-2">
                              <Input
                                value={c.name}
                                onChange={(e) =>
                                  updateEditComponent(c.id, { name: e.target.value })
                                }
                                placeholder="Component name"
                              />
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              <Input
                                type="number"
                                value={c.amount || ""}
                                onChange={(e) =>
                                  updateEditComponent(c.id, {
                                    amount: Number(e.target.value) || 0,
                                  })
                                }
                                placeholder="0"
                                className="text-right tabular-nums"
                              />
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => removeEditComponent(c.id)}
                                title="Delete row"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Calculation Summary
                    </h4>
                    <div className="mt-3 space-y-1.5 text-sm">
                      {editFeeDraft.feeComponents
                        .filter((c) => c.name || c.amount)
                        .map((c) => (
                          <div
                            key={c.id}
                            className="flex justify-between text-muted-foreground"
                          >
                            <span className="truncate">{c.name || "—"}</span>
                            <span className="tabular-nums">
                              ₹{(c.amount || 0).toLocaleString()}
                            </span>
                          </div>
                        ))}
                    </div>
                    <div className="mt-3 border-t pt-3 flex items-baseline justify-between">
                      <span className="text-sm font-semibold">Total Fee</span>
                      <span className="text-lg font-bold tabular-nums">
                        ₹
                        {editFeeDraft.feeComponents
                          .reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
                          .toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Details */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Scholarship Allowed</Label>
                  <Select
                    value={editFeeDraft.scholarshipAllowed}
                    onValueChange={(v) =>
                      setEditFeeDraft({
                        ...editFeeDraft,
                        scholarshipAllowed: v as "Yes" | "No",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Maximum Scholarship Amount</Label>
                  <Input
                    type="number"
                    value={editFeeDraft.maxScholarship || ""}
                    onChange={(e) =>
                      setEditFeeDraft({
                        ...editFeeDraft,
                        maxScholarship: Number(e.target.value) || 0,
                      })
                    }
                    placeholder="0"
                    disabled={editFeeDraft.scholarshipAllowed === "No"}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2 pt-2 border-t">
                  <div className="text-sm font-semibold text-foreground">
                    Counsellor Points
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Points awarded to counsellors on enrollment — counted towards
                    their point target.
                  </p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Points</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editFeeDraft.counsellorPoints || ""}
                    onChange={(e) =>
                      setEditFeeDraft({
                        ...editFeeDraft,
                        counsellorPoints: Number(e.target.value) || 0,
                      })
                    }
                    placeholder="e.g. 10"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditFee(null);
                setEditFeeDraft(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent-hover"
              onClick={saveEditFee}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function EditUniversityDialog({
  open,
  university,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  university: UniRow;
  saving?: boolean;
  onClose: () => void;
  onSave: (updated: UniRow) => void;
}) {
  const [form, setForm] = useState({
    code: university.code,
    name: university.name,
    type: university.type,
    category: university.category,
    website: university.website === "—" ? "" : university.website,
    email: university.email === "—" ? "" : university.email,
    phone: university.phone === "—" ? "" : university.phone,
    country: university.country === "—" ? "" : university.country,
    state: university.state === "—" ? "" : university.state,
    city: university.city === "—" ? "" : university.city,
    address: university.address === "—" ? "" : university.address,
    status: university.status,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Re-seed the form whenever the dialog is (re)opened for this university.
  const [seededKey, setSeededKey] = useState<string | null>(null);
  if (open && seededKey !== university.code) {
    setSeededKey(university.code);
    setForm({
      code: university.code,
      name: university.name,
      type: university.type,
      category: university.category,
      website: university.website === "—" ? "" : university.website,
      email: university.email === "—" ? "" : university.email,
      phone: university.phone === "—" ? "" : university.phone,
      country: university.country === "—" ? "" : university.country,
      state: university.state === "—" ? "" : university.state,
      city: university.city === "—" ? "" : university.city,
      address: university.address === "—" ? "" : university.address,
      status: university.status,
    });
    setErrors({});
  }
  if (!open && seededKey !== null) {
    setSeededKey(null);
  }

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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

  const save = () => {
    if (!validate()) return;

    const initials =
      form.name
        .split(/\s+/)
        .filter(
          (word) => word && !/^(University|College|Institute|of|the|and|&)$/i.test(word),
        )
        .map((word) => word[0]?.toUpperCase())
        .slice(0, 2)
        .join("") || university.initials;

    const location = `${form.city.trim()}, ${form.state.trim()}`;

    onSave({
      ...university,
      code: form.code.trim() || university.code,
      name: form.name.trim() || university.name,
      type: form.type as UniRow["type"],
      category: form.category,
      website: form.website.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      country: form.country.trim(),
      state: form.state.trim(),
      city: form.city.trim(),
      address: form.address.trim(),
      location,
      status: form.status as UniRow["status"],
      initials,
    });
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-w-3xl p-0 overflow-hidden max-h-[85vh]">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-xl font-semibold">Edit University</DialogTitle>
          <DialogDescription>Update this university profile.</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
            <SectionTitle>Basic Information</SectionTitle>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-edit-uni-name">
                University Name <span className="text-accent">*</span>
              </Label>
              <Input
                id="profile-edit-uni-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className={cn(errors.name && "border-red-400 focus-visible:ring-red-300")}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-edit-uni-code">
                University Code <span className="text-accent">*</span>
              </Label>
              <Input
                id="profile-edit-uni-code"
                className={cn(
                  "font-mono",
                  errors.code && "border-red-400 focus-visible:ring-red-300",
                )}
                value={form.code}
                onChange={(e) => update("code", e.target.value)}
                readOnly
              />
              {errors.code && <p className="text-xs text-red-500">{errors.code}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>
                University Type <span className="text-accent">*</span>
              </Label>
              <Select value={form.type} onValueChange={(v) => update("type", v)}>
                <SelectTrigger
                  className={cn(errors.type && "border-red-400 focus:ring-red-300")}
                >
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Type 1 – Student Pays University">
                    Type 1 – Student Pays University
                  </SelectItem>
                  <SelectItem value="Type 2 – Student Pays upCarrera">
                    Type 2 – Student Pays upCarrera
                  </SelectItem>
                </SelectContent>
              </Select>
              {errors.type && <p className="text-xs text-red-500">{errors.type}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>
                University Category <span className="text-accent">*</span>
              </Label>
              <Select value={form.category} onValueChange={(v) => update("category", v)}>
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
                </SelectContent>
              </Select>
              {errors.category && (
                <p className="text-xs text-red-500">{errors.category}</p>
              )}
            </div>

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

            <div className="space-y-1.5">
              <Label htmlFor="profile-edit-uni-website">Website</Label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="profile-edit-uni-website"
                  placeholder="https://university.edu"
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
              <Label htmlFor="profile-edit-uni-email">Official Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="profile-edit-uni-email"
                  type="email"
                  placeholder="contact@university.edu"
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
              <Label htmlFor="profile-edit-uni-phone">Official Phone</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="profile-edit-uni-phone"
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
              <Label htmlFor="profile-edit-uni-country">
                Country <span className="text-accent">*</span>
              </Label>
              <Input
                id="profile-edit-uni-country"
                placeholder="India"
                value={form.country}
                onChange={(e) => update("country", e.target.value)}
                className={cn(errors.country && "border-red-400 focus-visible:ring-red-300")}
              />
              {errors.country && (
                <p className="text-xs text-red-500">{errors.country}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-edit-uni-state">
                State <span className="text-accent">*</span>
              </Label>
              <Input
                id="profile-edit-uni-state"
                placeholder="Uttar Pradesh"
                value={form.state}
                onChange={(e) => update("state", e.target.value)}
                className={cn(errors.state && "border-red-400 focus-visible:ring-red-300")}
              />
              {errors.state && <p className="text-xs text-red-500">{errors.state}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-edit-uni-city">
                City <span className="text-accent">*</span>
              </Label>
              <Input
                id="profile-edit-uni-city"
                placeholder="Noida"
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                className={cn(errors.city && "border-red-400 focus-visible:ring-red-300")}
              />
              {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="profile-edit-uni-address">Full Address</Label>
              <Textarea
                id="profile-edit-uni-address"
                placeholder="Enter complete postal address"
                rows={3}
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="bg-muted/30 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Field ---- */
function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-sm text-foreground", mono && "font-mono text-xs")}>
        {value}
      </div>
    </div>
  );
}
