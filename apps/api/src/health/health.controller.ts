import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Liveness/readiness probe — served at /api/health (global prefix + 'health').
 *
 * Unlike /api/integrations/health (which only reports integration-credential
 * booleans), this route asserts the MySQL connection with a `SELECT 1`. It is
 * @Public() so load balancers, nginx, PM2, and post-deploy smoke tests can hit
 * it without a token. When the DB is unreachable it returns 503 so an automated
 * `curl -fsS` fails loudly rather than reporting a false-healthy 200.
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger('Health');

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ResponseMessage('Service healthy')
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      this.logger.error('Health check failed: database unreachable', err as Error);
      throw new ServiceUnavailableException('Database unreachable');
    }

    return { status: 'ok', db: 'up', uptime: Math.round(process.uptime()) };
  }
}
