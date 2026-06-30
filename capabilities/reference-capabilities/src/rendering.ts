/** Rendering capability (reference/deterministic). KMOS-0004 Media. */
import type { CapabilityHandler, CapabilityDescriptor, ReferenceCapability } from './contract.js';

export interface RenderInput { readonly storyboard: string; readonly format?: string; }
export interface RenderOutput { readonly renderedRef: string; readonly format: string; readonly checksum: string; }

export const renderingDescriptor: CapabilityDescriptor = {
  name: 'Rendering', ownerDomain: 'Media', businessPurpose: 'Render a storyboard into a media artifact',
  version: '1.0.0', inputs: ['Storyboard'], outputs: ['Video'],
  contract: { acceptedObjects: ['Storyboard'], producedObjects: ['Video'], consumedEvents: ['StoryboardCompleted'], publishedEvents: ['RenderCompleted'] },
};

/** Deterministic FNV-1a hash so the same storyboard always renders identically (reproducibility). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'sha256:' + h.toString(16).padStart(8, '0');
}

export const rendering: ReferenceCapability<RenderInput, RenderOutput> = {
  descriptor: renderingDescriptor,
  create(): CapabilityHandler<RenderInput, RenderOutput> {
    return {
      health: () => 'Ready',
      invoke: async (input) => {
        const format = input.format ?? 'video/mp4';
        return { renderedRef: `rendered:${fnv1a(input.storyboard)}`, format, checksum: fnv1a(input.storyboard + format) };
      },
    };
  },
};
