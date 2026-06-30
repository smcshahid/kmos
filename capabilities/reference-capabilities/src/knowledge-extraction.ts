/** Knowledge Extraction capability (reference/deterministic). KMOS-0004 Knowledge. */
import type { CapabilityHandler, CapabilityDescriptor, ReferenceCapability } from './contract.js';

export interface ExtractionInput { readonly text: string; }
export interface ExtractedConcept { readonly canonicalName: string; readonly definition: string; }
export interface ExtractionOutput { readonly concepts: readonly ExtractedConcept[]; }

export const knowledgeExtractionDescriptor: CapabilityDescriptor = {
  name: 'KnowledgeExtraction', ownerDomain: 'Knowledge', businessPurpose: 'Extract concepts from text',
  version: '1.0.0', inputs: ['Transcript'], outputs: ['Concept'],
  contract: { acceptedObjects: ['Transcript'], producedObjects: ['Concept'], consumedEvents: ['TranscriptCorrected'], publishedEvents: ['KnowledgeExtracted'] },
};

/** Deterministic "extraction": capitalized words longer than 4 chars become concepts. */
export const knowledgeExtraction: ReferenceCapability<ExtractionInput, ExtractionOutput> = {
  descriptor: knowledgeExtractionDescriptor,
  create(): CapabilityHandler<ExtractionInput, ExtractionOutput> {
    return {
      health: () => 'Ready',
      invoke: async (input) => {
        const seen = new Set<string>();
        const concepts: ExtractedConcept[] = [];
        for (const raw of input.text.split(/\W+/)) {
          const w = raw.trim();
          if (w.length > 4 && w[0] === w[0]?.toUpperCase() && !seen.has(w.toLowerCase())) {
            seen.add(w.toLowerCase());
            concepts.push({ canonicalName: w, definition: `Concept "${w}" extracted from source text.` });
          }
        }
        return { concepts };
      },
    };
  },
};
