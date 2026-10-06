import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CATEGORIES,
  EMPLOYMENT_STATUSES,
  MARITAL_STATUSES,
  QUALIFICATION_LEVELS,
  SCORE_TYPES,
} from './dto/section-data.dto';

export interface Option {
  value: string;
  label: string;
}
export interface LookupCache {
  countries: Array<{ id: number; name: string }>;
  states: Array<{ id: number; name: string; country: string }>;
  categories: Option[];
  marital_statuses: Option[];
  qualification_levels: Option[];
  score_types: Option[];
  employment_statuses: Option[];
}

const CACHE_TTL_MS = 10 * 60 * 1000;

const LEVEL_LABELS: Record<string, string> = {
  '10th': 'Class 10',
  '12th': 'Class 12',
  diploma: 'Diploma',
  ug: 'Undergraduate',
  pg: 'Postgraduate',
  doctorate: 'Doctorate',
};

function titleCase(value: string): string {
  return value
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

/**
 * Small read-only reference lists the public form needs (countries, states and
 * the enum vocabularies), served from a short in-memory cache so a bot cannot
 * hammer the DB through the public surface.
 */
@Injectable()
export class ApplicantLookupsService {
  private cache: LookupCache | null = null;
  private cachedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<LookupCache> {
    if (this.cache && Date.now() - this.cachedAt < CACHE_TTL_MS) return this.cache;

    const [countries, states] = await Promise.all([
      this.prisma.countries.findMany({
        where: { deleted_at: null },
        select: { country_id: true, country: true },
        orderBy: { country: 'asc' },
      }),
      this.prisma.states.findMany({
        where: { deleted_at: null },
        select: { id: true, state_name: true, country: true },
        orderBy: { state_name: 'asc' },
      }),
    ]);

    this.cache = {
      countries: countries.map((c) => ({ id: c.country_id, name: c.country })),
      states: states.map((s) => ({ id: s.id, name: s.state_name, country: s.country })),
      categories: CATEGORIES.map((v) => ({ value: v, label: v.toUpperCase() })),
      marital_statuses: MARITAL_STATUSES.map((v) => ({ value: v, label: titleCase(v) })),
      qualification_levels: QUALIFICATION_LEVELS.map((v) => ({ value: v, label: LEVEL_LABELS[v] ?? v })),
      score_types: SCORE_TYPES.map((v) => ({ value: v, label: titleCase(v) })),
      employment_statuses: EMPLOYMENT_STATUSES.map((v) => ({ value: v, label: titleCase(v) })),
    };
    this.cachedAt = Date.now();
    return this.cache;
  }
}
