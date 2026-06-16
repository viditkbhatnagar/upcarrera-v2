import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  ArrowLeft,
  Building2,
  Pencil,
  BookPlus,
  CalendarPlus,
  Globe,
  Mail,
  Phone,
  MapPin,
  Plus,
  Eye,
  Search,
  CheckCircle2,
  FileText,
  Tag,
  Activity,
  Wallet,
  Settings2,
  Trash2,
  Lock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  type: "Private" | "Deemed" | "State" | "Central" | "Foreign";
  location: string;
  courses: number;
  intakes: number;
  status: "Active" | "Inactive";
  initials: string;
  color: string;
};

const UNIVERSITIES: UniRow[] = [
  { code: "UNI-001", name: "Amity University Online", type: "Private", location: "Noida, Uttar Pradesh", courses: 24, intakes: 4, status: "Active", initials: "AU", color: "bg-rose-100 text-rose-700" },
  { code: "UNI-002", name: "Manipal University Jaipur", type: "Private", location: "Jaipur, Rajasthan", courses: 18, intakes: 3, status: "Active", initials: "MU", color: "bg-amber-100 text-amber-700" },
  { code: "UNI-003", name: "Lovely Professional University", type: "Private", location: "Phagwara, Punjab", courses: 22, intakes: 4, status: "Active", initials: "LP", color: "bg-emerald-100 text-emerald-700" },
  { code: "UNI-004", name: "Chandigarh University Online", type: "Private", location: "Mohali, Punjab", courses: 16, intakes: 3, status: "Active", initials: "CU", color: "bg-sky-100 text-sky-700" },
  { code: "UNI-005", name: "Jain (Deemed-to-be University)", type: "Deemed", location: "Bengaluru, Karnataka", courses: 14, intakes: 2, status: "Active", initials: "JU", color: "bg-violet-100 text-violet-700" },
  { code: "UNI-006", name: "NMIMS Global Access", type: "Deemed", location: "Mumbai, Maharashtra", courses: 12, intakes: 2, status: "Active", initials: "NM", color: "bg-indigo-100 text-indigo-700" },
  { code: "UNI-007", name: "Symbiosis Centre for Distance Learning", type: "Deemed", location: "Pune, Maharashtra", courses: 10, intakes: 2, status: "Active", initials: "SC", color: "bg-pink-100 text-pink-700" },
  { code: "UNI-008", name: "IGNOU", type: "Central", location: "New Delhi", courses: 32, intakes: 2, status: "Active", initials: "IG", color: "bg-teal-100 text-teal-700" },
  { code: "UNI-009", name: "Dr. D.Y. Patil Vidyapeeth", type: "Deemed", location: "Pune, Maharashtra", courses: 9, intakes: 2, status: "Inactive", initials: "DY", color: "bg-orange-100 text-orange-700" },
  { code: "UNI-010", name: "Sikkim Manipal University", type: "State", location: "Gangtok, Sikkim", courses: 11, intakes: 3, status: "Active", initials: "SM", color: "bg-fuchsia-100 text-fuchsia-700" },
  { code: "UNI-011", name: "Andhra University Online", type: "State", location: "Visakhapatnam, AP", courses: 8, intakes: 2, status: "Inactive", initials: "AU", color: "bg-lime-100 text-lime-700" },
  { code: "UNI-012", name: "UPES Online", type: "Private", location: "Dehradun, Uttarakhand", courses: 15, intakes: 3, status: "Active", initials: "UP", color: "bg-cyan-100 text-cyan-700" },
];

const TYPE_STYLE: Record<UniRow["type"], string> = {
  Private: "bg-sky-50 text-sky-700 ring-sky-200",
  Deemed: "bg-violet-50 text-violet-700 ring-violet-200",
  State: "bg-amber-50 text-amber-700 ring-amber-200",
  Central: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Foreign: "bg-rose-50 text-rose-700 ring-rose-200",
};

export const Route = createFileRoute("/universities/universities_/$code")({
  head: ({ params }) => ({
    meta: [{ title: `${params.code} — Universities — upCarrera` }],
  }),
  component: UniversityProfilePage,
});

// --- Live API wiring (GET /api/universities/:id) -------------------------
// The route param ($code) is passed as the university id. The detail endpoint
// returns a single university row of raw columns; we map it into the UniRow
// shape the existing header/overview UI consumes. Fields the endpoint does not
// provide (courses/intakes counts, deterministic avatar color) are derived.
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
    .filter((w) => w.length > 0 && !/^(University|College|Institute|of|the|and|&|Online)$/i.test(w));
  const picked = words.length > 0 ? words : name.trim().split(/\s+/);
  return picked.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "U";
}

function pickColor(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

// category column holds a free-form string; coerce it to the UI's narrow type.
function mapType(category: string | null): UniRow["type"] {
  const c = (category ?? "").toLowerCase();
  if (c.includes("deem")) return "Deemed";
  if (c.includes("central")) return "Central";
  if (c.includes("state")) return "State";
  if (c.includes("foreign") || c.includes("international")) return "Foreign";
  return "Private";
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
  const location = [u.address, u.state].filter((x) => x && x.trim() !== "").join(", ") || "—";
  return {
    code: String(u.id),
    name,
    type: mapType(u.category),
    location,
    courses: 0,
    intakes: intakesCount,
    status: mapStatus(u.status),
    initials: deriveInitials(name),
    color: pickColor(name),
  };
}

/* ---- Mock supporting data ---- */

type CourseRow = {
  code: string;
  name: string;
  level: "UG" | "PG" | "Diploma" | "Certificate";
  category: string;
  specialisation: string;
  duration: string;
  status: "Active" | "Inactive";
};

const TAGGED_COURSES: CourseRow[] = [
  { code: "CRS-001", name: "MBA", level: "PG", category: "Management", specialisation: "Marketing", duration: "2 Years", status: "Active" },
  { code: "CRS-002", name: "MBA", level: "PG", category: "Management", specialisation: "Finance", duration: "2 Years", status: "Active" },
  { code: "CRS-003", name: "MCA", level: "PG", category: "Technology", specialisation: "Data Science", duration: "2 Years", status: "Active" },
  { code: "CRS-004", name: "BBA", level: "UG", category: "Management", specialisation: "General", duration: "3 Years", status: "Active" },
  { code: "CRS-005", name: "BCA", level: "UG", category: "Technology", specialisation: "Cloud Computing", duration: "3 Years", status: "Inactive" },
];

const COURSE_LIBRARY: Omit<CourseRow, "status">[] = [
  { code: "CRS-006", name: "B.Tech Computer Science", level: "UG", category: "Technology", specialisation: "AI & ML", duration: "4 Years" },
  { code: "CRS-007", name: "M.Tech Data Science", level: "PG", category: "Technology", specialisation: "Big Data", duration: "2 Years" },
  { code: "CRS-008", name: "B.Com Honours", level: "UG", category: "Commerce", specialisation: "Accounting", duration: "3 Years" },
  { code: "CRS-009", name: "LLB", level: "UG", category: "Law", specialisation: "Corporate Law", duration: "3 Years" },
  { code: "CRS-010", name: "BBA International Business", level: "UG", category: "Management", specialisation: "International Business", duration: "3 Years" },
];


type FeeRow = {
  id: string;
  course: string;
  intake: string;
  registration: number;
  tuition: number;
  total: number;
  status: "Active" | "Draft" | "Inactive";
};

const FEE_STRUCTURES: FeeRow[] = [
  { id: "FEE-2026-001", course: "MBA in Marketing", intake: "Jan 2026", registration: 5000, tuition: 168000, total: 173000, status: "Active" },
  { id: "FEE-2026-002", course: "MBA in Finance", intake: "Jan 2026", registration: 5000, tuition: 168000, total: 173000, status: "Active" },
  { id: "FEE-2026-003", course: "MCA in Data Science", intake: "Jul 2026", registration: 5000, tuition: 142000, total: 147000, status: "Draft" },
];

type ActivityItem = {
  id: string;
  type: "created" | "course" | "intake" | "fee" | "commission" | "payout" | "status";
  title: string;
  description: string;
  actor: string;
  date: string;
};

const ACTIVITIES: ActivityItem[] = [
  { id: "a1", type: "created", title: "University Created", description: "University profile was created.", actor: "Priya Sharma", date: "12 Jan 2026, 10:32 AM" },
  { id: "a2", type: "course", title: "Course Tagged", description: "MBA — Marketing tagged to university.", actor: "Priya Sharma", date: "12 Jan 2026, 11:04 AM" },
  { id: "a3", type: "intake", title: "Intake Tagged", description: "January 2026 intake added.", actor: "Rahul Verma", date: "14 Jan 2026, 09:15 AM" },
  { id: "a4", type: "fee", title: "Fee Structure Created", description: "FEE-2026-001 created for MBA — Marketing.", actor: "Finance Admin", date: "16 Jan 2026, 04:21 PM" },
  { id: "a5", type: "commission", title: "Commission Rule Updated", description: "Counsellor commission set to 6%.", actor: "Ops Admin", date: "20 Jan 2026, 12:08 PM" },
  { id: "a6", type: "payout", title: "Payout Rule Updated", description: "Payout cycle set to T+30.", actor: "Finance Admin", date: "22 Jan 2026, 03:47 PM" },
  { id: "a7", type: "status", title: "Status Changed", description: "Marked as Active.", actor: "Ops Admin", date: "23 Jan 2026, 10:00 AM" },
];

const ACTIVITY_META: Record<ActivityItem["type"], { icon: typeof Tag; color: string }> = {
  created: { icon: Building2, color: "bg-sky-100 text-sky-700" },
  course: { icon: BookPlus, color: "bg-emerald-100 text-emerald-700" },
  intake: { icon: CalendarPlus, color: "bg-violet-100 text-violet-700" },
  fee: { icon: Wallet, color: "bg-amber-100 text-amber-700" },
  commission: { icon: Settings2, color: "bg-indigo-100 text-indigo-700" },
  payout: { icon: Settings2, color: "bg-pink-100 text-pink-700" },
  status: { icon: CheckCircle2, color: "bg-teal-100 text-teal-700" },
};

function UniversityProfilePage() {
  // The $code route param is the university id; pass it straight to /universities/:id.
  const { code } = Route.useParams();
  const {
    data: apiUni,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["university", code],
    queryFn: () => apiGet<ApiUniversity>(`/universities/${code}`),
  });

  // TODO(api): no per-university endpoints for tagged courses, fee structures,
  // the course library used by the Tag-Course dialog, or the activity timeline
  // that match these table columns — those tabs stay on mock data.

  // Derived view-model from the live row; placeholder keeps hooks unconditional
  // while the request is in flight (real loading/error UI is rendered below).
  const uni: UniRow = useMemo(
    () =>
      apiUni
        ? mapApiUniversity(apiUni)
        : {
            code: String(code),
            name: "",
            type: "Private",
            location: "—",
            courses: 0,
            intakes: 0,
            status: "Inactive",
            initials: "U",
            color: AVATAR_COLORS[0],
          },
    [apiUni, code],
  );

  const [tagCourseOpen, setTagCourseOpen] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseLevelFilter, setCourseLevelFilter] = useState<"All" | "UG" | "PG" | "Diploma" | "Certificate">("All");

  // Create Fee Structure wizard state
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeStep, setFeeStep] = useState<1 | 2 | 3>(1);
  const [feeCourse, setFeeCourse] = useState<string>("");
  const [feeIntake, setFeeIntake] = useState<string>("");
  const [feeStatus, setFeeStatus] = useState<"Draft" | "Active" | "Inactive">("Draft");
  const [feeComponents, setFeeComponents] = useState<{ id: string; name: string; amount: string }[]>([
    { id: "fc1", name: "Application Fee", amount: "" },
    { id: "fc2", name: "Registration Fee", amount: "" },
    { id: "fc3", name: "Tuition Fee", amount: "" },
    { id: "fc4", name: "Exam Fee", amount: "" },
  ]);
  const [scholarshipAllowed, setScholarshipAllowed] = useState<"Yes" | "No">("No");
  const [maxScholarship, setMaxScholarship] = useState<string>("");
  const [feeSuccess, setFeeSuccess] = useState<null | {
    code: string;
    university: string;
    course: string;
    intake: string;
    total: number;
  }>(null);

  const INTAKES = useMemo(
    () => ["January 2026", "April 2026", "July 2026", "October 2026"],
    [],
  );

  const selectedCourseObj = useMemo(
    () => TAGGED_COURSES.find((c) => c.code === feeCourse),
    [feeCourse],
  );

  const courseLabel = selectedCourseObj
    ? `${selectedCourseObj.name} in ${selectedCourseObj.specialisation}`
    : "";

  const feeStructureName =
    feeCourse && feeIntake
      ? `${uni.initials} - ${courseLabel} - ${feeIntake} Fee Structure`
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
    () =>
      feeComponents.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0),
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
    setFeeSuccess(null);
  };

  const closeFeeWizard = () => {
    setFeeOpen(false);
    setTimeout(resetFeeWizard, 200);
  };

  const updateComponent = (id: string, patch: Partial<{ name: string; amount: string }>) => {
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
  const canProceedStep2 = feeComponents.length > 0 && feeComponents.every((c) => c.name && c.amount);

  const submitFee = (activate: boolean) => {
    setFeeSuccess({
      code: feeStructureCode,
      university: uni.name,
      course: courseLabel,
      intake: feeIntake,
      total: totalFee,
    });
    setFeeStatus(activate ? "Active" : "Draft");
    toast.success("Fee Structure Created Successfully");
  };

  const filteredLibrary = useMemo(() => {
    return COURSE_LIBRARY.filter((c) => {
      const matchesSearch =
        courseSearch.trim() === "" ||
        c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
        c.code.toLowerCase().includes(courseSearch.toLowerCase());
      const matchesLevel = courseLevelFilter === "All" || c.level === courseLevelFilter;
      return matchesSearch && matchesLevel;
    });
  }, [courseSearch, courseLevelFilter]);

  const toggleCourse = (code: string) => {
    setSelectedCourses((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const basicInfo = useMemo(() => {
    const dash = (v: string | null | undefined) =>
      v && String(v).trim() !== "" ? String(v).trim() : "—";
    return {
      name: uni.name,
      code: uni.code,
      type: uni.type === "Private" ? "Type 2 – Student Pays upCarrera" : "Type 1 – Student Pays University",
      category: dash(apiUni?.category) === "—" ? `${uni.type} University` : (apiUni?.category as string),
      country: dash(apiUni?.country_id),
      state: dash(apiUni?.state),
      city: dash(apiUni?.address),
      website: dash(apiUni?.website),
      email: dash(apiUni?.email),
      phone: dash(apiUni?.phone),
      address: dash(apiUni?.address),
      status: uni.status,
    };
  }, [uni, apiUni]);

  const backLink = (
    <div>
      <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
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
    const notFound = error instanceof Error && /404|not found/i.test(error.message);
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
            {error instanceof Error ? error.message : "Please try again in a moment."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
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
                uni.color,
              )}
            >
              {uni.initials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {uni.name}
                </h1>
                {uni.status === "Active" ? (
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
                <span className="font-mono text-xs">{uni.code}</span>
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1", TYPE_STYLE[uni.type])}>
                  {uni.type}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {uni.location}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="gap-2">
              <Pencil className="h-4 w-4" />
              Edit University
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-10 bg-muted/60 p-1 text-foreground">
          <TabsTrigger value="overview" className="gap-2 text-foreground/70 hover:text-foreground data-[state=active]:text-foreground">
            <Building2 className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="courses" className="gap-2 text-foreground/70 hover:text-foreground data-[state=active]:text-foreground">
            <BookPlus className="h-3.5 w-3.5" />
            Courses
          </TabsTrigger>
          <TabsTrigger value="fees" className="gap-2 text-foreground/70 hover:text-foreground data-[state=active]:text-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Fee Structure
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2 text-foreground/70 hover:text-foreground data-[state=active]:text-foreground">
            <Activity className="h-3.5 w-3.5" />
            Activity Timeline
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="border-b p-5">
              <h2 className="text-base font-semibold text-foreground">Basic Information</h2>
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
              <Field label="Address" value={basicInfo.address} className="sm:col-span-2" />
              <Field
                label="Status"
                value={
                  basicInfo.status === "Active" ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-zinc-100 text-zinc-600">Inactive</Badge>
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
                <h2 className="text-base font-semibold text-foreground">Tagged Courses</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Courses currently mapped to this university.
                </p>
              </div>
              <Button className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover" onClick={() => setTagCourseOpen(true)}>
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
                    <TableHead className="pr-4 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TAGGED_COURSES.map((c) => (
                    <TableRow key={c.code} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.code}</TableCell>
                      <TableCell className="py-3 text-sm font-medium text-foreground">{c.name} in {c.specialisation}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700">{c.level}</Badge>
                      </TableCell>
                      <TableCell className="py-3 text-sm">{c.name}</TableCell>
                      <TableCell className="py-3 text-sm">{c.specialisation}</TableCell>
                      <TableCell className="py-3 text-sm">{c.duration}</TableCell>
                      <TableCell className="py-3">
                        {c.status === "Active" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-zinc-100 text-zinc-600">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-3 pr-4 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
                <h2 className="text-base font-semibold text-foreground">Fee Structures</h2>
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
                  {FEE_STRUCTURES.map((f) => (
                    <TableRow key={f.id} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{f.id}</TableCell>
                      <TableCell className="py-3 text-sm font-medium text-foreground">{f.course}</TableCell>
                      <TableCell className="py-3 text-sm">{f.intake}</TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums">₹{f.registration.toLocaleString()}</TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums">₹{f.tuition.toLocaleString()}</TableCell>
                      <TableCell className="py-3 text-right text-sm font-semibold tabular-nums">₹{f.total.toLocaleString()}</TableCell>
                      <TableCell className="py-3">
                        {f.status === "Active" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>
                        ) : f.status === "Draft" ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700">Draft</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-zinc-100 text-zinc-600">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="space-y-4">
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Activity Timeline</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Chronological log of all profile changes and events.
            </p>
            <ol className="mt-6 relative space-y-5 border-l border-border pl-6">
              {ACTIVITIES.map((a) => {
                const meta = ACTIVITY_META[a.type];
                const Icon = meta.icon;
                return (
                  <li key={a.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[34px] grid h-7 w-7 place-items-center rounded-full ring-4 ring-card",
                        meta.color,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">{a.title}</span>
                        <span className="text-xs text-muted-foreground">· {a.date}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{a.description}</p>
                      <p className="text-xs text-muted-foreground">by {a.actor}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </TabsContent>
      </Tabs>

      {/* Tag Course Dialog */}
      <Dialog open={tagCourseOpen} onOpenChange={setTagCourseOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Tag Courses</DialogTitle>
            <DialogDescription>
              Select courses from the library to tag to {uni.name}.
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
              <Select value={courseLevelFilter} onValueChange={(v) => setCourseLevelFilter(v as typeof courseLevelFilter)}>
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
                          selected && "bg-accent/10"
                        )}
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">{c.name}</div>
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
                {selectedCourses.length} course{selectedCourses.length > 1 ? "s" : ""} selected
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
              Tag {selectedCourses.length > 0 ? `${selectedCourses.length} Course${selectedCourses.length > 1 ? "s" : ""}` : "Courses"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Fee Structure Wizard */}
      <Dialog open={feeOpen} onOpenChange={(o) => (o ? setFeeOpen(true) : closeFeeWizard())}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create Fee Structure</DialogTitle>
            <DialogDescription>Create a fee plan by selecting a course.</DialogDescription>
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
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700">Draft</Badge>
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
                  { n: 3, label: "Scholarship" },
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
                        feeStep === s.n ? "font-medium text-foreground" : "text-muted-foreground",
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
                      <span className="font-medium">{uni.name}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">{uni.code}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Course *</Label>
                    <Select value={feeCourse} onValueChange={setFeeCourse}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select course" />
                      </SelectTrigger>
                      <SelectContent>
                        {TAGGED_COURSES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name} in {c.specialisation}
                          </SelectItem>
                        ))}
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
                    <Input value={feeStructureName} readOnly placeholder="Auto-generated" className="bg-muted/40" />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Fee Structure Code</Label>
                    <Input value={feeStructureCode} readOnly placeholder="Auto-generated" className="bg-muted/40 font-mono text-xs" />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Status</Label>
                    <Select value={feeStatus} onValueChange={(v) => setFeeStatus(v as typeof feeStatus)}>
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
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={addCustomComponent}>
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
                                  onChange={(e) => updateComponent(c.id, { name: e.target.value })}
                                  placeholder="Component name"
                                />
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <Input
                                  type="number"
                                  value={c.amount}
                                  onChange={(e) => updateComponent(c.id, { amount: e.target.value })}
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
                        {feeComponents.filter((c) => c.name || c.amount).map((c) => (
                          <div key={c.id} className="flex justify-between text-muted-foreground">
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
                  <div className="space-y-1.5">
                    <Label>Scholarship Allowed</Label>
                    <Select value={scholarshipAllowed} onValueChange={(v) => setScholarshipAllowed(v as "Yes" | "No")}>
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
                  <div className="sm:col-span-2 rounded-xl border bg-muted/30 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium">Total Fee</span>
                      <span className="text-lg font-bold tabular-nums">
                        ₹{totalFee.toLocaleString()}
                      </span>
                    </div>
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

