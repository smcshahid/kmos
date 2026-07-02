/**
 * @kmos/crawl-station-app — entry point.
 *
 * `npm run crawl` (PORT env, default 8092). Composes the KMOS platform (durable
 * PostgreSQL EventLog when KMOS_DATABASE_URL is set, else in-memory), builds the
 * CrawlStation application service, and serves the UI + API.
 */

export * from './platform.js';
export * from './crawl-service.js';
export * from './crawl-store.js';
export * from './types.js';
export * from './http.js';
export * from './crawler.js';
export * from './extract.js';
export * from './robots.js';
export * from './urls.js';
export { SAMPLE_SEED, SAMPLE_NOTE } from './sample.js';

import { PgSqlClient } from '@kmos/events';
import { createCrawlPlatformFromEnv } from './platform.js';
import { CrawlService } from './crawl-service.js';
import { PostgresCrawlStore } from './crawl-store.js';
import { createCrawlServer } from './http.js';

const isMain = import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');

if (isMain) {
  const port = Number(process.env.PORT ?? 8092);
  const url = process.env.KMOS_DATABASE_URL;
  const platform = await createCrawlPlatformFromEnv({
    enforce: process.env.KMOS_ENFORCE === 'true',
  });
  // Durable crawl job-state uses the SAME shared PostgreSQL (no duplicate services);
  // with no database it stays in-memory. Recovery on boot restores every crawl.
  const store = url ? new PostgresCrawlStore(new PgSqlClient(url)) : undefined;
  const userAgent = process.env.CS_USER_AGENT;
  const service = new CrawlService(platform, {
    ...(store ? { store } : {}),
    ...(userAgent ? { userAgent } : {}),
  });
  await service.init();
  const server = createCrawlServer({ service });
  const backing = url ? 'PostgreSQL (durable event log + crawl state)' : 'in-memory (ephemeral)';
  server.listen(port, () => {
    console.log(`CrawlStation listening on http://localhost:${port}  (UI at /, health at /health)`);
    console.log(`  KMOS backing: ${backing}${process.env.KMOS_ENFORCE === 'true' ? '  | attribution: ENFORCING' : ''}`);
    console.log(`  recovered crawls: ${service.listJobs().length}`);
  });
}
