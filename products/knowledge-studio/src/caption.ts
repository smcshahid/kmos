/**
 * Provider-independent caption/ASR adapter.
 *
 * On Olares (or any host) a YouTube video's transcript is produced by external
 * infrastructure — yt-dlp for existing captions, or Whisper/Speaches ASR over the
 * downloaded audio. Knowledge Studio does not couple to any one of these: it calls a
 * single HTTP endpoint that speaks a tiny contract, so the operator can point it at
 * whatever service their platform provides. When no endpoint is configured, YouTube
 * without a supplied transcript degrades honestly (the pipeline reports "needs infra").
 *
 * Contract (KS_CAPTION_ENDPOINT): POST { "videoId": "<id>" } → 200 with either
 *   { "transcript": "..." }  |  { "captions": "..." }  |  { "text": "..." }
 * or a plain-text body. A non-2xx or empty response means "no captions available".
 */

/** Build an async fetcher from an endpoint URL. Returns undefined-safe captions. */
export function makeHttpCaptionFetcher(
  endpoint: string,
  opts: { timeoutMs?: number } = {},
): (videoId: string) => Promise<string | undefined> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  return async (videoId: string): Promise<string | undefined> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
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
