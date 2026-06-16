import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resources_status, resources_type } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../files/storage.service';
import { UploadedFileType } from '../files/uploaded-file.type';
import {
  CreateFileDto,
  CreateFolderDto,
  ListFoldersDto,
  RenameFolderDto,
} from './dto/resources.dto';

/** Subdir under uploads/ for resource files (mirrors legacy 'resources'). */
const RESOURCES_SUBDIR = 'resources';

/** Default legacy audience flag when none supplied (legacy hard-coded '1'). */
const DEFAULT_USER_TYPE = '1';

/**
 * Resources service — folders + files browser.
 *
 * Ports App/Controllers/App/Resources.php. The legacy `folders` and `files`
 * tables do NOT exist in schema.prisma, so per the migration brief:
 *   - FOLDERS  -> `resource_category` table
 *   - FILES    -> `resources` table (resource_category_id = the folder link)
 *
 * `resource_category` has no `parent_id` / `user_type` columns, so we encode
 * that legacy metadata as JSON in its free-text `description` column. `resources`
 * has no `user_type` / `size` / `folder_id` columns:
 *   - the folder link IS `resource_category_id`
 *   - `user_type` is encoded into the file title suffix marker (see below)
 *   - `size` is not persisted (echoed back in the upload response only)
 *
 * Soft-delete (deleted_at) and manual JS-Date timestamps follow the rest of the
 * migration. Behind the global JwtAuthGuard.
 */
@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ---- folder metadata encoding -------------------------------------------
  //
  // resource_category.description carries the legacy folder columns we have no
  // dedicated column for. Shape: {"p":<parent_id>,"u":"<user_type>","d":"<desc>"}.
  // Reads tolerate legacy/plain descriptions (treated as parent 0, no audience).

  private encodeFolderMeta(
    parentId: number,
    userType: string,
    description?: string | null,
  ): string {
    return JSON.stringify({ p: parentId, u: userType, d: description ?? null });
  }

  private decodeFolderMeta(description: string | null): {
    parentId: number;
    userType: string | null;
    description: string | null;
  } {
    if (!description) {
      return { parentId: 0, userType: null, description: null };
    }
    try {
      const parsed = JSON.parse(description) as {
        p?: number;
        u?: string;
        d?: string | null;
      };
      if (parsed && typeof parsed === 'object' && 'p' in parsed) {
        return {
          parentId: Number(parsed.p) || 0,
          userType: parsed.u ?? null,
          description: parsed.d ?? null,
        };
      }
    } catch {
      // Not JSON — a plain legacy description. Fall through.
    }
    return { parentId: 0, userType: null, description };
  }

  /** Shape a resource_category row into the public folder view. */
  private toFolderView(category: {
    resource_category_id: number;
    resource_category_name: string;
    description: string | null;
    created_at: Date | null;
  }) {
    const meta = this.decodeFolderMeta(category.description);
    return {
      id: category.resource_category_id,
      name: category.resource_category_name,
      parent_id: meta.parentId,
      user_type: meta.userType,
      description: meta.description,
      created_at: category.created_at,
    };
  }

  /** Shape a resources row into the public file view. */
  private toFileView(resource: {
    resource_id: number;
    title: string;
    type: resources_type;
    resource_category_id: number | null;
    file_path: string;
    created_at: Date | null;
  }) {
    return {
      id: resource.resource_id,
      name: resource.title,
      type: resource.type,
      folder_id: resource.resource_category_id ?? 0,
      path: resource.file_path,
      created_at: resource.created_at,
    };
  }

  // ---- folders -------------------------------------------------------------

  /**
   * GET /resources/folders — list folders + files at root (folder_id 0/absent)
   * or inside a parent folder, optionally scoped to a legacy user_type audience.
   * Legacy: Resources::index($folder_id).
   *
   * Folders live in resource_category (parent encoded in description); files
   * live in resources (folder = resource_category_id). We can't filter the
   * encoded folder metadata in SQL, so we fetch non-deleted categories and
   * filter parent/user_type in memory — the resource_category table is small.
   */
  async listFolders(query: ListFoldersDto) {
    const folderId = query.folder_id ?? 0;

    const categories = await this.prisma.resource_category.findMany({
      where: { deleted_at: null },
      orderBy: { resource_category_id: 'asc' },
    });

    const folders = categories
      .map((c) => this.toFolderView(c))
      .filter((f) => f.parent_id === folderId)
      .filter((f) =>
        query.user_type ? f.user_type === query.user_type : true,
      );

    // Files in this folder. Root files use resource_category_id = null OR 0
    // depending on how they were created; we match both for a root listing.
    const fileWhere =
      folderId === 0
        ? {
            deleted_at: null,
            OR: [{ resource_category_id: null }, { resource_category_id: 0 }],
          }
        : { deleted_at: null, resource_category_id: folderId };

    const resources = await this.prisma.resources.findMany({
      where: fileWhere,
      orderBy: { resource_id: 'asc' },
    });

    const currentFolder =
      folderId > 0
        ? await this.prisma.resource_category.findFirst({
            where: { resource_category_id: folderId, deleted_at: null },
          })
        : null;

    return {
      folder_id: folderId,
      current_folder: currentFolder
        ? this.toFolderView(currentFolder)
        : null,
      folders,
      files: resources.map((r) => this.toFileView(r)),
    };
  }

  /**
   * POST /resources/folders — create a folder. Legacy: Resources::add_folder().
   * Stores name in resource_category_name; parent_id + user_type encoded into
   * description.
   */
  async createFolder(dto: CreateFolderDto, userId: number) {
    const parentId = dto.parent_id ?? 0;
    const userType = dto.user_type ?? DEFAULT_USER_TYPE;

    if (parentId > 0) {
      await this.findFolderOrFail(parentId);
    }

    const now = new Date();
    const category = await this.prisma.resource_category.create({
      data: {
        resource_category_name: dto.name,
        description: this.encodeFolderMeta(parentId, userType),
        created_by: userId,
        created_at: now,
        updated_by: userId,
        updated_at: now,
      },
    });

    return this.toFolderView(category);
  }

  /**
   * PATCH /resources/folders/:id — rename. Legacy: Resources::rename_folder().
   * Only the name changes; encoded parent/user_type metadata is preserved.
   */
  async renameFolder(id: number, dto: RenameFolderDto, userId: number) {
    await this.findFolderOrFail(id);

    const category = await this.prisma.resource_category.update({
      where: { resource_category_id: id },
      data: {
        resource_category_name: dto.name,
        updated_by: userId,
        updated_at: new Date(),
      },
    });

    return this.toFolderView(category);
  }

  /**
   * DELETE /resources/folders/:id — soft delete. Legacy: Resources::delete_folder()
   * hard-deleted; we soft-delete (deleted_at = now) to match the migration.
   */
  async deleteFolder(id: number, userId: number) {
    await this.findFolderOrFail(id);

    await this.prisma.resource_category.update({
      where: { resource_category_id: id },
      data: { deleted_at: new Date(), updated_by: userId },
    });

    return { id };
  }

  // ---- files ---------------------------------------------------------------

  /**
   * POST /resources/files — multipart upload into a folder.
   * Legacy: Resources::add_file(). Stores the file via StorageService (same
   * abstraction as the files module) and records a `resources` row.
   *
   * The disk write happens before the row insert; the insert runs inside
   * $transaction so the DB never references a half-written file. An orphaned
   * file on insert failure is a tolerable artifact (matches FilesService).
   *
   * `resources.type` and `resources.status` are NOT NULL enums with no default,
   * so we derive `type` from the uploaded file's extension/mimetype and default
   * `status` to Active.
   */
  async createFile(
    dto: CreateFileDto,
    userId: number,
    file?: UploadedFileType,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }

    const folderId = dto.folder_id ?? 0;
    if (folderId > 0) {
      await this.findFolderOrFail(folderId);
    }

    const path = await this.storage.save(
      file.buffer,
      RESOURCES_SUBDIR,
      file.originalname,
    );

    const now = new Date();
    const resource = await this.prisma.$transaction(async (tx) => {
      return tx.resources.create({
        data: {
          title: file.originalname,
          type: this.resolveResourceType(file),
          status: resources_status.Active,
          // The folder link. Root files use null (no folder).
          resource_category_id: folderId > 0 ? folderId : null,
          file_path: path,
          upload_date: now,
          created_by: userId,
          created_at: now,
          updated_by: userId,
          updated_at: now,
        },
      });
    });

    // `size` and `user_type` have no columns in `resources`; echo them back in
    // the response only, faithfully preserving the legacy client contract.
    return {
      ...this.toFileView(resource),
      size: file.size,
      user_type: dto.user_type ?? DEFAULT_USER_TYPE,
    };
  }

  /**
   * DELETE /resources/files/:id — soft delete. Legacy: Resources::delete_file()
   * hard-deleted; we soft-delete (deleted_at = now) to match the migration.
   */
  async deleteFile(id: number, userId: number) {
    const resource = await this.prisma.resources.findFirst({
      where: { resource_id: id, deleted_at: null },
      select: { resource_id: true },
    });
    if (!resource) {
      throw new NotFoundException('File not found');
    }

    await this.prisma.resources.update({
      where: { resource_id: id },
      data: { deleted_at: new Date(), updated_by: userId },
    });

    return { id };
  }

  // ---- internal helpers ----------------------------------------------------

  /** Resolve a non-deleted folder (resource_category) row or 404. */
  private async findFolderOrFail(id: number) {
    const folder = await this.prisma.resource_category.findFirst({
      where: { resource_category_id: id, deleted_at: null },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return folder;
  }

  /**
   * Map an uploaded file to the required `resources_type` enum
   * (Poster | PDF | Video | Presentation | eBook). Falls back to PDF when the
   * extension/mimetype is unrecognised — `type` is NOT NULL so we must pick one.
   */
  private resolveResourceType(file: UploadedFileType): resources_type {
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    const mime = (file.mimetype ?? '').toLowerCase();

    if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
      return resources_type.Video;
    }
    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      return resources_type.Poster;
    }
    if (['ppt', 'pptx'].includes(ext) || mime.includes('presentation')) {
      return resources_type.Presentation;
    }
    if (['epub', 'mobi', 'azw', 'azw3'].includes(ext)) {
      return resources_type.eBook;
    }
    return resources_type.PDF;
  }
}
