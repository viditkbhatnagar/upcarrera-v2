import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZoomService } from '../integrations/zoom.service';

// The legacy App\Controllers\Zoom controller read live_settings by id = 1.
const LIVE_SETTINGS_ID = 1;

// Zoom Meeting SDK host role.
const SDK_ROLE_HOST = 1;

/**
 * Backs the /sessions/:id/zoom-launch and /sessions/:id/zoom-start endpoints.
 * Ports App\Controllers\Zoom::index (join/launch view) and ::start (host start
 * view), which read the sessions row and the singleton live_settings row.
 */
@Injectable()
export class ZoomSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zoom: ZoomService,
  ) {}

  /** Fetch a live session row or 404 (shared by launch + start). */
  private async getSessionOrFail(id: number) {
    const session = await this.prisma.sessions.findFirst({
      where: { session_id: id, deleted_at: null },
    });
    if (!session) {
      throw new NotFoundException('Session not found!');
    }
    return session;
  }

  /** The singleton live_settings row (id = 1) the legacy app rendered from. */
  private getLiveSettings() {
    return this.prisma.live_settings.findFirst({
      where: { id: LIVE_SETTINGS_ID, deleted_at: null },
    });
  }

  /**
   * Data the join page needs (Zoom::index). Returns the session row plus the
   * Zoom meeting id/password drawn from live_settings, so a participant can join.
   */
  async getLaunch(id: number) {
    const [session, liveSettings] = await Promise.all([
      this.getSessionOrFail(id),
      this.getLiveSettings(),
    ]);

    return {
      session,
      meeting: liveSettings
        ? {
            meeting_id: liveSettings.meeting_id,
            meeting_password: liveSettings.meeting_password,
            meeting_name: liveSettings.meeting_name,
          }
        : null,
    };
  }

  /**
   * Host start payload (Zoom::start): live_settings SDK config + session data +
   * a host Meeting SDK signature. The signature is generated from the
   * live_settings.meeting_id via ZoomService.getMeetingSdkSignature(meeting, 1).
   *
   * When the Meeting SDK env credentials are absent, getMeetingSdkSignature
   * throws ServiceUnavailableException (503 'Zoom not configured').
   */
  async getStart(id: number) {
    const [session, liveSettings] = await Promise.all([
      this.getSessionOrFail(id),
      this.getLiveSettings(),
    ]);

    const meetingNumber = liveSettings?.meeting_id;
    if (!meetingNumber) {
      throw new NotFoundException('Live meeting is not configured.');
    }

    const signature = this.zoom.getMeetingSdkSignature(
      meetingNumber,
      SDK_ROLE_HOST,
    );

    return {
      session,
      live_settings: {
        meeting_name: liveSettings.meeting_name,
        meeting_id: liveSettings.meeting_id,
        meeting_password: liveSettings.meeting_password,
        // SDK key is public-by-design (the secret is never returned).
        sdk_key: process.env.ZOOM_SDK_KEY ?? null,
      },
      signature,
      role: SDK_ROLE_HOST,
    };
  }
}
