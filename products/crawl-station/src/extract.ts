/**
 * HTML content + metadata extraction — pure, dependency-free.
 *
 * Turns a fetched HTML document into the readable knowledge CrawlStation preserves:
 * a clean title, a description, the canonical URL, language, the main readable text
 * (boilerplate stripped), discovered links + images (resolved to absolute URLs), and a
 * transparent extraction-confidence score. This is a pragmatic, best-effort reader in
 * the spirit of Readability/Firecrawl — not a full DOM parser — kept deliberately
 * simple and total (never throws) so it runs safely inside the crawl loop and offline
 * tests. It is the product's own logic (CrawlStation is KMOS's first web-acquisition
 * app); a second consumer would justify promoting it to a shared capability.
 */

import { canonicalizeUrl, looksLikePage, tryParseUrl } from './urls.js';

export interface ExtractedPage {
  readonly title: string;
  readonly description: string;
  readonly canonicalUrl?: string;
  readonly siteName?: string;
  readonly lang?: string;
  /** The main readable text, boilerplate removed and whitespace collapsed. */
  readonly text: string;
  readonly wordCount: number;
  /** Absolute, deduped, http(s) links discovered on the page (in document order). */
  readonly links: readonly string[];
  /** Absolute image URLs discovered (in document order). */
  readonly images: readonly string[];
  /** 0..1 heuristic confidence that clean readable content was recovered. */
  readonly confidence: number;
}

/** Tags whose entire subtree is non-content and is dropped before reading. */
const DROP_BLOCKS = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'canvas'];
/** Structural boilerplate stripped from the reading scope when present. */
const BOILERPLATE = ['nav', 'header', 'footer', 'aside', 'form'];
/** Block-level tags converted to newlines so text keeps paragraph structure. */
const BLOCK_TAGS = /<\/?(?:p|div|section|article|main|br|li|ul|ol|tr|h[1-6]|blockquote|pre|figure|figcaption|table)\b[^>]*>/gi;

export function extractHtml(html: string, pageUrl: string): ExtractedPage {
  const doc = html ?? '';

  // 1) Strip comments + non-content subtrees up front so nothing below sees them.
  let cleaned = doc.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of DROP_BLOCKS) {
    cleaned = cleaned.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
    // Self-closing / unclosed variants.
    cleaned = cleaned.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), ' ');
  }

  // 2) Head-ish metadata (read from the cleaned doc; regexes are attribute-order tolerant).
  const rawTitle = firstTag(cleaned, 'title');
  const metaDesc = metaContent(cleaned, 'description') ?? ogContent(cleaned, 'description');
  const ogTitle = ogContent(cleaned, 'title');
  const siteName = ogContent(cleaned, 'site_name');
  const ogUrl = ogContent(cleaned, 'url');
  const canonicalHref = linkHref(cleaned, 'canonical') ?? ogUrl;
  const lang = htmlLang(cleaned) ?? localeFromOg(cleaned);

  const base = resolveBase(canonicalHref, pageUrl);
  const canonicalUrl = canonicalHref ? canonicalizeUrl(canonicalHref, pageUrl) : undefined;

  // 3) Links + images (resolved to absolute, deduped).
  const links = extractLinks(cleaned, base);
  const images = extractImages(cleaned, base);

  // 4) Readable text: prefer the largest <article>/<main>; else <body> minus boilerplate.
  const scope = readingScope(cleaned);
  const text = readableText(scope);
  const wordCount = countWords(text);

  const title = clean(ogTitle ?? rawTitle ?? '') || firstHeading(cleaned) || '(untitled)';
  const description = clean(metaDesc ?? '') || firstSentence(text);

  return {
    title,
    description,
    ...(canonicalUrl ? { canonicalUrl } : {}),
    ...(siteName ? { siteName: clean(siteName) } : {}),
    ...(lang ? { lang: lang.toLowerCase() } : {}),
    text,
    wordCount,
    links,
    images,
    confidence: scoreConfidence(wordCount, !!title && title !== '(untitled)', !!description),
  };
}

// --- metadata readers -------------------------------------------------------

function firstTag(scope: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(scope);
  return m?.[1];
}

/** <meta name="X" content="Y"> in either attribute order. */
function metaContent(scope: string, name: string): string | undefined {
  const re1 = new RegExp(`<meta\\b[^>]*\\bname=["']${name}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\bname=["']${name}["']`, 'i');
  return re1.exec(scope)?.[1] ?? re2.exec(scope)?.[1];
}

/** <meta property="og:X" content="Y"> in either attribute order. */
function ogContent(scope: string, prop: string): string | undefined {
  const re1 = new RegExp(`<meta\\b[^>]*\\bproperty=["']og:${prop}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\bproperty=["']og:${prop}["']`, 'i');
  return re1.exec(scope)?.[1] ?? re2.exec(scope)?.[1];
}

function linkHref(scope: string, rel: string): string | undefined {
  const re1 = new RegExp(`<link\\b[^>]*\\brel=["']${rel}["'][^>]*\\bhref=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<link\\b[^>]*\\bhref=["']([^"']*)["'][^>]*\\brel=["']${rel}["']`, 'i');
  return re1.exec(scope)?.[1] ?? re2.exec(scope)?.[1];
}

function htmlLang(scope: string): string | undefined {
  const m = /<html\b[^>]*\blang=["']([^"']+)["']/i.exec(scope);
  return m?.[1];
}

function localeFromOg(scope: string): string | undefined {
  const loc = ogContent(scope, 'locale');
  return loc ? loc.split(/[_-]/)[0] : undefined;
}

// --- links + images ---------------------------------------------------------

function extractLinks(scope: string, base: string | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*\bhref=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope)) !== null) {
    const href = (m[1] ?? '').trim();
    if (!href || href.startsWith('#') || /^(?:mailto|tel|javascript|data):/i.test(href)) continue;
    const abs = tryParseUrl(href, base);
    if (!abs) continue;
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    if (!looksLikePage(abs.toString())) continue;
    const key = canonicalizeUrl(abs.toString());
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(abs.toString());
  }
  return out;
}

function extractImages(scope: string, base: string | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope)) !== null) {
    const src = (m[1] ?? '').trim();
    if (!src || src.startsWith('data:')) continue;
    const abs = tryParseUrl(src, base);
    if (!abs || (abs.protocol !== 'http:' && abs.protocol !== 'https:')) continue;
    const key = abs.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

// --- readable text ----------------------------------------------------------

/** Choose the reading scope: the longest <article> or <main>, else <body> with
 *  structural boilerplate removed, else the whole cleaned document. */
function readingScope(cleaned: string): string {
  const candidates = [...blocks(cleaned, 'article'), ...blocks(cleaned, 'main')];
  if (candidates.length) {
    return candidates.reduce((a, b) => (b.length > a.length ? b : a));
  }
  const body = firstTag(cleaned, 'body') ?? cleaned;
  let scoped = body;
  for (const tag of BOILERPLATE) {
    scoped = scoped.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
  }
  return scoped;
}

function blocks(scope: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope)) !== null) out.push(m[1] ?? '');
  return out;
}

function readableText(scopeHtml: string): string {
  const withBreaks = scopeHtml.replace(BLOCK_TAGS, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = decodeEntities(stripped);
  // Collapse intra-line whitespace, trim lines, drop empty lines, cap blank runs.
  const lines = decoded.split('\n').map((l) => l.replace(/[ \t\f\v ]+/g, ' ').trim());
  const joined: string[] = [];
  let blank = 0;
  for (const line of lines) {
    if (line === '') { blank++; if (blank > 1) continue; joined.push(''); }
    else { blank = 0; joined.push(line); }
  }
  return joined.join('\n').trim();
}

function firstHeading(cleaned: string): string {
  for (let i = 1; i <= 3; i++) {
    const h = firstTag(cleaned, `h${i}`);
    if (h) { const t = clean(h.replace(/<[^>]+>/g, ' ')); if (t) return t; }
  }
  return '';
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const m = /^(.{0,240}?[.!?])(?:\s|$)/.exec(flat);
  const s = m ? m[1]! : flat.slice(0, 200);
  return s.trim();
}

// --- helpers ----------------------------------------------------------------

function resolveBase(canonicalHref: string | undefined, pageUrl: string): string | undefined {
  if (canonicalHref) {
    const abs = tryParseUrl(canonicalHref, pageUrl);
    if (abs) return abs.toString();
  }
  return tryParseUrl(pageUrl)?.toString() ?? pageUrl;
}

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/** Confidence rises with readable volume and the presence of a real title/description. */
function scoreConfidence(wordCount: number, hasTitle: boolean, hasDescription: boolean): number {
  let score = 0;
  score += Math.min(0.6, (wordCount / 200) * 0.6); // up to 0.6, full at ~200+ words
  if (hasTitle) score += 0.25;
  if (hasDescription) score += 0.15;
  return Math.round(Math.min(1, score) * 100) / 100;
}

function clean(s: string): string {
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©',
  reg: '®', trade: '™', mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«',
  raquo: '»', deg: '°', eacute: 'é', egrave: 'è', agrave: 'à',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? safeFromCodePoint(code) : whole;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}
