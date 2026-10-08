import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../files/storage.service';
import { canonicalCourseLevel } from '../workflow/stages';
import { deriveIntakeStatus } from '../finance/fee-structures/fee-structure.money';
import { normalizeIndianMobile } from '../students/indian-mobile';
import {
  assertApplicationReferences,
  resolveApplicationIntake,
} from '../students/application-references';
import type { UploadedFileType } from '../files/uploaded-file.type';
import type { PublicApplicationDto } from './dto/public-application.dto';

const OFFERING_ACTIVE = 1;
const LEAD_SOURCE = 'Online Application';
const DECLARATION_VERSION = '1.0';
const UPLOAD_SUBDIR = 'online-applications';
const DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB per file
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 30 MB per submission (H1)
const MAX_FILES = 12; // per submission (H1)
// Per-IP submit throttle (H2) — in-memory; PM2 runs a single fork so one map suffices.
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const SUBMIT_MAX_PER_IP = 8;

const SNIFF: Array<{ mime: 'application/pdf' | 'image/jpeg' | 'image/png'; ext: string; test: (b: Buffer) => boolean }> = [
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.length >= 5 && b.toString('latin1', 0, 5) === '%PDF-' },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
];
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  return SNIFF.find((s) => s.test(buf)) ?? null;
}

const MARITAL_MAP: Record<string, string> = { single: 'single', married: 'married', divorced: 'other', widowed: 'other' };
const EMPLOYMENT_MAP: Record<string, string> = {
  'employed – full time': 'employed', 'employed - full time': 'employed',
  'employed – part time': 'employed', 'employed - part time': 'employed',
  freelancer: 'self_employed', 'self-employed / business': 'self_employed', 'self-employed': 'self_employed',
  student: 'unemployed', 'currently unemployed': 'unemployed', homemaker: 'unemployed', retired: 'unemployed',
};
const QUAL_MAP: Record<string, string> = {
  'ph.d': 'doctorate', phd: 'doctorate', "master's degree": 'pg', masters: 'pg',
  "bachelor's degree": 'ug', bachelors: 'ug', '12th standard': '12th', '10th standard': '10th',
};

export interface CatalogueIntake { id: number; name: string }
export interface CatalogueCourse { id: number; name: string; document_group: string | null; intakes: CatalogueIntake[] }
export interface CatalogueUniversity { id: number; name: string; courses: CatalogueCourse[] }
export interface DocumentRule {
  slot: string; document_type_id: number; label: string; required: boolean;
  applies_when: string | null; max_files: number; help_text: string | null;
}
export interface CataloguePayload { universities: CatalogueUniversity[]; document_rules: Record<string, DocumentRule[]> }
interface RequiredDoc { requirement_id: number; document_type_id: number; label: string }
interface DocPolicy { required: RequiredDoc[]; maxByType: Map<number, number>; labelByType: Map<number, string> }
interface SavedFile {
  slot: string; path: string; sha256: string; mime: string;
  size: number; originalName: string | null; documentTypeId: number | null;
  requirementId: number | null; label: string;
}

/**
 * Self-serve public application intake (online admission funnel), separate from the
 * counsellor magic-link flow. Catalogue (read-only) + a create endpoint that mints an
 * UNASSIGNED lead (source="Online Application", stage lead_added, APP-YYYY-NNNNNN).
 * Hardened per security review: per-IP throttle, per-request size/count caps,
 * magic-byte file sniffing, slot allowlist, files-then-atomic-rows with cleanup, a
 * silent generic receipt for bots/duplicates, and sanitized notes.
 */
@Injectable()
export class PublicIntakeService {
  private readonly logger = new Logger(PublicIntakeService.name);
  private readonly submitLog = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ===================== catalogue (read-only) =====================

  async catalogue(now: Date = new Date()): Promise<CataloguePayload> {
    const [tags, offerings] = await Promise.all([
      this.prisma.university_course.findMany({ where: { deleted_at: null }, select: { university_id: true, course_id: true } }),
      this.prisma.university_course_intake.findMany({
        where: { deleted_at: null, status: OFFERING_ACTIVE },
        select: { university_id: true, course_id: true, intake_id: true },
      }),
    ]);
    if (!tags.length || !offerings.length) return { universities: [], document_rules: {} };

    const openSet = await this.openIntakeIds([...new Set(offerings.map((o) => o.intake_id))], now);
    const liveOfferings = offerings.filter((o) => openSet.has(o.intake_id));
    if (!liveOfferings.length) return { universities: [], document_rules: {} };

    const uniIds = [...new Set(liveOfferings.map((o) => o.university_id))];
    const courseIds = [...new Set(liveOfferings.map((o) => o.course_id))];
    const intakeIds = [...new Set(liveOfferings.map((o) => o.intake_id))];

    const [universities, courses, intakes] = await Promise.all([
      this.prisma.university.findMany({ where: { id: { in: uniIds }, deleted_at: null }, select: { id: true, title: true } }),
      this.prisma.course.findMany({ where: { id: { in: courseIds }, deleted_at: null }, select: { id: true, title: true, short_name: true, level: true } }),
      this.prisma.intake.findMany({ where: { id: { in: intakeIds } }, select: { id: true, name: true } }),
    ]);
    const uniName = new Map(universities.map((u) => [u.id, (u.title ?? '').trim()]));
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const intakeName = new Map(intakes.map((i) => [i.id, (i.name ?? '').trim()]));

    const taggedPairs = new Set(tags.map((t) => `${t.university_id}:${t.course_id}`));
    const tree = new Map<number, Map<number, Set<number>>>();
    for (const o of liveOfferings) {
      if (!taggedPairs.has(`${o.university_id}:${o.course_id}`)) continue;
      if (!uniName.has(o.university_id) || !courseById.has(o.course_id)) continue;
      if (!intakeName.get(o.intake_id)) continue;
      let byCourse = tree.get(o.university_id);
      if (!byCourse) tree.set(o.university_id, (byCourse = new Map()));
      let set = byCourse.get(o.course_id);
      if (!set) byCourse.set(o.course_id, (set = new Set()));
      set.add(o.intake_id);
    }

    const levelsPresent = new Set<string>();
    const universitiesOut: CatalogueUniversity[] = [];
    for (const [uid, byCourse] of tree) {
      const coursesOut: CatalogueCourse[] = [];
      for (const [cid, set] of byCourse) {
        const c = courseById.get(cid)!;
        const level = canonicalCourseLevel(c.level);
        if (level) levelsPresent.add(level);
        const name = (c.title ?? '').trim() || (c.short_name ?? '').trim() || `Course ${cid}`;
        const intakeList = [...set].map((id) => ({ id, name: intakeName.get(id) ?? '' })).filter((i) => i.name).sort((a, b) => a.name.localeCompare(b.name));
        if (!intakeList.length) continue;
        coursesOut.push({ id: cid, name, document_group: level, intakes: intakeList });
      }
      if (!coursesOut.length) continue;
      coursesOut.sort((a, b) => a.name.localeCompare(b.name));
      universitiesOut.push({ id: uid, name: uniName.get(uid) || `University ${uid}`, courses: coursesOut });
    }
    universitiesOut.sort((a, b) => a.name.localeCompare(b.name));
    return { universities: universitiesOut, document_rules: await this.documentRules(levelsPresent) };
  }

  private async documentRules(levels: Set<string>): Promise<Record<string, DocumentRule[]>> {
    const out: Record<string, DocumentRule[]> = {};
    if (!levels.size) return out;
    const reqs = await this.prisma.document_requirement.findMany({
      where: { course_level: { in: [...levels] }, deleted_at: null },
      orderBy: [{ course_level: 'asc' }, { sort_order: 'asc' }, { id: 'asc' }],
    });
    if (!reqs.length) return out;
    const label = await this.typeLabels(reqs.map((r) => r.document_type_id));
    for (const r of reqs) {
      (out[r.course_level] ??= []).push({
        slot: `doc_${r.document_type_id}`,
        document_type_id: r.document_type_id,
        label: label.get(r.document_type_id) ?? 'Document',
        required: r.is_required,
        applies_when: r.applies_when ?? null,
        max_files: r.max_files,
        help_text: r.help_text ?? null,
      });
    }
    return out;
  }

  // ===================== submit (create application) =====================

  async createApplication(
    dto: PublicApplicationDto,
    files: UploadedFileType[],
    ip: string | null,
  ): Promise<{ application_no: string }> {
    this.throttle(ip); // H2: shed scripted submissions before any work

    // Honeypot: a bot filled the hidden field — accept silently, persist nothing.
    if (dto.company_website && dto.company_website.trim()) {
      this.logger.warn(`Online application honeypot tripped ip=${ip ?? '?'}`);
      return { application_no: this.fakeReceipt() };
    }

    const now = new Date();
    const dob = new Date(dto.date_of_birth);
    const age = (now.getTime() - dob.getTime()) / (365.25 * 86400000);
    if (Number.isNaN(dob.getTime()) || age < 14 || age > 100) {
      throw new BadRequestException('Enter a valid date of birth.');
    }

    // Validate (university, course, intake) against LIVE offerings — never trust ids.
    await assertApplicationReferences(this.prisma, { university_id: dto.university_id, course_id: dto.course_id }, null, { skipUniversityCourseConsistency: true });
    const resolved = await resolveApplicationIntake(this.prisma, { universityId: dto.university_id, courseId: dto.course_id, intakeId: dto.intake_id });
    const openOffering = await this.prisma.university_course_intake.findFirst({
      where: { university_id: dto.university_id, course_id: dto.course_id, intake_id: dto.intake_id, deleted_at: null, status: OFFERING_ACTIVE },
      select: { id: true },
    });
    if (!openOffering || !(await this.openIntakeIds([dto.intake_id], now)).has(dto.intake_id)) {
      throw new BadRequestException('That programme intake is not open for applications.');
    }

    const policy = await this.documentPolicy(dto.course_id);

    // Duplicate guard (soft, UX only): a recent application with the same email or
    // mobile gets the SAME silent receipt — no 409, so it leaks nothing (M3/M4) and
    // cannot be used to block a victim.
    const phoneNorm = normalizeIndianMobile(dto.phone);
    const since = new Date(now.getTime() - DEDUPE_WINDOW_MS);
    const dupe = await this.prisma.applications.findFirst({
      where: {
        deleted_at: null,
        created_at: { gte: since },
        OR: [{ email: dto.email.trim().toLowerCase() }, ...(phoneNorm ? [{ phone_normalized: phoneNorm }] : [])],
      },
      select: { application_id: true },
    });
    if (dupe) {
      this.logger.warn(`Online application duplicate suppressed ip=${ip ?? '?'}`);
      return { application_no: this.fakeReceipt() };
    }

    // Validate + sniff all files BEFORE any disk write; enforce size/count/slot rules.
    const bySlot = this.groupFiles(files);
    const prepared = this.prepareFiles(bySlot, policy); // throws 400 on any violation

    // Save files to disk, then persist the lead + form + document rows atomically.
    // On a DB failure, delete the just-written files so nothing is orphaned (M1).
    const saved = await this.saveFiles(prepared);
    try {
      const application_no = await this.prisma.$transaction(async (tx) => {
        const app = await tx.applications.create({
          data: {
            name: dto.full_name.trim(),
            email: dto.email.trim().toLowerCase(),
            phone: phoneNorm ?? dto.phone.replace(/[^\d]/g, ''),
            second_phone: dto.alt_phone?.replace(/[^\d]/g, '') || null,
            whatsapp_no: dto.whatsapp.replace(/[^\d]/g, ''),
            dob,
            gender: dto.gender.trim() || null,
            address: this.sanitizeMultiline(dto.permanent_address),
            university_id: dto.university_id,
            course_id: dto.course_id,
            intake_id: dto.intake_id,
            ...(resolved.session_id != null ? { session_id: resolved.session_id } : {}),
            source: LEAD_SOURCE,
            remarks: this.buildRemarks(dto),
            is_converted: 0,
            is_archived: false,
            stage: 'lead_added',
            stage_entered_at: now,
            phone_normalized: phoneNorm,
            created_at: now,
          },
        });
        const no = formatApplicationId(now, app.application_id);
        await tx.applications.update({ where: { application_id: app.application_id }, data: { custom_application_id: no } });
        await tx.application_form.create({
          data: {
            application_id: app.application_id,
            name_on_certificate: dto.full_name.trim().slice(0, 100),
            father_guardian_name: (dto.father_name?.trim() || dto.guardian_name?.trim() || '').slice(0, 160) || null,
            mother_name: dto.mother_name?.trim().slice(0, 160) || null,
            marital_status: MARITAL_MAP[(dto.marital_status ?? '').trim().toLowerCase()] ?? null,
            aadhaar_last4: dto.aadhaar_number ? dto.aadhaar_number.replace(/\D/g, '').slice(-4) : null,
            highest_qualification: QUAL_MAP[(dto.highest_qualification ?? '').trim().toLowerCase()] ?? null,
            employment_status: EMPLOYMENT_MAP[(dto.employment_status ?? '').trim().toLowerCase()] ?? null,
            current_employer: dto.organisation_name?.trim().slice(0, 160) || null,
            current_designation: dto.designation?.trim().slice(0, 120) || null,
            declaration_accepted_at: now,
            declaration_version: DECLARATION_VERSION,
            declaration_ip: ip,
            updated_via: 'applicant',
            created_at: now,
          },
        });
        for (const s of saved) {
          await tx.application_document.create({
            data: {
              application_id: app.application_id,
              requirement_id: s.requirementId,
              document_type_id: s.documentTypeId,
              label: s.label.slice(0, 50),
              file_path: s.path,
              original_name: s.originalName?.slice(0, 255) ?? null,
              mime_type: s.mime.slice(0, 64),
              size_bytes: s.size,
              sha256: s.sha256,
              uploaded_via: 'applicant',
              verification_status: 'pending',
              created_at: now,
            },
          });
        }
        return no;
      });
      return { application_no };
    } catch (err) {
      await Promise.all(saved.map((s) => this.storage.delete(s.path).catch(() => undefined)));
      this.logger.error(`Online application persist failed, files cleaned: ${(err as Error).message}`);
      throw err;
    }
  }

  // ---- files ----

  private groupFiles(files: UploadedFileType[]): Map<string, UploadedFileType[]> {
    const map = new Map<string, UploadedFileType[]>();
    for (const f of files) {
      const m = /^documents\[(.+)\]$/.exec(f.fieldname ?? '');
      const slot = m ? m[1] : f.fieldname;
      if (!slot) continue;
      (map.get(slot) ?? map.set(slot, []).get(slot)!).push(f);
    }
    return map;
  }

  /** Validate every file (slot allowlist, magic bytes, per-slot + total caps) and
   *  return the verified set. Throws 400 on the first violation — before any write. */
  private prepareFiles(
    bySlot: Map<string, UploadedFileType[]>,
    policy: DocPolicy,
  ): Array<{ slot: string; file: UploadedFileType; mime: string; ext: string; documentTypeId: number | null; requirementId: number | null; label: string }> {
    if (!bySlot.get('photo')?.length) throw new BadRequestException('A passport photo is required.');
    if (!bySlot.get('signature')?.length) throw new BadRequestException('A signature is required.');
    for (const r of policy.required) {
      if (!bySlot.get(`doc_${r.document_type_id}`)?.length) throw new BadRequestException(`Missing required document: ${r.label}`);
    }

    const out: Array<{ slot: string; file: UploadedFileType; mime: string; ext: string; documentTypeId: number | null; requirementId: number | null; label: string }> = [];
    let total = 0;
    let count = 0;
    const reqIdByType = new Map(policy.required.map((r) => [r.document_type_id, r.requirement_id]));

    for (const [slot, list] of bySlot) {
      // Slot allowlist: photo, signature, or doc_<id> for a known type at this level.
      let documentTypeId: number | null = null;
      let imageOnly = false;
      let maxForSlot = 1;
      let label = slot;
      if (slot === 'photo') { imageOnly = true; label = 'Passport photo'; }
      else if (slot === 'signature') { imageOnly = true; label = 'Signature'; }
      else {
        const m = /^doc_(\d+)$/.exec(slot);
        if (!m || !policy.maxByType.has(Number(m[1]))) {
          throw new BadRequestException(`Unexpected document "${slot}".`);
        }
        documentTypeId = Number(m[1]);
        maxForSlot = policy.maxByType.get(documentTypeId) ?? 1;
        label = policy.labelByType.get(documentTypeId) ?? 'Document';
      }
      if (list.length > maxForSlot) throw new BadRequestException(`Too many files for "${label}".`);

      for (const f of list) {
        if (!f.buffer || f.size === 0) throw new BadRequestException('An uploaded file is empty.');
        if (f.size > MAX_FILE_BYTES) throw new BadRequestException(`"${f.originalname}" is larger than 8 MB.`);
        total += f.size;
        count += 1;
        if (count > MAX_FILES) throw new BadRequestException('Too many files attached.');
        if (total > MAX_TOTAL_BYTES) throw new BadRequestException('The total upload size is too large.');
        const kind = sniff(f.buffer); // magic bytes, not the client mimetype (M2)
        if (!kind) throw new BadRequestException(`"${f.originalname}" must be a PDF, JPG or PNG.`);
        if (imageOnly && kind.mime === 'application/pdf') throw new BadRequestException(`${label} must be a JPG or PNG image.`);
        out.push({ slot, file: f, mime: kind.mime, ext: kind.ext, documentTypeId, requirementId: documentTypeId != null ? reqIdByType.get(documentTypeId) ?? null : null, label });
      }
    }
    return out;
  }

  private async saveFiles(
    prepared: Array<{ slot: string; file: UploadedFileType; mime: string; ext: string; documentTypeId: number | null; requirementId: number | null; label: string }>,
  ): Promise<SavedFile[]> {
    const saved: SavedFile[] = [];
    try {
      for (const p of prepared) {
        // Name derived from the VERIFIED type, never the client extension (M2).
        const path = await this.storage.save(p.file.buffer, UPLOAD_SUBDIR, `${p.slot}.${p.ext}`);
        saved.push({
          slot: p.slot, path,
          sha256: createHash('sha256').update(p.file.buffer).digest('hex'),
          mime: p.mime, size: p.file.size,
          originalName: p.file.originalname ?? null,
          documentTypeId: p.documentTypeId, requirementId: p.requirementId, label: p.label,
        });
      }
      return saved;
    } catch (err) {
      await Promise.all(saved.map((s) => this.storage.delete(s.path).catch(() => undefined)));
      throw err;
    }
  }

  private async documentPolicy(courseId: number): Promise<DocPolicy> {
    const empty: DocPolicy = { required: [], maxByType: new Map(), labelByType: new Map() };
    const course = await this.prisma.course.findFirst({ where: { id: courseId, deleted_at: null }, select: { level: true } });
    const level = canonicalCourseLevel(course?.level);
    if (!level) return empty;
    const rule = await this.prisma.course_admission_rule.findFirst({ where: { course_id: courseId, deleted_at: null }, select: { requires_employment: true } });
    const employment = rule?.requires_employment === true;
    const reqs = await this.prisma.document_requirement.findMany({
      where: { course_level: level, deleted_at: null },
      select: { id: true, document_type_id: true, is_required: true, applies_when: true, max_files: true },
    });
    if (!reqs.length) return empty;
    const labelByType = await this.typeLabels(reqs.map((r) => r.document_type_id));
    const maxByType = new Map(reqs.map((r) => [r.document_type_id, Math.max(1, r.max_files)]));
    const applicable = reqs.filter((r) => r.is_required && (!r.applies_when || (r.applies_when === 'employment' && employment)));
    return {
      required: applicable.map((r) => ({ requirement_id: r.id, document_type_id: r.document_type_id, label: labelByType.get(r.document_type_id) ?? 'Document' })),
      maxByType,
      labelByType,
    };
  }

  private async typeLabels(typeIds: number[]): Promise<Map<number, string>> {
    const unique = [...new Set(typeIds)];
    if (!unique.length) return new Map();
    const types = await this.prisma.document_type.findMany({ where: { id: { in: unique } }, select: { id: true, title: true } });
    return new Map(types.map((t) => [t.id, (t.title ?? '').trim() || 'Document']));
  }

  // ---- notes (preserve what has no column), sanitized for the shared DB (M6) ----

  private buildRemarks(dto: PublicApplicationDto): string {
    const lines: string[] = ['[Online application]'];
    const add = (k: string, v?: string) => {
      const s = this.sanitizeLine(v);
      if (s) lines.push(`${k}: ${s}`);
    };
    add('WhatsApp', dto.whatsapp);
    add('Nationality', dto.nationality);
    if (dto.father_name && dto.guardian_name) add('Guardian', dto.guardian_name);
    add('Country', dto.country);
    add('State', dto.state);
    add('District', dto.district);
    add('Correspondence address', this.sanitizeMultiline(dto.correspondence_address) ?? undefined);
    add('School / College', dto.school_college);
    add('Year of passing', dto.year_of_passing);
    add('Percentage / Grade', dto.percentage_grade);
    // NB: passport number is deliberately NOT stored here (M5).
    return lines.join('\n').slice(0, 2000);
  }

  /** Single-line: strip control chars + newlines, neutralise spreadsheet formulas. */
  private sanitizeLine(v?: string | null): string {
    if (!v) return '';
    let s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return s.slice(0, 200);
  }
  /** Multi-line (address): keep newlines, drop other control chars + formula guard. */
  private sanitizeMultiline(v?: string | null): string | null {
    if (!v) return null;
    let s = v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return s.slice(0, 500) || null;
  }

  // ---- throttle + misc ----

  private throttle(ip: string | null): void {
    if (process.env.NODE_ENV === 'test') return; // e2e submits repeatedly from one IP
    const key = ip || 'unknown';
    const now = Date.now();
    const hits = (this.submitLog.get(key) ?? []).filter((t) => now - t < SUBMIT_WINDOW_MS);
    if (hits.length >= SUBMIT_MAX_PER_IP) {
      throw new HttpException('Too many applications from this network. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    hits.push(now);
    this.submitLog.set(key, hits);
    if (this.submitLog.size > 5000) {
      // bound the map: drop entries whose last hit is outside the window
      for (const [k, v] of this.submitLog) if (!v.some((t) => now - t < SUBMIT_WINDOW_MS)) this.submitLog.delete(k);
    }
  }

  /** A plausible-looking receipt for bots/duplicates — indistinguishable from a real id. */
  private fakeReceipt(): string {
    const n = String(Math.floor(Math.random() * 900000) + 100000);
    return `APP-${new Date().getFullYear()}-${n}`;
  }

  private async openIntakeIds(intakeIds: number[], now: Date): Promise<Set<number>> {
    if (!intakeIds.length) return new Set();
    const intakes = await this.prisma.intake.findMany({
      where: { id: { in: intakeIds }, deleted_at: null },
      select: { id: true, start_date: true, closing_date: true, year: true, month: true, status: true },
    });
    const open = new Set<number>();
    for (const i of intakes) {
      if ((i.status ?? '').trim().toLowerCase() === 'inactive') continue;
      if (deriveIntakeStatus(i.start_date, i.closing_date, now, { year: i.year, month: i.month }) === 'Open') open.add(i.id);
    }
    return open;
  }
}

/** APP-YYYY-NNNNNN, the Phase 1 application id (mirrors StudentsService). */
function formatApplicationId(createdAt: Date, applicationId: number): string {
  return `APP-${createdAt.getFullYear()}-${String(applicationId).padStart(6, '0')}`;
}
