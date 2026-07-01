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
export { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from './sample.js';

import { createStudioPlatformFromEnv } from './platform.js';
import { StudioService } from './studio.js';
import { createStudioServer } from './http.js';

const isMain = import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');

if (isMain) {
  const port = Number(process.env.PORT ?? 8090);
  const platform = await createStudioPlatformFromEnv({ enforce: process.env.KMOS_ENFORCE === 'true' });
  const studio = new StudioService(platform);
  const server = createStudioServer({ studio });
  const backing = process.env.KMOS_DATABASE_URL ? 'PostgreSQL (durable event log)' : 'in-memory';
  server.listen(port, () => {
    console.log(`Knowledge Studio listening on http://localhost:${port}  (UI at /, health at /health)`);
    console.log(`  KMOS event log: ${backing}`);
  });
}
