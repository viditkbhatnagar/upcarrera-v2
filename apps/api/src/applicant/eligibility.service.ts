import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Canonical qualification ladder, low -> high. Matches qualification.level_code. */
export const LEVEL_LADDER = ['10th', '12th', 'diploma', 'ug', 'pg', 'doctorate'] as const;
export type LevelCode = (typeof LEVEL_LADDER)[number];

export type EligibilityStatus = 'eligible' | 'not_eligible' | 'needs_review';

export interface EligibilityResult {
  status: EligibilityStatus;
  detail: string;
}

export interface AdmissionRule {
  min_qualification: string | null;
  min_percentage: number | null;
  min_cgpa: number | null;
}

export interface QualificationScore {
  level_code: string | null;
  score_type: string | null;
  score_value: number | null;
  score_scale: number | null;
}

/** 0-based rank on the ladder, or -1 when the code is unknown/absent. */
export function levelRank(code: string | null | undefined): number {
  if (!code) return -1;
  return LEVEL_LADDER.indexOf(code.trim().toLowerCase() as LevelCode);
}

/**
 * Machine-checkable eligibility (design openQuestion #2): hard-block (NOT_ELIGIBLE)
 * ONLY when the highest qualification is below the course minimum, or a configured
 * score minimum is not met. A missing rule, an unclassifiable level, or a CGPA with
 * no min_cgpa configured yields NEEDS_REVIEW — which does NOT block submission; the
 * counsellor resolves it at review.
 */
@Injectable()
export class EligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pure evaluation (no I/O) — unit-testable. */
  compute(
    rule: AdmissionRule | null,
    highestQualification: string | null,
    qualifications: readonly QualificationScore[],
  ): EligibilityResult {
    if (!rule) {
      return {
        status: 'needs_review',
        detail: 'No admission rule is configured for this course; your counsellor will review eligibility.',
      };
    }

    // ---- 1. qualification ladder ----
    const minRank = levelRank(rule.min_qualification);
    if (minRank >= 0) {
      const highRank = levelRank(highestQualification);
      if (highRank < 0) {
        return {
          status: 'needs_review',
          detail: 'Add your highest qualification so eligibility can be checked.',
        };
      }
      if (highRank < minRank) {
        return {
          status: 'not_eligible',
          detail: `This course needs at least ${this.levelLabel(rule.min_qualification)}. Please contact your counsellor.`,
        };
      }
    }

    // ---- 2. score minimums (compared against the highest-level qualification) ----
    const top = this.topQualification(qualifications, highestQualification);
    const hasScoreRule = rule.min_percentage != null || rule.min_cgpa != null;
    if (hasScoreRule) {
      if (!top || top.score_value == null || !top.score_type) {
        return {
          status: 'needs_review',
          detail: 'Add your score for the highest qualification so eligibility can be checked.',
        };
      }
      const type = top.score_type.trim().toLowerCase();
      if (type === 'percentage') {
        if (rule.min_percentage != null && Number(top.score_value) < Number(rule.min_percentage)) {
          return {
            status: 'not_eligible',
            detail: `This course needs at least ${rule.min_percentage}%. Please contact your counsellor.`,
          };
        }
      } else if (type === 'cgpa') {
        if (rule.min_cgpa != null) {
          if (Number(top.score_value) < Number(rule.min_cgpa)) {
            return {
              status: 'not_eligible',
              detail: `This course needs at least ${rule.min_cgpa} CGPA. Please contact your counsellor.`,
            };
          }
        } else if (rule.min_percentage != null) {
          // Percentage minimum configured, but the student reported a CGPA with no
          // CGPA minimum to compare against -> let the counsellor decide.
          return {
            status: 'needs_review',
            detail: 'Your CGPA will be reviewed against the course requirement by your counsellor.',
          };
        }
      } else {
        // GRADE or other -> cannot auto-compare.
        return {
          status: 'needs_review',
          detail: 'Your grade will be reviewed by your counsellor.',
        };
      }
    }

    return { status: 'eligible', detail: 'You meet the published eligibility for this course.' };
  }

  /** Evaluate against the DB (course_admission_rule + the application's qualifications). */
  async evaluate(
    courseId: number | null,
    highestQualification: string | null,
    qualifications?: readonly QualificationScore[],
    applicationId?: number,
  ): Promise<EligibilityResult> {
    const rule =
      courseId != null
        ? await this.prisma.course_admission_rule.findFirst({
            where: { course_id: courseId, deleted_at: null },
            select: { min_qualification: true, min_percentage: true, min_cgpa: true },
          })
        : null;

    let quals = qualifications;
    if (!quals && applicationId != null) {
      const rows = await this.prisma.qualification.findMany({
        where: { application_id: applicationId, deleted_at: null },
        select: { level_code: true, score_type: true, score_value: true, score_scale: true },
      });
      quals = rows.map((r) => ({
        level_code: r.level_code,
        score_type: r.score_type,
        score_value: r.score_value != null ? Number(r.score_value) : null,
        score_scale: r.score_scale != null ? Number(r.score_scale) : null,
      }));
    }

    return this.compute(
      rule
        ? {
            min_qualification: rule.min_qualification,
            min_percentage: rule.min_percentage != null ? Number(rule.min_percentage) : null,
            min_cgpa: rule.min_cgpa != null ? Number(rule.min_cgpa) : null,
          }
        : null,
      highestQualification,
      quals ?? [],
    );
  }

  /** The qualification row at the highest level (prefer the stated highest level). */
  private topQualification(
    qualifications: readonly QualificationScore[],
    highestQualification: string | null,
  ): QualificationScore | null {
    if (!qualifications.length) return null;
    if (highestQualification) {
      const match = qualifications.find(
        (q) => levelRank(q.level_code) === levelRank(highestQualification),
      );
      if (match) return match;
    }
    return [...qualifications].sort((a, b) => levelRank(b.level_code) - levelRank(a.level_code))[0];
  }

  private levelLabel(code: string | null): string {
    const map: Record<string, string> = {
      '10th': 'Class 10',
      '12th': 'Class 12',
      diploma: 'a Diploma',
      ug: 'an Undergraduate degree',
      pg: 'a Postgraduate degree',
      doctorate: 'a Doctorate',
    };
    return map[(code ?? '').trim().toLowerCase()] ?? (code ?? 'the required qualification');
  }
}
