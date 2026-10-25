import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  GraduationCap,
  Laptop,
  Layers,
  SearchX,
} from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, Section, StatePanel } from "@/components/counsellor/shared/info";
import { mapCourse, modeStyle, NONE, type ApiCourseRow } from "./course-model";

interface CourseUniversityRow {
  university_id: number;
  university_title: string | null;
  university_course_name: string | null;
  status: number | null;
  open_intake_count: number;
}

interface CatalogIntake {
  id: number;
  name: string | null;
  start_date: string | null;
  closing_date: string | null;
}

interface ResolvedFee {
  registration_fee: number | null;
  total_fee: number | null;
  currency: string;
}

const inr = (n: number | null | undefined) => (n == null ? NONE : `₹${n.toLocaleString("en-IN")}`);
const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : NONE;

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="text-sm font-semibold mt-1 break-words">{value}</p>
    </div>
  );
}

/**
 * Course detail (Naji's design), read-only:
 *   GET /courses/:id                                        -> hero + overview
 *   GET /courses/:id/universities                           -> offering universities
 *   GET /admission-catalog/universities/:u/courses/:c/intakes -> open intakes
 *   GET /fee-structures/resolve                             -> fee per (university, course, intake)
 */
export function CounsellorCourseDetail({ idParam }: { idParam: string }) {
  const id = /^\d+$/.test(idParam) ? Number(idParam) : null;
  const course = useQuery({
    queryKey: ["counsellor", "course", id],
    queryFn: () => apiGet<ApiCourseRow>(`/courses/${id}`),
    enabled: id != null,
  });
  const universities = useQuery({
    queryKey: ["course-universities", id],
    queryFn: () => apiGet<CourseUniversityRow[]>(`/courses/${id}/universities`),
    enabled: id != null,
  });

  const c = course.data ? mapCourse(course.data) : null;

  const crumb = (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Link to="/universities/courses" className="hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="h-3.5 w-3.5" /> Courses
      </Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-foreground font-medium truncate">{c?.name ?? idParam}</span>
    </div>
  );

  if (id == null || (course.isError && course.error instanceof ApiError && course.error.status === 404)) {
    return (
      <>
        {crumb}
        <StatePanel icon={<SearchX className="h-7 w-7 text-muted-foreground/70" />} title="Course not found" />
      </>
    );
  }
  if (course.isLoading) return <>{crumb}<StatePanel icon={<BookOpen className="h-7 w-7 text-muted-foreground/60" />} title="Loading course…" /></>;
  if (course.isError || !c) {
    return (
      <>
        {crumb}
        <StatePanel
          icon={<AlertTriangle className="h-7 w-7 text-destructive" />}
          title="Couldn't load the course"
          action={<Button onClick={() => course.refetch()}>Try again</Button>}
        />
      </>
    );
  }

  const offering = universities.data ?? [];

  return (
    <>
      {crumb}

      <Card className="overflow-hidden shadow-[var(--shadow-soft)] border-border/70">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="secondary">{c.level}</Badge>
            <Badge className={cn("border", modeStyle(c.mode))}>{c.mode}</Badge>
          </div>
          <h1 className="text-2xl font-bold break-words">{c.name}</h1>
          <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-sm font-medium text-primary-soft-foreground">
            <Building2 className="h-4 w-4 shrink-0" />
            {c.universities > 1 ? `${c.universities} universities` : c.university}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {c.specialisations.length > 0 ? c.specialisations.join(", ") : "No specialisations listed"}
          </p>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 border-t border-border">
          <Stat icon={Clock} label="Duration" value={c.duration} />
          <Stat icon={Laptop} label="Mode" value={c.mode} />
          <Stat icon={GraduationCap} label="Eligibility" value={c.eligibility} />
          <Stat icon={Award} label="Level" value={c.level} />
          <Stat icon={Layers} label="Course group" value={c.group} />
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="max-w-full h-auto flex flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="offering">Intake &amp; Fees</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Section title="Course Overview" icon={BookOpen}>
            <Field label="Course" value={c.name} />
            <Field label="Code" value={c.code} />
            <Field label="Level" value={c.level} />
            <Field label="Duration" value={c.duration} />
            <Field label="Study mode" value={c.mode} />
            <Field label="Eligibility" value={c.eligibility} />
          </Section>
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border/70">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Specialisations
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.specialisations.length === 0 ? (
                <p className="text-sm text-muted-foreground">None listed.</p>
              ) : (
                c.specialisations.map((s) => (
                  <Badge key={s} variant="secondary" className="px-3 py-1.5 text-xs">{s}</Badge>
                ))
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="offering" className="mt-4 space-y-4">
          {universities.isLoading ? (
            <StatePanel icon={<Calendar className="h-7 w-7 text-muted-foreground/60" />} title="Loading intakes…" />
          ) : offering.length === 0 ? (
            <StatePanel icon={<Calendar className="h-7 w-7 text-muted-foreground/60" />} title="No universities offer this course yet" />
          ) : (
            offering.map((u) => <UniversityOffering key={u.university_id} courseId={id} university={u} />)
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function UniversityOffering({ courseId, university }: { courseId: number; university: CourseUniversityRow }) {
  const intakes = useQuery({
    queryKey: ["counsellor", "course-intakes", university.university_id, courseId],
    queryFn: () =>
      apiGet<CatalogIntake[]>(
        `/admission-catalog/universities/${university.university_id}/courses/${courseId}/intakes`,
      ),
  });
  const rows = intakes.data ?? [];

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border/70">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {university.university_title ?? `University #${university.university_id}`}
          </h2>
          {university.university_course_name && (
            <p className="text-xs text-muted-foreground mt-0.5">Offered as “{university.university_course_name}”</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {university.status === 0 && <Badge variant="outline">Paused</Badge>}
          <Badge variant="outline">{rows.length} open intake{rows.length === 1 ? "" : "s"}</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Intake</TableHead>
              <TableHead>Starts</TableHead>
              <TableHead>Enrollment closes</TableHead>
              <TableHead className="text-right">Registration fee</TableHead>
              <TableHead className="text-right">Total fee</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {intakes.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
              </TableRow>
            )}
            {!intakes.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No open intakes.</TableCell>
              </TableRow>
            )}
            {rows.map((i) => (
              <IntakeRow key={i.id} intake={i} universityId={university.university_id} courseId={courseId} />
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function IntakeRow({ intake, universityId, courseId }: { intake: CatalogIntake; universityId: number; courseId: number }) {
  // 404 simply means no active fee structure yet; shown as a dash.
  const fee = useQuery({
    queryKey: ["counsellor", "course-fee", universityId, courseId, intake.id],
    queryFn: () =>
      apiGet<ResolvedFee>("/fee-structures/resolve", {
        university_id: universityId,
        course_id: courseId,
        intake_id: intake.id,
      }),
    retry: false,
    staleTime: 5 * 60_000,
  });
  return (
    <TableRow className="hover:bg-muted/30">
      <TableCell className="font-medium text-sm">{intake.name ?? `Intake #${intake.id}`}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{fmtDate(intake.start_date)}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{fmtDate(intake.closing_date)}</TableCell>
      <TableCell className="text-right text-sm tabular-nums">{fee.isLoading ? "…" : inr(fee.data?.registration_fee)}</TableCell>
      <TableCell className="text-right text-sm font-semibold tabular-nums">{fee.isLoading ? "…" : inr(fee.data?.total_fee)}</TableCell>
    </TableRow>
  );
}
