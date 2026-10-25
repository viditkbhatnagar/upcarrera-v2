import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STAGE_META } from "@/components/applications/stage-model";
import { mapRow } from "@/components/applications/list-model";
import type { Stage } from "@/lib/api/applications";
import { cn } from "@/lib/utils";
import { PIPELINE_TAB_ROWS, useApplicationsByStage } from "./use-dashboard-data";

const TABS: readonly { value: Stage; label: string }[] = [
  { value: "fee_pending", label: "Payment Pending" },
  { value: "form_pending", label: "Form Pending" },
  { value: "sa_verification", label: "Approval Waiting" },
  { value: "converted", label: "Enrolled" },
];

interface RecentTablesProps {
  /** Per-stage totals from GET /applications `counts`. */
  counts: Record<Stage, number> | undefined;
}

export function RecentTables({ counts }: RecentTablesProps) {
  const [active, setActive] = useState<Stage>(TABS[0].value);

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border/70">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Application Pipeline Snapshot</h3>
          <p className="text-xs text-muted-foreground">Quick view of pending payments, forms, approvals and enrollments</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/students/applications">View all applications</Link>
        </Button>
      </div>
      <Tabs value={active} onValueChange={(v) => setActive(v as Stage)}>
        <div className="overflow-x-auto">
          <TabsList className="bg-muted/60">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label} ({counts ? counts[t.value] ?? 0 : "…"})
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4">
            {active === t.value && <StageTable stage={t.value} total={counts?.[t.value]} />}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

function StageTable({ stage, total }: { stage: Stage; total: number | undefined }) {
  const query = useApplicationsByStage(stage);
  const rows = (query.data?.items ?? []).map(mapRow);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Application ID</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>University</TableHead>
            <TableHead>Course</TableHead>
            <TableHead>Intake</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-6">Loading…</TableCell>
            </TableRow>
          ) : query.isError ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-destructive py-6">Couldn't load applications.</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-6">No applications in this stage</TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={r.rowId}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-mono text-xs">{r.id}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">{r.date}</TableCell>
                <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">{r.university}</TableCell>
                <TableCell className="whitespace-nowrap">{r.course}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">{r.intake}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("font-medium border-transparent", STAGE_META[r.stage].badge)}>
                    {r.stageLabel}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="icon" aria-label={`View ${r.name}`}>
                    <Link to="/students/applications/$appId" params={{ appId: String(r.rowId) }}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {total !== undefined && total > PIPELINE_TAB_ROWS && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the latest {PIPELINE_TAB_ROWS} of {total.toLocaleString("en-IN")}.
        </p>
      )}
    </div>
  );
}
