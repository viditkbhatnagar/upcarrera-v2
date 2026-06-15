import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Body for POST /notifications/send.
 *
 * Targets a notification at a single user (`user_id`), a whole role
 * (`role_id`), or both. Ports the fields written by CI4
 * App/Controllers/App/Notifications.php::add() — `title`, `description`,
 * `role_id`, `user_id` — and adds an opt-in `email` flag for an extra
 * transactional email to the target user.
 */
export class SendNotificationDto {
  /** Target user id. 0 (the schema default) means a broadcast to all users. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  user_id?: number;

  /** Target role id. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  role_id?: number;

  @IsString()
  @IsNotEmpty()
  title!: string;

  /** Stored in the `description` column (legacy field name). */
  @IsString()
  @IsNotEmpty()
  message!: string;

  /** When true, also send a transactional email to the target user. */
  @IsOptional()
  @IsBoolean()
  email?: boolean;
}
