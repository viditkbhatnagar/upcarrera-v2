import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * What ApplicantSessionGuard stashes on the request after it has re-validated the
 * magic-link row. It deliberately does NOT populate `req.user`, so no staff
 * decorator/guard can ever mistake an applicant for a staff principal.
 */
export interface ApplicantContext {
  applicationId: number;
  linkId: number;
}

/** The request shape the applicant routes read (Express request + our context). */
export interface ApplicantRequest {
  applicant?: ApplicantContext;
  ip?: string;
  ips?: string[];
  headers: Record<string, unknown>;
}

/** Injects the validated applicant context (set by ApplicantSessionGuard). */
export const CurrentApplicant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApplicantContext => {
    const req = ctx.switchToHttp().getRequest<ApplicantRequest>();
    // The guard guarantees this is set before any handler runs.
    return req.applicant as ApplicantContext;
  },
);
