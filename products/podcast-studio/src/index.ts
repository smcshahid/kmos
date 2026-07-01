/**
 * @kmos/podcast-studio-app — Podcast Studio, the second flagship KMOS application.
 *
 * WP1 exposes the core product spine (compose → submit → verifiable knowledge). The
 * HTTP server + web UI, acquisition, audio/media, summaries, and packaging arrive in
 * later work packages (see engineering/KCSI-02-PODCAST-STUDIO-PLAN.md).
 */

export * from './types.js';
export * from './platform.js';
export * from './studio.js';
export * from './transcript.js';
export * from './chapters.js';
export * from './evidence.js';
export * from './acquisition.js';
export * from './subtitles.js';
export * from './clips.js';
export { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from './sample.js';
