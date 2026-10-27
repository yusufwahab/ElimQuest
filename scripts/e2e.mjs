// Runs the browser tests safely: builds the web app in LOCAL DEV-AUTH mode (ignoring any real VITE_SUPABASE_* values in
// apps/web/.env) and then starts Playwright, whose server ignores apps/server/.env. Usage: npm run test:e2e [-- playwright args]
import { spawnSync } from 'node:child_process';

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
// Shell-provided empty values override apps/web/.env, so the build uses the local dev login, not your real Supabase project.
run('npm', ['run', 'build', '-w', '@elimquest/web'], { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_API_URL: '', VITE_SOCKET_URL: '' });
run('npx', ['playwright', 'test', ...process.argv.slice(2)]);
