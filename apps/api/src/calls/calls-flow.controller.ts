import { All, Body, Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AinvoxService } from './ainvox.service';
import { Public } from '../common/decorators/public.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/**
 * PUBLIC call-control endpoints that Ainvox calls back during a call. Opted out
 * of the global JwtAuthGuard (@Public) and instead guarded by AINVOX_FLOW_TOKEN.
 * Responses are RAW JSON (sent via @Res, bypassing the global response envelope)
 * because Ainvox expects the exact `{ action: ... }` shape. Served under
 * /api/calls (flow, flow/hangup, status). @All matches Ainvox's GET or POST.
 */
@Controller('calls')
export class CallsFlowController {
  constructor(private readonly ainvox: AinvoxService) {}

  /** Public config probe — booleans only, never the keys. */
  @Public()
  @Get('health')
  @ResponseMessage('Calling health')
  health() {
    return {
      configured: this.ainvox.isConfigured,
      virtualNumber: this.ainvox.virtualNumber,
      publicBaseSet: Boolean(process.env.AINVOX_PUBLIC_BASE_URL),
      flowTokenSet: Boolean(process.env.AINVOX_FLOW_TOKEN),
    };
  }

  @Public()
  @All('flow')
  flow(
    @Query() q: Record<string, unknown>,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ): void {
    const params = { ...(body ?? {}), ...(q ?? {}) }; // query wins
    const flowToken = process.env.AINVOX_FLOW_TOKEN;
    if (!flowToken || params.token !== flowToken) {
      res.status(403).json({ action: 'hangup' });
      return;
    }
    if (params.action === 'dial') {
      const callerId = process.env.AINVOX_VIRTUAL_NUMBER ?? '';
      const hangupUrl = `${(process.env.AINVOX_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '')}/api/calls/flow/hangup`;
      // Emit BOTH camelCase + snake_case keys — Ainvox docs disagree on casing.
      res.json({
        action: 'Dial',
        callerId,
        caller_id: callerId,
        numbers: params.to ? [String(params.to)] : [],
        timeout: 30,
        record: 'true',
        recordStatusUrl: '',
        record_status_url: '',
        callStatusUrl: '',
        call_status_url: '',
        flowUrl: hangupUrl,
        flow_url: hangupUrl,
      });
      return;
    }
    res.json({ action: 'hangup' });
  }

  @Public()
  @All('flow/hangup')
  hangup(@Res() res: Response): void {
    res.json({ action: 'hangup' });
  }

  @Public()
  @All('status')
  status(@Res() res: Response): void {
    res.json({ status: 1 });
  }
}
