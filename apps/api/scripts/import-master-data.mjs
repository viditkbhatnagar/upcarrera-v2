#!/usr/bin/env node
/**
 * Master-data importer — loads the Phase 1 "upCarrera_Phase1_Master_Data_Templates.xlsx"
 * workbook (universities, courses, intakes, offerings, fees, document rules) into the
 * CRM database, idempotently.
 *
 * SAFE BY DEFAULT: runs as a DRY RUN and writes nothing unless --commit is passed.
 * It resolves the sheet's free-text university codes against the Universities sheet
 * (by name / short_name / code, normalised) plus a small explicit alias map; any
 * reference it cannot resolve UNAMBIGUOUSLY is skipped and listed in the report —
 * it never guesses a university, a course or an intake onto a financial row.
 *
 * Usage:
 *   node scripts/import-master-data.mjs --file <xlsx> [--commit]
 *   DATABASE_URL=mysql://… node scripts/import-master-data.mjs --file <xlsx> --commit
 *
 * The catalogue the public form + counsellor "New Application" read is:
 *   university -> university_course (tag) -> university_course_intake (offering)
 *   -> intake (derived Open) ; specialisations hang off course_id.
 * A course row is one (level, group, specialisation); fees are per that triple.
 */
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

/* ----------------------------- args ----------------------------- */
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const FILE = getArg('--file');
const COMMIT = args.includes('--commit');
if (!FILE) {
  console.error('ERROR: --file <xlsx> is required');
  process.exit(1);
}

/* ----------------------------- helpers ----------------------------- */
const norm = (v) =>
  v == null ? '' : String(v).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const trimStr = (v) => (v == null ? '' : String(v).trim());
const nz = (v) => {
  const s = trimStr(v);
  return s === '' ? null : s;
};

// Explicit, SAFE aliases: normalised sheet ref -> normalised university key.
// Only unambiguous expansions/typos; anything ambiguous is deliberately absent
// so it falls through to "unresolved" and gets reported for Sharon.
const UNI_ALIASES = {
  amity: 'amityonline',
  uu: 'uuonline',
  jainonline: 'jain',
  dypatil: 'dypatil', // D.Y. Patil normalises to this already
};

const MONTHS = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April',
  may: 'May', jun: 'June', jul: 'July', aug: 'August',
  sep: 'September', oct: 'October', nov: 'November', dec: 'December',
};
// Normalise an intake code's month token (handles JULY->JUL, APRIL->APR typos).
function parseIntakeCode(code) {
  const m = String(code || '').trim().toUpperCase().match(/^INT-(\d{4})-([A-Z]+)$/);
  if (!m) return null;
  const year = Number(m[1]);
  let mon = m[2].slice(0, 3).toLowerCase();
  if (!MONTHS[mon]) return null;
  return { year, monthKey: mon, month: MONTHS[mon] };
}

function parseDate(v) {
  if (v instanceof Date) return v;
  const s = trimStr(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/YYYY
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // YYYY-MM-DD
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/* ----------------------------- read workbook ----------------------------- */
async function readWorkbook(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sheets = {};
  wb.eachSheet((ws) => {
    const rows = [];
    ws.eachRow((row) => rows.push(row.values));
    sheets[ws.name.trim()] = rows;
  });
  return sheets;
}

// Turn a sheet (array of row-value arrays from exceljs; index 0 is empty, index 1
// is col A) into objects keyed by the header row. Finds the first non-empty row
// as the header.
function toRecords(rows) {
  if (!rows || rows.length === 0) return [];
  let hi = rows.findIndex((r) => r && r.slice(1).some((c) => trimStr(c) !== ''));
  if (hi < 0) return [];
  const header = rows[hi].map((c) => trimStr(c));
  const out = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.slice(1).some((c) => trimStr(c) !== '')) continue;
    const obj = {};
    for (let c = 1; c < header.length; c++) {
      if (header[c]) obj[header[c]] = r[c] ?? null;
    }
    out.push(obj);
  }
  return out;
}

/* ----------------------------- main ----------------------------- */
const prisma = new PrismaClient();
const now = new Date();
const report = { skips: [], notes: [], counts: {} };
const skip = (section, key, reason) => report.skips.push({ section, key, reason });
const bump = (k, n = 1) => (report.counts[k] = (report.counts[k] || 0) + n);

async function main() {
  const sheets = await readWorkbook(FILE);
  const S = (name) => toRecords(sheets[name] || []);

  const unisSheet = S('02 Universities');
  const coursesSheet = S('03 Courses');
  const intakesSheet = S('05 Intakes');
  const offeringsSheet = S('06 Intake Offerings');
  const feesSheet = S('07 Fee Structures');
  const docsSheet = S('08 Document Reqs');

  console.log(`\n== Master-data import (${COMMIT ? 'COMMIT' : 'DRY RUN'}) ==`);
  console.log(`file: ${FILE}`);

  /* ---- 1. Universities ---- */
  const uniByNorm = new Map(); // normalised key -> { id?, title }
  for (const u of unisSheet) {
    const name = nz(u.name);
    if (!name) { skip('universities', '(blank name)', 'missing name'); continue; }
    const data = {
      title: name,
      country_id: 'India',
      website: (nz(u.website) || '').slice(0, 60) || 'n/a',
      phone: (nz(u.contact_phone) || '').slice(0, 15) || 'n/a',
      email: (nz(u.contact_email) || '').slice(0, 30) || 'n/a',
      category: nz(u.type),
      address: nz(u.address),
      state: nz(u.state),
      status: /inactive/i.test(trimStr(u.status)) ? '0' : '1',
      fee_collection_model: nz(u.fee_collection_model),
    };
    let id;
    if (COMMIT) {
      const existing = await prisma.university.findFirst({
        where: { title: name, deleted_at: null }, select: { id: true },
      });
      if (existing) {
        await prisma.university.update({ where: { id: existing.id }, data: { ...data, updated_at: now } });
        id = existing.id; bump('universities_updated');
      } else {
        const created = await prisma.university.create({ data: { ...data, created_at: now } });
        id = created.id; bump('universities_created');
      }
    } else { bump('universities_planned'); }
    // register every spelling we know for this university
    for (const k of [u.code, u.short_name, u.name].map(norm).filter(Boolean)) {
      uniByNorm.set(k, { id, title: name });
    }
  }
  const resolveUni = (ref) => {
    let k = norm(ref);
    if (!k) return null;
    if (UNI_ALIASES[k]) k = UNI_ALIASES[k];
    return uniByNorm.get(k) || null;
  };

  /* ---- 2. Courses (one per level|group|specialisation) + specialisations ---- */
  const courseByKey = new Map(); // `${group}|${spec}` norm -> { id?, title, level }
  for (const c of coursesSheet) {
    const group = nz(c.group);
    const spec = nz(c.specialisation) || 'General';
    const level = nz(c.level);
    if (!group) { skip('courses', '(blank group)', 'missing group'); continue; }
    const title = spec && spec !== 'General' ? `${group} (${spec})` : `${group} (General)`;
    const data = {
      title,
      short_name: group.slice(0, 255),
      stream: group.slice(0, 255),
      level: level ? level.slice(0, 255) : null,
      total_duration: (nz(c.duration_years) || '').toString().slice(0, 255) || 'n/a',
      study_mode: 'Online',
      total_amount: 0,
      is_lms_course: 0,
    };
    let id;
    if (COMMIT) {
      const existing = await prisma.course.findFirst({
        where: { title, deleted_at: null }, select: { id: true },
      });
      if (existing) { id = existing.id; bump('courses_existing'); }
      else {
        const created = await prisma.course.create({ data: { ...data, created_at: now } });
        id = created.id; bump('courses_created');
        // one specialisation row so the New-Application spec dropdown is non-empty
        await prisma.specialisations.create({
          data: { course_id: id, title: spec, created_at: now },
        });
      }
    } else { bump('courses_planned'); }
    courseByKey.set(`${norm(group)}|${norm(spec)}`, { id, title, level });
  }
  // resolve an offering/fee (group, spec) -> course; blank spec defaults to General
  const resolveCourse = (group, spec) => {
    const g = norm(group);
    const s = norm(spec) || 'general';
    return courseByKey.get(`${g}|${s}`) || courseByKey.get(`${g}|general`) || null;
  };

  /* ---- 3. Intakes (keyed by year+month) ---- */
  const intakeByCode = new Map(); // normalised year-month -> { id?, open }
  const { deriveIntakeStatus } = await import(
    '../dist/finance/fee-structures/fee-structure.money.js'
  ).catch(() => ({ deriveIntakeStatus: null }));
  for (const it of intakesSheet) {
    const parsed = parseIntakeCode(it.code);
    if (!parsed) { skip('intakes', trimStr(it.code), 'unparseable intake code'); continue; }
    const start = parseDate(it.start_date);
    const close = parseDate(it.closing_date);
    const data = {
      name: `${parsed.month} ${parsed.year}`,
      month: parsed.month,
      year: parsed.year,
      start_date: start,
      closing_date: close,
      status: nz(it.status),
    };
    let id;
    if (COMMIT) {
      const existing = await prisma.intake.findFirst({
        where: { year: parsed.year, month: parsed.month, deleted_at: null }, select: { id: true },
      });
      if (existing) {
        await prisma.intake.update({ where: { id: existing.id }, data: { ...data, updated_at: now } });
        id = existing.id; bump('intakes_updated');
      } else {
        const created = await prisma.intake.create({ data: { ...data, created_at: now } });
        id = created.id; bump('intakes_created');
      }
    } else { bump('intakes_planned'); }
    const open = deriveIntakeStatus
      ? deriveIntakeStatus(start, close, now, { year: parsed.year, month: parsed.month }) === 'Open'
      : null;
    intakeByCode.set(`${parsed.year}-${parsed.monthKey}`, { id, open });
  }
  const resolveIntake = (code) => {
    const p = parseIntakeCode(code);
    if (!p) return null;
    return intakeByCode.get(`${p.year}-${p.monthKey}`) || null;
  };

  /* ---- 4+5. Offerings -> university_course tag + university_course_intake ---- */
  const tagSeen = new Set();
  for (const o of offeringsSheet) {
    const uni = resolveUni(o.university_code);
    if (!uni) { skip('offerings', trimStr(o.university_code), 'university not resolvable'); continue; }
    const intake = resolveIntake(o.intake_code);
    if (!intake) { skip('offerings', trimStr(o.intake_code), 'intake code not in Intakes'); continue; }
    const course = resolveCourse(o.course_group, o.course_specialisation);
    if (!course) {
      skip('offerings', `${trimStr(o.course_group)}|${trimStr(o.course_specialisation) || '(blank→General)'}`,
        'course (group/spec) not in catalogue'); continue;
    }
    if (nz(o.course_specialisation) == null) bump('offerings_spec_defaulted_General');
    if (COMMIT) {
      // tag
      const tagKey = `${uni.id}:${course.id}`;
      if (!tagSeen.has(tagKey)) {
        const tag = await prisma.university_course.findFirst({
          where: { university_id: uni.id, course_id: course.id }, select: { id: true, deleted_at: true },
        });
        if (!tag) {
          await prisma.university_course.create({
            data: { university_id: uni.id, course_id: course.id, status: 1, source: 'import', created_at: now, updated_at: now },
          });
        } else if (tag.deleted_at) {
          await prisma.university_course.update({ where: { id: tag.id }, data: { status: 1, deleted_at: null, updated_at: now } });
        }
        tagSeen.add(tagKey);
      }
      // offering
      const off = await prisma.university_course_intake.findFirst({
        where: { university_id: uni.id, course_id: course.id, intake_id: intake.id }, select: { id: true, deleted_at: true },
      });
      if (!off) {
        await prisma.university_course_intake.create({
          data: { university_id: uni.id, course_id: course.id, intake_id: intake.id, status: 1, source: 'import', created_at: now, updated_at: now },
        });
        bump('offerings_created');
      } else {
        if (off.deleted_at) await prisma.university_course_intake.update({ where: { id: off.id }, data: { status: 1, deleted_at: null, updated_at: now } });
        bump('offerings_existing');
      }
    } else { bump('offerings_planned'); }
    if (intake.open) bump('offerings_in_open_intake');
  }

  /* ---- 6. Fee structures (per university|course|intake) ---- */
  for (const f of feesSheet) {
    const uni = resolveUni(f.university_code);
    const intake = resolveIntake(f.intake_code);
    const course = resolveCourse(f.course_group, f.course_specialisation);
    if (!uni || !intake || !course) {
      skip('fees', `${trimStr(f.university_code)}|${trimStr(f.course_group)}|${trimStr(f.intake_code)}`,
        !uni ? 'university unresolved' : !intake ? 'intake unresolved' : 'course unresolved');
      continue;
    }
    const courseFee = Number(trimStr(f.course_fee)) || null;
    const data = {
      university_id: uni.id, course_id: course.id, intake_id: intake.id,
      status: 'active', currency: 'INR',
      registration_fee: Number(trimStr(f.registration_fee)) || null,
      course_fee_basis: nz(f.course_fee_basis),
      course_fee_amount: courseFee,
      discount_allowed: /yes/i.test(trimStr(f.discount_allowed)),
      discount_max_pct: Number(trimStr(f.discount_max_pct)) || null,
    };
    if (COMMIT) {
      const existing = await prisma.fee_structure.findFirst({
        where: { university_id: uni.id, course_id: course.id, intake_id: intake.id }, select: { id: true },
      });
      if (existing) { await prisma.fee_structure.update({ where: { id: existing.id }, data: { ...data, updated_at: now } }); bump('fees_updated'); }
      else { await prisma.fee_structure.create({ data: { ...data, created_at: now } }); bump('fees_created'); }
    } else { bump('fees_planned'); }
  }

  /* ---- 7. Document requirements (document_type + document_requirement) ---- */
  const LEVELMAP = { ug: 'ug', pg: 'pg', diploma: 'diploma', 'pgdiploma': 'pg', certificate: 'certification', certification: 'certification', doctorate: 'doctorate' };
  for (const d of docsSheet) {
    const lvlRaw = norm(d.course_level);
    const level = LEVELMAP[lvlRaw];
    const typeName = nz(d.document_type);
    if (!typeName) { skip('docreqs', '(blank type)', 'missing document_type'); continue; }
    if (!level) { skip('docreqs', `${trimStr(d.course_level)} / ${typeName}`, 'non-canonical course_level'); continue; }
    if (COMMIT) {
      let dt = await prisma.document_type.findFirst({ where: { title: typeName }, select: { id: true } });
      if (!dt) dt = await prisma.document_type.create({ data: { title: typeName, created_at: now } });
      const existing = await prisma.document_requirement.findFirst({
        where: { course_level: level, document_type_id: dt.id }, select: { id: true },
      });
      const payload = {
        course_level: level, document_type_id: dt.id,
        is_required: /yes|true|1/i.test(trimStr(d.is_required)),
        applies_when: nz(d.applies_when),
        max_files: Number(trimStr(d.max_files)) || 1,
        help_text: (nz(d.help_text) || '').slice(0, 255) || null,
        sort_order: Number(trimStr(d.sort_order)) || 0,
      };
      if (existing) { await prisma.document_requirement.update({ where: { id: existing.id }, data: { ...payload, updated_at: now } }); bump('docreqs_updated'); }
      else { await prisma.document_requirement.create({ data: { ...payload, created_at: now } }); bump('docreqs_created'); }
    } else { bump('docreqs_planned'); }
  }

  /* ---- report ---- */
  console.log('\n--- counts ---');
  for (const [k, v] of Object.entries(report.counts).sort()) console.log(`  ${k}: ${v}`);

  const bySection = {};
  for (const s of report.skips) {
    bySection[s.section] = bySection[s.section] || {};
    const key = `${s.reason} :: ${s.key}`;
    bySection[s.section][key] = (bySection[s.section][key] || 0) + 1;
  }
  console.log('\n--- skipped (needs data fix) ---');
  for (const [sec, items] of Object.entries(bySection)) {
    console.log(`  [${sec}] ${Object.values(items).reduce((a, b) => a + b, 0)} rows`);
    for (const [k, n] of Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`     ${n}× ${k}`);
    }
  }
  console.log(`\n${COMMIT ? 'COMMITTED' : 'DRY RUN — nothing written'}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
