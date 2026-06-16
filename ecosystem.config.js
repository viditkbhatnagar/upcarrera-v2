/**
 * PM2 process definitions for the upCarrera droplet deploy.
 *
 * Two bare Node processes, both bound to 127.0.0.1 so only nginx (80/443) is
 * publicly reachable:
 *   - upcarrera-api : NestJS, dist/main.js, PORT 3000  (routes under /api)
 *   - upcarrera-web : Next.js, next start,  PORT 3001  (the staff app)
 *
 * Usage on the droplet (from the repo root, after `pnpm build`):
 *   pm2 start ecosystem.config.js
 *   pm2 save                 # persist the process list
 *   pm2 startup systemd      # then run the command it prints (boot persistence)
 *
 * Secrets are NOT defined here — the API reads apps/api/.env (DATABASE_URL,
 * JWT_SECRET, …) via @nestjs/config; only non-secret runtime wiring lives below.
 */
module.exports = {
  apps: [
    {
      name: 'upcarrera-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 5000, // give enableShutdownHooks() time to disconnect Prisma
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOST: '127.0.0.1',
      },
    },
    {
      name: 'upcarrera-web',
      cwd: './apps/web',
      // Run the Next.js binary directly so the bind host is explicit and not
      // subject to shell-variable surprises. `next build` must have run first.
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001 -H 127.0.0.1',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
    },
  ],
};
