import { IsInt, IsOptional } from 'class-validator';

/**
 * Port of Session_request::edit / ajax_approve — the legacy flow mainly toggles
 * the request `status` (e.g. 0 = pending, 1 = approved). Field set mirrors the
 * session_requests table in schema.prisma; all fields optional (permissive edit).
 */
export class UpdateSessionRequestDto {
  @IsOptional()
  @IsInt()
  student_id?: number;

  @IsOptional()
  @IsInt()
  course_id?: number;

  @IsOptional()
  @IsInt()
  subject_id?: number;

  @IsOptional()
  @IsInt()
  status?: number;
}
