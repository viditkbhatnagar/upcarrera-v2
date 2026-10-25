import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';

export const RESOURCE_TYPES = ['Poster', 'PDF', 'Video', 'Presentation', 'eBook'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

const URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true };

/** POST /counsellor-resources (admin). file_url must be http(s). */
export class CreateCounsellorResourceDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(RESOURCE_TYPES) type?: ResourceType;
  @IsOptional() @IsUrl(URL_OPTIONS) @MaxLength(500) file_url?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) file_size_bytes?: number;
  @IsOptional() @Type(() => Number) @IsInt() sort_order?: number;
  @IsOptional() @IsBoolean() status?: boolean;
}

/** PATCH /counsellor-resources/:id (admin): every field optional. */
export class UpdateCounsellorResourceDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(RESOURCE_TYPES) type?: ResourceType;
  @IsOptional() @IsUrl(URL_OPTIONS) @MaxLength(500) file_url?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) file_size_bytes?: number;
  @IsOptional() @Type(() => Number) @IsInt() sort_order?: number;
  @IsOptional() @IsBoolean() status?: boolean;
}
