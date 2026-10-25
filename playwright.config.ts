import { defineConfig, devices } from '@playwright/test';

// Servers: dev API (fast timing, fixtures on) + built web via `vite preview`. Ports are overridable so a stale local
// server is never reused by accident: E2E_API_PORT (default 8788), E2E_WEB_PORT (default 4173).
// Build the web app first: npm run build -w @elimquest/web
const api = process.env.E2E_API_PORT ?? '8788';
const web = process.env.E2E_WEB_PORT ?? '4173';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${web}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'npx tsx apps/server/src/index.ts',
      env: { PORT: api, ALLOW_FIXTURE_QUESTIONS: 'true', MAX_ACTIVE_ROOMS: '100', MAX_OPEN_ROOMS_PER_HOST: '100', TIMING_SCALE: '0.3', ANSWER_GRACE_MS: '300', RATE_LIMIT_DISABLED: 'true' },
      url: `http://localhost:${api}/healthz`, reuseExistingServer: !process.env.CI, timeout: 60_000,
    },
    { command: `npx vite preview --port ${web} --strictPort`, cwd: 'apps/web', env: { VITE_DEV_API_TARGET: `http://localhost:${api}` }, url: `http://localhost:${web}`, reuseExistingServer: !process.env.CI },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
