import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, newCanonicalId } from '@kmos/canonical-kernel';
import { KnowledgeService } from '@kmos/knowledge';
import { LearningPlatform } from '../src/index.js';

const now = () => '2026-06-30T00:00:00.000Z';

test('Learning Platform assembles curricula + lessons from authoritative Knowledge (thin app)', async () => {
  const bus = new EventBus();
  const knowledge = new KnowledgeService({ bus, now });
  const learning = new LearningPlatform({ knowledge });

  const sincerity = await knowledge.createKnowledge({ category: 'Concept', canonicalName: 'Sincerity', definition: 'Purity of intention', primaryLanguage: 'en' });
  await knowledge.addVocabulary(sincerity.id, { language: 'ar', preferredTerm: 'Ikhlas' });
  const patience = await knowledge.createKnowledge({ category: 'Concept', canonicalName: 'Patience', definition: 'Steadfast endurance', primaryLanguage: 'en' });

  const lesson = learning.generateLesson(sincerity.id);
  assert.equal(lesson?.title, 'Sincerity');
  assert.equal(lesson?.body, 'Purity of intention');
  assert.equal(lesson?.vocabulary[0]?.term, 'Ikhlas');

  const curriculum = learning.assembleCurriculum('Virtues', [sincerity.id, patience.id]);
  assert.equal(curriculum.lessons.length, 2);

  const learner = newCanonicalId('Identity');
  learning.recordCompletion(learner, sincerity.id);
  const progress = learning.progressFor(learner, curriculum);
  assert.deepEqual(progress.completed, [sincerity.id]);
  assert.deepEqual(progress.remaining, [patience.id]);
});
