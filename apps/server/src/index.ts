import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';

// Load apps/server/.env if present (real environment variables take precedence).
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const app = await createApp();
const port = await app.listen();
console.log(`ElimQuest server listening on :${port} (${app.env.NODE_ENV}, db=${app.db.kind}, auth=${app.env.AUTH_MODE}, email=${app.env.EMAIL_MODE})`);
if (app.env.NODE_ENV !== 'production') console.log('Development mode: dev auth + fixture questions are active. Do not deploy this configuration.');

let closing = false;
const shutdown = async (sig: string) => {
  if (closing) return;
  closing = true;
  console.log(`${sig} received: shutting down gracefully (in-flight games will enter recovery pause on next boot)`);
  const t = setTimeout(() => process.exit(1), 10_000);
  t.unref();
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
