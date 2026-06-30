/** Translation capability (reference/deterministic). KMOS-0004 Language. */
import type { CapabilityHandler, CapabilityDescriptor, ReferenceCapability } from './contract.js';

export interface TranslationInput { readonly text: string; readonly targetLanguage: string; }
export interface TranslationOutput { readonly text: string; readonly targetLanguage: string; }

export const translationDescriptor: CapabilityDescriptor = {
  name: 'Translation', ownerDomain: 'Language', businessPurpose: 'Translate text into a target language',
  version: '1.0.0', inputs: ['Transcript'], outputs: ['Translation'],
  contract: { acceptedObjects: ['Transcript'], producedObjects: ['Translation'], consumedEvents: ['TranscriptCorrected'], publishedEvents: ['TranslationCompleted'] },
};

export const translation: ReferenceCapability<TranslationInput, TranslationOutput> = {
  descriptor: translationDescriptor,
  create(): CapabilityHandler<TranslationInput, TranslationOutput> {
    return {
      health: () => 'Ready',
      invoke: async (input) => ({ text: `[${input.targetLanguage}] ${input.text}`, targetLanguage: input.targetLanguage }),
    };
  },
};
