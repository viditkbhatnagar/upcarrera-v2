import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AinvoxService, AinvoxError } from './ainvox.service';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/** Normalise to +E.164; default +91 for bare 10-digit Indian numbers. */
function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  return null;
}

/**
 * Staff click-to-call + call history. Behind the global JwtAuthGuard; further
 * restricted to calling roles (admin / telecaller / consultant / sub-admin).
 * Served under /api/admin/calls. The Ainvox secret never leaves the server —
 * recordings are streamed (proxied) through getRecording.
 */
@Controller('admin/calls')
@Roles(1, 2, 6, 7)
export class AdminCallsController {
  private readonly logger = new Logger(AdminCallsController.name);

  constructor(
    private readonly ainvox: AinvoxService,
    private readonly prisma: PrismaService,
  ) {}

  /** Agent phone: explicit override → AINVOX_DEFAULT_AGENT_PHONE → the user's profile phone. */
  private async resolveAgentPhone(userId: number, override?: unknown): Promise<string | null> {
    const fromOverride = normalizePhone(override);
    if (fromOverride) return fromOverride;
    const fromEnv = normalizePhone(process.env.AINVOX_DEFAULT_AGENT_PHONE);
    if (fromEnv) return fromEnv;
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    return normalizePhone(user?.phone);
  }

  /** POST /api/admin/calls/create — rings the agent's phone, then dials the student. */
  @Post('create')
  @ResponseMessage('Call started — your phone will ring shortly.')
  async create(
    @Body() body: Record<string, unknown>,
    @CurrentUser('userId') userId: number,
  ) {
    if (!this.ainvox.isConfigured) {
      throw new ServiceUnavailableException('Calling is not configured.');
    }
    const studentPhone = normalizePhone(body?.studentPhone);
    if (!studentPhone) throw new BadRequestException('A valid phone number is required.');

    const agentPhone = await this.resolveAgentPhone(userId, body?.agentPhone);
    if (!agentPhone) {
      throw new BadRequestException(
        'No agent phone found — add your phone number to your profile first.',
      );
    }

    const callerId = this.ainvox.virtualNumber;
    const flowToken = process.env.AINVOX_FLOW_TOKEN;
    const publicBase = process.env.AINVOX_PUBLIC_BASE_URL;
    if (!callerId || !flowToken || !publicBase) {
      throw new ServiceUnavailableException(
        'Caller ID, flow token or public URL is missing.',
      );
    }

    const base = publicBase.replace(/\/+$/, '');
    const flowUrl = `${base}/api/calls/flow?token=${encodeURIComponent(flowToken)}&action=dial&to=${encodeURIComponent(studentPhone)}`;
    const callStatusUrl = `${base}/api/calls/status`;

    let result;
    try {
      result = await this.ainvox.createCall({
        phoneNumber: agentPhone,
        callerId,
        flowUrl,
        callStatusUrl,
      });
    } catch (err) {
      // Surface Ainvox provider failures (e.g. 402 out-of-balance, 401 bad keys)
      // as a clean, user-facing message instead of a generic 500.
      if (err instanceof AinvoxError) {
        this.logger.warn(`Ainvox createCall failed (${err.code}): ${err.message}`);
        throw new ServiceUnavailableException(err.message);
      }
      throw err;
    }
    return { uuid: result.uuid, agentPhone, studentPhone };
  }

  /** GET /api/admin/calls/log?phoneNumber=&direction=&pageNumber=&perPage= */
  @Get('log')
  @ResponseMessage('Call log')
  async log(@Query() q: Record<string, unknown>) {
    if (!this.ainvox.isConfigured) {
      throw new ServiceUnavailableException('Calling is not configured.');
    }
    const phoneNumber =
      typeof q.phoneNumber === 'string' && q.phoneNumber.trim()
        ? (normalizePhone(q.phoneNumber) ?? undefined)
        : undefined;
    const direction =
      q.direction === 'inbound' || q.direction === 'outbound' ? q.direction : undefined;
    return this.ainvox.listCallLogs({
      phoneNumber,
      direction,
      pageNumber: Number(q.pageNumber) || 1,
      perPage: Number(q.perPage) || 20,
    });
  }

  /** GET /api/admin/calls/recording?path=… — proxies the audio stream (secret stays server-side). */
  @Get('recording')
  async recording(@Query('path') path: string, @Res() res: Response) {
    if (!this.ainvox.isConfigured) {
      res.status(503).json({ status: 0, message: 'Calling is not configured.' });
      return;
    }
    if (!path || typeof path !== 'string') {
      res.status(400).json({ status: 0, message: 'Missing recording path.' });
      return;
    }
    try {
      const { body, contentType, contentLength } = await this.ainvox.getRecordingStream(path);
      res.set({
        'Content-Type': contentType,
        ...(contentLength ? { 'Content-Length': String(contentLength) } : {}),
        'Cache-Control': 'private, max-age=300',
      });
      body.on('error', () => {
        if (!res.headersSent) {
          res.status(502).json({ status: 0, message: 'Recording stream error.' });
        } else {
          res.destroy();
        }
      });
      body.pipe(res);
    } catch (err) {
      this.logger.error(`recording failed: ${(err as Error).message}`);
      if (!res.headersSent) {
        res.status(502).json({ status: 0, message: 'Could not fetch the recording.' });
      }
    }
  }
}
