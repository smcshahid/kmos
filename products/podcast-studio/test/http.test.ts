import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPodcastPlatform } from '../src/platform.ts';
import { PodcastStudioService } from '../src/studio.ts';
import { createPodcastServer } from '../src/http.ts';
import { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from '../src/sample.ts';

async function withServer(studio: PodcastStudioService, fn: (base: string) => Promise<void>): Promise<void> {
  const server = createPodcastServer({ studio });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise<void>((r) => server.close(() => r())); }
}

async function get(base: string, path: string): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(base + path);
  const text = await res.text();
  let body: any = undefined; try { body = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, body, text };
}

test('the HTTP API serves the UI, health, and a processed episode end-to-end', async () => {
  const studio = new PodcastStudioService(createPodcastPlatform());
  const ep = await studio.submitAndProcess({ kind: 'transcript', reference: SAMPLE_TITLE, title: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });
  assert.equal(ep.status, 'ready', ep.error ?? '');

  await withServer(studio, async (base) => {
    // UI
    const ui = await get(base, '/');
    assert.equal(ui.status, 200);
    assert.match(ui.text, /Podcast Studio/);
    // Health
    const health = await get(base, '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');
    // List + detail
    const list = await get(base, '/api/episodes');
    assert.ok(Array.isArray(list.body) && list.body.length === 1);
    const detail = await get(base, '/api/episodes/' + ep.id);
    assert.equal(detail.body.status, 'ready');
    // Concepts + search
    const concepts = await get(base, '/api/episodes/' + ep.id + '/concepts');
    assert.ok(concepts.body.length >= 3);
    const search = await get(base, '/api/search?q=Retrieval');
    assert.ok(search.body.length > 0);
    // Downloads listing + a real file
    const dls = await get(base, '/api/episodes/' + ep.id + '/downloads');
    assert.ok(dls.body.some((d: any) => d.name === 'package.json'));
    const pkg = await get(base, '/api/episodes/' + ep.id + '/download/package.json');
    assert.equal(pkg.status, 200);
    assert.equal(JSON.parse(pkg.text).generator, 'Podcast Studio on KMOS');
    // Unknown route
    assert.equal((await get(base, '/api/nope')).status, 404);
  });
});

test('POST /api/episodes accepts a submission and RSS preview parses a feed', async () => {
  const studio = new PodcastStudioService(createPodcastPlatform());
  await withServer(studio, async (base) => {
    const res = await fetch(base + '/api/episodes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'transcript', reference: 'X', transcript: SAMPLE_TRANSCRIPT }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.ok(body.id);

    const feed = await fetch(base + '/api/feed', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml: '<rss><channel><title>Show</title><item><title>E1</title><enclosure url="https://x/e1.mp3" type="audio/mpeg"/></item></channel></rss>' }),
    });
    const feedBody = await feed.json();
    assert.equal(feedBody.title, 'Show');
    assert.equal(feedBody.episodes.length, 1);
  });
});
