/**
 * @kmos/podcast-studio-app — Podcast Studio, the second flagship KMOS application.
 *
 * `npm start` (PORT env, default 8091). Composes the KMOS platform (durable PostgreSQL
 * EventLog when KMOS_DATABASE_URL is set, else in-memory), builds the Podcast Studio
 * application service, and serves the UI + API. Providers wire in via env:
 *   OLLAMA_URL                 → richer concept extraction (else reference)
 *   PODCAST_TRANSCRIBE_ENDPOINT (or KS_CAPTION_ENDPOINT) → acquisition/ASR (else paste)
 */

export * from './types.js';
export * from './platform.js';
export * from './studio.js';
export * from '@kmos/content-projections';
export * from './acquisition.js';
export * from './subtitles.js';
export * from './clips.js';
export * from './summary.js';
export * from './moments.js';
export * from './downloads.js';
export * from './episode-store.js';
export * from './http.js';
export { STUDIO_HTML } from './web.js';
export { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from './sample.js';

import { PgSqlClient } from '@kmos/events';
import { createOllamaExtraction } from '@kmos/providers';
import { createPodcastPlatformFromEnv } from './platform.js';
import { PodcastStudioService } from './studio.js';
import { PostgresEpisodeStore } from './episode-store.js';
import { makeHttpTranscriptFetcher } from './acquisition.js';
import { createPodcastServer } from './http.js';

const isMain = import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');

if (isMain) {
  const port = Number(process.env.PORT ?? 8091);
  const url = process.env.KMOS_DATABASE_URL;
  const ollamaUrl = process.env.OLLAMA_URL;
  const extraction = ollamaUrl
    ? createOllamaExtraction({ url: ollamaUrl, ...(process.env.OLLAMA_MODEL ? { model: process.env.OLLAMA_MODEL } : {}) })
    : undefined;
  const platform = await createPodcastPlatformFromEnv({
    enforce: process.env.KMOS_ENFORCE === 'true',
    ...(extraction ? { extraction } : {}),
  });
  const store = url ? new PostgresEpisodeStore(new PgSqlClient(url)) : undefined;
  const endpoint = process.env.PODCAST_TRANSCRIBE_ENDPOINT ?? process.env.KS_CAPTION_ENDPOINT;
  const transcriptFetcher = endpoint ? makeHttpTranscriptFetcher(endpoint) : undefined;
  const studio = new PodcastStudioService(platform, {
    ...(store ? { store } : {}),
    ...(transcriptFetcher ? { transcriptFetcher } : {}),
  });
  await studio.init();
  const server = createPodcastServer({ studio });
  const backing = url ? 'PostgreSQL (durable event log + job state)' : 'in-memory (ephemeral)';
  server.listen(port, () => {
    console.log(`Podcast Studio listening on http://localhost:${port}  (UI at /, health at /health)`);
    console.log(`  KMOS backing: ${backing}${process.env.KMOS_ENFORCE === 'true' ? '  | attribution: ENFORCING' : ''}`);
    console.log(`  acquisition/ASR: ${endpoint ? endpoint : 'not configured (paste a transcript)'}`);
    console.log(`  concept extraction: ${ollamaUrl ? `Ollama @ ${ollamaUrl}` : 'reference (offline; set OLLAMA_URL for richer concepts)'}`);
    console.log(`  recovered episodes: ${studio.listEpisodes().length}`);
  });
}
