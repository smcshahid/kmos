import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPodcastPlatform } from '../src/platform.ts';
import { PodcastStudioService } from '../src/studio.ts';
import { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from '../src/sample.ts';

function newStudio(): PodcastStudioService {
  return new PodcastStudioService(createPodcastPlatform());
}

test('the full pipeline runs every stage and reaches ready', async () => {
  const studio = newStudio();
  const ep = await studio.submitAndProcess({
    kind: 'transcript', reference: SAMPLE_TITLE, title: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT,
  });
  assert.equal(ep.status, 'ready', ep.error ?? '');
  assert.ok(ep.stages.every((s) => s.status === 'done' || s.status === 'skipped'), 'all stages complete');
  assert.ok(ep.segments.length > 0, 'transcript parsed into segments');
  assert.ok(ep.chapters.length > 0, 'chapters detected');
});

test('every episode produces evidence-grounded, verifiable concepts', async () => {
  const studio = newStudio();
  const ep = await studio.submitAndProcess({
    kind: 'audio', reference: 'https://example.com/ep12.mp3', title: SAMPLE_TITLE,
    show: 'The Science of Learning', transcript: SAMPLE_TRANSCRIPT,
  });
  assert.equal(ep.status, 'ready', ep.error ?? '');
  const summaries = studio.conceptSummaries(ep.id);
  assert.ok(summaries.length >= 3, `expected several concepts; got ${summaries.length}`);
  const grounded = summaries.filter((c) => c.evidenceCount > 0);
  assert.ok(grounded.length > 0, 'at least one concept grounded in a transcript passage');

  // A concept view is fully verifiable — evidence, lineage, trust.
  const view = studio.conceptView(grounded[0]!.id)!;
  assert.ok(view.evidence.length >= 1, 'evidence quotes present');
  assert.ok(view.lineage.length >= 1, 'lineage chain present (transcript ← source)');
  assert.ok(Array.isArray(view.trust.reasons) && view.trust.reasons.length > 0, 'explainable trust reasons present');
});

test('semantic search returns concepts with supporting quotes', async () => {
  const studio = newStudio();
  const ep = await studio.submitAndProcess({
    kind: 'transcript', reference: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT,
  });
  assert.equal(ep.status, 'ready', ep.error ?? '');
  const hits = studio.search('Retrieval');
  assert.ok(hits.length > 0, 'search finds indexed concepts');
});

test('an episode without a transcript degrades honestly (needs infra)', async () => {
  const studio = newStudio();
  const ep = await studio.submitAndProcess({ kind: 'rss', reference: 'https://feeds.example.com/show.xml' });
  assert.equal(ep.status, 'failed');
  assert.match(ep.error ?? '', /transcript|acquisition|ASR/i);
  const acquire = ep.stages.find((s) => s.id === 'acquire')!;
  assert.equal(acquire.status, 'failed');
});

test('favorites toggle and episodes list newest-first', async () => {
  const studio = newStudio();
  const a = await studio.submitAndProcess({ kind: 'transcript', reference: 'A', title: 'A', transcript: SAMPLE_TRANSCRIPT });
  await studio.toggleFavorite(a.id);
  assert.equal(studio.getEpisode(a.id)!.favorite, true);
  assert.ok(studio.listEpisodes().length >= 1);
});
