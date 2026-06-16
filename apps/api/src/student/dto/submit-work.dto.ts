import { IsOptional, IsString } from 'class-validator';

/**
 * Body for POST /student/homework/:id/submit and
 * POST /student/assessments/:id/submit.
 *
 * Mirrors CI4 Api/Student/Home_work::submit_feedback &
 * Api/Student/Assessments::submit_feedback: the student supplies a typed answer
 * and/or an uploaded answer file (a JSON-encoded path list in legacy). Here the
 * already-uploaded reference is passed as a string; submitting flips
 * student_status to 1 (Completed).
 */
export class SubmitWorkDto {
  @IsOptional()
  @IsString()
  answer?: string;

  @IsOptional()
  @IsString()
  answer_file?: string;
}
