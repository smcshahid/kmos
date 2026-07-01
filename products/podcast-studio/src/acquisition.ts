/**
 * Episode acquisition (source resolution + RSS parsing).
 *
 * Provider-independent: the actual transcript comes from an injected fetcher (a
 * yt-dlp/Whisper/Speaches capability behind an HTTP contract — reused from
 * `@kmos/providers`). This module owns only the pure, offline parts: parsing an RSS
 * feed into selectable episodes, and resolving a source reference into a canonical
 * audio reference. When no fetcher is configured, acquisition degrades honestly
 * (the pipeline reports "needs infra") — we never pretend to have fetched audio.
 *
 * KCSI-02 WP2: RSS parsing + source resolution are candidate acquisition capabilities;
 * the transcript fetcher is the KCSI-01 caption/ASR adapter, reused unchanged.
 */

import { makeHttpCaptionFetcher, type CaptionFetcher } from '@kmos/providers';
import type { EpisodeKind } from './types.js';

/** A transcript/caption fetcher for a resolved audio reference (async; undefined = none). */
export type TranscriptFetcher = CaptionFetcher;

/** Build an HTTP transcript fetcher (reuses the KCSI-01 caption/ASR adapter). */
export const makeHttpTranscriptFetcher = makeHttpCaptionFetcher;

export interface ResolvedSource {
  /** Canonical audio reference passed to the transcript fetcher (id or URL). */
  readonly audioRef: string;
  readonly canonicalUrl?: string;
  readonly title?: string;
}

const YT_PATTERNS = [
  /(?:youtube\.com\/watch\?[^#]*\bv=)([A-Za-z0-9_-]{11})/,
  /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com\/(?:embed|shorts|live)\/)([A-Za-z0-9_-]{11})/,
];

export function parseYouTubeId(url: string): string | undefined {
  const trimmed = (url ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  for (const re of YT_PATTERNS) {
    const m = re.exec(trimmed);
    if (m && m[1]) return m[1];
  }
  return undefined;
}

/** Resolve a source reference into a canonical audio reference for the fetcher. Pure. */
export function resolveSource(kind: EpisodeKind, reference: string): ResolvedSource {
  const ref = (reference ?? '').trim();
  if (kind === 'youtube') {
    const id = parseYouTubeId(ref);
    if (!id) return { audioRef: '' };
    return { audioRef: `youtube:${id}`, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
  }
  // rss/audio: the reference is the enclosure/audio URL; upload/transcript: the name.
  return { audioRef: ref, ...(isUrl(ref) ? { canonicalUrl: ref } : {}) };
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

// --- RSS feed parsing (pure, offline) --------------------------------------

export interface FeedEpisode {
  readonly title: string;
  /** Enclosure audio URL — the reference to acquire this episode. */
  readonly audioUrl: string;
  readonly guid?: string;
  readonly published?: string;
  readonly durationSec?: number;
  readonly description?: string;
}

export interface PodcastFeed {
  readonly title: string;
  readonly description?: string;
  readonly episodes: readonly FeedEpisode[];
}

/**
 * Parse a podcast RSS/Atom feed into selectable episodes. Deterministic, dependency-
 * free, and tolerant of messy feeds (missing fields are simply absent). Never throws.
 */
export function parseRssFeed(xml: string): PodcastFeed {
  const text = xml ?? '';
  const channelTitle = firstTag(text, 'title') ?? 'Podcast';
  const channelDesc = firstTag(text, 'description');
  const items = [...matchAll(text, /<item\b[\s\S]*?<\/item>/gi)];
  const episodes: FeedEpisode[] = [];
  for (const item of items) {
    const title = firstTag(item, 'title') ?? 'Untitled episode';
    const audioUrl = enclosureUrl(item) ?? '';
    if (!audioUrl) continue; // an episode without audio isn't acquirable
    const guid = firstTag(item, 'guid');
    const published = firstTag(item, 'pubDate');
    const description = firstTag(item, 'description');
    const durationSec = parseDuration(firstTag(item, 'itunes:duration'));
    episodes.push({
      title, audioUrl,
      ...(guid ? { guid } : {}),
      ...(published ? { published } : {}),
      ...(durationSec !== undefined ? { durationSec } : {}),
      ...(description ? { description } : {}),
    });
  }
  return { title: channelTitle, ...(channelDesc ? { description: channelDesc } : {}), episodes };
}

function firstTag(scope: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(scope);
  if (!m || m[1] === undefined) return undefined;
  const val = decodeXml(stripCdata(m[1])).trim();
  return val.length > 0 ? val : undefined;
}

function enclosureUrl(item: string): string | undefined {
  // <enclosure url="..." type="audio/mpeg" .../>  (audio preferred)
  const encs = [...matchAll(item, /<enclosure\b[^>]*>/gi)];
  for (const enc of encs) {
    const url = attr(enc, 'url');
    const type = attr(enc, 'type') ?? '';
    if (url && (type.startsWith('audio') || type.startsWith('video') || type === '')) return url;
  }
  // Fallback: media:content url
  const media = /<media:content\b[^>]*\burl="([^"]+)"/i.exec(item);
  return media?.[1];
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag);
  return m?.[1];
}

function parseDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw); // seconds
  const parts = raw.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function matchAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  while ((m = g.exec(text)) !== null) { out.push(m[0]); if (m.index === g.lastIndex) g.lastIndex++; }
  return out;
}
