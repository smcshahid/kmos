import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudioPlatform } from '../src/platform.ts';
import { StudioService } from '../src/studio.ts';
import { SAMPLE_TRANSCRIPT, SAMPLE_TITLE } from '../src/sample.ts';
import {
  renderTranscriptMarkdown, renderStudyNotes, renderPackage,
} from '../src/downloads.ts';

function newStudio(): StudioService {
  return new StudioService(createStudioPlatform());
}

async function processSample(studio: StudioService, targetLanguage?: string) {
  return studio.submitAndProcess({
    kind: 'transcript', reference: SAMPLE_TITLE, title: SAMPLE_TITLE,
    transcript: SAMPLE_TRANSCRIPT, ...(targetLanguage ? { targetLanguage } : {}),
  });
}

test('the full pipeline runs every stage and reaches ready', async () => {
  const studio = newStudio();
  const src = await processSample(studio);
  assert.equal(src.status, 'ready', src.error ?? '');
  assert.equal(src.stages.find((s) => s.id === 'acquire')!.status, 'done');
  assert.equal(src.stages.find((s) => s.id === 'audio')!.status, 'skipped'); // honest: needs infra
  assert.ok(src.stages.filter((s) => s.status === 'done').length >= 8);
  assert.ok(src.segments.length > 5);
  assert.ok(src.chapters.length >= 1);
  assert.ok(src.conceptIds.length > 3);
  assert.ok(src.durationSec > 0);
});

test('R1: every source produces chapters and evidence-grounded concepts', async () => {
  const studio = newStudio();
  const src = await processSample(studio);
  const grounded = studio.conceptSummaries(src.id).filter((c) => c.evidenceCount > 0);
  assert.ok(grounded.length >= 3, 'several concepts grounded in a real passage');
});

test('R2/R5: a concept view is fully verifiable — evidence, lineage, trust', async () => {
  const studio = newStudio();
  const src = await processSample(studio);
  const grounded = studio.conceptSummaries(src.id).find((c) => c.evidenceCount > 0)!;
  const view = studio.conceptView(grounded.id)!;

  // Evidence: a real quote with a jump-to-moment timestamp (one interaction away).
  assert.ok(view.evidence.length >= 1);
  assert.ok(view.evidence[0]!.quote.length > 0);
  assert.equal(typeof view.evidence[0]!.startSec, 'number');
  assert.ok(view.evidence[0]!.timedExactly, 'sample has exact timing');

  // Lineage: concept's transcript derived from the source media (chain of custody).
  assert.ok(view.lineage.length >= 2, 'transcript <- source media');
  assert.ok(view.lineage.some((n) => n.kind === 'Media'));
  assert.ok(view.lineage.some((n) => n.kind === 'Document'));

  // Trust: grounded concept is trusted, with explainable reasons (not a bare score).
  assert.equal(view.trust.trusted, true);
  assert.ok(view.trust.reasons.length >= 3);
  assert.ok(view.trust.reasons.some((r) => /knowledge provenance/i.test(r)));
});

test('trust is honest: an ungrounded concept is marked "needs review"', async () => {
  const studio = newStudio();
  const src = await processSample(studio);
  const summaries = studio.conceptSummaries(src.id);
  const ungrounded = summaries.find((c) => c.evidenceCount === 0);
  if (ungrounded) {
    const view = studio.conceptView(ungrounded.id)!;
    assert.equal(view.trust.trusted, false, 'no passage => not trusted, no fabrication');
  }
});

test('R3: semantic search returns concepts with supporting quotes', async () => {
  const studio = newStudio();
  const src = await processSample(studio);
  const hits = studio.search('retrieval practice strengthens memory');
  assert.ok(hits.length >= 1);
  const withQuote = hits.find((h) => h.quote);
  assert.ok(withQuote, 'at least one hit carries a supporting quote');
  assert.equal(withQuote!.sourceId, src.id);
});

test('translation adds a second-language vocabulary to concepts', async () => {
  const studio = newStudio();
  const src = await processSample(studio, 'fr');
  assert.ok(src.translatedTranscript && src.translatedTranscript.length > 0);
  const grounded = studio.conceptSummaries(src.id).find((c) => c.evidenceCount > 0)!;
  const view = studio.conceptView(grounded.id)!;
  assert.ok(view.vocabulary.some((v) => v.language === 'fr'));
  assert.ok(view.vocabulary.some((v) => v.language === 'en'));
});

test('R4: collections are created in KMOS and downloads render with citations', async () => {
  const studio = newStudio();
  const src = await processSample(studio);
  const ids = studio.conceptSummaries(src.id).slice(0, 3).map((c) => c.id);
  const col = await studio.createCollection('My findings', ids);
  assert.ok(col.id);
  assert.equal(col.memberIds.length, 3);

  const views = studio.assembleConceptViews(src.id);
  const md = renderTranscriptMarkdown(src);
  assert.match(md, /## /); // chaptered
  const notes = renderStudyNotes(src, views);
  assert.match(notes, /Study Notes/);
  assert.match(notes, /Trust:/);
  const pkg = JSON.parse(renderPackage(src, views));
  assert.equal(pkg.source.title, SAMPLE_TITLE);
  assert.ok(Array.isArray(pkg.concepts) && pkg.concepts.length > 0);
  assert.ok(pkg.lineageAssets.transcript && pkg.lineageAssets.source);
});

test('an empty transcript fails gracefully with a clear message', async () => {
  const studio = newStudio();
  const src = await studio.submitAndProcess({ kind: 'transcript', reference: 'x', transcript: '' });
  assert.equal(src.status, 'failed');
  assert.match(src.error ?? '', /transcript/i);
});

test('a YouTube URL without a transcript reports honestly (needs infra)', async () => {
  const studio = newStudio();
  const src = await studio.submitAndProcess({ kind: 'youtube', reference: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(src.status, 'failed');
  const acquire = src.stages.find((s) => s.id === 'acquire')!;
  assert.equal(acquire.mode, 'external');
});
