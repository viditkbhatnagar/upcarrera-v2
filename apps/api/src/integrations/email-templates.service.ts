import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Phase 1 transactional emails, keyed by template file name (without .html).
 *
 * Each template carries its own subject line in its `<title>` element — including
 * placeholders — so the subject and body never drift apart.
 */
export type EmailTemplateKey =
  | 'user-invite'
  | 'password-reset-otp'
  | 'application-magic-link'
  | 'application-submitted'
  | 'application-approved'
  | 'application-rejected'
  | 'fee-verified'
  | 'payment-confirmed'
  | 'payment-rejected';

export interface RenderedEmail {
  subject: string;
  html: string;
}

/** `{{placeholder}}` — the only substitution syntax the templates use. */
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const TITLE = /<title>([\s\S]*?)<\/title>/i;

/**
 * Values that are the same on every email we send. Callers supply only the
 * variables specific to their message; these fill in the rest, and anything a
 * caller passes explicitly wins.
 */
function brandDefaults(): Record<string, string> {
  return {
    organization_name: process.env.MAIL_ORG_NAME ?? 'Upcarrera',
    logo_url: process.env.MAIL_LOGO_URL ?? 'https://admin.upcarrera.com/brand/logo-email.png',
    support_email: process.env.MAIL_SUPPORT_EMAIL ?? 'hello@upcarrera.com',
    support_phone: process.env.MAIL_SUPPORT_PHONE ?? '+91 95620 04111',
    support_hours: process.env.MAIL_SUPPORT_HOURS ?? 'Mon–Sat, 9:30am–6:30pm IST',
    finance_email: process.env.MAIL_FINANCE_EMAIL ?? 'accounts@upcarrera.com',
    year: String(new Date().getFullYear()),
  };
}

/**
 * Loads the HTML email templates and fills in their placeholders.
 *
 * Templates live beside this file in `email-templates/` and are read once at
 * boot (they total ~150 KB), so sending costs no disk I/O. `nest-cli.json`
 * copies the directory into `dist/` on build — without that asset rule the
 * compiled API would start and then fail on the first send.
 */
@Injectable()
export class EmailTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplatesService.name);
  private readonly templates = new Map<string, string>();

  onModuleInit(): void {
    const dir = join(__dirname, 'email-templates');

    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.html'));
    } catch (err) {
      // A missing directory means the build dropped the assets. Fail loudly at
      // boot rather than at the first password reset a user asks for.
      throw new Error(
        `Email templates directory not found at ${dir}: ${(err as Error).message}. ` +
          'Check the "assets" rule in apps/api/nest-cli.json.',
      );
    }

    for (const file of files) {
      this.templates.set(file.replace(/\.html$/, ''), readFileSync(join(dir, file), 'utf8'));
    }
    this.logger.log(`Loaded ${this.templates.size} email templates`);
  }

  /** Template keys that loaded successfully — used by the health/readiness check. */
  get available(): string[] {
    return [...this.templates.keys()].sort();
  }

  /**
   * Render a template to a subject and HTML body.
   *
   * Throws if the template is unknown, or if any placeholder is left unfilled —
   * an email reading "Dear {{first_name}}" is worse than a failed send, and the
   * caller's missing field is a bug we want surfaced, not delivered.
   */
  render(key: EmailTemplateKey, vars: Record<string, string | number | null | undefined>): RenderedEmail {
    const raw = this.templates.get(key);
    if (!raw) {
      throw new Error(
        `Unknown email template "${key}". Available: ${this.available.join(', ') || '(none loaded)'}`,
      );
    }

    const values: Record<string, string> = { ...brandDefaults() };
    for (const [k, v] of Object.entries(vars)) {
      if (v !== null && v !== undefined) values[k] = String(v);
    }

    const missing = new Set<string>();
    const fill = (text: string): string =>
      text.replace(PLACEHOLDER, (_match, name: string) => {
        const value = values[name];
        if (value === undefined) {
          missing.add(name);
          return '';
        }
        return value;
      });

    const subject = fill(TITLE.exec(raw)?.[1]?.trim() ?? '').replace(/\s+/g, ' ');
    const html = fill(raw);

    if (missing.size) {
      throw new Error(
        `Email template "${key}" is missing values for: ${[...missing].sort().join(', ')}`,
      );
    }
    if (!subject) {
      throw new Error(`Email template "${key}" has no <title> to use as the subject line`);
    }

    return { subject, html };
  }
}
