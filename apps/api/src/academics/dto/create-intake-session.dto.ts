import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * POST /intakes/sessions and PATCH /intakes/sessions/:id — an intake in the
 * master list applications and students are filed under (`sessions` table,
 * whose only business column is session_title). The title is trimmed and must
 * not be blank; the service rejects a title another live intake already uses
 * (case- and whitespace-insensitive) with 409.
 */
export class CreateIntakeSessionDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Intake name is required' })
  @MaxLength(260)
  session_title!: string;
}
