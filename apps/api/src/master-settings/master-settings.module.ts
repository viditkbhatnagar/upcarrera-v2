import { Module } from '@nestjs/common';
import { MasterSettingsService } from './master-settings.service';
import {
  CourseAdmissionRulesController,
  DocumentRequirementsController,
} from './master-settings.controller';

/**
 * Master Settings (WS6): the admin CRUD that populates the document checklist
 * (document_requirement) and per-course eligibility rules (course_admission_rule)
 * consumed by the SA approve gate and the public application form. PrismaModule is
 * global, so no imports are needed.
 */
@Module({
  controllers: [DocumentRequirementsController, CourseAdmissionRulesController],
  providers: [MasterSettingsService],
})
export class MasterSettingsModule {}
