/**
 * Learning Platform (KMOS-0009 reference application).
 *
 * A thin experience that turns institutional Knowledge into educational
 * pathways. It composes the Knowledge Service (read) and presents curricula and
 * lessons; the authoritative content is the Knowledge Objects themselves. The
 * app owns no business logic and no canonical objects -- learner progress is
 * ephemeral session/view state (a Learning DOMAIN would own durable progress).
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type { KnowledgeService, KnowledgeObject } from '@kmos/knowledge';

export interface LearningPlatformOptions {
  readonly knowledge: KnowledgeService;
}

export interface Lesson {
  readonly conceptId: CanonicalId;
  readonly title: string;
  readonly body: string;
  readonly vocabulary: readonly { language: string; term: string }[];
}

export interface Curriculum {
  readonly title: string;
  readonly lessons: readonly Lesson[];
}

export interface Progress {
  readonly learnerId: CanonicalId;
  readonly completed: readonly CanonicalId[];
  readonly remaining: readonly CanonicalId[];
}

export class LearningPlatform {
  private readonly knowledge: KnowledgeService;
  /** Ephemeral, per-session learner progress (NOT a canonical object). */
  private readonly progress = new Map<CanonicalId, Set<CanonicalId>>();

  constructor(opts: LearningPlatformOptions) {
    this.knowledge = opts.knowledge;
  }

  /** Build a lesson presenting one concept's authoritative knowledge. */
  generateLesson(conceptId: CanonicalId): Lesson | undefined {
    const ko: KnowledgeObject | undefined = this.knowledge.getKnowledge(conceptId);
    if (!ko) return undefined;
    const vocab = this.knowledge.getVocabulary(conceptId).map((v) => ({ language: v.body.language, term: v.body.preferredTerm }));
    return {
      conceptId,
      title: ko.body.canonicalName,
      body: ko.body.definition,
      vocabulary: vocab,
    };
  }

  /** Assemble an ordered curriculum from a list of concept ids. */
  assembleCurriculum(title: string, conceptIds: readonly CanonicalId[]): Curriculum {
    const lessons: Lesson[] = [];
    for (const id of conceptIds) {
      const lesson = this.generateLesson(id);
      if (lesson) lessons.push(lesson);
    }
    return { title, lessons };
  }

  /** Record that a learner completed a lesson (ephemeral session state). */
  recordCompletion(learnerId: CanonicalId, conceptId: CanonicalId): void {
    const set = this.progress.get(learnerId) ?? new Set<CanonicalId>();
    set.add(conceptId);
    this.progress.set(learnerId, set);
  }

  /** Progress of a learner against a curriculum. */
  progressFor(learnerId: CanonicalId, curriculum: Curriculum): Progress {
    const done = this.progress.get(learnerId) ?? new Set<CanonicalId>();
    const completed: CanonicalId[] = [];
    const remaining: CanonicalId[] = [];
    for (const lesson of curriculum.lessons) {
      (done.has(lesson.conceptId) ? completed : remaining).push(lesson.conceptId);
    }
    return { learnerId, completed, remaining };
  }
}
