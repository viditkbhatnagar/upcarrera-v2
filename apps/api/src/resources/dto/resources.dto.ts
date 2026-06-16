import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Query / body DTOs for the resources (folders + files) endpoints.
 *
 * SCHEMA-MAPPING NOTE (read with resources.service.ts):
 * The legacy CI4 `folders` and `files` tables are ABSENT from schema.prisma.
 * Per the migration brief, folders are backed by `resource_category` and files
 * by `resources`. Because those Prisma models lack the legacy `parent_id`,
 * `user_type`, `folder_id` and `size` columns, we faithfully adapt:
 *   - folder.parent_id + folder.user_type  -> JSON-encoded into
 *     resource_category.description (the only free-text column available)
 *   - file -> a `resources` row whose resource_category_id IS the folder link
 *   - file.user_type -> encoded alongside the path (no dedicated column)
 *   - file.size -> NOT persisted (no column); echoed back in the upload
 *     response only, mirroring the legacy `size` field for the client.
 *
 * All numeric query params use @Type(() => Number) + @IsOptional() so the global
 * ValidationPipe (transform: true) coerces them — NO per-param ParseIntPipe,
 * matching finance/list.dto.ts.
 */

/** Root listing = folder_id absent (or 0). A value drills into that folder. */
export class ListFoldersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  folder_id?: number;

  /**
   * Legacy `user_type`: '1' = client, '2' = consultant. Kept as a string to
   * preserve the legacy stored representation exactly. Optional — when absent
   * the listing is not scoped by audience (admin view).
   */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  user_type?: string;
}

export class CreateFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  /** Parent folder id; 0 / omitted means a root-level folder. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  parent_id?: number;

  /** Legacy audience flag ('1' client / '2' consultant). Defaults to '1'. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  user_type?: string;
}

export class RenameFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;
}

export class CreateFileDto {
  /** Folder the file belongs to; 0 / omitted means a root-level file. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  folder_id?: number;

  /** Legacy audience flag ('1' client / '2' consultant). Defaults to '1'. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  user_type?: string;
}
