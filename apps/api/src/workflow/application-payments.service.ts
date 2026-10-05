import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReadStream } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../files/storage.service';
import { contentTypeFor } from '../files/content-type';
import type { UploadedFileType } from '../files/uploaded-file.type';
import { EmailService } from '../integrations/email.service';
import { EmailTemplatesService } from '../integrations/email-templates.service';
import { AuditService } from './audit.service';
import { RecordAccessService, AccessUser, AccessScope } from './record-access.service';
import { StageEngineService, StageActor } from './stage-engine.service';
import { lmsPaidTo, lmsPaymentMode, normalizeTxnRef, effectiveStage } from './stages';
import { validateProof } from './proof-file';
import { istTodayIso, dateOnly } from './ist-date';
import {
  RecordPaymentDto,
  VerifyPaymentDto,
  MismatchPaymentDto,
  ListApplicationPaymentsDto,
} from './dto/application-payment.dto';

const PROOF_SUBDIR = 'application_payments';
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Pre-conversion registration-fee entries (stages 4-5): the counsellor records a
 * paid fee with proof (fee_pending -> fee_verification), Accounts verifies it
 * (-> sa_verification, mirroring the verified values into the legacy columns) or
 * flags a mismatch (-> fee_pending, releasing the transaction number).
 */
@Injectable()
export class ApplicationPaymentsService {
  private readonly logger = new Logger(ApplicationPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly stageEngine: StageEngineService,
    private readonly audit: AuditService,
    private readonly access: RecordAccessService,
    private readonly email: EmailService,
    private readonly templates: EmailTemplatesService,
  ) {}

  // ---- counsellor records the registration fee -----------------------------

  async record(
    applicationId: number,
    dto: RecordPaymentDto,
    file: UploadedFileType | undefined,
    user: AccessUser,
  ) {
    const { mime } = validateProof(file);
    const proof = file as UploadedFileType;

    const application = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
    });
    if (!application) throw new NotFoundException('Application not found!');

    if (effectiveStage(application) !== 'fee_pending') {
      throw new ConflictException('The application is not awaiting a registration fee.');
    }
    this.assertNotOnHold(application); // CRITIQUE #5: no fee entry on a held application

    // CRITIQUE #5: only the owning counsellor (or Admin) may record the fee.
    const scope = await this.access.assertAction(user, application, 'record_payment');
    const actor = this.actorFor(scope, user);

    // paid_on must not be in the future (IST).
    if (dateOnly(dto.paid_on) > istTodayIso()) {
      throw new BadRequestException('Paid-on date cannot be in the future');
    }

    // CRITIQUE #8: resolve the expected fee from an ACTIVE fee_structure for this
    // application's university/course/intake, when one exists. When it is known, a
    // reason is required if the recorded amount differs; otherwise any amount is
    // accepted (the structure master is not configured for this offering yet).
    const amountExpected = await this.resolveExpectedAmount(application);
    if (
      amountExpected != null &&
      dto.amount !== amountExpected &&
      !dto.amount_change_reason?.trim()
    ) {
      throw new BadRequestException(
        'A reason is required when the amount differs from the expected fee',
      );
    }

    const txnNorm = normalizeTxnRef(dto.txn_ref);
    const proofPath = await this.storage.save(proof.buffer, PROOF_SUBDIR, proof.originalname);

    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const payment = await tx.application_payment.create({
          data: {
            application_id: applicationId,
            fee_kind: 'registration',
            amount_expected: amountExpected,
            amount: dto.amount,
            amount_change_reason: dto.amount_change_reason ?? null,
            paid_to: dto.paid_to,
            payment_mode: dto.payment_mode,
            txn_ref: dto.txn_ref,
            txn_ref_norm: txnNorm,
            txn_ref_active: txnNorm,
            paid_on: new Date(dto.paid_on),
            proof_path: proofPath,
            proof_mime: mime,
            proof_size: proof.size ?? null,
            proof_original_name: proof.originalname ?? null,
            status: 'pending',
            entered_by: actor.userId,
            entered_at: now,
          },
        });

        await this.stageEngine.transition(tx, application, 'record_payment', actor, {
          refTable: 'application_payment',
          refId: payment.id,
        });

        await this.audit.record(tx, {
          action: 'payment_entry',
          entity: 'application_payment',
          entityId: payment.id,
          applicationId,
          field: 'amount',
          newValue: dto.amount,
          actorId: actor.userId,
          actorRoleId: actor.roleId,
          context: { txn_ref: dto.txn_ref, paid_to: dto.paid_to, payment_mode: dto.payment_mode },
        });

        return payment;
      });
    } catch (err) {
      // CRITIQUE #8: the proof was written before the transaction; roll it back so a
      // rejected entry (e.g. a duplicate txn number) leaves no orphaned file on disk.
      await this.storage.delete(proofPath);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Duplicate transaction number');
      }
      throw err;
    }
  }

  /**
   * The expected registration fee for an application from the ACTIVE fee_structure
   * matching its university/course/intake (intake resolved via session_id), or null
   * when any key is missing or no active structure exists (CRITIQUE #8).
   */
  private async resolveExpectedAmount(application: {
    university_id: number | null;
    course_id: number | null;
    session_id: number | null;
  }): Promise<number | null> {
    const { university_id, course_id, session_id } = application;
    if (university_id == null || course_id == null || session_id == null) return null;

    const intake = await this.prisma.intake.findFirst({
      where: { session_id, deleted_at: null },
      select: { id: true },
    });
    if (!intake) return null;

    const fee = await this.prisma.fee_structure.findFirst({
      where: {
        university_id,
        course_id,
        intake_id: intake.id,
        status: 'active',
      },
      select: { registration_fee: true },
    });
    if (!fee || fee.registration_fee == null) return null;
    return Math.round(Number(fee.registration_fee));
  }

  // ---- Accounts queue ------------------------------------------------------

  async queue(query: ListApplicationPaymentsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const and: Prisma.application_paymentWhereInput[] = [
      { status: query.status ?? 'pending', deleted_at: null },
    ];
    if (query.paid_to) and.push({ paid_to: query.paid_to });
    if (query.payment_mode) and.push({ payment_mode: query.payment_mode });
    if (query.date_from) and.push({ paid_on: { gte: new Date(query.date_from) } });
    if (query.date_to) and.push({ paid_on: { lte: new Date(query.date_to) } });

    if (query.search?.trim()) {
      const term = query.search.trim();
      const norm = normalizeTxnRef(term);
      const apps = await this.prisma.applications.findMany({
        where: {
          deleted_at: null,
          OR: [
            { name: { contains: term } },
            { phone: { contains: term } },
            { custom_application_id: { contains: term } },
          ],
        },
        select: { application_id: true },
        take: 200,
      });
      and.push({
        OR: [
          { txn_ref_norm: { contains: norm } },
          { application_id: { in: apps.map((a) => a.application_id) } },
        ],
      });
    }

    const where: Prisma.application_paymentWhereInput = { AND: and };

    const [rows, total] = await Promise.all([
      this.prisma.application_payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.application_payment.count({ where }),
    ]);

    const items = await this.decoratePayments(rows);
    return { items, total, page, limit };
  }

  /** Attach the application display id, applicant, counsellor and a proof URL. */
  private async decoratePayments<T extends { id: number; application_id: number }>(rows: T[]) {
    if (rows.length === 0) return [];
    const appIds = [...new Set(rows.map((r) => r.application_id))];
    const applications = await this.prisma.applications.findMany({
      where: { application_id: { in: appIds } },
      select: {
        application_id: true,
        custom_application_id: true,
        enrollment_id: true,
        name: true,
        phone: true,
        pipeline_user: true,
        created_by: true,
      },
    });
    const appById = new Map(applications.map((a) => [a.application_id, a]));
    const counsellorIds = [
      ...new Set(
        applications
          .map((a) => a.pipeline_user ?? a.created_by)
          .filter((id): id is number => id != null),
      ),
    ];
    const users = counsellorIds.length
      ? await this.prisma.users.findMany({
          where: { id: { in: counsellorIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name ?? null]));

    return rows.map((r) => {
      const app = appById.get(r.application_id);
      const counsellorId = app ? (app.pipeline_user ?? app.created_by ?? null) : null;
      return {
        ...r,
        display_id:
          app?.custom_application_id?.trim() ||
          app?.enrollment_id?.trim() ||
          `APP-${r.application_id}`,
        applicant_name: app?.name ?? null,
        applicant_phone: app?.phone ?? null,
        consultant_id: counsellorId,
        consultant_name: counsellorId != null ? (nameById.get(counsellorId) ?? null) : null,
        proof_url: `/api/application-payments/${r.id}/proof`,
      };
    });
  }

  // ---- proof streaming (never a public path) -------------------------------

  async proofStream(
    paymentId: number,
    user: AccessUser,
  ): Promise<{ stream: ReadStream; filename: string; contentType: string }> {
    const payment = await this.prisma.application_payment.findFirst({
      where: { id: paymentId, deleted_at: null },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const scope = await this.access.scopeFor(user);
    const allowed =
      scope.scope === 'all' ||
      scope.roleKey === 'accounts' ||
      (await this.canSeeParent(scope, payment.application_id));
    if (!allowed) throw new ForbiddenException('Access denied');

    const stream = await this.storage.streamPath(payment.proof_path);
    return {
      stream,
      filename: payment.proof_original_name ?? this.storage.basename(payment.proof_path),
      contentType: payment.proof_mime ?? contentTypeFor(payment.proof_path),
    };
  }

  private async canSeeParent(scope: AccessScope, applicationId: number): Promise<boolean> {
    const app = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
    });
    return app ? this.access.canSee(scope, app) : false;
  }

  // ---- Accounts verifies ---------------------------------------------------

  async verify(paymentId: number, dto: VerifyPaymentDto, user: AccessUser) {
    const payment = await this.loadPending(paymentId);
    const application = await this.loadApplication(payment.application_id);
    this.assertNotOnHold(application); // CRITIQUE #5: no verify on a held application

    // CRITIQUE #5: only Accounts (the fee_verification owner) or Admin may verify.
    const scope = await this.access.assertAction(user, application, 'verify');
    const actor = this.actorFor(scope, user);
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.application_payment.update({
        where: { id: payment.id },
        data: {
          status: 'verified',
          verified_by: actor.userId,
          verified_at: now,
          bank_credit_date: dto.bank_credit_date ? new Date(dto.bank_credit_date) : null,
          verify_note: dto.verify_note ?? null,
          updated_by: actor.userId,
          updated_at: now,
        },
      });

      // Move stage AND mirror the verified values into the legacy LMS columns in
      // one update, using the LMS vocabulary (002 header).
      await this.stageEngine.transition(tx, application, 'verify', actor, {
        refTable: 'application_payment',
        refId: payment.id,
        extraData: {
          amount: Math.round(Number(payment.amount)),
          paid_date: payment.paid_on,
          payment_mode: lmsPaymentMode(payment.payment_mode),
          payment_to: lmsPaidTo(payment.paid_to),
          fee_receipt: payment.txn_ref,
        },
      });

      await this.audit.record(tx, {
        action: 'verify',
        entity: 'application_payment',
        entityId: payment.id,
        applicationId: application.application_id,
        field: 'status',
        oldValue: 'pending',
        newValue: 'verified',
        actorId: actor.userId,
        actorRoleId: actor.roleId,
      });

      return p;
    });

    await this.sendEmail('fee-verified', application, {
      amount: Math.round(Number(payment.amount)),
    });

    return updated;
  }

  // ---- Accounts flags a mismatch -------------------------------------------

  async mismatch(paymentId: number, dto: MismatchPaymentDto, user: AccessUser) {
    const payment = await this.loadPending(paymentId);
    const application = await this.loadApplication(payment.application_id);
    this.assertNotOnHold(application); // CRITIQUE #5: no mismatch on a held application

    // CRITIQUE #5: only Accounts (the fee_verification owner) or Admin may flag it.
    const scope = await this.access.assertAction(user, application, 'mismatch');
    const actor = this.actorFor(scope, user);
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.application_payment.update({
        where: { id: payment.id },
        data: {
          status: 'mismatch',
          txn_ref_active: null, // release the number so it can be re-entered
          mismatch_by: actor.userId,
          mismatch_at: now,
          mismatch_reason: dto.reason,
          updated_by: actor.userId,
          updated_at: now,
        },
      });

      await this.stageEngine.transition(tx, application, 'mismatch', actor, {
        reason: dto.reason,
        refTable: 'application_payment',
        refId: payment.id,
      });

      await this.audit.record(tx, {
        action: 'mismatch',
        entity: 'application_payment',
        entityId: payment.id,
        applicationId: application.application_id,
        field: 'status',
        oldValue: 'pending',
        newValue: 'mismatch',
        reason: dto.reason,
        actorId: actor.userId,
        actorRoleId: actor.roleId,
      });

      return p;
    });

    await this.sendEmail('payment-rejected', application, { reason: dto.reason });
    return updated;
  }

  // ---- helpers -------------------------------------------------------------

  private assertNotOnHold(application: { hold_at: Date | null }): void {
    if (application.hold_at != null) {
      throw new ConflictException('Resume the application before acting on it.');
    }
  }

  private async loadPending(paymentId: number) {
    const payment = await this.prisma.application_payment.findFirst({
      where: { id: paymentId, deleted_at: null },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'pending') {
      throw new ConflictException(`Payment is ${payment.status}, not pending`);
    }
    return payment;
  }

  private async loadApplication(applicationId: number) {
    const application = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
    });
    if (!application) throw new NotFoundException('Application not found!');
    return application;
  }

  private actorFor(scope: AccessScope, user: AccessUser): StageActor {
    const userId = Number(user.userId ?? user.id);
    return {
      userId,
      roleId: scope.roleId,
      onBehalf: scope.scope === 'all',
    };
  }

  /** Fire-and-forget transactional email; never blocks or fails the flow. */
  private async sendEmail(
    key: 'fee-verified' | 'payment-rejected',
    application: { email: string | null; name: string | null; custom_application_id: string | null; application_id: number },
    extra: Record<string, string | number | null | undefined>,
  ): Promise<void> {
    try {
      if (!this.email.isConfigured || !application.email) return;
      const rendered = this.templates.render(key, {
        name: application.name ?? 'Applicant',
        application_id: application.custom_application_id ?? `APP-${application.application_id}`,
        ...extra,
      });
      await this.email.sendEmail({
        to: application.email,
        name: application.name ?? 'Applicant',
        subject: rendered.subject,
        html: rendered.html,
      });
    } catch (err) {
      this.logger.warn(`Email ${key} skipped: ${(err as Error).message}`);
    }
  }
}
