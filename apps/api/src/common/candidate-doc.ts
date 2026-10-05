import type { Prisma } from '@prisma/client';

/**
 * Candidate (lead) document classification — the ONE source of truth for the
 * overloaded `student_document.application_id` column.
 *
 * That column is OVERLOADED: an application/student document stores a real
 * `applications.application_id` there, but a candidate (lead) document stores a
 * `leads.id` (there is no `candidate_id` column — see FilesService). The two
 * id-spaces can collide, so the column alone can NEVER classify a row. The
 * reliable signal is HOW the row was created: candidate docs are stored under
 * `candidate_documents/` (legacy `canditates/`). Every route that acts on a
 * student_document — the files write/list/row-access paths (FilesService), the
 * shared document-row authorizer (RecordAccessService) and the student-profile
 * read (StudentProfileService) — classifies through THIS module, so none can
 * drift and let a candidate doc be reached/merged as an application doc.
 *
 * This file is a dependency-free leaf (only a type-only Prisma import, erased at
 * build), so workflow/, students/ and files/ can all import it with no module or
 * circular-dependency concern.
 *
 * ACCEPTED FOLLOW-UP (not fixed here, no migration in this pass): the real
 * end-state fix for the overloaded application_id column is an explicit
 * discriminator column (e.g. student_document.doc_kind = 'application' | 'lead')
 * set on write, so classification no longer depends on the stored file path. That
 * is a schema change for a future migration; until then the file-prefix
 * discriminator below is the single source of truth every route shares.
 */

/** Subdir candidate (lead) documents are stored under (legacy App/Upload_document). */
export const CANDIDATE_DOCS_SUBDIR = 'candidate_documents';

/**
 * Legacy CI4 candidate-doc path prefix ('canditates/documents/…', note the typo).
 * Recognised ALONGSIDE CANDIDATE_DOCS_SUBDIR so a migrated candidate document is
 * still classified correctly.
 */
export const LEGACY_CANDIDATE_DIR = 'canditates';

/** The file-path prefixes that mark a student_document row as candidate(lead)-scoped. */
const CANDIDATE_DOC_PREFIXES = [
  `${CANDIDATE_DOCS_SUBDIR}/`,
  `${LEGACY_CANDIDATE_DIR}/`,
] as const;

/**
 * True when a student_document row was created via the candidate path (its stored
 * file lives under candidate_documents/, or the legacy canditates/ dir). THE
 * discriminator that resolves the overloaded application_id column: a candidate
 * doc's application_id is a leads.id, an application/student doc's is a real
 * applications.application_id.
 */
export function isCandidateDocFile(file: string | null | undefined): boolean {
  if (typeof file !== 'string') return false;
  return CANDIDATE_DOC_PREFIXES.some((prefix) => file.startsWith(prefix));
}

/**
 * The Prisma OR fragment matching candidate(lead)-scoped rows by their file prefix
 * — the query-side twin of isCandidateDocFile. Used to RESTRICT a lead-keyed list
 * to genuine candidate docs (listCandidateDocuments) and, negated under NOT, to
 * EXCLUDE candidate docs from an application-keyed read (student profile
 * documents()). Built from the same prefixes, so the row check and the query can
 * never disagree.
 */
export function candidateDocFileWhereOr(): Prisma.student_documentWhereInput[] {
  return CANDIDATE_DOC_PREFIXES.map((prefix) => ({
    file: { startsWith: prefix },
  }));
}
