/** Speech Recognition capability (reference/deterministic). KMOS-0004 Language. */
import type { CapabilityHandler, CapabilityDescriptor, ReferenceCapability } from './contract.js';

export interface TranscriptionInput { readonly audioRef: string; readonly language?: string; }
export interface TranscriptionOutput { readonly transcript: string; readonly language: string; readonly confidence: number; }

export const transcriptionDescriptor: CapabilityDescriptor = {
  name: 'SpeechRecognition', ownerDomain: 'Language', businessPurpose: 'Transcribe audio into text',
  version: '1.0.0', inputs: ['Asset'], outputs: ['Transcript'],
  contract: { acceptedObjects: ['Asset'], producedObjects: ['Transcript'], consumedEvents: ['AssetRegistered'], publishedEvents: ['TranscriptGenerated'] },
};

export const transcription: ReferenceCapability<TranscriptionInput, TranscriptionOutput> = {
  descriptor: transcriptionDescriptor,
  create(): CapabilityHandler<TranscriptionInput, TranscriptionOutput> {
    return {
      health: () => 'Ready',
      invoke: async (input) => ({
        transcript: `[transcript of ${input.audioRef}]`,
        language: input.language ?? 'en',
        confidence: 0.95,
      }),
    };
  },
};
