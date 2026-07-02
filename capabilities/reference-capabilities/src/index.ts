/** @kmos/reference-capabilities — deterministic reference capabilities. */
export * from './contract.js';
export * from './compose.js';
export * from './transcription.js';
export * from './translation.js';
export * from './knowledge-extraction.js';
export * from './rendering.js';

import { transcription } from './transcription.js';
import { translation } from './translation.js';
import { knowledgeExtraction } from './knowledge-extraction.js';
import { rendering } from './rendering.js';
import type { ReferenceCapability } from './contract.js';

/** All reference capabilities, for bulk registration into Registry + Runtime. */
export const referenceCapabilities: readonly ReferenceCapability[] = [
  transcription as ReferenceCapability,
  translation as ReferenceCapability,
  knowledgeExtraction as ReferenceCapability,
  rendering as ReferenceCapability,
];
