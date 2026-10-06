import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { applications, application_form } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../integrations/email.service';
import { EmailTemplatesService } from '../integrations/email-templates.service';
import { AuditService } from '../workflow/audit.service';
import { RecordAccessService, AccessUser, AccessScope } from '../workflow/record-access.service';
import { StageEngineService } from '../workflow/stage-engine.service';
import { effectiveStage } from '../workflow/stages';
import { ApplicantContext } from './applicant-context';
import { EligibilityService, EligibilityResult } from './eligibility.service';
import { ProgramReferenceService } from './program-reference.service';
import { DocumentChecklistService } from './document-checklist.service';
import { ApplicationProgressService, Progress } from './application-progress.service';
import { MagicLinkService } from './magic-link.service';
import { ApplicationPdfService } from './application-pdf.service';
import { validateStrict } from './strict-validate';
import {
  ContactDataDto,
  EducationDataDto,
  EmploymentDataDto,
  PersonalDataDto,
  QualificationRecordDto,
} from './dto/section-data.dto';
import { ProgramConfirmDto, SubmitApplicationDto } from './dto/public-form.dto';

export type FormSection = 'personal' | 'contact' | 'education' | 'employment';
const WRITABLE_SECTIONS: readonly FormSection[] = ['personal', 'contact', 'education', 'employment'];

const DECLARATION_VERSION = 'v1';

interface SaveContext {
  via: 'applicant' | 'staff';
  actorUserId: number | null;
  actorRoleId: number | null;
  ip: string | null;
  /** applicant complete flag; staff corrections always run full validation. */
  complete: boolean;
}

/**
 * The student form: the public read, per-section saves with write-through to the
 * legacy `applications`/`qualification` columns, program confirm/change, submit,
 * and the staff read / correction / reopen. Every field that has a legacy home is
 * written through so counsellor screens, conversion and the LMS keep reading the
 * columns they already read; the `applications` table is never widened.
 */
@Injectable()
export class ApplicationFormService {
  private readonly logger = new Logger(ApplicationFormService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: EligibilityService,
    private readonly programRef: ProgramReferenceService,
    private readonly checklist: DocumentChecklistService,
    private readonly progress: ApplicationProgressService,
    private readonly magicLinks: MagicLinkService,
    private readonly pdf: ApplicationPdfService,
    private readonly email: EmailService,
    private readonly templates: EmailTemplatesService,
    private readonly audit: AuditService,
    private readonly access: RecordAccessService,
    private readonly stageEngine: StageEngineService,
  ) {}

  // ========================================================================
  // Reads
  // ========================================================================

  /** GET /public/application — everything the form needs for THIS application. */
  async publicRead(applicant: ApplicantContext) {
    const { application, form } = await this.load(applicant.applicationId);
    return this.buildView(application, form, { staff: false, linkId: applicant.linkId });
  }

  /**
   * GET /applications/:id/form — the staff read (adds verification + reopen history).
   * LOW 8: a READ must never WRITE. Legacy applications can lack an application_form
   * row; the staff read now DERIVES an empty form instead of lazily creating one.
   */
  async staffRead(applicationId: number) {
    const { application, form } = await this.loadForRead(applicationId);
    return this.buildView(application, form, { staff: true });
  }

  private async buildView(
    application: applications,
    form: application_form | null,
    opts: { staff: boolean; linkId?: number },
  ) {
    const [program, counsellor, checklist, documents, qualifications, reopenReason, link] =
      await Promise.all([
        this.programRef.resolveProgram(application),
        this.programRef.resolveCounsellor(application),
        this.checklist.resolve(application),
        this.prisma.application_document.findMany({
          where: { application_id: application.application_id, deleted_at: null },
          orderBy: { id: 'asc' },
        }),
        this.prisma.qualification.findMany({
          where: { application_id: application.application_id, deleted_at: null },
          orderBy: { qualification_id: 'asc' },
        }),
        this.latestReopenReason(application.application_id),
        opts.linkId != null
          ? this.prisma.application_magic_link.findUnique({
              where: { id: opts.linkId },
              select: { expires_at: true },
            })
          : Promise.resolve(null),
      ]);

    const progress = await this.progress.compute(application.application_id);
    const employmentRequired = await this.checklist.employmentRequired(application.course_id);

    const docByRequirement = new Map<number, typeof documents>();
    for (const d of documents) {
      if (d.requirement_id == null) continue;
      const list = docByRequirement.get(d.requirement_id) ?? [];
      list.push(d);
      docByRequirement.set(d.requirement_id, list);
    }

    return {
      application_id: application.custom_application_id ?? `APP-${application.application_id}`,
      program: {
        university: program.university,
        course: program.course,
        specialisation: program.specialisation,
        intake: program.intake,
      },
      counsellor: {
        name: counsellor.name,
        email: counsellor.email,
        phone: counsellor.phone,
      },
      sections: {
        personal: {
          name_on_certificate: form?.name_on_certificate ?? null,
          father_guardian_name: form?.father_guardian_name ?? null,
          mother_name: form?.mother_name ?? null,
          category: form?.category ?? null,
          marital_status: form?.marital_status ?? null,
          aadhaar_last4: form?.aadhaar_last4 ?? null,
          dob: application.dob ? application.dob.toISOString().slice(0, 10) : null,
          gender: application.gender,
          nationality: application.nationality ?? null,
          abc_id: application.abc_id,
        },
        contact: {
          email: application.email,
          phone: application.phone, // read-only
          second_phone: application.second_phone,
          whatsapp_no: application.whatsapp_no,
          address: application.address,
          state: application.state,
          district: application.district,
          pin_code: form?.pin_code ?? null,
        },
        education: {
          highest_qualification: form?.highest_qualification ?? null,
          records: qualifications.map((q) => ({
            id: q.qualification_id,
            level_code: q.level_code,
            label: q.qualification,
            institution: q.institution,
            board: q.board,
            passing_year: q.passing_year,
            score_type: q.score_type,
            score_value: q.score_value != null ? Number(q.score_value) : null,
            score_scale: q.score_scale != null ? Number(q.score_scale) : null,
          })),
        },
        employment: employmentRequired
          ? {
              employment_status: form?.employment_status ?? null,
              total_experience_months: form?.total_experience_months ?? null,
              current_employer: form?.current_employer ?? null,
              current_designation: form?.current_designation ?? null,
              employment_history: this.parseHistory(form?.employment_history ?? null),
            }
          : null,
      },
      employment_required: employmentRequired,
      documents: {
        checklist: checklist.map((c) => ({
          requirement_id: c.requirement_id,
          label: c.label,
          is_required: c.is_required,
          max_files: c.max_files,
          help_text: c.help_text,
          files: (docByRequirement.get(c.requirement_id) ?? []).map((d) => this.docView(d, opts.staff)),
        })),
        // Uploads not tied to a resolved requirement (e.g. after a checklist change).
        other: documents
          .filter((d) => d.requirement_id == null || !checklist.some((c) => c.requirement_id === d.requirement_id))
          .map((d) => this.docView(d, opts.staff)),
      },
      eligibility: {
        status: form?.eligibility_status ?? null,
        detail: form?.eligibility_detail ?? null,
      },
      program_change_request: form?.program_change_request ?? null,
      reopen_reason: reopenReason,
      progress,
      row_version: form?.row_version ?? 0,
      link_expires_at: link?.expires_at ?? null,
      ...(opts.staff
        ? {
            declaration_accepted_at: form?.declaration_accepted_at ?? null,
          }
        : {}),
    };
  }

  private docView(
    d: {
      id: number;
      label: string | null;
      original_name: string | null;
      size_bytes: number | null;
      verification_status: string;
      rejection_reason: string | null;
      created_at: Date;
    },
    staff: boolean,
  ) {
    // Never return file_path to any client — files are served only through the
    // scoped download endpoints.
    return {
      id: d.id,
      label: d.label,
      original_name: d.original_name,
      size_bytes: d.size_bytes,
      uploaded_at: d.created_at,
      ...(staff
        ? { verification_status: d.verification_status, rejection_reason: d.rejection_reason }
        : {}),
    };
  }

  // ========================================================================
  // Section saves (public)
  // ========================================================================

  async saveSectionPublic(
    applicant: ApplicantContext,
    section: string,
    body: { data: Record<string, unknown>; complete?: boolean; row_version: number },
    ip: string | null,
  ) {
    const sec = this.assertSection(section);
    const { application, form } = await this.load(applicant.applicationId);
    this.assertRowVersion(form, body.row_version);
    return this.applySection(application, form, sec, body.data, {
      via: 'applicant',
      actorUserId: null,
      actorRoleId: null,
      ip,
      complete: body.complete === true,
    });
  }

  // ========================================================================
  // Section saves (staff correction)
  // ========================================================================

  async staffPatchSection(
    applicationId: number,
    section: string,
    body: { data: Record<string, unknown>; row_version: number },
    user: AccessUser,
  ) {
    const sec = this.assertSection(section);
    const { application, form } = await this.load(applicationId);
    // LOW 8: match allowed_actions — a staff field correction is the 'correct'
    // action, allowed ONLY at counsellor_review (owning counsellor; Admin overrides
    // ownership). This 403s a correction attempted at any other stage, instead of
    // the previous visibility-only check that let an owner edit at e.g. fee_pending
    // or sa_verification.
    const scope = await this.access.assertAction(user, application, 'correct');
    this.assertRowVersion(form, body.row_version);
    return this.applySection(application, form, sec, body.data, {
      via: 'staff',
      actorUserId: Number(user.userId ?? user.id),
      actorRoleId: scope.roleId,
      ip: null,
      complete: true, // a correction always runs full validation
    });
  }

  private async applySection(
    application: applications,
    form: application_form,
    section: FormSection,
    rawData: Record<string, unknown>,
    ctx: SaveContext,
  ) {
    if (section === 'employment') {
      const required = await this.checklist.employmentRequired(application.course_id);
      if (!required) {
        throw new NotFoundException('This course does not collect employment details.');
      }
    }

    const now = new Date();
    const formUpdate: Prisma.application_formUpdateManyMutationInput = {
      updated_via: ctx.via,
      updated_by: ctx.actorUserId,
      updated_at: now,
    };
    const appUpdate: Prisma.applicationsUpdateManyMutationInput = {};
    const diffs: Array<{ field: string; old_value: string | null; new_value: string | null }> = [];

    let eligibility: EligibilityResult | null = null;
    let educationRecords: QualificationRecordDto[] | undefined;

    switch (section) {
      case 'personal':
        this.mapPersonal(rawData, application, form, appUpdate, formUpdate, diffs);
        if (ctx.complete) this.assertRequired('personal', { application, form, appUpdate, formUpdate });
        if (ctx.complete) formUpdate.personal_saved_at = now;
        break;
      case 'contact':
        this.mapContact(rawData, application, form, appUpdate, formUpdate, diffs);
        if (ctx.complete) this.assertRequired('contact', { application, form, appUpdate, formUpdate });
        if (ctx.complete) formUpdate.contact_saved_at = now;
        break;
      case 'education': {
        const dto = validateStrict(EducationDataDto, rawData);
        educationRecords = dto.records;
        if ('highest_qualification' in rawData) {
          formUpdate.highest_qualification = dto.highest_qualification ?? null;
        }
        if (ctx.complete) {
          const highest = dto.highest_qualification ?? form.highest_qualification;
          if (!highest) throw new BadRequestException('Select your highest qualification.');
          if (!educationRecords || educationRecords.length === 0) {
            throw new BadRequestException('Add at least one education record.');
          }
          formUpdate.education_saved_at = now;
        }
        break;
      }
      case 'employment': {
        const dto = validateStrict(EmploymentDataDto, rawData);
        this.mapEmployment(rawData, dto, form, formUpdate, diffs);
        if (ctx.complete) {
          const status = dto.employment_status ?? form.employment_status;
          if (!status) throw new BadRequestException('Select your employment status.');
          formUpdate.employment_saved_at = now;
        }
        break;
      }
    }

    eligibility = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: the form row must still be at the expected row_version.
      const guarded = await tx.application_form.updateMany({
        where: { application_id: application.application_id, row_version: form.row_version },
        data: { ...formUpdate, row_version: { increment: 1 } },
      });
      if (guarded.count === 0) {
        throw new ConflictException('This form was updated in another tab. Reload and try again.');
      }

      if (Object.keys(appUpdate).length) {
        await tx.applications.updateMany({
          where: { application_id: application.application_id },
          data: { ...appUpdate, updated_at: now, updated_by: ctx.actorUserId },
        });
      }

      let elig: EligibilityResult | null = null;
      if (section === 'education') {
        await this.writeQualifications(tx, application.application_id, educationRecords);
      }
      // Recompute on education OR employment: both feed the result now that
      // min_experience_months is enforced (MEDIUM 4). Employment carries no
      // qualification change, so the highest qualification stays as stored.
      if (section === 'education' || section === 'employment') {
        elig = await this.recomputeEligibility(
          tx,
          application,
          (formUpdate.highest_qualification as string | null | undefined) ?? form.highest_qualification,
          now,
        );
      }

      if (diffs.length) {
        await this.audit.recordFieldChanges(
          tx,
          {
            action: ctx.via === 'staff' ? 'form_correct' : 'form_save',
            entity: 'application_form',
            entityId: form.id,
            applicationId: application.application_id,
            actorId: ctx.actorUserId,
            actorRoleId: ctx.actorRoleId,
            actorType: ctx.via === 'staff' ? 'user' : 'applicant',
            ip: ctx.ip,
            context: { section },
          },
          diffs,
        );
      }
      return elig;
    });

    const freshForm = await this.prisma.application_form.findUnique({
      where: { application_id: application.application_id },
      select: { row_version: true, eligibility_status: true, eligibility_detail: true },
    });
    const progress = await this.progress.compute(application.application_id);

    return {
      progress,
      eligibility: eligibility
        ? { status: eligibility.status, detail: eligibility.detail }
        : { status: freshForm?.eligibility_status ?? null, detail: freshForm?.eligibility_detail ?? null },
      row_version: freshForm?.row_version ?? form.row_version + 1,
    };
  }

  // ========================================================================
  // Program confirm / change request
  // ========================================================================

  async confirmProgram(applicant: ApplicantContext, dto: ProgramConfirmDto, ip: string | null) {
    const { application, form } = await this.load(applicant.applicationId);
    if (dto.row_version != null) this.assertRowVersion(form, dto.row_version);
    const now = new Date();

    if (dto.change_request?.trim()) {
      const reason = dto.change_request.trim();
      await this.prisma.$transaction(async (tx) => {
        await tx.application_form.updateMany({
          where: { application_id: application.application_id },
          data: {
            program_change_request: reason,
            program_change_requested_at: now,
            updated_via: 'applicant',
            updated_at: now,
            row_version: { increment: 1 },
          },
        });
        await this.audit.record(tx, {
          action: 'program_change_requested',
          entity: 'application_form',
          entityId: form.id,
          applicationId: application.application_id,
          actorType: 'applicant',
          newValue: reason,
          ip,
        });
        await this.notifyCounsellor(
          tx,
          application,
          'Program change requested',
          `The applicant requested a program change: ${reason}`,
        );
      });
    } else {
      await this.prisma.application_form.updateMany({
        where: { application_id: application.application_id },
        data: {
          program_confirmed_at: now,
          updated_via: 'applicant',
          updated_at: now,
          row_version: { increment: 1 },
        },
      });
    }

    const progress = await this.progress.compute(application.application_id);
    const fresh = await this.prisma.application_form.findUnique({
      where: { application_id: application.application_id },
      select: { row_version: true },
    });
    return { progress, row_version: fresh?.row_version ?? form.row_version + 1 };
  }

  // ========================================================================
  // Submit
  // ========================================================================

  async submit(applicant: ApplicantContext, dto: SubmitApplicationDto, ip: string | null) {
    const { application, form } = await this.load(applicant.applicationId);
    this.assertRowVersion(form, dto.row_version);

    // Server-side completeness: every applicable step done.
    const progress = await this.progress.compute(application.application_id);
    if (progress.completed < progress.total) {
      throw new BadRequestException('Please complete every section before submitting.');
    }
    // Every required document present.
    await this.assertRequiredDocuments(application);
    // Eligibility must not be a hard fail.
    if (form.eligibility_status === 'not_eligible') {
      throw new BadRequestException(
        'Based on the details provided you are not eligible for this course. Please contact your counsellor.',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT application_id FROM applications WHERE application_id = ${application.application_id} FOR UPDATE`,
      );

      // CRITIQUE #1/#20 — consume the link conditionally; exactly one row must flip,
      // otherwise a replay/double-submit is in flight.
      const consumed = await tx.application_magic_link.updateMany({
        where: { id: applicant.linkId, consumed_at: null, revoked_at: null },
        data: { consumed_at: now },
      });
      if (consumed.count !== 1) {
        throw new ConflictException('This application has already been submitted.');
      }

      await tx.application_form.updateMany({
        where: { application_id: application.application_id, row_version: form.row_version },
        data: {
          declaration_accepted_at: now,
          declaration_version: DECLARATION_VERSION,
          declaration_ip: ip,
          updated_via: 'applicant',
          updated_at: now,
          row_version: { increment: 1 },
        },
      });

      // Stage 2 -> 3 as the APPLICANT (null staff actor).
      await this.stageEngine.transition(
        tx,
        application,
        'mark_form_received',
        { userId: null, roleId: null, actorType: 'applicant', ip },
        { refTable: 'application_magic_link', refId: applicant.linkId },
      );

      await this.audit.record(tx, {
        action: 'form_submitted',
        entity: 'applications',
        entityId: application.application_id,
        applicationId: application.application_id,
        actorType: 'applicant',
        ip,
      });
    });

    // After commit: the summary PDF, the submitted email (with PDF), and the
    // counsellor notification — all best-effort, never failing the submit.
    await this.afterSubmit(application.application_id, now);

    return {
      submitted: true,
      application_id: application.custom_application_id ?? `APP-${application.application_id}`,
      submitted_at: now,
    };
  }

  private async afterSubmit(applicationId: number, submittedAt: Date): Promise<void> {
    try {
      const { application, form } = await this.load(applicationId);
      const view = await this.buildView(application, form, { staff: true });
      let pdfBuffer: Buffer | null = null;
      try {
        pdfBuffer = await this.pdf.buildSummary(view);
        // Persist the summary path is best-effort; skip if storage is unavailable.
      } catch (err) {
        this.logger.warn(`Summary PDF failed for ${applicationId}: ${(err as Error).message}`);
      }

      await this.sendSubmittedEmail(application, submittedAt, pdfBuffer);

      await this.notifyCounsellor(
        this.prisma,
        application,
        'Application form submitted',
        `${application.name ?? 'An applicant'} submitted their application form.`,
      );
    } catch (err) {
      this.logger.warn(`Post-submit side effects failed for ${applicationId}: ${(err as Error).message}`);
    }
  }

  private async sendSubmittedEmail(
    application: applications,
    submittedAt: Date,
    pdf: Buffer | null,
  ): Promise<void> {
    try {
      if (!application.email?.trim()) return;
      const baseVars = await this.programRef.emailVars(application);
      const pdfName = `${this.programRef.displayId(application)}.pdf`;
      const rendered = this.templates.render('application-submitted', {
        // Values are passed RAW; render() HTML-escapes every placeholder centrally
        // (SECURITY MEDIUM 2), so there is no double-escaping here.
        ...baseVars,
        submitted_at: new Intl.DateTimeFormat('en-IN', {
          dateStyle: 'medium',
          timeZone: 'Asia/Kolkata',
        }).format(submittedAt),
        pdf_filename: pdfName,
      });
      await this.email.sendEmail({
        to: application.email.trim(),
        name: application.name ?? 'Applicant',
        subject: rendered.subject,
        html: rendered.html,
        saveToSentItems: true,
        attachments: pdf
          ? [{ filename: pdfName, contentType: 'application/pdf', contentBytes: pdf.toString('base64') }]
          : undefined,
      });
    } catch (err) {
      // ERROR, not warn: a render() throw means the submitted-application email was
      // NEVER delivered (a caller/template variable mismatch). Fire-and-forget still
      // (submission already succeeded), but loud so the mismatch is not silent.
      this.logger.error(`Submitted email NOT sent: ${(err as Error).message}`);
    }
  }

  // ========================================================================
  // Reopen (staff)
  // ========================================================================

  async reopen(applicationId: number, reason: string, user: AccessUser) {
    const { application } = await this.load(applicationId);
    const scope = await this.assertStaffReviewable(user, application);
    if (effectiveStage(application) !== 'counsellor_review') {
      throw new ConflictException('Only an application in Counsellor Review can be reopened for the student.');
    }
    if (application.hold_at != null) {
      throw new ConflictException('Resume the application before reopening the form.');
    }
    // Issues a 'reopen' link and, on a confirmed send, moves stage 3 -> 2 with the
    // reason (which the public read surfaces as the student's banner).
    const result = await this.magicLinks.issueForReopen(application, user, scope, reason);
    return { reopened: true, link_id: result.link_id, expires_at: result.expires_at };
  }

  // ========================================================================
  // Mapping helpers
  // ========================================================================

  private mapPersonal(
    rawData: Record<string, unknown>,
    application: applications,
    form: application_form,
    appUpdate: Prisma.applicationsUpdateManyMutationInput,
    formUpdate: Prisma.application_formUpdateManyMutationInput,
    diffs: Array<{ field: string; old_value: string | null; new_value: string | null }>,
  ): void {
    const dto = validateStrict(PersonalDataDto, rawData);
    const setForm = <K extends keyof PersonalDataDto>(key: K, col: keyof application_form, oldVal: unknown) => {
      if (key in rawData) {
        const v = (dto[key] as string | undefined) ?? null;
        (formUpdate as Record<string, unknown>)[col as string] = v;
        diffs.push({ field: col as string, old_value: this.str(oldVal), new_value: this.str(v) });
      }
    };
    setForm('name_on_certificate', 'name_on_certificate', form.name_on_certificate);
    setForm('father_guardian_name', 'father_guardian_name', form.father_guardian_name);
    setForm('mother_name', 'mother_name', form.mother_name);
    setForm('category', 'category', form.category);
    setForm('marital_status', 'marital_status', form.marital_status);
    setForm('aadhaar_last4', 'aadhaar_last4', form.aadhaar_last4);

    if ('dob' in rawData) {
      appUpdate.dob = dto.dob ? new Date(dto.dob) : null;
      diffs.push({ field: 'dob', old_value: this.str(application.dob), new_value: dto.dob ?? null });
    }
    if ('gender' in rawData) {
      appUpdate.gender = dto.gender ?? null;
      diffs.push({ field: 'gender', old_value: this.str(application.gender), new_value: this.str(dto.gender) });
    }
    if ('nationality' in rawData) {
      appUpdate.nationality = dto.nationality ?? null;
      diffs.push({ field: 'nationality', old_value: this.str(application.nationality), new_value: this.str(dto.nationality) });
    }
    if ('abc_id' in rawData) {
      appUpdate.abc_id = dto.abc_id ?? null;
      diffs.push({ field: 'abc_id', old_value: this.str(application.abc_id), new_value: this.str(dto.abc_id) });
    }
  }

  private mapContact(
    rawData: Record<string, unknown>,
    application: applications,
    form: application_form,
    appUpdate: Prisma.applicationsUpdateManyMutationInput,
    formUpdate: Prisma.application_formUpdateManyMutationInput,
    diffs: Array<{ field: string; old_value: string | null; new_value: string | null }>,
  ): void {
    const dto = validateStrict(ContactDataDto, rawData);
    const setApp = (key: keyof ContactDataDto, col: keyof applications, oldVal: unknown) => {
      if (key in rawData) {
        const v = (dto[key] as string | undefined) ?? null;
        (appUpdate as Record<string, unknown>)[col as string] = v;
        diffs.push({ field: col as string, old_value: this.str(oldVal), new_value: this.str(v) });
      }
    };
    // SECURITY MEDIUM 4: email is READ-ONLY (owned at Add Lead), never written
    // from the public/staff form — the DTO omits it, so it can never arrive here.
    setApp('second_phone', 'second_phone', application.second_phone);
    setApp('whatsapp_no', 'whatsapp_no', application.whatsapp_no);
    setApp('address', 'address', application.address);
    setApp('state', 'state', application.state);
    setApp('district', 'district', application.district);
    if ('pin_code' in rawData) {
      formUpdate.pin_code = dto.pin_code ?? null;
      diffs.push({ field: 'pin_code', old_value: this.str(form.pin_code), new_value: this.str(dto.pin_code) });
    }
  }

  private mapEmployment(
    rawData: Record<string, unknown>,
    dto: EmploymentDataDto,
    form: application_form,
    formUpdate: Prisma.application_formUpdateManyMutationInput,
    diffs: Array<{ field: string; old_value: string | null; new_value: string | null }>,
  ): void {
    if ('employment_status' in rawData) {
      formUpdate.employment_status = dto.employment_status ?? null;
      diffs.push({ field: 'employment_status', old_value: this.str(form.employment_status), new_value: this.str(dto.employment_status) });
    }
    if ('total_experience_months' in rawData) {
      formUpdate.total_experience_months = dto.total_experience_months ?? null;
    }
    if ('current_employer' in rawData) {
      formUpdate.current_employer = dto.current_employer ?? null;
    }
    if ('current_designation' in rawData) {
      formUpdate.current_designation = dto.current_designation ?? null;
    }
    if ('employment_history' in rawData) {
      formUpdate.employment_history = dto.employment_history
        ? JSON.stringify(dto.employment_history)
        : null;
    }
  }

  private async writeQualifications(
    tx: Prisma.TransactionClient,
    applicationId: number,
    records: QualificationRecordDto[] | undefined,
  ): Promise<void> {
    if (!records) return; // section save without a records key: leave existing rows

    const existing = await tx.qualification.findMany({
      where: { application_id: applicationId, deleted_at: null },
      select: { qualification_id: true },
    });
    const existingIds = new Set(existing.map((e) => e.qualification_id));
    const keptIds = new Set<number>();
    const now = new Date();

    for (const r of records) {
      // percentage legacy column: ROUND(score) for percentage, NULL for CGPA/grade.
      const legacyPercentage =
        r.score_type === 'percentage' && r.score_value != null ? Math.round(r.score_value) : null;
      const data = {
        application_id: applicationId,
        student_id: 0,
        qualification: r.label ?? r.level_code,
        board: r.board ?? null,
        institution: r.institution ?? null,
        passing_year: r.passing_year ?? null,
        level_code: r.level_code,
        score_type: r.score_type,
        score_value: r.score_value != null ? new Prisma.Decimal(r.score_value) : null,
        score_scale: r.score_scale != null ? new Prisma.Decimal(r.score_scale) : null,
        percentage: legacyPercentage,
      };

      if (r.id != null && existingIds.has(r.id)) {
        await tx.qualification.update({
          where: { qualification_id: r.id },
          data: { ...data, updated_at: now },
        });
        keptIds.add(r.id);
      } else {
        await tx.qualification.create({ data: { ...data, created_at: now } });
      }
    }

    // Removed rows -> legacy INT soft-delete (deleted_at = 1).
    const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
    if (toDelete.length) {
      await tx.qualification.updateMany({
        where: { qualification_id: { in: toDelete } },
        data: { deleted_at: 1, updated_at: now },
      });
    }
  }

  private async recomputeEligibility(
    tx: Prisma.TransactionClient,
    application: applications,
    highestQualification: string | null,
    now: Date,
  ): Promise<EligibilityResult> {
    const [rows, formRow] = await Promise.all([
      tx.qualification.findMany({
        where: { application_id: application.application_id, deleted_at: null },
        select: { level_code: true, score_type: true, score_value: true, score_scale: true },
      }),
      // Read the (possibly just-written) experience inside the same tx so an
      // employment save is evaluated against its own new value (MEDIUM 4).
      tx.application_form.findUnique({
        where: { application_id: application.application_id },
        select: { total_experience_months: true },
      }),
    ]);
    const quals = rows.map((r) => ({
      level_code: r.level_code,
      score_type: r.score_type,
      score_value: r.score_value != null ? Number(r.score_value) : null,
      score_scale: r.score_scale != null ? Number(r.score_scale) : null,
    }));
    const result = await this.eligibility.evaluate(
      application.course_id,
      highestQualification,
      quals,
      undefined,
      formRow?.total_experience_months ?? null,
    );
    await tx.application_form.updateMany({
      where: { application_id: application.application_id },
      data: {
        eligibility_status: result.status,
        eligibility_detail: result.detail,
        eligibility_checked_at: now,
      },
    });
    return result;
  }

  // ========================================================================
  // Shared helpers
  // ========================================================================

  private assertSection(section: string): FormSection {
    if (!WRITABLE_SECTIONS.includes(section as FormSection)) {
      throw new NotFoundException('Unknown form section.');
    }
    return section as FormSection;
  }

  private assertRowVersion(form: application_form, rowVersion: number): void {
    if (form.row_version !== rowVersion) {
      throw new ConflictException('This form was updated in another tab. Reload and try again.');
    }
  }

  private assertRequired(
    section: 'personal' | 'contact',
    state: {
      application: applications;
      form: application_form;
      appUpdate: Prisma.applicationsUpdateManyMutationInput;
      formUpdate: Prisma.application_formUpdateManyMutationInput;
    },
  ): void {
    const merged = (col: string, fromApp: boolean): unknown => {
      const upd = fromApp ? state.appUpdate : state.formUpdate;
      if (col in (upd as Record<string, unknown>)) return (upd as Record<string, unknown>)[col];
      return fromApp
        ? (state.application as unknown as Record<string, unknown>)[col]
        : (state.form as unknown as Record<string, unknown>)[col];
    };
    const requireFields: Array<[string, boolean]> =
      section === 'personal'
        ? [['name_on_certificate', false], ['dob', true], ['gender', true]]
        : [['email', true], ['address', true]];
    for (const [col, fromApp] of requireFields) {
      const v = merged(col, fromApp);
      if (v == null || (typeof v === 'string' && v.trim() === '')) {
        throw new BadRequestException(`Please complete all required fields before marking this section done.`);
      }
    }
  }

  private async assertRequiredDocuments(application: applications): Promise<void> {
    const coverage = await this.checklist.requiredCoverage(
      application.application_id,
      application.course_id,
    );
    if (!coverage.complete) {
      throw new BadRequestException(
        `Please upload every required document (${coverage.missing.length} still needed) before submitting.`,
      );
    }
  }

  private async assertStaffReviewable(user: AccessUser, application: applications): Promise<AccessScope> {
    const scope = await this.access.scopeFor(user);
    if (scope.scope === 'all') return scope;
    if (
      scope.scope === 'owners' &&
      scope.roleKey === 'counsellor' &&
      this.access.canSee(scope, application)
    ) {
      return scope;
    }
    throw new ForbiddenException('Only the owning counsellor or an administrator can do this.');
  }

  private async latestReopenReason(applicationId: number): Promise<string | null> {
    const row = await this.prisma.application_stage_log.findFirst({
      where: { application_id: applicationId, event: 'reopened' },
      orderBy: { id: 'desc' },
      select: { reason: true },
    });
    return row?.reason ?? null;
  }

  private async notifyCounsellor(
    db: PrismaService | Prisma.TransactionClient,
    application: applications,
    title: string,
    message: string,
  ): Promise<void> {
    const userId = application.pipeline_user ?? application.created_by ?? null;
    if (userId == null) return;
    await db.notifications.create({
      data: {
        title,
        description: `${message} (${application.custom_application_id ?? `APP-${application.application_id}`})`,
        user_id: userId,
        created_at: new Date(),
      },
    });
  }

  private parseHistory(raw: string | null): Array<Record<string, string>> {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private str(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  private async load(applicationId: number): Promise<{ application: applications; form: application_form }> {
    const application = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
    });
    if (!application) throw new NotFoundException('Application not found!');
    let form = await this.prisma.application_form.findUnique({
      where: { application_id: applicationId },
    });
    if (!form) {
      form = await this.prisma.application_form.create({
        data: { application_id: applicationId, created_at: new Date() },
      });
    }
    return { application, form };
  }

  /**
   * LOW 8: a NON-creating load for read-only paths. Returns `form: null` when a
   * legacy application has no application_form row, so a GET never writes. buildView
   * derives an empty form from null.
   */
  private async loadForRead(
    applicationId: number,
  ): Promise<{ application: applications; form: application_form | null }> {
    const application = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
    });
    if (!application) throw new NotFoundException('Application not found!');
    const form = await this.prisma.application_form.findUnique({
      where: { application_id: applicationId },
    });
    return { application, form };
  }
}
