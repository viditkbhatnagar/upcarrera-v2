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

/**
 * The subset of the `universities` row the Edit form writes back, carried
 * verbatim: no trim, no `|| fallback`, no normalisation.
 */
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

type UniRow = {
  /**
   * Display-only code (`UNI-028`) derived from the id — the same format the
   * list page shows. There is no code column, so this never reaches the API;
   * every request uses the route's numeric id.
   */
  code: string;
  name: string;
  type: "Type 1 – Student Pays University" | "Type 2 – Student Pays upCarrera";
  category: string;
  /** "<state>, <country name>" — never the free-text address. */
  location: string;
  /** Country NAME(s) resolved from `country_id` via GET /countries. */
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
   * ---- Raw server values, carried alongside the coerced display values ----
   *
   * Everything above is COERCED for rendering: a NULL title shows as
   * `University #28`, a NULL/unknown category shows as "Private University",
   * a missing field shows as "—". That is fine for a profile card; it is data
   * loss the moment it is fed back into a PATCH. The Edit dialog therefore
   * seeds itself from `raw`, never from the display fields, so that opening
   * Edit and saving cannot stamp a derived default over a NULL column.
   */
  raw: RawUniversity;
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
    meta: [
      { title: `${displayUniversityCode(params.code)} — Universities — upCarrera` },
    ],
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

/**
 * Legacy `status` is CHAR(1): "1"/Active, "0"/Inactive.
 *
 * This used to collapse NULL to "Inactive" while the list page
 * (universities.universities.tsx `deriveStatus`) collapsed it to "Active", so
 * the same university read as Active in the table and Inactive on its own
 * profile. They now agree on "Active", matching the list page: the legacy app
 * treats a row as live unless it is explicitly switched off, and the list is
 * the screen operators filter on. Either way this is DISPLAY ONLY — the Edit
 * form seeds its Status select from `raw.status` via `columnToStatus`, which
 * maps NULL to "" ("not set") and never to a guess.
 */
function mapStatus(status: number | string | null): UniRow["status"] {
  const s = String(status ?? "").toLowerCase().trim();
  if (s === "0" || s === "inactive" || s === "false") return "Inactive";
  return "Active";
}

/** Same display format as the list page: `UNI-<id padded to 3>`. */
function displayUniversityCode(id: number | string): string {
  return `UNI-${String(id).padStart(3, "0")}`;
}

/** Where the GET /countries lookup is, so Country never shows a raw id early. */
type CountryLookupStatus = "pending" | "error" | "success";

function mapApiUniversity(
  u: ApiUniversity,
  countryNames: Map<string, string>,
  countryLookup: CountryLookupStatus,
): UniRow {
  const name = (u.title ?? "").trim() || `University #${u.id}`;
  const intakesCount = u.intakes
    ? u.intakes.split(",").filter((x) => x.trim() !== "").length
    : 0;
  const state = (u.state ?? "").trim();
  // `country_id` is an id (or id list), resolved to names for display. There
  // is no City column — the city lives inside the free-text `address`, which is
  // shown in full in its own Address row rather than passed off as a "City".
  //
  // "Country ID n" is only honest once the lookup has answered: while it is in
  // flight the Country row reads "Loading…" (and the header shows the state
  // alone); if it failed, the raw id is shown with that caveat.
  const described = describeCountryIds(u.country_id ?? "", countryNames);
  const country =
    described === ""
      ? ""
      : countryLookup === "pending"
        ? "Loading…"
        : countryLookup === "error" && described.includes("Country ID ")
          ? `${described} (country names unavailable)`
          : described;
  const locationCountry = countryLookup === "pending" ? "" : described;
  const location =
    [state, locationCountry].filter((x) => x !== "").join(", ") || "—";
  return {
    code: displayUniversityCode(u.id),
    name,
    type: mapType(),
    category: mapCategory(u.category),
    location,
    country: country || "—",
    state: state || "—",
    address: (u.address ?? "").trim() || "—",
    website: (u.website ?? "").trim() || "—",
    email: (u.email ?? "").trim() || "—",
    phone: (u.phone ?? "").trim() || "—",
    courses: 0,
    intakes: intakesCount,
    status: mapStatus(u.status),
    initials: deriveInitials(name),
    color: pickColor(name),
    // Verbatim. This is what the Edit form seeds from and what the "did the
    // user change it?" diff compares against. See the UniRow.raw comment.
    raw: {
      title: u.title ?? null,
      category: u.category ?? null,
      website: u.website ?? null,
      email: u.email ?? null,
      phone: u.phone ?? null,
      country_id: u.country_id ?? null,
      state: u.state ?? null,
      address: u.address ?? null,
      status:
        u.status === null || u.status === undefined ? null : String(u.status),
    },
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

  // GET /countries resolves the stored `country_id` to a name.
  const { data: countriesData, status: countryLookup } = useCountries();
  const countryNames = useMemo(
    () => countryNameMap(countriesData?.items),
    [countriesData],
  );

  // Derived view-model from the live row; placeholder keeps hooks unconditional
  // while the request is in flight (real loading/error UI is rendered below).
  const profile: UniRow = useMemo(
    () =>
      apiUni
        ? mapApiUniversity(apiUni, countryNames, countryLookup)
        : {
            code: displayUniversityCode(code),
            name: "",
            type: "Type 1 – Student Pays University",
            category: "Private University",
            location: "—",
            country: "—",
            state: "—",
            address: "—",
            website: "—",
            email: "—",
            phone: "—",
            courses: 0,
            intakes: 0,
            status: "Inactive",
            initials: "U",
            color: AVATAR_COLORS[0],
            raw: {
              title: null,
              category: null,
              website: null,
              email: null,
              phone: null,
              country_id: null,
              state: null,
              address: null,
              status: null,
            },
          },
    [apiUni, code, countryNames, countryLookup],
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

  // There is no fee-structure API yet (QA FS01/FS02): this screen reads course
  // rows and renders them as fee structures, and nothing here can persist. These
  // handlers used to claim success anyway. That went unnoticed only because
  // <Toaster /> was never mounted, so no toast in the app rendered at all — now
  // that it is mounted, a fabricated "Updated" would be shown to the operator.
  // Tell the truth instead: the dialog closes, and the message says why nothing
  // was saved.
  const FEE_NOT_PERSISTED =
    "Fee structures can't be saved yet — there is no fee-structure API. Nothing was changed.";

  const saveEditFee = () => {
    setEditFee(null);
    setEditFeeDraft(null);
    toast.error(FEE_NOT_PERSISTED);
  };

  const deleteFee = () => {
    setViewFee(null);
    toast.error(FEE_NOT_PERSISTED);
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
    toast.error(FEE_NOT_PERSISTED);
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
      website: profile.website,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      status: profile.status,
    }),
    [profile],
  );

  // Edit University -> PATCH /universities/:id. The body is a PARTIAL: only
  // the columns the operator actually changed are present (UpdateUniversityDto
  // is a PartialType, so omitted columns are left alone server-side).
  const editMut = useMutation({
    mutationFn: (body: Partial<UniversityPayload>) =>
      apiPatch(`/universities/${code}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["university", code] });
      // The list page reads the same rows; keep it from showing stale values.
      qc.invalidateQueries({ queryKey: ["universities"] });
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
              {/* No City row: there is no city column. It used to render the
                  ENTIRE address under a "City" label; the address (city
                  included) is shown in full in the Address row below. */}
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
                label="Address (including city)"
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

      {editUniversityOpen && (
        <EditUniversityDialog
          // Mounted only while open and keyed by row id, so every open
          // re-snapshots the raw seed values the diff compares against.
          key={profile.code}
          university={profile}
          saving={editMut.isPending}
          onClose={() => setEditUniversityOpen(false)}
          // The body arrives already diffed against the seed — untouched
          // columns are absent, so there is nothing here to re-derive.
          onSave={(body) => editMut.mutate(body)}
        />
      )}

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
              {/* Not a success panel: nothing was written. There is no
                  fee-structure API (QA FS01/FS02), so this is a preview of what
                  WOULD be created. It used to claim "has been saved". */}
              <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
                <div>
                  <div className="text-sm font-semibold text-amber-900">
                    Preview only — not saved
                  </div>
                  <div className="text-xs text-amber-800">
                    Fee structures cannot be stored yet: the fee-structure API
                    does not exist. Nothing below has been written to the
                    database.
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

/* ---------------- University edit form: shape, seed, payload, diff ----------------
 *
 * Deliberately mirrors apps/web/src/routes/universities.universities.tsx
 * (`seedUniversityForm` / `toUniversityPayload` / `diffUniversityPayload`) so
 * the list page and this profile page cannot drift on what they write back.
 *
 * Only the columns `UpdateUniversityDto` actually accepts live in this shape.
 * Fields rendered by the dialog but ABSENT here, because the schema has no
 * column for them and so they must never reach a PATCH body:
 *   - University Code -> derived from `id`, read-only
 *   - University Type -> no payer-type column on `model university`
 *   - City            -> no column; the legacy app folds it into `address`
 */
type UniversityForm = {
  name: string;
  category: string;
  website: string;
  email: string;
  phone: string;
  country: string;
  state: string;
  address: string;
  status: string;
};

/** "Active"/"Inactive" -> the CHAR(1) column. Anything else passes through. */
function statusToColumn(status: string): string {
  if (status === "Active") return "1";
  if (status === "Inactive") return "0";
  return status.trim();
}

/** Inverse of `statusToColumn`, for seeding the form from the stored value. */
function columnToStatus(raw: string | null): string {
  const v = (raw ?? "").trim();
  if (v === "") return ""; // NULL / empty — "not set", NOT a guess either way
  if (v === "1") return "Active";
  if (v === "0") return "Inactive";
  return v; // unrecognised: surfaced verbatim as an extra Select option
}

/** Map the form onto the snake_case columns UpdateUniversityDto accepts. */
function toUniversityPayload(form: UniversityForm) {
  return {
    title: form.name.trim(),
    category: form.category.trim(),
    website: form.website.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    // Legacy free-form Text column — the list page writes it the same way.
    country_id: form.country.trim(),
    state: form.state.trim(),
    // `address` is written from the Address field alone. It used to fall back
    // to the City field, but the old `UniRow.city` was itself DERIVED from `address`,
    // so that path wrote a column back from its own display derivative.
    address: form.address.trim(),
    status: statusToColumn(form.status),
  };
}

type UniversityPayload = ReturnType<typeof toUniversityPayload>;

/**
 * Seed the Edit form from the RAW server row — never from the display row.
 *
 * `UniRow.name`/`.category`/`.status`/`.country`/`.address` are all
 * coercions (`University #28`, "Private University", "Active", "—"). Seeding
 * from them and PATCHing back is exactly what rewrites master data, so none of
 * them are read here.
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

/** The form fields the operator actually edited, compared trim-insensitively. */
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
 * extra option, otherwise the Select renders its placeholder and the operator
 * cannot tell a real stored value from an empty column.
 *
 * The comparison is exact, not trimmed: a padded `"Private University "` is
 * not byte-equal to any SelectItem, so it gets its own option rather than
 * silently rendering as "nothing selected".
 */
function extraSelectOptions(
  value: string,
  known: readonly string[],
): string[] {
  if (!value.trim() || known.includes(value)) return [];
  return [value];
}

const STATUS_OPTIONS = ["Active", "Inactive"] as const;

function validateUniversityForm(form: UniversityForm): Record<string, string> {
  const next: Record<string, string> = {};
  if (!form.name.trim()) next.name = "University name is required";
  if (!form.category.trim()) next.category = "University category is required";
  // The picker only ever yields numeric ids; this guards the raw-id fallback
  // input (shown when GET /countries fails or is empty) against a typed
  // country NAME. Edit validates touched fields only, so a legacy stored value
  // never blocks an unrelated save.
  if (!form.country.trim()) next.country = "Country is required";
  else if (!COUNTRY_ID_RE.test(form.country.trim()))
    next.country = "Enter a numeric country ID (e.g. 99), or several separated by commas";
  if (!form.state.trim()) next.state = "State is required";
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    next.email = "Invalid email address";
  if (
    form.website.trim() &&
    !/^(https?:\/\/)?[^\s$.?#].[^\s]*$/i.test(form.website.trim())
  )
    next.website = "Invalid website URL";
  return next;
}

function EditUniversityDialog({
  university,
  saving,
  onClose,
  onSave,
}: {
  university: UniRow;
  saving?: boolean;
  onClose: () => void;
  /** Receives an already-diffed PARTIAL body: untouched columns are absent. */
  onSave: (body: Partial<UniversityPayload>) => void;
}) {
  /*
   * Captured ONCE when the dialog mounts, from the raw server row. The lazy
   * `useState` initialiser keeps the snapshot stable for the lifetime of the
   * dialog (a background refetch cannot move it underneath the operator), so
   * the diff below always compares against what the form was opened with. The
   * call site mounts this only while open and keys it by row id, so every open
   * re-snapshots.
   */
  const [seeded] = useState<UniversityForm>(() =>
    seedUniversityForm(university.raw),
  );
  const [form, setForm] = useState<UniversityForm>(seeded);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /*
   * University Type has no column on `model university`; it is a display-only
   * control and is kept out of `form` so it can never reach a PATCH body.
   */
  const [type, setType] = useState<UniRow["type"]>(university.type);

  // Stored values outside the standard option sets, surfaced as extra options
  // so the operator sees what is really in the column instead of a blank.
  const extraCategories = extraSelectOptions(seeded.category, CATEGORIES);
  const extraStatuses = extraSelectOptions(seeded.status, STATUS_OPTIONS);

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

  const save = () => {
    const touched = changedFields(seeded, form);

    // Nothing was edited: send nothing. A no-op PATCH is exactly how derived
    // defaults used to get written over real NULLs.
    if (touched.length === 0) {
      toast.info("No changes to save");
      onClose();
      return;
    }

    /*
     * Validate only what the operator touched. The required-field rules exist
     * to stop them SUBMITTING a blank, not to force them to invent a value for
     * a column that is NULL today, that they are not editing, and that the
     * PATCH will not include anyway.
     */
    const all = validateUniversityForm(form);
    const next = Object.fromEntries(
      Object.entries(all).filter(([field]) =>
        touched.includes(field as keyof UniversityForm),
      ),
    );
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSave(diffUniversityPayload(seeded, form));
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
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saving) onClose();
      }}
    >
      <DialogContent className="max-w-3xl p-0 overflow-hidden max-h-[85vh]">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-xl font-semibold">Edit University</DialogTitle>
          <DialogDescription>
            Update this university profile. Only the fields you edit are saved —
            everything you leave alone is left exactly as stored.
          </DialogDescription>
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
              {!form.name.trim() && (
                <p className="text-xs text-muted-foreground">
                  No name is stored for this university — the heading above
                  shows “{university.name}”, which is derived from the record
                  id, not something the database holds.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-edit-uni-code">University Code</Label>
              <Input
                id="profile-edit-uni-code"
                className="font-mono"
                value={university.code}
                readOnly
              />
              <p className="text-xs text-muted-foreground">
                Derived from the record id — not a stored column.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>University Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as UniRow["type"])}
              >
                <SelectTrigger>
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
              <p className="text-xs text-muted-foreground">
                Display only — there is no payer-type column to save this to.
              </p>
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
                  university. It is not one of the standard categories — it is
                  kept as-is unless you pick a different one.
                </p>
              )}
              {!form.category.trim() && (
                <p className="text-xs text-muted-foreground">
                  No category is stored for this university. The badge on the
                  profile shows a default, not a stored value.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => update("status", v)}>
                <SelectTrigger>
                  {/* The placeholder is what a NULL `status` looks like. It
                      used to render as a definite Active/Inactive — a claim
                      the database never made. */}
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                  {extraStatuses.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {extraStatuses.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  “{extraStatuses[0]}” is the value currently stored. It is kept
                  as-is unless you pick a different one.
                </p>
              )}
              {!form.status.trim() && (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
            <SectionTitle>Location</SectionTitle>

            <CountryField
              id="profile-edit-uni-country"
              value={form.country}
              storedValue={seeded.country}
              error={errors.country}
              disabled={Boolean(saving)}
              onChange={(v) => update("country", v)}
            />

            <StateField
              id="profile-edit-uni-state"
              value={form.state}
              countryId={form.country}
              error={errors.state}
              disabled={Boolean(saving)}
              onChange={(v) => update("state", v)}
            />

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-edit-uni-address">Address (including city)</Label>
              <Textarea
                id="profile-edit-uni-address"
                placeholder="e.g. Sector 125, Noida, Uttar Pradesh 201313"
                rows={3}
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
              />
              {/* The City input that used to sit here was removed: the schema
                  has no City column, the profile's City row is derived FROM
                  `address`, and the old save wrote `address` back from it. */}
              <p className="text-xs text-muted-foreground">
                There is no separate City field — a university record stores
                its city as part of this address, so include it here.
              </p>
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

/* ---------------- Country / State lookups ----------------
 *
 * Mirrors the same block in universities.universities.tsx.
 *
 * `university.country_id` is a Text column holding `countries.country_id`
 * (India is 99) — and, per the legacy DTO, possibly a comma-separated list of
 * them. It is never a country name, so it is rendered through GET /countries
 * and edited with a picker valued by id. `states.country` is a VarChar holding
 * the country NAME, so state suggestions are filtered by name, not id.
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

/**
 * Country picker, valued by `countries.country_id`.
 *
 * Seeded with the verbatim stored `country_id`; `toUniversityPayload` trims it
 * and `diffUniversityPayload` only sends it when it differs from the seed, so
 * opening Edit and saving never rewrites the column. A stored value that is not
 * exactly one listed id (padded, a comma-separated list, an id with no
 * countries row) is offered as its own option so the trigger shows it. If the
 * lookup is unavailable it degrades to the raw id input.
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
        maxLength={255}
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
