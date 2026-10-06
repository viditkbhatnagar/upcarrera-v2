import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { fee_structure } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../workflow/audit.service';
import { toCsv, type CsvRow } from '../../reports/reports.csv';
import { canActivate, computeTotals } from './fee-structure.compute';
import {
  type NumericLike,
  parseDurationToContext,
  type PeriodContext,
  paiseToDecimalString,
  pickNextIntakeId,
  SEMESTERS_PER_YEAR,
  toPaise,
} from './fee-structure.money';
import { baseFeeView, decimalToNumber, detailView, type RowDecoration } from './fee-structure.mapper';
import type {
  ActivateFeeStructureDto,
  CopyFeeStructureDto,
  CopyIntakeDto,
  CreateFeeStructureDto,
  ExpireFeeStructureDto,
  ListFeeStructuresDto,
  UpdateFeeStructureDto,
} from './dto/fee-structure.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;
const EXPORT_MAX = 5000;

/** The config fields audited and snapshotted on every save. */
const AUDITED_FIELDS = [
  'currency',
  'registration_fee',
  'course_fee_basis',
  'course_fee_amount',
  'course_fee_periods',
  'course_fee_total',
  'exam_fee',
  'exam_fee_basis',
  'other_fees_total',
  'total_fee',
  'discount_allowed',
  'discount_max_pct',
  'allow_full',
  'allow_per_year',
  'allow_per_semester',
  'allow_custom',
  'notes',
] as const;

/** The normalized column snapshot shape (money as fixed strings), for audit + writes. */
type ColumnData = {
  currency: string;
  registration_fee: string | null;
  course_fee_basis: string | null;
  course_fee_amount: string | null;
  course_fee_periods: number | null;
  course_fee_total: string;
  exam_fee: string | null;
  exam_fee_basis: string | null;
  other_fees_total: string;
  total_fee: string;
  discount_allowed: boolean;
  discount_max_pct: string | null;
  allow_full: boolean;
  allow_per_year: boolean;
  allow_per_semester: boolean;
  allow_custom: boolean;
  notes: string | null;
};

/** A merged config used to recompute totals (numbers, not Decimals). */
interface EffectiveConfig {
  currency?: string | null;
  registration_fee?: number | null;
  course_fee_basis?: string | null;
  course_fee_amount?: number | null;
  course_fee_periods?: number | null;
  exam_fee?: number | null;
  exam_fee_basis?: string | null;
  discount_allowed?: boolean;
  discount_max_pct?: number | null;
  allow_full?: boolean;
  allow_per_year?: boolean;
  allow_per_semester?: boolean;
  allow_custom?: boolean;
  notes?: string | null;
}

interface ComputeItemInput {
  amount: number;
  basis: string;
  label?: string | null;
}

/**
 * The Fee Structure master service (WS2, spec FS01-FS04). Owns the Draft ->
 * Active -> Expired lifecycle, the Rs0 activation guard, copy / bulk-copy,
 * resolve (stage 4) and CSV export. All money math goes through the pure
 * helpers so totals never drift. No @relation in the schema, so names are
 * bulk-resolved by id (one findMany per lookup table, Map by id).
 */
@Injectable()
export class FeeStructuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async list(query: ListFeeStructuresDto) {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [where, whereNoStatus] = await Promise.all([
      this.buildListWhere(query),
      this.buildListWhere({ ...query, status: undefined }),
    ]);
    const orderBy = this.buildOrderBy(query.sort);

    const [rows, total, grouped] = await Promise.all([
      this.prisma.fee_structure.findMany({ where, orderBy, skip, take }),
      this.prisma.fee_structure.count({ where }),
      this.prisma.fee_structure.groupBy({
        by: ['status'],
        where: whereNoStatus,
        _count: { _all: true },
      }),
    ]);

    const counts = { draft: 0, active: 0, expired: 0 };
    for (const g of grouped) {
      if (g.status && g.status in counts) {
        counts[g.status as keyof typeof counts] = g._count._all;
      }
    }

    const items = await this.decorateRows(rows);
    return { items, total, page, limit, counts };
  }

  async detail(id: number) {
    const row = await this.getRow(id);
    const [items, instalments, decoration] = await Promise.all([
      this.loadItems(id),
      this.loadInstalments(id),
      this.resolveDecoration(row),
    ]);
    // FS05: resolve the same duration context the save used, so the displayed
    // breakdown expands per-period fees exactly as the persisted total_fee did.
    // Non-strict: a legacy row with an unparseable duration just falls back.
    const period = await this.resolvePeriodContext(
      row.course_id,
      {
        course_fee_basis: row.course_fee_basis,
        course_fee_periods: row.course_fee_periods,
        course_fee_amount: decimalToNumber(row.course_fee_amount),
        exam_fee: decimalToNumber(row.exam_fee),
        exam_fee_basis: row.exam_fee_basis,
      },
      items.map((it) => ({ amount: decimalToNumber(it.amount) ?? 0, basis: it.basis, label: it.label })),
      { strict: false },
    );
    return detailView(row, items, instalments, decoration, new Date(), period);
  }

  /**
   * The ACTIVE structure for a (university, course, intake), with the fields
   * stage 4 and the student Program section need. Public so AP04's
   * GET /applications/:id/registration-fee can call it after its record-access
   * check (the application->intake bridge is owned by WS3/WS4).
   */
  async resolveActive(universityId: number, courseId: number, intakeId: number) {
    const row = await this.prisma.fee_structure.findFirst({
      where: {
        university_id: universityId,
        course_id: courseId,
        intake_id: intakeId,
        status: 'active',
      },
    });
    if (!row) {
      const [uni, course, intake] = await Promise.all([
        this.prisma.university.findFirst({ where: { id: universityId }, select: { title: true } }),
        this.prisma.course.findFirst({ where: { id: courseId }, select: { title: true } }),
        this.prisma.intake.findFirst({ where: { id: intakeId }, select: { name: true } }),
      ]);
      throw new NotFoundException(
        `No active fee structure for ${uni?.title ?? `university #${universityId}`} / ` +
          `${course?.title ?? `course #${courseId}`} / ${intake?.name ?? `intake #${intakeId}`} — ` +
          'ask an Admin to activate one.',
      );
    }
    const university = await this.prisma.university.findFirst({
      where: { id: universityId },
      select: { fee_collection_model: true },
    });
    return {
      id: row.id,
      code: row.code,
      registration_fee: decimalToNumber(row.registration_fee),
      total_fee: decimalToNumber(row.total_fee),
      currency: row.currency,
      fee_collection_model: university?.fee_collection_model ?? null,
    };
  }

  async exportCsv(query: ListFeeStructuresDto): Promise<string> {
    const where = await this.buildListWhere(query);
    const orderBy = this.buildOrderBy(query.sort);
    const rows = await this.prisma.fee_structure.findMany({ where, orderBy, take: EXPORT_MAX });
    const items = await this.decorateRows(rows);
    const headers = [
      'Code',
      'University',
      'Course',
      'Intake',
      'Intake status',
      'Collection model',
      'Status',
      'Currency',
      'Registration fee',
      'Course fee total',
      'Exam fee',
      'Other fees total',
      'Total fee',
      'Discount allowed',
      'Max discount %',
      'Created',
    ];
    const csvRows: CsvRow[] = items.map((it) => ({
      Code: it.code,
      University: it.university_title,
      Course: it.course_title,
      Intake: it.intake_name,
      'Intake status': it.intake_status,
      'Collection model': it.fee_collection_model,
      Status: it.status,
      Currency: it.currency,
      'Registration fee': it.registration_fee,
      'Course fee total': it.course_fee_total,
      'Exam fee': it.exam_fee,
      'Other fees total': it.other_fees_total,
      'Total fee': it.total_fee,
      'Discount allowed': it.discount_allowed ? 'Yes' : 'No',
      'Max discount %': it.discount_max_pct,
      Created: it.created_at ? new Date(it.created_at).toISOString().slice(0, 10) : '',
    }));
    return toCsv(csvRows, headers);
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async create(dto: CreateFeeStructureDto, userId: number) {
    const { course } = await this.assertKeyRefs(dto.university_id, dto.course_id, dto.intake_id);

    const effItems: ComputeItemInput[] = (dto.items ?? []).map((it) => ({
      amount: it.amount,
      basis: it.basis,
      label: it.label,
    }));
    // FS05: expand per-year / per-semester fees over the course's real duration,
    // not the course-fee basis. Rejects (422) a per-period fee with no resolvable
    // period count instead of silently charging it once.
    const period = await this.resolvePeriodContext(dto.course_id, dto, effItems, {
      strict: true,
      course,
    });
    const courseFeePeriods = this.effectiveCoursePeriods(
      dto.course_fee_basis,
      dto.course_fee_periods,
      period,
    );

    const totals = computeTotals({
      registrationFee: dto.registration_fee,
      courseFeeBasis: dto.course_fee_basis,
      courseFeeAmount: dto.course_fee_amount,
      courseFeePeriods,
      examFee: dto.exam_fee,
      examFeeBasis: dto.exam_fee_basis,
      discountAllowed: dto.discount_allowed,
      discountMaxPct: dto.discount_max_pct,
      items: effItems,
      years: period?.years,
      semesters: period?.semesters,
    });
    const columns = this.columnsFromConfig({ ...dto, course_fee_periods: courseFeePeriods }, totals);
    const now = new Date();

    let createdId: number;
    try {
      createdId = await this.prisma.$transaction(async (tx) => {
        const row = await tx.fee_structure.create({
          data: {
            university_id: dto.university_id,
            course_id: dto.course_id,
            intake_id: dto.intake_id,
            status: 'draft',
            ...columns,
            created_by: userId,
            created_at: now,
            updated_at: now,
          },
        });
        const code = this.codeFor(row.id);
        await tx.fee_structure.update({ where: { id: row.id }, data: { code } });
        await this.writeItems(tx, row.id, dto.items, userId, now);
        await this.writeInstalments(tx, row.id, dto.instalments, userId, now);
        await this.audit.record(tx, {
          action: 'create',
          entity: 'fee_structure',
          entityId: row.id,
          actorId: userId,
          newValue: { code, ...columns },
        });
        return row.id;
      });
    } catch (e) {
      await this.rethrowUnique(e, dto.university_id, dto.course_id, dto.intake_id);
    }
    return this.detail(createdId!);
  }

  async update(id: number, dto: UpdateFeeStructureDto, userId: number) {
    const existing = await this.getRow(id);
    if (existing.status === 'expired') {
      throw new ConflictException(
        'Expired fee structures are read-only — copy it to a new intake instead.',
      );
    }
    const isActive = existing.status === 'active';
    if (isActive && !dto.change_reason?.trim()) {
      throw new UnprocessableEntityException(
        'A change reason is required to edit an active fee structure.',
      );
    }

    const eff = this.mergeConfig(existing, dto);
    const effItems: ComputeItemInput[] =
      dto.items !== undefined
        ? dto.items.map((it) => ({ amount: it.amount, basis: it.basis, label: it.label }))
        : (await this.loadItems(id)).map((it) => ({
            amount: decimalToNumber(it.amount) ?? 0,
            basis: it.basis,
            label: it.label,
          }));

    // FS05: resolve the per-period duration context (422s an unresolvable one).
    const period = await this.resolvePeriodContext(existing.course_id, eff, effItems, {
      strict: true,
    });
    const courseFeePeriods = this.effectiveCoursePeriods(
      eff.course_fee_basis,
      eff.course_fee_periods,
      period,
    );

    const totals = computeTotals({
      registrationFee: eff.registration_fee ?? undefined,
      courseFeeBasis: eff.course_fee_basis,
      courseFeeAmount: eff.course_fee_amount ?? undefined,
      courseFeePeriods,
      examFee: eff.exam_fee ?? undefined,
      examFeeBasis: eff.exam_fee_basis,
      discountAllowed: eff.discount_allowed,
      discountMaxPct: eff.discount_max_pct ?? undefined,
      items: effItems,
      years: period?.years,
      semesters: period?.semesters,
    });

    // HIGH-1: an edit to an ACTIVE structure must leave it fully activatable, not
    // just above ₹0. Re-run the whole activation guard over the merged config, the
    // effective instalments and the university model, and reject if it would no
    // longer activate. (Registration-fee floor intentionally dropped — FS06.)
    if (isActive) {
      if (toPaise(totals.columns.course_fee_total) <= 0) {
        throw new UnprocessableEntityException(
          'Course fee cannot drop to ₹0 on an active fee structure.',
        );
      }
      const university = await this.prisma.university.findFirst({
        where: { id: existing.university_id },
        select: { fee_collection_model: true },
      });
      const effInstalments: Array<{ amount: NumericLike }> =
        dto.instalments !== undefined
          ? dto.instalments.map((i) => ({ amount: i.amount }))
          : (await this.loadInstalments(id)).map((i) => ({ amount: i.amount }));
      const check = canActivate({
        courseFeeTotal: totals.columns.course_fee_total,
        registrationFee: eff.registration_fee ?? 0,
        totalFee: totals.columns.total_fee,
        feeCollectionModel: university?.fee_collection_model ?? null,
        allowFull: eff.allow_full ?? false,
        allowPerYear: eff.allow_per_year ?? false,
        allowPerSemester: eff.allow_per_semester ?? false,
        allowCustom: eff.allow_custom ?? false,
        discountAllowed: eff.discount_allowed ?? false,
        discountMaxPct: eff.discount_max_pct ?? undefined,
        customInstalments: effInstalments,
      });
      if (!check.ok) {
        throw new UnprocessableEntityException(
          `This edit would leave the active fee structure unactivatable: ${check.reasons.join(' ')}`,
        );
      }
    }

    const columns = this.columnsFromConfig({ ...eff, course_fee_periods: courseFeePeriods }, totals);
    const before = this.snapshot(existing);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // MEDIUM-2: re-check the status INSIDE the write as a conditional updateMany,
      // so a PATCH racing an activate/expire cannot edit a row that has since moved
      // out of the status we validated against (0 rows matched -> 409).
      const res = await tx.fee_structure.updateMany({
        where: { id, status: existing.status },
        data: { ...columns, updated_by: userId, updated_at: now },
      });
      if (res.count === 0) {
        throw new ConflictException(
          'This fee structure changed status while you were editing (it was activated or expired). ' +
            'Reload it and try again.',
        );
      }
      if (dto.items !== undefined) await this.writeItems(tx, id, dto.items, userId, now);
      if (dto.instalments !== undefined) {
        await this.writeInstalments(tx, id, dto.instalments, userId, now);
      }
      const changes = this.audit.diff(before, columns, AUDITED_FIELDS);
      await this.audit.recordFieldChanges(
        tx,
        {
          action: 'update',
          entity: 'fee_structure',
          entityId: id,
          actorId: userId,
          reason: dto.change_reason?.trim() ?? null,
        },
        changes,
      );
    });
    return this.detail(id);
  }

  async remove(id: number, userId: number) {
    const existing = await this.getRow(id);
    if (existing.status !== 'draft') {
      throw new ConflictException(
        'Only Draft fee structures can be deleted — expire it instead.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const [items, instalments] = await Promise.all([
        tx.fee_structure_item.findMany({ where: { fee_structure_id: id } }),
        tx.fee_structure_instalment.findMany({ where: { fee_structure_id: id } }),
      ]);
      // MEDIUM-2: delete the parent ONLY while it is still a Draft, as a single
      // conditional statement — a DELETE racing an activate matches 0 rows and 409s
      // (and rolls back) instead of deleting a now-Active row. The parent goes first
      // so the children are never orphaned when the guard fails.
      const del = await tx.fee_structure.deleteMany({ where: { id, status: 'draft' } });
      if (del.count === 0) {
        throw new ConflictException(
          'This fee structure is no longer a Draft (it was activated or expired) — it cannot be deleted.',
        );
      }
      await this.audit.record(tx, {
        action: 'delete',
        entity: 'fee_structure',
        entityId: id,
        actorId: userId,
        oldValue: { ...this.snapshot(existing), code: existing.code, items, instalments },
      });
      await tx.fee_structure_item.deleteMany({ where: { fee_structure_id: id } });
      await tx.fee_structure_instalment.deleteMany({ where: { fee_structure_id: id } });
    });
    return { id, deleted: true };
  }

  /**
   * Draft -> Active. canActivate() runs the full guard first (Rs0, collection
   * model, plans, custom sum, discount). The flip itself is an atomic
   * conditional UPDATE: WHERE status='draft' AND course_fee_total>0 AND
   * registration_fee>0, so two concurrent activates leave exactly ONE winner —
   * the loser's updateMany matches 0 rows and gets a 409.
   */
  async activate(id: number, dto: ActivateFeeStructureDto, userId: number) {
    const existing = await this.getRow(id);
    if (existing.status === 'active') {
      throw new ConflictException('This fee structure is already active.');
    }
    if (existing.status === 'expired') {
      throw new ConflictException('An expired fee structure cannot be re-activated.');
    }

    const check = await this.activationCheck(existing);
    if (!check.ok) throw new UnprocessableEntityException(check.reasons.join(' '));

    const now = new Date();
    // LOW-7: the state flip and its audit row commit together in one transaction.
    // The flip is still the atomic winner-decider (WHERE status='draft' AND
    // course_fee_total>0 — the registration-fee floor is dropped, FS06); when it
    // matches 0 rows the callback returns false and the empty tx is a no-op.
    const won = await this.prisma.$transaction(async (tx) => {
      const res = await tx.fee_structure.updateMany({
        where: { id, status: 'draft', course_fee_total: { gt: 0 } },
        data: { status: 'active', activated_at: now, activated_by: userId, updated_at: now },
      });
      if (res.count === 0) return false;
      await this.audit.record(tx, {
        action: 'activate',
        entity: 'fee_structure',
        entityId: id,
        actorId: userId,
        oldValue: 'draft',
        newValue: 'active',
        reason: dto.note?.trim() ?? null,
      });
      return true;
    });

    if (!won) {
      const fresh = await this.prisma.fee_structure.findUnique({ where: { id } });
      if (!fresh) throw new NotFoundException('Fee structure not found.');
      if (fresh.status !== 'draft') {
        throw new ConflictException(
          'This fee structure was already activated or expired by someone else.',
        );
      }
      const recheck = await this.activationCheck(fresh);
      throw new UnprocessableEntityException(
        recheck.reasons.join(' ') || 'Activation was blocked — please review the fees.',
      );
    }

    return this.detail(id);
  }

  async expire(id: number, dto: ExpireFeeStructureDto, userId: number) {
    const existing = await this.getRow(id);
    if (existing.status === 'expired') {
      throw new ConflictException('This fee structure is already expired.');
    }
    if (existing.status !== 'active') {
      throw new ConflictException('Only an active fee structure can be expired.');
    }
    const now = new Date();
    // MEDIUM-2 / LOW-7: expire ONLY while still active, as a conditional updateMany,
    // with the audit row in the same transaction. A PATCH racing this expire sees
    // the status change (its own guarded write 409s); an expire racing another
    // transition matches 0 rows here and 409s instead of double-expiring.
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.fee_structure.updateMany({
        where: { id, status: 'active' },
        data: { status: 'expired', expired_at: now, expired_by: userId, updated_at: now },
      });
      if (res.count === 0) {
        throw new ConflictException(
          'This fee structure is no longer active (it was changed by someone else) — it cannot be expired.',
        );
      }
      await this.audit.record(tx, {
        action: 'expire',
        entity: 'fee_structure',
        entityId: id,
        actorId: userId,
        oldValue: 'active',
        newValue: 'expired',
        reason: dto.reason?.trim() ?? null,
      });
    });
    return this.detail(id);
  }

  async copy(id: number, dto: CopyFeeStructureDto, userId: number) {
    const source = await this.getRow(id);
    let targetIntakeId = dto.intake_id;
    if (!targetIntakeId) {
      const next = await this.nextIntakeFor(source.intake_id);
      if (!next) {
        throw new UnprocessableEntityException(
          'No later intake found to copy into — pick a target intake.',
        );
      }
      targetIntakeId = next;
    }
    if (targetIntakeId === source.intake_id) {
      throw new ConflictException('Choose a different intake to copy into.');
    }
    const intake = await this.prisma.intake.findFirst({
      where: { id: targetIntakeId, deleted_at: null },
    });
    if (!intake) throw new NotFoundException('Target intake not found.');

    const now = new Date();
    let createdId: number;
    try {
      createdId = await this.prisma.$transaction(async (tx) => {
        const [items, instalments] = await Promise.all([
          tx.fee_structure_item.findMany({
            where: { fee_structure_id: id },
            orderBy: { sort_order: 'asc' },
          }),
          tx.fee_structure_instalment.findMany({
            where: { fee_structure_id: id },
            orderBy: { seq: 'asc' },
          }),
        ]);
        const row = await tx.fee_structure.create({
          data: {
            ...this.copyColumns(source),
            intake_id: targetIntakeId!,
            status: 'draft',
            copied_from_id: source.id,
            created_by: userId,
            created_at: now,
            updated_at: now,
          },
        });
        const code = this.codeFor(row.id);
        await tx.fee_structure.update({ where: { id: row.id }, data: { code } });
        await this.cloneChildren(tx, row.id, items, instalments, userId, now);
        await this.audit.record(tx, {
          action: 'create',
          entity: 'fee_structure',
          entityId: row.id,
          actorId: userId,
          newValue: { code, copied_from_id: source.id, intake_id: targetIntakeId },
          context: { copied_from_id: source.id },
        });
        return row.id;
      });
    } catch (e) {
      await this.rethrowUnique(e, source.university_id, source.course_id, targetIntakeId);
    }
    return this.detail(createdId!);
  }

  /**
   * Bulk copy-to-next-intake. Copies every Active/Expired structure of the
   * source intake that does not yet exist for the target, as a Draft, in one
   * transaction. Idempotent through uq_fee_structure_key plus an in-memory
   * NOT EXISTS guard: a second run creates 0 and skips everything.
   */
  async copyIntake(dto: CopyIntakeDto, userId: number) {
    if (dto.from_intake_id === dto.to_intake_id) {
      throw new ConflictException('Source and target intake must be different.');
    }
    const [from, to] = await Promise.all([
      this.prisma.intake.findFirst({ where: { id: dto.from_intake_id, deleted_at: null } }),
      this.prisma.intake.findFirst({ where: { id: dto.to_intake_id, deleted_at: null } }),
    ]);
    if (!from) throw new NotFoundException('Source intake not found.');
    if (!to) throw new NotFoundException('Target intake not found.');

    const sources = await this.prisma.fee_structure.findMany({
      where: {
        intake_id: dto.from_intake_id,
        status: { in: ['active', 'expired'] },
        ...(dto.university_id ? { university_id: dto.university_id } : {}),
      },
      orderBy: { id: 'asc' },
    });
    const existingTargets = await this.prisma.fee_structure.findMany({
      where: { intake_id: dto.to_intake_id },
      select: { university_id: true, course_id: true },
    });
    const taken = new Set(existingTargets.map((t) => `${t.university_id}:${t.course_id}`));

    const now = new Date();
    const skipped: Array<{ university_id: number; course_id: number; reason: string }> = [];
    const alreadyExists = 'A fee structure already exists for the target intake.';
    let created = 0;

    // LOW-7: each clone is its OWN transaction so one row's failure cannot abort the
    // batch. The in-memory `taken` set is the cheap first pass; a unique-key P2002
    // (a row created by a concurrent run between the check and the insert) is caught
    // per row and recorded as skipped, never surfaced as a 500.
    for (const s of sources) {
      const key = `${s.university_id}:${s.course_id}`;
      if (taken.has(key)) {
        skipped.push({ university_id: s.university_id, course_id: s.course_id, reason: alreadyExists });
        continue;
      }
      try {
        await this.prisma.$transaction(async (tx) => {
          const [items, instalments] = await Promise.all([
            tx.fee_structure_item.findMany({ where: { fee_structure_id: s.id } }),
            tx.fee_structure_instalment.findMany({ where: { fee_structure_id: s.id } }),
          ]);
          const row = await tx.fee_structure.create({
            data: {
              ...this.copyColumns(s),
              intake_id: dto.to_intake_id,
              status: 'draft',
              copied_from_id: s.id,
              created_by: userId,
              created_at: now,
              updated_at: now,
            },
          });
          await tx.fee_structure.update({
            where: { id: row.id },
            data: { code: this.codeFor(row.id) },
          });
          await this.cloneChildren(tx, row.id, items, instalments, userId, now);
        });
        taken.add(key);
        created += 1;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          skipped.push({ university_id: s.university_id, course_id: s.course_id, reason: alreadyExists });
          continue;
        }
        throw e;
      }
    }

    await this.audit.record(this.prisma, {
      action: 'copy_intake',
      entity: 'intake',
      entityId: dto.to_intake_id,
      actorId: userId,
      context: { from_intake_id: dto.from_intake_id, to_intake_id: dto.to_intake_id, created },
    });

    return { created, skipped: await this.decorateSkipped(skipped) };
  }

  /**
   * The next intake after the current one in the deterministic order (start_date,
   * else (year, month), else id), or null. Public for callers/tests. Works even
   * when every intake has a NULL start_date (MEDIUM-3).
   */
  async nextIntakeFor(currentIntakeId: number): Promise<number | null> {
    const current = await this.prisma.intake.findFirst({
      where: { id: currentIntakeId, deleted_at: null },
      select: { id: true },
    });
    if (!current) return null;
    const intakes = await this.prisma.intake.findMany({
      where: { deleted_at: null },
      select: { id: true, start_date: true, year: true, month: true },
    });
    return pickNextIntakeId(intakes, currentIntakeId);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private codeFor(id: number): string {
    return `FEE-${String(id).padStart(5, '0')}`;
  }

  private async getRow(id: number): Promise<fee_structure> {
    const row = await this.prisma.fee_structure.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Fee structure not found.');
    return row;
  }

  private loadItems(id: number) {
    return this.prisma.fee_structure_item.findMany({
      where: { fee_structure_id: id },
      orderBy: { sort_order: 'asc' },
    });
  }

  private loadInstalments(id: number) {
    return this.prisma.fee_structure_instalment.findMany({
      where: { fee_structure_id: id },
      orderBy: { seq: 'asc' },
    });
  }

  private resolvePaging(query: { page?: number; limit?: number }) {
    const page = query.page && query.page > 0 ? query.page : DEFAULT_PAGE;
    const limitRaw = query.limit && query.limit > 0 ? query.limit : DEFAULT_LIMIT;
    const limit = Math.min(limitRaw, MAX_LIMIT);
    return { page, limit, skip: (page - 1) * limit, take: limit };
  }

  private buildOrderBy(sort?: string): Prisma.fee_structureOrderByWithRelationInput {
    switch (sort) {
      case 'created_asc':
        return { created_at: 'asc' };
      case 'total_asc':
        return { total_fee: 'asc' };
      case 'total_desc':
        return { total_fee: 'desc' };
      case 'code_asc':
        return { code: 'asc' };
      case 'code_desc':
        return { code: 'desc' };
      case 'created_desc':
      default:
        return { id: 'desc' };
    }
  }

  private async buildListWhere(query: ListFeeStructuresDto): Promise<Prisma.fee_structureWhereInput> {
    const and: Prisma.fee_structureWhereInput[] = [];
    if (query.status) and.push({ status: query.status });
    if (query.university_id) and.push({ university_id: query.university_id });
    if (query.course_id) and.push({ course_id: query.course_id });
    if (query.intake_id) and.push({ intake_id: query.intake_id });
    if (query.fee_min != null) and.push({ total_fee: { gte: query.fee_min } });
    if (query.fee_max != null) and.push({ total_fee: { lte: query.fee_max } });

    if (query.fee_collection_model) {
      const unis = await this.prisma.university.findMany({
        where: { fee_collection_model: query.fee_collection_model, deleted_at: null },
        select: { id: true },
      });
      and.push({ university_id: { in: unis.length ? unis.map((u) => u.id) : [-1] } });
    }

    const q = query.q?.trim();
    if (q) {
      const [unis, courses] = await Promise.all([
        this.prisma.university.findMany({
          where: { title: { contains: q }, deleted_at: null },
          select: { id: true },
        }),
        this.prisma.course.findMany({
          where: { title: { contains: q }, deleted_at: null },
          select: { id: true },
        }),
      ]);
      const or: Prisma.fee_structureWhereInput[] = [{ code: { contains: q } }];
      if (unis.length) or.push({ university_id: { in: unis.map((u) => u.id) } });
      if (courses.length) or.push({ course_id: { in: courses.map((c) => c.id) } });
      and.push({ OR: or });
    }

    return and.length ? { AND: and } : {};
  }

  private async decorateRows(rows: fee_structure[]) {
    if (rows.length === 0) return [];
    const uniIds = [...new Set(rows.map((r) => r.university_id))];
    const courseIds = [...new Set(rows.map((r) => r.course_id))];
    const intakeIds = [...new Set(rows.map((r) => r.intake_id))];
    const copiedIds = [...new Set(rows.map((r) => r.copied_from_id).filter((x): x is number => x != null))];

    // LOW-9: the row-level activation {ok, reasons} is computed here for the list so
    // the UI can disable an un-activatable Activate action. Only allow_custom rows
    // need their instalments, so they are bulk-loaded in one query (no N+1).
    const customRowIds = rows.filter((r) => r.allow_custom).map((r) => r.id);

    const [unis, courses, intakes, copied, customInstalments] = await Promise.all([
      this.prisma.university.findMany({
        where: { id: { in: uniIds } },
        select: { id: true, title: true, fee_collection_model: true },
      }),
      this.prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true },
      }),
      this.prisma.intake.findMany({
        where: { id: { in: intakeIds } },
        select: { id: true, name: true, start_date: true, closing_date: true, year: true, month: true },
      }),
      copiedIds.length
        ? this.prisma.fee_structure.findMany({
            where: { id: { in: copiedIds } },
            select: { id: true, code: true },
          })
        : Promise.resolve([] as Array<{ id: number; code: string | null }>),
      customRowIds.length
        ? this.prisma.fee_structure_instalment.findMany({
            where: { fee_structure_id: { in: customRowIds } },
            select: { fee_structure_id: true, amount: true },
          })
        : Promise.resolve([] as Array<{ fee_structure_id: number; amount: Prisma.Decimal }>),
    ]);

    const uniMap = new Map(unis.map((u) => [u.id, u]));
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const intakeMap = new Map(intakes.map((i) => [i.id, i]));
    const copiedMap = new Map(copied.map((c) => [c.id, c.code]));
    const instByFee = new Map<number, Array<{ amount: NumericLike }>>();
    for (const ins of customInstalments) {
      const arr = instByFee.get(ins.fee_structure_id) ?? [];
      arr.push({ amount: ins.amount });
      instByFee.set(ins.fee_structure_id, arr);
    }
    const now = new Date();

    return rows.map((row) => {
      const uni = uniMap.get(row.university_id);
      const intake = intakeMap.get(row.intake_id);
      const decoration: RowDecoration = {
        universityTitle: uni?.title ?? null,
        feeCollectionModel: uni?.fee_collection_model ?? null,
        courseTitle: courseMap.get(row.course_id)?.title ?? null,
        intakeName: intake?.name ?? null,
        intakeStartDate: intake?.start_date ?? null,
        intakeClosingDate: intake?.closing_date ?? null,
        intakeYear: intake?.year ?? null,
        intakeMonth: intake?.month ?? null,
        copiedFromCode: row.copied_from_id != null ? (copiedMap.get(row.copied_from_id) ?? null) : null,
      };
      const activation = canActivate({
        courseFeeTotal: row.course_fee_total ?? 0,
        registrationFee: row.registration_fee ?? 0,
        totalFee: row.total_fee ?? 0,
        feeCollectionModel: uni?.fee_collection_model ?? null,
        allowFull: row.allow_full,
        allowPerYear: row.allow_per_year,
        allowPerSemester: row.allow_per_semester,
        allowCustom: row.allow_custom,
        discountAllowed: row.discount_allowed,
        discountMaxPct: row.discount_max_pct ?? undefined,
        customInstalments: instByFee.get(row.id) ?? [],
      });
      return { ...baseFeeView(row, decoration, now), activation };
    });
  }

  private async resolveDecoration(row: fee_structure): Promise<RowDecoration> {
    const [uni, course, intake, copied] = await Promise.all([
      this.prisma.university.findFirst({
        where: { id: row.university_id },
        select: { title: true, fee_collection_model: true },
      }),
      this.prisma.course.findFirst({ where: { id: row.course_id }, select: { title: true } }),
      this.prisma.intake.findFirst({
        where: { id: row.intake_id },
        select: { name: true, start_date: true, closing_date: true, year: true, month: true },
      }),
      row.copied_from_id
        ? this.prisma.fee_structure.findFirst({
            where: { id: row.copied_from_id },
            select: { code: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      universityTitle: uni?.title ?? null,
      feeCollectionModel: uni?.fee_collection_model ?? null,
      courseTitle: course?.title ?? null,
      intakeName: intake?.name ?? null,
      intakeStartDate: intake?.start_date ?? null,
      intakeClosingDate: intake?.closing_date ?? null,
      intakeYear: intake?.year ?? null,
      intakeMonth: intake?.month ?? null,
      copiedFromCode: copied?.code ?? null,
    };
  }

  private async decorateSkipped(
    skipped: Array<{ university_id: number; course_id: number; reason: string }>,
  ) {
    if (skipped.length === 0) return [];
    const uniIds = [...new Set(skipped.map((s) => s.university_id))];
    const courseIds = [...new Set(skipped.map((s) => s.course_id))];
    const [unis, courses] = await Promise.all([
      this.prisma.university.findMany({ where: { id: { in: uniIds } }, select: { id: true, title: true } }),
      this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }),
    ]);
    const uniMap = new Map(unis.map((u) => [u.id, u.title]));
    const courseMap = new Map(courses.map((c) => [c.id, c.title]));
    return skipped.map((s) => ({
      university_id: s.university_id,
      university: uniMap.get(s.university_id) ?? null,
      course_id: s.course_id,
      course: courseMap.get(s.course_id) ?? null,
      reason: s.reason,
    }));
  }

  private async activationCheck(row: fee_structure) {
    const [university, instalments] = await Promise.all([
      this.prisma.university.findFirst({
        where: { id: row.university_id },
        select: { fee_collection_model: true },
      }),
      row.allow_custom ? this.loadInstalments(row.id) : Promise.resolve([]),
    ]);
    return canActivate({
      courseFeeTotal: row.course_fee_total ?? 0,
      registrationFee: row.registration_fee ?? 0,
      totalFee: row.total_fee ?? 0,
      feeCollectionModel: university?.fee_collection_model ?? null,
      allowFull: row.allow_full,
      allowPerYear: row.allow_per_year,
      allowPerSemester: row.allow_per_semester,
      allowCustom: row.allow_custom,
      discountAllowed: row.discount_allowed,
      discountMaxPct: row.discount_max_pct ?? undefined,
      customInstalments: instalments.map((i) => ({ amount: i.amount })),
    });
  }

  private async assertKeyRefs(universityId: number, courseId: number, intakeId: number) {
    const [uni, course, intake] = await Promise.all([
      this.prisma.university.findFirst({ where: { id: universityId, deleted_at: null } }),
      this.prisma.course.findFirst({ where: { id: courseId, deleted_at: null } }),
      this.prisma.intake.findFirst({ where: { id: intakeId, deleted_at: null } }),
    ]);
    if (!uni) throw new NotFoundException('University not found.');
    if (!course) throw new NotFoundException('Course not found.');
    if (!intake) throw new NotFoundException('Intake not found.');

    const belongs =
      course.university_id === universityId ||
      (await this.prisma.university_course.count({
        where: { university_id: universityId, course_id: courseId, deleted_at: null },
      })) > 0;
    if (!belongs) {
      throw new BadRequestException('This course is not tagged to the selected university.');
    }
    return { uni, course, intake };
  }

  /**
   * FS05: the (years, semesters) that per-year / per-semester fees expand over,
   * or undefined when the structure has no per-period component. Prefers an
   * explicit course-fee period count, else parses the course's free-text
   * duration. In `strict` mode (save) an unresolvable duration is a 422; in
   * non-strict mode (display) it returns undefined and the caller falls back to
   * the basis-derived context.
   */
  private async resolvePeriodContext(
    courseId: number,
    cfg: {
      course_fee_basis?: string | null;
      course_fee_periods?: number | null;
      course_fee_amount?: number | null;
      exam_fee?: number | null;
      exam_fee_basis?: string | null;
    },
    items: ComputeItemInput[],
    opts: {
      strict: boolean;
      course?: { duration: string | null; total_duration: string | null } | null;
    },
  ): Promise<PeriodContext | undefined> {
    const perPeriod = (b?: string | null) => b === 'per_year' || b === 'per_semester';
    const courseNeeds = perPeriod(cfg.course_fee_basis) && toPaise(cfg.course_fee_amount) > 0;
    const examNeeds = perPeriod(cfg.exam_fee_basis) && toPaise(cfg.exam_fee) > 0;
    const itemNeeds = items.some((it) => perPeriod(it.basis) && toPaise(it.amount) > 0);
    if (!courseNeeds && !examNeeds && !itemNeeds) return undefined;

    // An explicit course-fee period count wins when the course fee is per-period.
    if (cfg.course_fee_basis === 'per_year' && cfg.course_fee_periods && cfg.course_fee_periods > 0) {
      const years = Math.floor(cfg.course_fee_periods);
      return { years, semesters: years * SEMESTERS_PER_YEAR };
    }
    if (cfg.course_fee_basis === 'per_semester' && cfg.course_fee_periods && cfg.course_fee_periods > 0) {
      const semesters = Math.floor(cfg.course_fee_periods);
      return { years: Math.max(1, Math.ceil(semesters / SEMESTERS_PER_YEAR)), semesters };
    }

    const course =
      opts.course ??
      (await this.prisma.course.findFirst({
        where: { id: courseId },
        select: { duration: true, total_duration: true },
      }));
    const parsed = parseDurationToContext(course?.duration ?? null, course?.total_duration ?? null);
    if (parsed) return parsed;
    if (opts.strict) {
      throw new UnprocessableEntityException(
        'This fee structure has a per-year or per-semester fee, but the course duration could not be ' +
          'determined. Set a course-fee period count, or the course duration (e.g. "2 Years"), before saving.',
      );
    }
    return undefined;
  }

  /**
   * The course-fee period count the course fee is multiplied by: the explicit
   * value when set, else — for a per-period basis — the resolved duration
   * context, so a per-year course fee with no explicit count is not under-charged.
   */
  private effectiveCoursePeriods(
    basis: string | null | undefined,
    periods: number | null | undefined,
    period: PeriodContext | undefined,
  ): number | null {
    if (periods != null && periods > 0) return Math.floor(periods);
    if (period) {
      if (basis === 'per_year') return period.years;
      if (basis === 'per_semester') return period.semesters;
    }
    return basis === 'total' ? 1 : null;
  }

  /** Build the normalized column object from a create/merge config + computed totals. */
  private columnsFromConfig(cfg: EffectiveConfig, totals: ReturnType<typeof computeTotals>): ColumnData {
    return {
      currency: cfg.currency ?? 'INR',
      registration_fee:
        cfg.registration_fee != null ? paiseToDecimalString(toPaise(cfg.registration_fee)) : null,
      course_fee_basis: cfg.course_fee_basis ?? null,
      course_fee_amount:
        cfg.course_fee_amount != null ? paiseToDecimalString(toPaise(cfg.course_fee_amount)) : null,
      course_fee_periods:
        cfg.course_fee_periods ?? (cfg.course_fee_basis === 'total' ? 1 : null),
      course_fee_total: totals.columns.course_fee_total,
      exam_fee: cfg.exam_fee != null ? paiseToDecimalString(toPaise(cfg.exam_fee)) : null,
      exam_fee_basis: cfg.exam_fee_basis ?? null,
      other_fees_total: totals.columns.other_fees_total,
      total_fee: totals.columns.total_fee,
      discount_allowed: cfg.discount_allowed ?? false,
      discount_max_pct: cfg.discount_max_pct != null ? String(Number(cfg.discount_max_pct)) : null,
      allow_full: cfg.allow_full ?? true,
      allow_per_year: cfg.allow_per_year ?? false,
      allow_per_semester: cfg.allow_per_semester ?? false,
      allow_custom: cfg.allow_custom ?? false,
      notes: cfg.notes ?? null,
    };
  }

  /** Normalized snapshot of an existing row, same shape as columnsFromConfig (for audit diff). */
  private snapshot(row: fee_structure): ColumnData {
    return {
      currency: row.currency,
      registration_fee:
        row.registration_fee != null ? paiseToDecimalString(toPaise(row.registration_fee)) : null,
      course_fee_basis: row.course_fee_basis ?? null,
      course_fee_amount:
        row.course_fee_amount != null ? paiseToDecimalString(toPaise(row.course_fee_amount)) : null,
      course_fee_periods: row.course_fee_periods ?? null,
      course_fee_total:
        row.course_fee_total != null ? paiseToDecimalString(toPaise(row.course_fee_total)) : '0.00',
      exam_fee: row.exam_fee != null ? paiseToDecimalString(toPaise(row.exam_fee)) : null,
      exam_fee_basis: row.exam_fee_basis ?? null,
      other_fees_total:
        row.other_fees_total != null ? paiseToDecimalString(toPaise(row.other_fees_total)) : '0.00',
      total_fee: row.total_fee != null ? paiseToDecimalString(toPaise(row.total_fee)) : '0.00',
      discount_allowed: row.discount_allowed,
      discount_max_pct:
        row.discount_max_pct != null ? String(decimalToNumber(row.discount_max_pct)) : null,
      allow_full: row.allow_full,
      allow_per_year: row.allow_per_year,
      allow_per_semester: row.allow_per_semester,
      allow_custom: row.allow_custom,
      notes: row.notes ?? null,
    };
  }

  /** Merge a PATCH DTO over an existing row into a numeric config for recompute. */
  private mergeConfig(existing: fee_structure, dto: UpdateFeeStructureDto): EffectiveConfig {
    return {
      currency: dto.currency ?? existing.currency,
      registration_fee: dto.registration_fee ?? decimalToNumber(existing.registration_fee),
      course_fee_basis: dto.course_fee_basis ?? existing.course_fee_basis,
      course_fee_amount: dto.course_fee_amount ?? decimalToNumber(existing.course_fee_amount),
      course_fee_periods: dto.course_fee_periods ?? existing.course_fee_periods,
      exam_fee: dto.exam_fee ?? decimalToNumber(existing.exam_fee),
      exam_fee_basis: dto.exam_fee_basis ?? existing.exam_fee_basis,
      discount_allowed: dto.discount_allowed ?? existing.discount_allowed,
      discount_max_pct: dto.discount_max_pct ?? decimalToNumber(existing.discount_max_pct),
      allow_full: dto.allow_full ?? existing.allow_full,
      allow_per_year: dto.allow_per_year ?? existing.allow_per_year,
      allow_per_semester: dto.allow_per_semester ?? existing.allow_per_semester,
      allow_custom: dto.allow_custom ?? existing.allow_custom,
      notes: dto.notes ?? existing.notes,
    };
  }

  /** The source columns carried over by copy / copy-intake (everything but the key + lifecycle). */
  private copyColumns(source: fee_structure) {
    return {
      university_id: source.university_id,
      course_id: source.course_id,
      currency: source.currency,
      registration_fee: source.registration_fee,
      course_fee_basis: source.course_fee_basis,
      course_fee_amount: source.course_fee_amount,
      course_fee_periods: source.course_fee_periods,
      course_fee_total: source.course_fee_total,
      exam_fee: source.exam_fee,
      exam_fee_basis: source.exam_fee_basis,
      other_fees_total: source.other_fees_total,
      total_fee: source.total_fee,
      discount_allowed: source.discount_allowed,
      discount_max_pct: source.discount_max_pct,
      allow_full: source.allow_full,
      allow_per_year: source.allow_per_year,
      allow_per_semester: source.allow_per_semester,
      allow_custom: source.allow_custom,
      notes: source.notes,
    };
  }

  private async writeItems(
    tx: Prisma.TransactionClient,
    feeId: number,
    items: CreateFeeStructureDto['items'],
    userId: number,
    now: Date,
  ) {
    await tx.fee_structure_item.deleteMany({ where: { fee_structure_id: feeId } });
    if (items && items.length) {
      await tx.fee_structure_item.createMany({
        data: items.map((it, i) => ({
          fee_structure_id: feeId,
          fee_type_id: it.fee_type_id ?? null,
          label: it.label,
          amount: paiseToDecimalString(toPaise(it.amount)),
          basis: it.basis,
          sort_order: it.sort_order ?? i,
          created_by: userId,
          created_at: now,
        })),
      });
    }
  }

  private async writeInstalments(
    tx: Prisma.TransactionClient,
    feeId: number,
    instalments: CreateFeeStructureDto['instalments'],
    userId: number,
    now: Date,
  ) {
    await tx.fee_structure_instalment.deleteMany({ where: { fee_structure_id: feeId } });
    if (instalments && instalments.length) {
      await tx.fee_structure_instalment.createMany({
        data: instalments.map((ins) => ({
          fee_structure_id: feeId,
          seq: ins.seq,
          label: ins.label ?? null,
          amount: paiseToDecimalString(toPaise(ins.amount)),
          due_offset_days: ins.due_offset_days,
          created_by: userId,
          created_at: now,
        })),
      });
    }
  }

  private async cloneChildren(
    tx: Prisma.TransactionClient,
    feeId: number,
    items: Array<{ fee_type_id: number | null; label: string; amount: Prisma.Decimal; basis: string; sort_order: number }>,
    instalments: Array<{ seq: number; label: string | null; amount: Prisma.Decimal; due_offset_days: number }>,
    userId: number,
    now: Date,
  ) {
    if (items.length) {
      await tx.fee_structure_item.createMany({
        data: items.map((it) => ({
          fee_structure_id: feeId,
          fee_type_id: it.fee_type_id,
          label: it.label,
          amount: it.amount,
          basis: it.basis,
          sort_order: it.sort_order,
          created_by: userId,
          created_at: now,
        })),
      });
    }
    if (instalments.length) {
      await tx.fee_structure_instalment.createMany({
        data: instalments.map((ins) => ({
          fee_structure_id: feeId,
          seq: ins.seq,
          label: ins.label,
          amount: ins.amount,
          due_offset_days: ins.due_offset_days,
          created_by: userId,
          created_at: now,
        })),
      });
    }
  }

  private async rethrowUnique(
    e: unknown,
    universityId: number,
    courseId: number,
    intakeId: number,
  ): Promise<never> {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await this.prisma.fee_structure.findFirst({
        where: { university_id: universityId, course_id: courseId, intake_id: intakeId },
        select: { id: true, code: true },
      });
      throw new ConflictException(
        'A fee structure already exists for this university, course and intake' +
          (existing ? ` (${existing.code ?? `#${existing.id}`})` : ''),
      );
    }
    throw e;
  }
}
