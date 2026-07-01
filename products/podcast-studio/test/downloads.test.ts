import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPodcastPlatform } from '../src/platform.ts';
import { PodcastStudioService } from '../src/studio.ts';
import { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from '../src/sample.ts';

test('the downloadable package assembles verifiable, citation-carrying artifacts', async () => {
  const studio = new PodcastStudioService(createPodcastPlatform());
  const ep = await studio.submitAndProcess({
    kind: 'audio', reference: 'https://cdn.example.com/ep12.mp3', title: SAMPLE_TITLE,
    show: 'The Science of Learning', transcript: SAMPLE_TRANSCRIPT,
  });
  assert.equal(ep.status, 'ready', ep.error ?? '');

  const files = studio.assemblePackage(ep.id);
  const names = files.map((f) => f.name);
  for (const expected of ['transcript.md', 'show-notes.md', 'study-notes.md', 'concepts.json', 'citation.md', 'package.json', 'subtitles.srt', 'subtitles.vtt', 'summary.md']) {
    assert.ok(names.includes(expected), `package includes ${expected}`);
  }

  // package.json is valid and carries lineage + grounded concepts.
  const pkg = JSON.parse(files.find((f) => f.name === 'package.json')!.content);
  assert.equal(pkg.generator, 'Podcast Studio on KMOS');
  assert.ok(pkg.concepts.length >= 3);
  assert.ok(pkg.lineageAssets.transcript, 'transcript asset id present in package');

  // Show notes cite chapters + moments with timecodes.
  const notes = files.find((f) => f.name === 'show-notes.md')!.content;
  assert.match(notes, /## Chapters/);
  assert.match(notes, /## Notable moments/);

  // Study notes ground each concept in a quote (verifiable outside the app).
  const study = files.find((f) => f.name === 'study-notes.md')!.content;
  assert.match(study, /Retrieval Practice/);
  assert.match(study, /Trust:/);
});

test('assembleConceptViews returns fully-resolved, grounded concept views', async () => {
  const studio = new PodcastStudioService(createPodcastPlatform());
  const ep = await studio.submitAndProcess({ kind: 'transcript', reference: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });
  const views = studio.assembleConceptViews(ep.id);
  assert.ok(views.length >= 3);
  assert.ok(views.every((v) => Array.isArray(v.evidence) && Array.isArray(v.trust.reasons)));
});
