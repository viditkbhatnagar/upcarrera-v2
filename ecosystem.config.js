/**
 * PM2 process definitions for the upCarrera droplet.
 *
 * The web app is a STATIC Vite SPA (apps/web/dist) served directly by nginx —
 * there is no Node web process. Only the Nest API runs under PM2, bound to
 * 127.0.0.1 so the public surface is nginx (80/443) alone.
 *
 * Usage (repo root, after `./deploy/deploy.sh` has built apps/api/dist):
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup systemd     # then run the command it prints (boot persistence)
 *
 * Secrets live in apps/api/.env (DATABASE_URL, JWT_SECRET, …) read by @nestjs/config.
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
  ],
};
