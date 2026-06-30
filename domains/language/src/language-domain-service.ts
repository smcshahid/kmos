/**
 * Language domain service (KMOS-0002/0004 Language, KMOS-0005 institutional
 * memory).
 *
 * A DOMAIN composes capabilities into a business solution; it contains no
 * business logic itself (that lives in capabilities) and coordinates through the
 * Workflow Service, which executes capabilities via the Capability Runtime. This
 * domain takes a raw transcript and, through a declarative workflow:
 *   1. corrects it            (transcript-correction capability)
 *   2. extracts concepts      (knowledge-extraction capability)
 *   3. optionally translates  (translation capability)
 * then persists the results into the Knowledge Service as institutional memory:
 * a Concept KnowledgeObject per extracted concept and a multilingual Vocabulary
 * entry per concept (one language-independent KnowledgeObject; translations
 * never duplicate it — KMOS-0130 §14). Domain events TranscriptCorrected and
 * VocabularyLearned are emitted on the shared bus.
 */

import {
  EventBus, createEvent, type CanonicalId,
} from '@kmos/canonical-kernel';
import type { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { WorkflowService } from '@kmos/workflow';
import { KnowledgeService } from '@kmos/knowledge';
import { translation, knowledgeExtraction } from '@kmos/reference-capabilities';
import type { ReferenceCapability } from '@kmos/reference-capabilities';
import { RuntimeCapabilityInvoker } from './infrastructure/runtime-invoker.js';
import { transcriptCorrection } from './infrastructure/transcript-correction.js';

export interface LanguageDomainOptions {
  readonly bus: EventBus;
  readonly knowledge: KnowledgeService;
  readonly registry: CapabilityRegistryService;
  readonly runtime: CapabilityRuntimeService;
  readonly now?: () => string;
}

export interface ProcessTranscriptInput {
  readonly transcript: string;
  /** If set, the corrected transcript is also translated into this language. */
  readonly targetLanguage?: string;
  readonly organizationId?: CanonicalId;
  /** Optional preferred-spelling map applied by the correction capability. */
  readonly vocabulary?: Readonly<Record<string, string>>;
  /** Primary language of the transcript (default 'en'). */
  readonly sourceLanguage?: string;
}

export interface ProcessTranscriptResult {
  readonly correctedTranscript: string;
  readonly translatedTranscript?: string;
  /** Concept KnowledgeObject ids created in the Knowledge Service. */
  readonly conceptIds: readonly CanonicalId[];
  /** Vocabulary object ids created in the Knowledge Service. */
  readonly vocabularyIds: readonly CanonicalId[];
  readonly workflowExecutionId: CanonicalId;
  readonly state: string;
}

interface ExtractedConcept { readonly canonicalName: string; readonly definition: string; }

export class LanguageDomainService {
  private readonly bus: EventBus;
  private readonly knowledge: KnowledgeService;
  private readonly registry: CapabilityRegistryService;
  private readonly runtime: CapabilityRuntimeService;
  private readonly workflow: WorkflowService;
  private readonly now: () => string;
  private correctionCapabilityId?: CanonicalId;
  private extractionCapabilityId?: CanonicalId;
  private translationCapabilityId?: CanonicalId;

  constructor(opts: LanguageDomainOptions) {
    this.bus = opts.bus;
    this.knowledge = opts.knowledge;
    this.registry = opts.registry;
    this.runtime = opts.runtime;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.workflow = new WorkflowService({ bus: this.bus, invoker: new RuntimeCapabilityInvoker(this.runtime), now: this.now });
  }

  /** Register (descriptor in Registry, implementation in Runtime) the
   * capabilities this domain composes. Idempotent per instance. */
  async setup(): Promise<void> {
    this.correctionCapabilityId = await this.register(transcriptCorrection as unknown as ReferenceCapability);
    this.extractionCapabilityId = await this.register(knowledgeExtraction as ReferenceCapability);
    this.translationCapabilityId = await this.register(translation as ReferenceCapability);
  }

  private async register(refCap: ReferenceCapability): Promise<CanonicalId> {
    const d = refCap.descriptor;
    const cap = await this.registry.registerCapability({
      name: d.name, ownerDomain: d.ownerDomain, businessPurpose: d.businessPurpose, version: d.version,
      inputs: [...d.inputs], outputs: [...d.outputs],
      contract: {
        consumedEvents: [...d.contract.consumedEvents], publishedEvents: [...d.contract.publishedEvents],
        acceptedObjects: [...d.contract.acceptedObjects], producedObjects: [...d.contract.producedObjects],
      },
    });
    await this.runtime.registerImplementation(cap.id, d.version, refCap.create());
    return cap.id;
  }

  /**
   * Turn a raw transcript into institutional memory: correct it, extract
   * concepts, optionally translate, then persist concepts + multilingual
   * vocabulary into the Knowledge Service. All work runs in capabilities via the
   * workflow/runtime; the domain only coordinates and persists results.
   */
  async processTranscript(input: ProcessTranscriptInput): Promise<ProcessTranscriptResult> {
    if (!this.correctionCapabilityId) await this.setup();
    const correctId = this.correctionCapabilityId as CanonicalId;
    const extractId = this.extractionCapabilityId as CanonicalId;
    const translateId = this.translationCapabilityId as CanonicalId;
    const sourceLanguage = input.sourceLanguage ?? 'en';
    const wantsTranslation = input.targetLanguage !== undefined;

    // Coordinate correction -> extraction -> (translation) via the workflow.
    const steps: Array<Record<string, unknown>> = [
      { id: 'correct', kind: 'activity', capabilityRef: correctId, input: { text: '$input.transcript' } },
      { id: 'extract', kind: 'activity', capabilityRef: extractId, input: { text: '$steps.correct.text' } },
    ];
    if (wantsTranslation) {
      steps.push({ id: 'translate', kind: 'activity', capabilityRef: translateId, input: { text: '$steps.correct.text', targetLanguage: '$input.targetLanguage' } });
    }

    const def = await this.workflow.registerWorkflow({
      name: 'language.process-transcript', ownerDomain: 'Language',
      businessPurpose: 'Correct, extract concepts from, and optionally translate a transcript',
      steps: steps as never,
    });
    const startInput: Record<string, unknown> = { transcript: input.transcript };
    if (wantsTranslation) startInput.targetLanguage = input.targetLanguage;
    // The correction capability also receives the preferred-spelling vocabulary,
    // wired as a literal step input so the work stays inside the capability.
    if (input.vocabulary !== undefined) {
      (steps[0] as { input: Record<string, unknown> }).input.vocabulary = '$input.vocabulary';
      startInput.vocabulary = input.vocabulary;
    }
    const exec = await this.workflow.start(def.id, startInput);

    const stepResults = exec.body.stepResults;
    const correctedTranscript = String((stepResults['correct']?.output as { text?: string } | undefined)?.text ?? '');
    const concepts = ((stepResults['extract']?.output as { concepts?: readonly ExtractedConcept[] } | undefined)?.concepts ?? []) as readonly ExtractedConcept[];
    const translatedTranscript = wantsTranslation
      ? String((stepResults['translate']?.output as { text?: string } | undefined)?.text ?? '')
      : undefined;

    // Emit the corrected-transcript domain event (work proven done by capability).
    await this.emit('TranscriptCorrected', def.id, {
      workflowExecutionId: exec.id, conceptCount: concepts.length,
    }, input.organizationId);

    // Persist concepts as institutional memory + multilingual vocabulary.
    const conceptIds: CanonicalId[] = [];
    const vocabularyIds: CanonicalId[] = [];
    for (const c of concepts) {
      // One language-independent Concept KnowledgeObject (reuse if present).
      const existing = this.knowledge.getConcept(c.canonicalName, sourceLanguage, input.organizationId);
      const concept = existing ?? await this.knowledge.createKnowledge({
        category: 'Concept', canonicalName: c.canonicalName, definition: c.definition,
        primaryLanguage: sourceLanguage,
        ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      });
      conceptIds.push(concept.id);

      // Source-language vocabulary entry on the same KnowledgeObject.
      const srcVocab = await this.knowledge.addVocabulary(concept.id, { language: sourceLanguage, preferredTerm: c.canonicalName });
      vocabularyIds.push(srcVocab.id);
      await this.emit('VocabularyLearned', concept.id, {
        knowledgeId: concept.id, language: sourceLanguage, preferredTerm: c.canonicalName,
      }, input.organizationId);

      // Multilingual: a target-language vocabulary entry on the SAME KO (no
      // duplicate KnowledgeObject) when a translation was requested.
      if (wantsTranslation) {
        const targetLanguage = input.targetLanguage as string;
        const tgtVocab = await this.knowledge.addVocabulary(concept.id, {
          language: targetLanguage, preferredTerm: `[${targetLanguage}] ${c.canonicalName}`,
        });
        vocabularyIds.push(tgtVocab.id);
        await this.emit('VocabularyLearned', concept.id, {
          knowledgeId: concept.id, language: targetLanguage, preferredTerm: `[${targetLanguage}] ${c.canonicalName}`,
        }, input.organizationId);
      }
    }

    return {
      correctedTranscript,
      ...(translatedTranscript !== undefined ? { translatedTranscript } : {}),
      conceptIds, vocabularyIds,
      workflowExecutionId: exec.id, state: exec.body.state,
    };
  }

  private async emit(type: string, subjectId: CanonicalId, payload: Record<string, unknown>, organizationId?: CanonicalId): Promise<void> {
    const ev = createEvent({
      type, schemaVersion: '1.0', producer: 'LanguageDomain', subjectId, payload, time: this.now(),
      ...(organizationId !== undefined ? { organizationId } : {}),
    });
    await this.bus.publish(ev, { streamId: subjectId });
  }
}
