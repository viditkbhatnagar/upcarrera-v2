import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { CandidatesDocumentsController } from './candidates-documents.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';
import { WorkflowCoreModule } from '../workflow/workflow-core.module';

/**
 * File upload + secure download module.
 *
 * PrismaService comes from the @Global() PrismaModule (see app.module.ts), so
 * it is not re-declared here — mirrors LeadsModule/AuthModule.
 *
 * WorkflowCoreModule supplies RecordAccessService so every student_document
 * write/delete/download route can resolve the owning application/lead and run the
 * SAME record-access check as the students/applications document routes. It
 * depends only on the @Global PrismaModule, so there is no circular dependency
 * (StudentsModule also imports it, and WorkflowModule imports FilesModule).
 *
 * StorageService is exported so other features (e.g. resources, finance
 * invoices) can persist files through the same abstraction later.
 */
@Module({
  imports: [WorkflowCoreModule],
  controllers: [FilesController, CandidatesDocumentsController],
  providers: [FilesService, StorageService],
  exports: [StorageService],
})
export class FilesModule {}
