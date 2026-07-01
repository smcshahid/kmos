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
// Provider adapters now live in the shared capability layer (KCSI-01): the app injects
// them but no longer owns the HTTP/provider logic.
import { makeHttpCaptionFetcher, createOllamaExtraction } from '@kmos/providers';
import { createStudioPlatformFromEnv } from './platform.js';
import { StudioService } from './studio.js';
import { PostgresSourceStore } from './source-store.js';
import { createStudioServer } from './http.js';

const isMain = import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');

if (isMain) {
  const port = Number(process.env.PORT ?? 8090);
  const url = process.env.KMOS_DATABASE_URL;
  // Richer concepts: an Ollama-backed extraction capability when OLLAMA_URL is set
  // (provider-independent, behind the KMOS contract; falls back to the reference
  // extractor on any failure). See ADR-KS-0002.
  const ollamaUrl = process.env.OLLAMA_URL;
  const extraction = ollamaUrl
    ? createOllamaExtraction({ url: ollamaUrl, ...(process.env.OLLAMA_MODEL ? { model: process.env.OLLAMA_MODEL } : {}) })
    : undefined;
  const platform = await createStudioPlatformFromEnv({
    enforce: process.env.KMOS_ENFORCE === 'true',
    ...(extraction ? { extraction } : {}),
  });
  // Durable job-state uses the SAME shared PostgreSQL (no duplicate services); with no
  // database it stays in-memory. Recovery on boot restores the full source experience.
  const store = url ? new PostgresSourceStore(new PgSqlClient(url)) : undefined;
  // Provider-independent caption/ASR capability (yt-dlp/Whisper/Speaches behind an
  // HTTP contract). Configured via KS_CAPTION_ENDPOINT; absent → honest degradation.
  const captionEndpoint = process.env.KS_CAPTION_ENDPOINT;
  const captionFetcher = captionEndpoint ? makeHttpCaptionFetcher(captionEndpoint) : undefined;
  const studio = new StudioService(platform, {
    ...(store ? { store } : {}),
    ...(captionFetcher ? { captionFetcher } : {}),
  });
  await studio.init();
  const server = createStudioServer({ studio });
  const backing = url ? 'PostgreSQL (durable event log + job state)' : 'in-memory (ephemeral)';
  server.listen(port, () => {
    console.log(`Knowledge Studio listening on http://localhost:${port}  (UI at /, health at /health)`);
    console.log(`  KMOS backing: ${backing}${process.env.KMOS_ENFORCE === 'true' ? '  | attribution: ENFORCING' : ''}`);
    console.log(`  caption/ASR capability: ${captionEndpoint ? captionEndpoint : 'not configured (YouTube needs a pasted transcript)'}`);
    console.log(`  concept extraction: ${ollamaUrl ? `Ollama @ ${ollamaUrl}` : 'reference (offline; set OLLAMA_URL for richer concepts)'}`);
    console.log(`  recovered sources: ${studio.listSources().length}`);
  });
}
