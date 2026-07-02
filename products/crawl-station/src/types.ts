/**
 * CrawlStation — product-facing types.
 *
 * These describe the PRODUCT's operational job-state and read models — the visible,
 * trustworthy acquisition experience. The canonical business objects (Asset, Provenance,
 * Lineage, KnowledgeObject, Trust) live in KMOS; the types here are thin projections and
 * app-owned job state the application coordinates. No business logic lives in this layer
 * (KMOS-9999 §9): the crawl frontier, HTML extraction, and URL rules are the product's
 * own pure modules, and everything canonical is delegated to KMOS platform services.
 */

import type { CanonicalId } from '@kmos/canonical-kernel';

/** How much of a site to acquire, and how politely. Every field has a safe default
 *  (see DEFAULT_CRAWL_CONFIG) so a first-time user only needs to paste a URL. */
export interface CrawlConfig {
  /** Link-hops from the seed page. 0 = just the seed. Default 2. */
  readonly maxDepth: number;
  /** Hard cap on pages fetched (protects the user and the target). Default 40. */
  readonly maxPages: number;
  /** Stay on the seed's site (www-insensitive). Default true. */
  readonly sameSiteOnly: boolean;
  /** Honor robots.txt exclusions and crawl-delay. Default true (and strongly advised). */
  readonly respectRobots: boolean;
  /** Minimum delay between requests to the same host, ms (politeness). Default 400. */
  readonly politenessMs: number;
  /** Concurrent in-flight fetches across hosts. Default 4. */
  readonly concurrency: number;
  /** Per-request timeout, ms. Default 15000. */
  readonly timeoutMs: number;
  /** Retry attempts on transient failure (network / 5xx / 429). Default 2. */
  readonly maxRetries: number;
}

export const DEFAULT_CRAWL_CONFIG: CrawlConfig = {
  maxDepth: 2,
  maxPages: 40,
  sameSiteOnly: true,
  respectRobots: true,
  politenessMs: 400,
  concurrency: 4,
  timeoutMs: 15000,
  maxRetries: 2,
};

/** Overall job lifecycle. */
export type CrawlStatus = 'queued' | 'crawling' | 'completed' | 'failed' | 'cancelled';

/** Per-page outcome. Every terminal state is honest — nothing is hidden. */
export type PageStatus =
  | 'queued'      // discovered, waiting in the frontier
  | 'fetching'    // request in flight
  | 'stored'      // fetched, extracted, and preserved as KMOS knowledge + evidence
  | 'skipped'     // out of scope / not a page / duplicate
  | 'excluded'    // disallowed by robots.txt
  | 'error';      // fetch or processing failed (after retries)

/** A single line in the live activity feed — the crawl should feel alive, not a spinner. */
export interface ActivityEvent {
  readonly at: string;                 // ISO-8601
  readonly kind: 'discover' | 'fetch' | 'store' | 'skip' | 'exclude' | 'redirect' | 'error' | 'info';
  readonly url: string;
  readonly message: string;
}

/** One acquired (or attempted) page and everything we know about it — provenance first. */
export interface PageRecord {
  readonly id: string;
  readonly url: string;                // the URL as discovered/requested
  readonly canonicalUrl: string;       // normalized identity used for dedup
  readonly depth: number;
  /** The page this URL was discovered on (the discovery path / lineage). */
  readonly discoveredFrom?: string;
  status: PageStatus;
  httpStatus?: number;
  /** Final URL after following redirects, when different from the request URL. */
  redirectedTo?: string;
  contentType?: string;
  title?: string;
  description?: string;
  lang?: string;
  wordCount?: number;
  linkCount?: number;
  imageCount?: number;
  /** sha-256 of the raw bytes — the integrity anchor for this evidence. */
  contentHash?: string;
  /** 0..1 heuristic confidence that readable content was cleanly extracted. */
  extractionConfidence?: number;
  fetchedAt?: string;
  durationMs?: number;
  error?: string;
  skipReason?: string;
  /** A bounded readable excerpt kept for the page-review drawer (the full readable
   *  content lives in KMOS as a derived Asset; job state stays lean). */
  excerpt?: string;
  // --- KMOS canonical ids produced for this page ---
  rawAssetId?: CanonicalId;            // preserved raw HTML (evidence)
  contentAssetId?: CanonicalId;        // derived readable content (lineage from raw)
  knowledgeId?: CanonicalId;           // the page as a KnowledgeObject (searchable, trusted)
  trusted?: boolean;
  trustScore?: number;
}

/** Aggregate counters for the dashboard + live crawl view. */
export interface CrawlStats {
  discovered: number;   // unique URLs seen
  queued: number;       // waiting in the frontier
  fetching: number;     // in flight
  stored: number;       // acquired into KMOS
  skipped: number;
  excluded: number;
  errors: number;
  redirects: number;
  totalBytes: number;
  totalWords: number;
}

export function emptyStats(): CrawlStats {
  return {
    discovered: 0, queued: 0, fetching: 0, stored: 0, skipped: 0,
    excluded: 0, errors: 0, redirects: 0, totalBytes: 0, totalWords: 0,
  };
}

/** The job + outputs for one acquisition run. Job state is app-local operational
 *  state; the knowledge, evidence, lineage, and trust it produced are durable in KMOS. */
export interface CrawlJob {
  readonly id: string;
  readonly seedUrl: string;
  readonly canonicalSeed: string;
  readonly site: string;               // host key for display
  title: string;                       // friendly name (site + started time)
  readonly config: CrawlConfig;
  status: CrawlStatus;
  error?: string;
  favorite: boolean;
  readonly createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  stats: CrawlStats;
  pages: PageRecord[];
  /** Bounded, most-recent-first ring of activity (kept small for the live feed). */
  activity: ActivityEvent[];
  /** Sitemaps advertised by robots.txt (informational). */
  sitemaps?: string[];
}

/** Light job summary for the dashboard / history lists. */
export interface CrawlSummary {
  readonly id: string;
  readonly title: string;
  readonly seedUrl: string;
  readonly site: string;
  readonly status: CrawlStatus;
  readonly error: string | null;
  readonly favorite: boolean;
  readonly pagesStored: number;
  readonly pagesTotal: number;
  readonly totalWords: number;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

/** The full, verifiable page view — assembled at read time from KMOS + the crawl record. */
export interface PageView {
  readonly id: string;
  readonly url: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly description: string;
  readonly lang: string;
  readonly wordCount: number;
  readonly linkCount: number;
  readonly imageCount: number;
  readonly httpStatus: number | null;
  readonly redirectedTo: string | null;
  readonly contentHash: string | null;
  readonly extractionConfidence: number | null;
  readonly depth: number;
  readonly discoveredFrom: string | null;
  readonly fetchedAt: string | null;
  /** A readable excerpt of the extracted content (bounded for the drawer). */
  readonly excerpt: string;
  /** Chain of custody: raw evidence → derived readable content. */
  readonly lineage: readonly LineageNode[];
  readonly trust: TrustView;
}

export interface LineageNode {
  readonly assetId: CanonicalId;
  readonly label: string;
  readonly kind: string;
}

/** Explainable trust — reasons, never a bare score (UX principle shared across KMOS apps). */
export interface TrustView {
  readonly trusted: boolean;
  readonly score: number;
  readonly reasons: readonly string[];
}
