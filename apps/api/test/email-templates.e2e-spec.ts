import {
  EmailTemplatesService,
  type EmailTemplateKey,
} from '../src/integrations/email-templates.service';

/**
 * The nine Phase 1 transactional emails (spec Module 5).
 *
 * These render from HTML files on disk rather than from code, so the risk worth
 * testing is a template and its caller drifting apart — a placeholder renamed in
 * the HTML, or an asset that never reached the build. No database or Nest
 * context is needed; the service only reads files.
 */

/** Every variable the nine templates use between them. */
const ALL_VARS: Record<string, string> = {
  first_name: 'Asha',
  student_name: 'Asha Menon',
  student_phone: '+91 90000 11111',
  email: 'asha@example.com',
  application_id: 'APP-2026-000123',
  application_url: 'https://admin.upcarrera.com/students/applications/APP-2026-000123',
  university: 'Amity University Online',
  course: 'MBA',
  specialisation: 'Marketing',
  intake: 'January 2026',
  counsellor_name: 'Ravi Kumar',
  counsellor_first_name: 'Ravi',
  counsellor_email: 'ravi@upcarrera.com',
  counsellor_phone: '+91 90000 00000',
  magic_link: 'https://admin.upcarrera.com/apply/abc123',
  link_expiry_date: '12 Oct 2026',
  link_expiry_hours: '48',
  activation_link: 'https://admin.upcarrera.com/activate/xyz',
  role: 'Counsellor',
  invited_by: 'Super Admin',
  otp_code: '481920',
  otp_expiry_minutes: '10',
  request_time: '5 Oct 2026, 10:15 IST',
  submitted_at: '5 Oct 2026',
  approved_at: '6 Oct 2026',
  rejected_at: '6 Oct 2026',
  rejected_by: 'Student Affairs',
  rejection_reason: 'Documents illegible',
  verified_at: '6 Oct 2026',
  verified_by: 'Accounts',
  paid_at: '5 Oct 2026',
  fee_amount: 'Rs 5,000',
  fee_type: 'Registration fee',
  payment_mode: 'UPI',
  payment_reference: 'TXN99881',
  finance_notes: 'Amount mismatch',
  invoice_number: 'INV-2026-0012',
  invoice_filename: 'invoice.pdf',
  pdf_filename: 'application.pdf',
  balance_due: 'Rs 45,000',
  balance_due_date: '30 Nov 2026',
};

const EXPECTED_TEMPLATES: EmailTemplateKey[] = [
  'application-approved',
  'application-magic-link',
  'application-rejected',
  'application-submitted',
  'fee-verified',
  'password-reset-otp',
  'payment-confirmed',
  'payment-rejected',
  'user-invite',
];

describe('EmailTemplatesService', () => {
  let service: EmailTemplatesService;

  beforeAll(() => {
    service = new EmailTemplatesService();
    service.onModuleInit();
  });

  it('loads every Phase 1 template', () => {
    expect(service.available).toEqual([...EXPECTED_TEMPLATES].sort());
  });

  describe.each(EXPECTED_TEMPLATES)('%s', (key) => {
    it('renders with no placeholder left behind', () => {
      const { html } = service.render(key, ALL_VARS);
      expect(html.match(/\{\{[^}]+\}\}/g)).toBeNull();
    });

    it('produces a non-empty subject from its <title>', () => {
      const { subject } = service.render(key, ALL_VARS);
      expect(subject.length).toBeGreaterThan(0);
      expect(subject).not.toContain('{{');
    });
  });

  it('substitutes caller values into the body', () => {
    const { html } = service.render('application-magic-link', {
      ...ALL_VARS,
      magic_link: 'https://example.test/apply/TOKEN123',
    });
    expect(html).toContain('https://example.test/apply/TOKEN123');
  });

  it('substitutes caller values into the subject', () => {
    const { subject } = service.render('application-approved', {
      ...ALL_VARS,
      application_id: 'APP-2026-999999',
    });
    expect(subject).toContain('APP-2026-999999');
  });

  it('applies brand defaults the caller did not supply', () => {
    const { html } = service.render('password-reset-otp', ALL_VARS);
    expect(html).toContain(String(new Date().getFullYear()));
  });

  it('lets the caller override a brand default', () => {
    const { html } = service.render('user-invite', {
      ...ALL_VARS,
      support_email: 'override@example.test',
    });
    expect(html).toContain('override@example.test');
  });

  it('throws rather than sending an email with an unfilled placeholder', () => {
    expect(() => service.render('application-magic-link', { first_name: 'Asha' })).toThrow(
      /missing values for/i,
    );
  });

  it('names the missing variables so the caller can fix them', () => {
    expect(() => service.render('application-magic-link', { first_name: 'Asha' })).toThrow(
      /magic_link/,
    );
  });

  it('rejects an unknown template key', () => {
    expect(() =>
      service.render('no-such-template' as EmailTemplateKey, ALL_VARS),
    ).toThrow(/Unknown email template/);
  });

  it('treats null and undefined as not supplied', () => {
    expect(() =>
      service.render('password-reset-otp', { ...ALL_VARS, otp_code: null }),
    ).toThrow(/otp_code/);
  });
});
