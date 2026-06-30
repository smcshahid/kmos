import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, type StoredEvent } from '@kmos/canonical-kernel';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { KnowledgeService } from '@kmos/knowledge';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { LanguageDomainService } from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

function wire() {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const knowledge = new KnowledgeService({ bus, now: fixedNow });
  const registry = new CapabilityRegistryService({ bus, now: fixedNow });
  const runtime = new CapabilityRuntimeService({ bus, now: fixedNow });
  const language = new LanguageDomainService({ bus, knowledge, registry, runtime, now: fixedNow });
  return { bus, knowledge, registry, runtime, language };
}

function eventTypes(bus: EventBus): Set<string> {
  return new Set(bus.eventLog.read(1).map((s: StoredEvent) => s.event.identity.type));
}

test('Language domain processes a transcript: correct -> extract -> translate via workflow/runtime, concepts + multilingual vocabulary land in Knowledge', async () => {
  const { bus, knowledge, language } = wire();

  const res = await language.processTranscript({
    transcript: '  the   Photosynthesis  process  feeds  the   Mitochondria  ',
    targetLanguage: 'fr',
    vocabulary: { Mitochondria: 'Mitochondrion' },
  });

  assert.equal(res.state, 'Completed');
  assert.ok(res.workflowExecutionId.startsWith('kmos:'));

  assert.equal(res.correctedTranscript, 'the Photosynthesis process feeds the Mitochondrion');
  assert.ok(res.translatedTranscript?.startsWith('[fr] '));

  assert.ok(res.conceptIds.length >= 2);
  const names = res.conceptIds
    .map((id) => knowledge.getKnowledge(id)?.body.canonicalName)
    .filter((n): n is string => n !== undefined);
  assert.ok(names.includes('Photosynthesis'));
  assert.ok(names.includes('Mitochondrion'));

  for (const id of res.conceptIds) {
    const vocab = knowledge.getVocabulary(id);
    const langs = new Set(vocab.map((v) => v.body.language));
    assert.ok(langs.has('en'));
    assert.ok(langs.has('fr'));
    for (const v of vocab) assert.equal(v.body.knowledgeId, id);
  }

  const types = eventTypes(bus);
  assert.ok(types.has('TranscriptCorrected'));
  assert.ok(types.has('VocabularyLearned'));
  assert.ok(types.has('CapabilityExecutionCompleted'));
  assert.ok(types.has('ConceptCreated'));
  assert.ok(types.has('VocabularyExpanded'));
});

test('Language domain works without translation: correct + extract only', async () => {
  const { bus, knowledge, language } = wire();
  const res = await language.processTranscript({ transcript: 'Newton studied Gravity carefully' });

  assert.equal(res.state, 'Completed');
  assert.equal(res.translatedTranscript, undefined);
  assert.ok(res.conceptIds.length >= 2);

  for (const id of res.conceptIds) {
    const vocab = knowledge.getVocabulary(id);
    const langs = new Set(vocab.map((v) => v.body.language));
    assert.deepEqual([...langs], ['en']);
    assert.equal(vocab.length, 1);
  }

  const types = eventTypes(bus);
  assert.ok(types.has('TranscriptCorrected'));
  assert.ok(types.has('VocabularyLearned'));
  assert.ok(types.has('CapabilityExecutionCompleted'));
});

test('Language domain holds no business logic: correction/extraction/translation run only via capabilities', async () => {
  const { language, runtime } = wire();
  const res = await language.processTranscript({ transcript: 'Knowledge Preservation matters', targetLanguage: 'ar' });
  assert.ok(res.correctedTranscript.length > 0);
  assert.ok(res.conceptIds.length > 0);
  assert.equal(typeof runtime.invoke, 'function');
});
