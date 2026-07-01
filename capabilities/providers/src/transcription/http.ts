/**
 * HTTP caption/ASR transcription-acquisition provider (KCSI-01 WP3).
 *
 * A source's transcript is produced by external infrastructure — yt-dlp for existing
 * captions, or Whisper/Speaches ASR over the downloaded audio. Applications do not
 * couple to any one of these: they call a single HTTP endpoint that speaks a tiny
 * contract, so the operator points it at whatever their platform provides. When the
 * endpoint has nothing (or fails), the fetcher returns `undefined` — the caller
 * degrades honestly ("needs infra"). No throw: graceful degradation is the contract.
 *
 * Relocated verbatim-in-behavior from products/knowledge-studio/src/caption.ts so the
 * application no longer carries provider HTTP logic. The returned fetcher is **async**
 * — this also fixes the app's dead sync `CaptionFetcher` type-smell (youtube.ts:19).
 * See documentation/CAPABILITY-EVOLUTION-ROADMAP.md §3.
 *
 * Contract (endpoint): POST { "videoId": "<id>" } → 200 with either
 *   { "transcript": "..." }  |  { "captions": "..." }  |  { "text": "..." }
 * or a plain-text body. A non-2xx or empty response means "no captions available".
 */

/** Fetches a transcript/captions for a source id. Async; `undefined` = none (honest). */
export type CaptionFetcher = (videoId: string) => Promise<string | undefined>;

/** Build an async caption/ASR fetcher from an endpoint URL. Never throws. */
export function makeHttpCaptionFetcher(
  endpoint: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): CaptionFetcher {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const doFetch = opts.fetchImpl ?? fetch;
  return async (videoId: string): Promise<string | undefined> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
        signal: controller.signal,
      });
      if (!res.ok) return undefined;
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const body = (await res.json()) as Record<string, unknown>;
        const text = body.transcript ?? body.captions ?? body.text;
        return typeof text === 'string' && text.trim() ? text : undefined;
      }
      const text = await res.text();
      return text.trim() ? text : undefined;
    } catch {
      return undefined; // network error / timeout → honest degradation upstream
    } finally {
      clearTimeout(timer);
    }
  };
}
