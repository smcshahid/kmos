/**
 * Transcript-correction capability (reference/deterministic). KMOS-0004 Language.
 *
 * Defined in the DOMAIN's infrastructure layer because no reference capability
 * for it exists yet, but it is still a CAPABILITY (structural CapabilityHandler
 * with `invoke`/`health`), registered into the Capability Registry + Runtime and
 * executed via the Workflow Service. The business logic therefore lives in the
 * capability, not in the domain orchestration. A real engine (LLM/grammar model)
 * slots behind the same structural contract later (KMOS-0120 §13/§22).
 *
 * Deterministic behaviour: collapse runs of whitespace, trim the result, and
 * apply a provided vocabulary map of preferred spellings (case-insensitive,
 * whole-word replacement preserving the preferred spelling's casing).
 */

/** Structural copy of the kernel-free capability contract (no runtime dep). */
export type HealthState =
  | 'Unknown' | 'Starting' | 'Ready' | 'Busy' | 'Degraded' | 'Unavailable';

export interface InvocationContext {
  readonly capabilityId?: string;
  readonly version?: string;
  readonly correlationId?: string;
  readonly organizationId?: string;
  readonly configuration?: Readonly<Record<string, unknown>>;
}

export interface CapabilityHandler<I = unknown, O = unknown> {
  invoke(input: I, context: InvocationContext): Promise<O>;
  health(): HealthState;
}

export interface CapabilityDescriptor {
  readonly name: string;
  readonly ownerDomain: string;
  readonly businessPurpose: string;
  readonly version: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly contract: {
    readonly acceptedObjects: readonly string[];
    readonly producedObjects: readonly string[];
    readonly consumedEvents: readonly string[];
    readonly publishedEvents: readonly string[];
  };
}

export interface ReferenceCapability<I = unknown, O = unknown> {
  readonly descriptor: CapabilityDescriptor;
  create(): CapabilityHandler<I, O>;
}

export interface CorrectionInput {
  readonly text: string;
  /** Map of misspelling (any casing) -> preferred spelling. */
  readonly vocabulary?: Readonly<Record<string, string>>;
}
export interface CorrectionOutput {
  readonly text: string;
  /** Count of vocabulary substitutions applied (audit/lineage signal). */
  readonly corrections: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const transcriptCorrectionDescriptor: CapabilityDescriptor = {
  name: 'TranscriptCorrection',
  ownerDomain: 'Language',
  businessPurpose: 'Correct a raw transcript (normalize whitespace, apply preferred spellings)',
  version: '1.0.0',
  inputs: ['Transcript'],
  outputs: ['Transcript'],
  contract: {
    acceptedObjects: ['Transcript'],
    producedObjects: ['Transcript'],
    consumedEvents: [],
    publishedEvents: ['TranscriptCorrected'],
  },
};

/** The transcript-correction capability (structural ReferenceCapability). */
export const transcriptCorrection: ReferenceCapability<CorrectionInput, CorrectionOutput> = {
  descriptor: transcriptCorrectionDescriptor,
  create(): CapabilityHandler<CorrectionInput, CorrectionOutput> {
    return {
      health: () => 'Ready',
      invoke: async (input) => {
        let text = String(input.text ?? '').replace(/\s+/g, ' ').trim();
        let corrections = 0;
        const vocab = input.vocabulary ?? {};
        for (const [wrong, preferred] of Object.entries(vocab)) {
          if (wrong.length === 0) continue;
          const re = new RegExp(`\\b${escapeRegExp(wrong)}\\b`, 'gi');
          text = text.replace(re, () => { corrections += 1; return preferred; });
        }
        return { text, corrections };
      },
    };
  },
};
