// Data hooks behind the Source -> reference pickers.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type { ExternalReferee, ExternalRefereeInput } from "./lead-references";

export interface ReferenceOption {
  id: string;
  name: string;
  email: string;
  /** Secondary line: the student id, or the referee's phone. */
  detail?: string;
}

const REFERENCE_STALE_MS = 60 * 1000;
const STUDENT_PICKER_LIMIT = 30;

export const EXTERNAL_REFEREES_KEY = ["external-referees"] as const;

export function useExternalReferees() {
  const query = useQuery({
    queryKey: EXTERNAL_REFEREES_KEY,
    queryFn: () => apiGet<ExternalReferee[]>("/external-referees"),
    staleTime: REFERENCE_STALE_MS,
  });
  const options = useMemo<ReferenceOption[]>(
    () =>
      (query.data ?? []).map((r) => ({
        id: String(r.id),
        name: r.name,
        email: r.email,
        detail: r.phone,
      })),
    [query.data],
  );
  return { ...query, options };
}

export function useAddExternalReferee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExternalRefereeInput) =>
      apiPost<ExternalReferee>("/external-referees", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EXTERNAL_REFEREES_KEY }),
  });
}

interface StudentRow {
  student_id: number;
  name: string | null;
  email: string | null;
}

interface StudentsPage {
  items: StudentRow[];
}

/**
 * Students a lead can be referred by. GET /students is scoped by the API as it
 * is for the Students screen; the option VALUE is the student's USER id
 * (students.student_id), which is what applications.referred_by stores.
 */
export function useStudentReferenceOptions(search: string) {
  const term = search.trim();
  const query = useQuery({
    queryKey: ["reference-students", term],
    queryFn: () =>
      apiGet<StudentsPage>("/students", {
        limit: STUDENT_PICKER_LIMIT,
        ...(term ? { search: term } : {}),
      }),
    staleTime: REFERENCE_STALE_MS,
  });
  const options = useMemo<ReferenceOption[]>(
    () =>
      (query.data?.items ?? [])
        .filter((s) => s.student_id != null && s.name)
        .map((s) => ({
          id: String(s.student_id),
          name: s.name ?? "",
          email: s.email ?? "",
          detail: `STU-${s.student_id}`,
        })),
    [query.data],
  );
  return { ...query, options };
}
