// The required reference sub-field shown beside Source: a student picker for
// "Student Reference", an external-referee picker (+ add) for "External Reference".

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { AddExternalRefereeDialog } from "./add-external-referee-dialog";
import { STUDENT_REFERENCE_SOURCE } from "./lead-references";
import { ReferenceSearch } from "./reference-search";
import { useExternalReferees, useStudentReferenceOptions } from "./referees";

interface ReferenceFieldProps {
  source: string;
  referredBy: string;
  externalRefereeId: string;
  onReferredBy: (id: string) => void;
  onExternalReferee: (id: string) => void;
  error?: string;
}

function FieldShell({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label} <span className="text-accent">*</span>
      </Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function ReferenceField(props: ReferenceFieldProps) {
  return props.source === STUDENT_REFERENCE_SOURCE ? (
    <StudentReference {...props} />
  ) : (
    <ExternalReference {...props} />
  );
}

function StudentReference({ referredBy, onReferredBy, error }: ReferenceFieldProps) {
  const [search, setSearch] = useState("");
  const students = useStudentReferenceOptions(useDebouncedValue(search));
  return (
    <FieldShell label="Student" htmlFor="lead-referred-by" error={error}>
      <ReferenceSearch
        id="lead-referred-by"
        label="Student"
        options={students.options}
        value={referredBy}
        onChange={onReferredBy}
        fallbackLabel={`Student #${referredBy}`}
        loading={students.isFetching}
        invalid={!!error}
        filterLocally={false}
        onQueryChange={setSearch}
      />
    </FieldShell>
  );
}

function ExternalReference({ externalRefereeId, onExternalReferee, error }: ReferenceFieldProps) {
  const referees = useExternalReferees();
  const [adding, setAdding] = useState(false);
  return (
    <FieldShell label="External Referee" htmlFor="lead-external-referee" error={error}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ReferenceSearch
            id="lead-external-referee"
            label="External Referee"
            options={referees.options}
            value={externalRefereeId}
            onChange={onExternalReferee}
            fallbackLabel={`Referee #${externalRefereeId}`}
            loading={referees.isLoading}
            invalid={!!error}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Add external referee"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <AddExternalRefereeDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={(referee) => onExternalReferee(String(referee.id))}
      />
    </FieldShell>
  );
}
