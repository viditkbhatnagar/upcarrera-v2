import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { WorkflowCoreModule } from '../workflow/workflow-core.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { FilesModule } from '../files/files.module';
import { applicantThrottlers } from './throttler/applicant-throttle';
import { ApplicantThrottlerGuard } from './throttler/applicant-throttler.guard';
import { ApplicantConfig } from './applicant-config';
import { ApplicantSessionService } from './applicant-session.service';
import { ApplicantSessionGuard } from './applicant-session.guard';
import { PublicSessionService } from './public-session.service';
import { EligibilityService } from './eligibility.service';
import { DocumentChecklistService } from './document-checklist.service';
import { ApplicationProgressService } from './application-progress.service';
import { MagicLinkService } from './magic-link.service';
import { ApplicationFormService } from './application-form.service';
import { ApplicationDocumentsService } from './application-documents.service';
import { ApplicationPdfService } from './application-pdf.service';
import { ApplicantLookupsService } from './applicant-lookups.service';
import { ApplicantSessionController } from './controllers/applicant-session.controller';
import { ApplicantPublicController } from './controllers/applicant-public.controller';
import { ApplicationsFormController } from './controllers/applications-form.controller';

/**
 * WS5 (AP03) — magic link + the public student application form.
 *
 * ThrottlerModule.forRoot registers NAMED throttlers (it is @Global, so its
 * storage/options are available to ApplicantThrottlerGuard) but the guard is
 * applied ONLY on the public applicant controllers, never as an APP_GUARD, so the
 * rest of the API is untouched. JwtModule.register({}) gives a JwtService used
 * ONLY for the applicant session (secret passed per-call), separate from the
 * staff JWT. WorkflowCoreModule supplies record-access / stage-engine / audit, and
 * the ApplicationAccessGuard the staff controller uses; FilesModule supplies the
 * StorageService; IntegrationsModule supplies the Graph email + templates.
 */
@Module({
  imports: [
    WorkflowCoreModule,
    IntegrationsModule,
    FilesModule,
    JwtModule.register({}),
    ThrottlerModule.forRoot(applicantThrottlers),
  ],
  controllers: [
    ApplicantSessionController,
    ApplicantPublicController,
    ApplicationsFormController,
  ],
  providers: [
    ApplicantConfig,
    ApplicantSessionService,
    ApplicantSessionGuard,
    ApplicantThrottlerGuard,
    PublicSessionService,
    EligibilityService,
    DocumentChecklistService,
    ApplicationProgressService,
    MagicLinkService,
    ApplicationFormService,
    ApplicationDocumentsService,
    ApplicationPdfService,
    ApplicantLookupsService,
  ],
})
export class ApplicantModule {}
