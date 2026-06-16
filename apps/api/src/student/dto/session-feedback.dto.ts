import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Body for POST /student/sessions/:id/feedback.
 *
 * The student rates a session and leaves remarks; we also mark their
 * session_attendance row as completed (stamped). NOTE: the v2 `session_feedback`
 * table is teacher-shaped (teacher_id/session_status/problem_faced/...) and has
 * NO student_id/rating/remarks columns, so rating+remarks are persisted into the
 * closest existing columns (session_status + problem_faced) with created_by = me.
 */
export class SessionFeedbackDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
