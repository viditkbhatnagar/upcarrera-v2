import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Port of CI4 App\Controllers\App\Teachers::reset_password().
 * Updates a teacher's `username` + bcrypt `password`, preserving the previous
 * hash in `users.prev_password`. The legacy flow also rejects a username that
 * already belongs to a different user. Exposed at both PATCH
 * /teachers/:id/password and PATCH /teachers/:id/reset-password (one impl).
 */
export class ResetPasswordDto {
  /** New login username. Validated for cross-user uniqueness in the service. */
  @IsString()
  @IsNotEmpty()
  username!: string;

  /** New plaintext password (hashed with bcrypt before persistence). */
  @IsString()
  @MinLength(1)
  password!: string;
}

/** Sets users.zoom_email for a teacher (PATCH /teachers/:id/zoom-email). */
export class UpdateZoomEmailDto {
  @IsString()
  @IsNotEmpty()
  zoom_email!: string;
}

/**
 * Body for assigning a course to a teacher's enrolment
 * (POST /teachers/:id/enrolled-courses). Mirrors Instructor::enrol_course().
 */
export class EnrolCourseDto {
  @IsNotEmpty()
  course_id!: number;
}

/**
 * Body for assigning a student to a teacher (POST /teachers/:id/assigned-students).
 * Mirrors Instructor::assign_student() (course_id + student_id). In v2 there is
 * no instructor_student table, so this writes an `enrol` row instead (see service).
 */
export class AssignStudentDto {
  @IsNotEmpty()
  student_id!: number;

  @IsOptional()
  course_id?: number;
}
