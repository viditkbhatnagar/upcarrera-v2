import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResourcesService } from './resources.service';
import {
  CreateFileDto,
  CreateFolderDto,
  ListFoldersDto,
  RenameFolderDto,
} from './dto/resources.dto';
import { UploadedFileType } from '../files/uploaded-file.type';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Resources browser — folders + files. Port of App/Controllers/App/Resources.php.
 *
 * Backed by resource_category (folders) and resources (files); see
 * resources.service.ts for the full legacy-table -> Prisma-model mapping.
 *
 * All routes sit behind the global JwtAuthGuard (no @Public). The
 * {status,message,data} envelope is applied automatically by ResponseInterceptor.
 * `:id` routes live under distinct literal sub-paths (folders/ , files/), so
 * there is no literal-vs-:id ordering conflict.
 */
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  // ---- folders -------------------------------------------------------------

  @Get('folders')
  listFolders(@Query() query: ListFoldersDto) {
    return this.resources.listFolders(query);
  }

  @Post('folders')
  @ResponseMessage('Folder added successfully!')
  createFolder(
    @Body() dto: CreateFolderDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.resources.createFolder(dto, userId);
  }

  @Patch('folders/:id')
  @ResponseMessage('Folder renamed successfully!')
  renameFolder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameFolderDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.resources.renameFolder(id, dto, userId);
  }

  @Delete('folders/:id')
  @ResponseMessage('Folder Deleted Successfully!')
  deleteFolder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.resources.deleteFolder(id, userId);
  }

  // ---- files ---------------------------------------------------------------

  @Post('files')
  @ResponseMessage('File uploaded successfully!')
  @UseInterceptors(FileInterceptor('file'))
  createFile(
    @Body() dto: CreateFileDto,
    @UploadedFile() file: UploadedFileType,
    @CurrentUser('id') userId: number,
  ) {
    return this.resources.createFile(dto, userId, file);
  }

  @Delete('files/:id')
  @ResponseMessage('File Deleted Successfully!')
  deleteFile(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.resources.deleteFile(id, userId);
  }
}
