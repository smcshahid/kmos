import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPodcastPlatform } from '../src/platform.ts';
import { PodcastStudioService } from '../src/studio.ts';
import type { EpisodeStore, PersistedEpisode } from '../src/episode-store.ts';
import { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from '../src/sample.ts';

class FakeStore implements EpisodeStore {
  readonly rows = new Map<string, PersistedEpisode>();
  async init(): Promise<void> {}
  async load(): Promise<PersistedEpisode[]> { return [...this.rows.values()]; }
  async save(entry: PersistedEpisode): Promise<void> { this.rows.set(entry.episode.id, JSON.parse(JSON.stringify(entry))); }
}

test('episode job-state persists through the store', async () => {
  const store = new FakeStore();
  const studio = new PodcastStudioService(createPodcastPlatform(), { store });
  const ep = await studio.submitAndProcess({ kind: 'transcript', reference: SAMPLE_TITLE, title: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });
  assert.equal(ep.status, 'ready', ep.error ?? '');
  const saved = store.rows.get(ep.id);
  assert.ok(saved, 'episode saved');
  assert.equal(saved!.episode.status, 'ready');
  assert.ok(saved!.episode.segments.length > 0, 'derived view-state (segments) persisted');
  assert.ok(Object.keys(saved!.trust).length > 0, 'per-concept trust persisted');
});

test('a restarted studio recovers the full episode experience from the store', async () => {
  const store = new FakeStore();
  const s1 = new PodcastStudioService(createPodcastPlatform(), { store });
  const ep = await s1.submitAndProcess({ kind: 'transcript', reference: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });

  // A brand-new studio (fresh in-memory maps) sharing the same store.
  const s2 = new PodcastStudioService(createPodcastPlatform(), { store });
  await s2.init();
  const recovered = s2.getEpisode(ep.id);
  assert.ok(recovered, 'episode recovered on boot');
  assert.equal(recovered!.status, 'ready');
  assert.ok(s2.listEpisodes().length >= 1);
  // The app-owned view-state (segments, chapters, concept ids, subtitles) is recovered.
  // (Canonical KMOS knowledge rehydrates separately from the durable event log — ADR-0011,
  // proven by the @kmos/sdk recovery test — which a shared in-memory platform here lacks.)
  assert.ok(recovered!.segments.length > 0, 'transcript segments recovered');
  assert.ok(recovered!.conceptIds.length >= 3, 'concept ids recovered');
  assert.ok((recovered!.subtitleSrt ?? '').length > 0, 'subtitle track recovered');
});

test('an episode interrupted mid-processing recovers as failed-and-retryable', async () => {
  const store = new FakeStore();
  const studio = new PodcastStudioService(createPodcastPlatform(), { store });
  const ep = await studio.submitAndProcess({ kind: 'transcript', reference: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });
  // Simulate a crash mid-processing by rewriting the persisted row to 'processing'.
  const row = store.rows.get(ep.id)!;
  row.episode.status = 'processing';
  const running = row.episode.stages.find((s) => s.id === 'concepts')!;
  running.status = 'running';

  const s2 = new PodcastStudioService(createPodcastPlatform(), { store });
  await s2.init();
  const rec = s2.getEpisode(ep.id)!;
  assert.equal(rec.status, 'failed');
  assert.match(rec.error ?? '', /interrupted by a restart/i);
});
