/** @kmos/api-server — entry point. `npm run serve` (PORT env, default 8080). */
export * from './platform.js';
export * from './server.js';
import { createApiServer } from './server.js';
import { createPlatformFromEnv } from './platform.js';

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isMain) {
  const port = Number(process.env.PORT ?? 8080);
  // Env-driven composition: PostgreSQL-backed EventLog when KMOS_DATABASE_URL is
  // set (durable system of record), else in-memory. Enforcing mode via KMOS_ENFORCE.
  const platform = await createPlatformFromEnv({ enforce: process.env.KMOS_ENFORCE === 'true' });
  const backing = process.env.KMOS_DATABASE_URL ? 'PostgreSQL (durable event log)' : 'in-memory';
  const server = createApiServer({ platform });
  server.listen(port, () => {
    console.log(`KMOS API server listening on http://localhost:${port}  (UI at /, health at /health)`);
    console.log(`  event log: ${backing}${process.env.KMOS_ENFORCE === 'true' ? '  | attribution: ENFORCING' : ''}`);
  });
}
