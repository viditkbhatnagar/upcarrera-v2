import { EmailTemplatesService } from '../src/integrations/email-templates.service';

/**
 * Template-render guards. The renderer throws if ANY placeholder is left unfilled,
 * so a call site that under-supplies a template silently breaks that email (the
 * throw is caught + logged at the call site, never delivered). This spec pins two
 * things:
 *   1. the enrolment ("application-approved") email — which was silently failing
 *      because approve() passed only { name, application_id, student_no } while the
 *      template needs the full program + counsellor vars — renders with the vars
 *      the FIXED approve() now supplies, and throws with the old under-supplied set;
 *   2. the new "email-updated" notice renders from just { name, new_email }.
 *
 * Pure unit test: instantiates the service and loads the templates straight from
 * src/integrations/email-templates (no Nest boot, no DB).
 */
describe('Email template rendering (unit)', () => {
  let svc: EmailTemplatesService;

  beforeAll(() => {
    svc = new EmailTemplatesService();
    svc.onModuleInit();
  });

  // Exactly the shape the fixed approve() path passes: programRef.emailVars(...)
  // (first_name, course, university, specialisation, intake, counsellor_*) + extras.
  const approvedVars = {
    first_name: 'Asha',
    application_id: 'APP-123',
    course: 'MBA',
    university: 'Example University',
    specialisation: 'Finance',
    intake: 'Jan 2026',
    counsellor_name: 'Ravi',
    counsellor_email: 'ravi@example.com',
    counsellor_phone: '+91 90000 00000',
    approved_at: '07 Nov 2026, 3:00 pm',
    student_no: 'STU-2026-000123',
  };

  it('application-approved renders with the full program vars (regression: enrolment email was silently failing)', () => {
    const r = svc.render('application-approved', approvedVars);
    expect(r.subject).toMatch(/enrolled/i);
    expect(r.html).toContain('Example University');
  });

  it('application-approved THROWS when only the old under-supplied vars are passed (the original bug)', () => {
    expect(() =>
      svc.render('application-approved', {
        name: 'Asha',
        application_id: 'APP-123',
        student_no: 'STU-1',
      }),
    ).toThrow(/missing values/i);
  });

  it('email-updated renders from just name + new_email', () => {
    const r = svc.render('email-updated', { name: 'Asha', new_email: 'new@example.com' });
    expect(r.subject.length).toBeGreaterThan(0);
    expect(r.html).toContain('new@example.com');
  });

  it('email-updated HTML-escapes the recipient name (no markup injection)', () => {
    const r = svc.render('email-updated', { name: '<b>x</b>', new_email: 'a@b.com' });
    expect(r.html).not.toContain('<b>x</b>');
    expect(r.html).toContain('&lt;b&gt;');
  });
});
