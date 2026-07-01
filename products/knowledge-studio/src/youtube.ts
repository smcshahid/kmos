/**
 * YouTube source resolution (pure, no network by default).
 *
 * Parses a YouTube URL into a video id. In production, a `yt-dlp`-backed KMOS
 * capability downloads the video and fetches captions (or Whisper transcribes the
 * audio); that adapter is injected via {@link CaptionFetcher}. Offline / in the
 * reference build, no network call is made — the user supplies a transcript, which
 * is the honest, verifiable path. We never pretend to have fetched what we haven't.
 */

export interface YouTubeResolution {
  readonly videoId?: string;
  readonly canonicalUrl?: string;
  /** Captions text if a fetcher provided them; otherwise undefined (honest). */
  readonly captions?: string;
}

/** Optional injected adapter that fetches captions for a video id (production). */
export type CaptionFetcher = (videoId: string) => string | undefined;

const PATTERNS = [
  /(?:youtube\.com\/watch\?[^#]*\bv=)([A-Za-z0-9_-]{11})/,
  /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com\/(?:embed|shorts|live)\/)([A-Za-z0-9_-]{11})/,
];

export function parseVideoId(url: string): string | undefined {
  const trimmed = (url ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  for (const re of PATTERNS) {
    const m = re.exec(trimmed);
    if (m && m[1]) return m[1];
  }
  return undefined;
}

export function resolveYouTube(url: string, fetcher?: CaptionFetcher): YouTubeResolution {
  const videoId = parseVideoId(url);
  if (!videoId) return {};
  const captions = fetcher ? fetcher(videoId) : undefined;
  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    ...(captions ? { captions } : {}),
  };
}
