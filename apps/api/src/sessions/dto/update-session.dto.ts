import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Every field optional on edit — mirrors the legacy free-form edit form.
 * Declared standalone (no PartialType) to avoid an extra @nestjs/mapped-types
 * dependency; field set mirrors CreateSessionDto.
 */
export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(260)
  session_title?: string;
}
