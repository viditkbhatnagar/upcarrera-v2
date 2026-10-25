import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';

const URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true };

/** POST /training-videos (admin). video_url / thumbnail_url must be http(s). */
export class CreateTrainingVideoDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) category?: string;
  @IsOptional() @IsUrl(URL_OPTIONS) @MaxLength(500) video_url?: string;
  @IsOptional() @IsUrl(URL_OPTIONS) @MaxLength(500) thumbnail_url?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) duration_seconds?: number;
  @IsOptional() @Type(() => Number) @IsInt() sort_order?: number;
  @IsOptional() @IsBoolean() status?: boolean;
}

/** PATCH /training-videos/:id (admin): every field optional. */
export class UpdateTrainingVideoDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) category?: string;
  @IsOptional() @IsUrl(URL_OPTIONS) @MaxLength(500) video_url?: string;
  @IsOptional() @IsUrl(URL_OPTIONS) @MaxLength(500) thumbnail_url?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) duration_seconds?: number;
  @IsOptional() @Type(() => Number) @IsInt() sort_order?: number;
  @IsOptional() @IsBoolean() status?: boolean;
}
