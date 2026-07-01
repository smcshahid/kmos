/**
 * @kmos/knowledge-studio-app — entry point.
 *
 * `npm start` (PORT env, default 8090). Composes the KMOS platform (durable
 * PostgreSQL EventLog when KMOS_DATABASE_URL is set, else in-memory), builds the
 * Studio application service, and serves the UI + API.
 */

export * from './platform.js';
export * from './studio.js';
export * from './types.js';
export * from './http.js';
export * from './transcript.js';
export * from './chapters.js';
export * from './evidence.js';
export * from './downloads.js';
export * from './youtube.js';
export * from './source-store.js';
export { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from './sample.js';

import { PgSqlClient } from '@kmos/events';
import { createStudioPlatformFromEnv } from './platform.js';
import { StudioService } from './studio.js';
import { PostgresSourceStore } from './source-store.js';
import { createStudioServer } from './http.js';

const isMain = import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');

if (isMain) {
  const port = Number(process.env.PORT ?? 8090);
  const url = process.env.KMOS_DATABASE_URL;
  const platform = await createStudioPlatformFromEnv({ enforce: process.env.KMOS_ENFORCE === 'true' });
  // Durable job-state uses the SAME shared PostgreSQL (no duplicate services); with no
  // database it stays in-memory. Recovery on boot restores the full source experience.
  const store = url ? new PostgresSourceStore(new PgSqlClient(url)) : undefined;
  const studio = new StudioService(platform, store ? { store } : {});
  await studio.init();
  const server = createStudioServer({ studio });
  const backing = url ? 'PostgreSQL (durable event log + job state)' : 'in-memory (ephemeral)';
  server.listen(port, () => {
    console.log(`Knowledge Studio listening on http://localhost:${port}  (UI at /, health at /health)`);
    console.log(`  KMOS backing: ${backing}${process.env.KMOS_ENFORCE === 'true' ? '  | attribution: ENFORCING' : ''}`);
    console.log(`  recovered sources: ${studio.listSources().length}`);
  });
}
