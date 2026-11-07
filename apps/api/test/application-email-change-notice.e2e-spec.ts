import type { INestApplication } from '@nestjs/common';
import { bootApp } from './app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { StudentsService } from '../src/students/students.service';
import { EmailService } from '../src/integrations/email.service';

/**
 * Sharon's ask: "when we add a new mail id then a mail should go stating your mail
 * id has updated." updateApplication now sends an 'email-updated' notice to the new
 * (and previous) address on a real email change — best-effort, so a mail failure
 * never fails the edit. Drives the real StudentsService with a counsellor actor on
 * a lead-stage application; EmailService.sendEmail is stubbed. Self-contained seed.
 */
describe('Application email-change notice (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: StudentsService;
  let email: EmailService;
  let sendSpy: jest.SpyInstance;

  const COUN = 93501; // counsellor (role 6)
  const CONSULTANT_ROLE = 6;
  const ADMIN = 93502; // super admin (role 1) — can edit a terminal app's contact
  const SUPER_ADMIN_ROLE = 1;
  const TAG = 'E2eEmailChg';
  const DOMAIN = 'e2e-emchg.local';

  const cleanup = async () => {
    await prisma.applications.deleteMany({
      where: { OR: [{ name: { startsWith: TAG } }, { email: { endsWith: `@${DOMAIN}` } }] },
    });
    await prisma.users.deleteMany({ where: { id: { in: [COUN, ADMIN] } } });
  };

  beforeAll(async () => {
    ({ app } = await bootApp());
    prisma = app.get(PrismaService);
    service = app.get(StudentsService);
    email = app.get(EmailService);
    await cleanup();
    await prisma.users.create({ data: { id: COUN, name: `${TAG} Counsellor`, role_id: CONSULTANT_ROLE } });
    await prisma.users.create({ data: { id: ADMIN, name: `${TAG} Admin`, role_id: SUPER_ADMIN_ROLE } });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(() => {
    sendSpy = jest.spyOn(email, 'sendEmail').mockResolvedValue({} as never);
  });
  afterEach(() => jest.restoreAllMocks());

  const actor = { id: COUN, role_id: CONSULTANT_ROLE };

  const mkLead = async (addr: string) =>
    (
      await prisma.applications.create({
        data: {
          name: `${TAG} Lead`,
          email: addr,
          phone: '7012340000',
          stage: 'lead_added',
          pipeline_user: COUN,
          created_by: COUN,
          created_at: new Date(),
        },
      })
    ).application_id;

  it('notifies the new AND the old address when the email actually changes', async () => {
    const id = await mkLead(`old@${DOMAIN}`);
    await service.updateApplication(id, { email: `new@${DOMAIN}` } as never, actor);
    const tos = sendSpy.mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(tos).toEqual(expect.arrayContaining([`new@${DOMAIN}`, `old@${DOMAIN}`]));
    expect((sendSpy.mock.calls[0][0] as { subject: string }).subject).toMatch(/updated/i);
  });

  it('does not notify when the email is unchanged', async () => {
    const id = await mkLead(`same@${DOMAIN}`);
    await service.updateApplication(id, { email: `same@${DOMAIN}` } as never, actor);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('does not notify when the edit does not touch the email', async () => {
    const id = await mkLead(`keep@${DOMAIN}`);
    await service.updateApplication(id, { name: `${TAG} Renamed` } as never, actor);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("notifies when an ADMIN changes an ENROLLED (converted) student's email (C5 allows contact edits)", async () => {
    const adminActor = { id: ADMIN, role_id: SUPER_ADMIN_ROLE };
    const id = (
      await prisma.applications.create({
        data: {
          name: `${TAG} Enrolled`,
          email: `enrolled-old@${DOMAIN}`,
          phone: '7012340001',
          is_converted: 1, // terminal: programme is locked, but contact stays editable
          created_by: ADMIN,
          created_at: new Date(),
        },
      })
    ).application_id;
    await service.updateApplication(id, { email: `enrolled-new@${DOMAIN}` } as never, adminActor);
    const tos = sendSpy.mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(tos).toEqual(expect.arrayContaining([`enrolled-new@${DOMAIN}`, `enrolled-old@${DOMAIN}`]));
    expect((await prisma.applications.findUnique({ where: { application_id: id } }))?.email).toBe(
      `enrolled-new@${DOMAIN}`,
    );
  });

  it('still commits the edit even if the notice send fails', async () => {
    sendSpy.mockRejectedValue(new Error('smtp down'));
    const id = await mkLead(`fail@${DOMAIN}`);
    const res = await service.updateApplication(id, { email: `fail2@${DOMAIN}` } as never, actor);
    expect(res).toBeTruthy();
    const after = await prisma.applications.findUnique({ where: { application_id: id } });
    expect(after?.email).toBe(`fail2@${DOMAIN}`);
  });
});
