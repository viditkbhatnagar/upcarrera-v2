import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApplicantRequest } from '../applicant-context';

/**
 * Throttler for the PUBLIC applicant controllers only (NOT a global guard). It
 * keys per SESSION once ApplicantSessionGuard has set req.applicant, and per IP
 * on the unauthenticated session route (where no session exists yet). Guard
 * order on the protected controller is [ApplicantSessionGuard, this], so
 * req.applicant is already populated when the tracker is computed.
 *
 * The in-memory store (default ThrottlerStorageService) is sufficient: PM2 runs a
 * single fork, so there is one process to count in.
 */
@Injectable()
export class ApplicantThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: ApplicantRequest): Promise<string> {
    const linkId = req.applicant?.linkId;
    if (linkId) return `sess:${linkId}`;
    const ip = (req.ips && req.ips.length ? req.ips[0] : req.ip) ?? 'unknown';
    return `ip:${ip}`;
  }
}
