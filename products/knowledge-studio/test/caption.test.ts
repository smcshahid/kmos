import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createStudioPlatform } from '../src/platform.ts';
import { StudioService } from '../src/studio.ts';
import { makeHttpCaptionFetcher } from '@kmos/providers';
import { SAMPLE_TRANSCRIPT } from '../src/sample.ts';

/** Stand up a throwaway HTTP server for the duration of a test. */
async function withServer(handler: http.RequestListener, fn: (base: string) => Promise<void>): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test('the HTTP caption adapter returns transcript JSON', async () => {
  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ transcript: SAMPLE_TRANSCRIPT }));
  }, async (base) => {
    const fetcher = makeHttpCaptionFetcher(`${base}/captions`);
    const text = await fetcher('dQw4w9WgXcQ');
    assert.ok(text && text.includes('Retrieval'));
  });
});

test('the HTTP caption adapter degrades to undefined on non-2xx', async () => {
  await withServer((req, res) => {
    res.writeHead(404); res.end('no captions');
  }, async (base) => {
    const fetcher = makeHttpCaptionFetcher(`${base}/captions`);
    assert.equal(await fetcher('dQw4w9WgXcQ'), undefined);
  });
});

test('a YouTube URL processes end-to-end when a caption capability is configured', async () => {
  // Stub the fetcher (provider-independent seam); the pipeline should acquire captions
  // and produce verifiable knowledge exactly as the transcript path does.
  const studio = new StudioService(createStudioPlatform(), {
    captionFetcher: async () => SAMPLE_TRANSCRIPT,
  });
  const src = await studio.submitAndProcess({ kind: 'youtube', reference: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(src.status, 'ready', src.error ?? '');
  assert.equal(src.stages.find((s) => s.id === 'acquire')!.mode, 'kmos');
  assert.ok(src.conceptIds.length > 3);
  const grounded = studio.conceptSummaries(src.id).find((c) => c.evidenceCount > 0);
  assert.ok(grounded, 'concepts are grounded in the fetched captions');
});
