import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Body for PATCH /notifications/:id.
 *
 * Ports the editable fields of CI4 App/Controllers/App/Notifications.php::edit()
 * — `title`, `description`, `role_id`, `user_id`. Every field is optional so a
 * partial update only touches the columns supplied (the legacy edit() always
 * wrote all four; here we only write what is present, which is strictly safer).
 *
 * The legacy form posts `description`; we accept the same column name here so
 * the field maps 1:1 (unlike SendNotificationDto, which renames it to
 * `message`). The global ValidationPipe runs with transform:true, so @Type
 * coerces the numeric ids (no per-field ParseIntPipe — matches the codebase
 * style).
 */
export class UpdateNotificationDto {
  @IsOptional()
  @IsString()
  title?: string;

  /** Maps to the legacy `description` column. */
  @IsOptional()
  @IsString()
  description?: string;

  /** Target role id. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  role_id?: number;

  /** Target user id. 0 means a broadcast to all users (the schema default). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  user_id?: number;
}
