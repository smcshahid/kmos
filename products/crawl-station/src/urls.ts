/**
 * URL normalization, canonicalization, and scope rules — pure, dependency-free.
 *
 * Web acquisition lives or dies on URL identity: the same page reached by two paths
 * must dedupe to ONE canonical URL, and the crawler must stay inside the scope the
 * user asked for. These are the product's own rules (CrawlStation is KMOS's first
 * web-acquisition app), kept local until a second consumer justifies promotion to a
 * shared capability (evidence-first extraction mandate; KMOS-9999 §7).
 *
 * Nothing here performs I/O. Everything is deterministic and total (never throws) so
 * it is trivially testable offline and safe inside the crawl frontier's hot loop.
 */

/** Tracking/junk query params stripped during canonicalization (order-independent). */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'igshid', 'ref', 'ref_src', 'source',
  '_ga', '_gl', 'yclid', 'msclkid', 'spm', 'vero_id', 'oly_anon_id', 'oly_enc_id',
]);

/** File extensions we never treat as crawlable HTML pages (assets, binaries, feeds). */
const NON_PAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff', 'avif',
  'mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'flac', 'm4a',
  'pdf', 'zip', 'gz', 'tar', 'rar', '7z', 'dmg', 'exe', 'bin', 'iso',
  'css', 'js', 'mjs', 'map', 'json', 'xml', 'rss', 'atom',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv',
]);

/** Parse a URL, returning undefined instead of throwing on malformed input. */
export function tryParseUrl(raw: string, base?: string): URL | undefined {
  try {
    return base ? new URL(raw, base) : new URL(raw);
  } catch {
    return undefined;
  }
}

/**
 * Canonicalize a URL to a stable identity for deduplication:
 *  - lowercase scheme + host, drop default ports (:80/:443)
 *  - drop the fragment (#…) — never a distinct page
 *  - strip known tracking params, then sort the survivors
 *  - collapse a bare/trailing-slash path to "/", otherwise strip one trailing slash
 * Returns the input trimmed if it cannot be parsed (so callers still have something).
 */
export function canonicalizeUrl(raw: string, base?: string): string {
  const u = tryParseUrl(raw, base);
  if (!u) return raw.trim();
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return u.toString();

  u.hostname = u.hostname.toLowerCase();
  u.hash = '';
  if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
    u.port = '';
  }

  // Prune + sort query params for order-independent identity.
  const kept: [string, string][] = [];
  for (const [k, v] of u.searchParams) {
    if (!TRACKING_PARAMS.has(k.toLowerCase())) kept.push([k, v]);
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  u.search = '';
  for (const [k, v] of kept) u.searchParams.append(k, v);

  // Normalize the path: "" → "/", strip a single trailing slash (but keep root "/").
  let path = u.pathname || '/';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  u.pathname = path;

  return u.toString();
}

/** The registrable-ish host key used for same-site comparisons (host without leading www.). */
export function siteKey(raw: string): string | undefined {
  const u = tryParseUrl(raw);
  if (!u) return undefined;
  return u.hostname.toLowerCase().replace(/^www\./, '');
}

/** True when `candidate` is on the same site as `seed` (www-insensitive host match). */
export function sameSite(seed: string, candidate: string): boolean {
  const a = siteKey(seed);
  const b = siteKey(candidate);
  return a !== undefined && a === b;
}

/** File extension of a URL's path (lowercased, no dot), or '' when none. */
export function pathExtension(raw: string): string {
  const u = tryParseUrl(raw);
  const path = u?.pathname ?? raw;
  const last = path.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : '';
}

/** True when the URL looks like a crawlable HTML page (http/https, not a known asset type). */
export function looksLikePage(raw: string): boolean {
  const u = tryParseUrl(raw);
  if (!u) return false;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const ext = pathExtension(raw);
  return ext === '' || !NON_PAGE_EXTENSIONS.has(ext);
}

/** A short, human-friendly label for a URL (path + query), used in the live activity feed. */
export function shortLabel(raw: string): string {
  const u = tryParseUrl(raw);
  if (!u) return raw;
  const pathAndQuery = `${u.pathname}${u.search}`;
  return pathAndQuery === '/' || pathAndQuery === '' ? u.hostname : pathAndQuery;
}
