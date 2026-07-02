/**
 * robots.txt parsing + matching — pure, dependency-free.
 *
 * Trust begins with respect: CrawlStation honors robots.txt by default. This module
 * parses a robots.txt body into the group that applies to our user-agent and answers
 * "may I fetch this path?" using the widely-implemented longest-match rule (the most
 * specific Allow/Disallow wins; Allow wins exact ties), with `*` wildcards and `$`
 * end-anchors. It also surfaces Crawl-delay and Sitemap hints.
 *
 * Deterministic and total: malformed input yields permissive-but-safe defaults, never
 * an exception, so the crawl frontier can trust it in its hot loop.
 */

interface Rule {
  readonly allow: boolean;
  /** Original path pattern (may contain * and $). */
  readonly pattern: string;
  /** Precomputed specificity: pattern length excluding wildcard chars. */
  readonly length: number;
}

export interface RobotsRules {
  /** True when `path` (pathname + query) may be fetched by our agent. */
  isAllowed(path: string): boolean;
  /** Advertised crawl-delay in seconds for our agent, if any. */
  readonly crawlDelaySec?: number;
  /** Sitemaps declared anywhere in the file (agent-independent). */
  readonly sitemaps: readonly string[];
}

/** A permissive ruleset (used when there is no robots.txt or it cannot be fetched). */
export function allowAll(): RobotsRules {
  return { isAllowed: () => true, sitemaps: [] };
}

/**
 * Parse a robots.txt body and resolve the rules for `userAgent` (matched
 * case-insensitively by longest agent token; falls back to the `*` group).
 */
export function parseRobots(body: string, userAgent: string): RobotsRules {
  const ua = userAgent.toLowerCase();
  const lines = (body ?? '').split(/\r?\n/);

  // Collect groups: each is a set of user-agent tokens plus its directives.
  interface Group { agents: string[]; rules: Rule[]; delay?: number }
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | undefined;
  let sawDirective = false; // a new User-agent after a directive starts a new group

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (!current || sawDirective) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawDirective = false;
      }
      if (value) current.agents.push(value.toLowerCase());
    } else if (field === 'disallow' || field === 'allow') {
      if (!current) { current = { agents: ['*'], rules: [] }; groups.push(current); }
      sawDirective = true;
      // An empty Disallow means "allow everything" — represented as no constraint.
      if (field === 'disallow' && value === '') continue;
      current.rules.push(makeRule(field === 'allow', value));
    } else if (field === 'crawl-delay') {
      if (!current) { current = { agents: ['*'], rules: [] }; groups.push(current); }
      sawDirective = true;
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.delay = n;
    } else if (field === 'sitemap') {
      if (value) sitemaps.push(value);
    }
  }

  // Choose the group whose agent token is the longest prefix-match of our UA
  // (Google's rule). Prefer a specific match over '*'.
  let best: Group | undefined;
  let bestScore = -1;
  for (const g of groups) {
    for (const token of g.agents) {
      let score = -1;
      if (token === '*') score = 0;
      else if (ua.includes(token)) score = token.length;
      if (score > bestScore) { bestScore = score; best = g; }
    }
  }

  const rules = best?.rules ?? [];
  const result: RobotsRules = {
    sitemaps,
    ...(best?.delay !== undefined ? { crawlDelaySec: best.delay } : {}),
    isAllowed(path: string): boolean {
      // The most specific (longest) matching rule wins; on exact-length ties Allow
      // wins over Disallow. No matching rule → allowed.
      let best: Rule | undefined;
      for (const rule of rules) {
        if (!matches(rule.pattern, path)) continue;
        if (!best || rule.length > best.length || (rule.length === best.length && rule.allow && !best.allow)) {
          best = rule;
        }
      }
      return best ? best.allow : true;
    },
  };
  return result;
}

function makeRule(allow: boolean, pattern: string): Rule {
  const length = pattern.replace(/[*$]/g, '').length;
  return { allow, pattern, length };
}

function stripComment(line: string): string {
  const hash = line.indexOf('#');
  return hash >= 0 ? line.slice(0, hash) : line;
}

/**
 * Match a robots path pattern against a path. Supports `*` (any run of chars) and a
 * trailing `$` end-anchor. A pattern without `$` matches as a prefix (per the standard).
 */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const core = anchored ? pattern.slice(0, -1) : pattern;
  if (core === '') return false;
  const parts = core.split('*');
  let idx = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part === '') continue;
    if (i === 0) {
      // First literal segment must match at the start (prefix semantics).
      if (!path.startsWith(part, idx)) return false;
      idx += part.length;
    } else {
      const found = path.indexOf(part, idx);
      if (found < 0) return false;
      idx = found + part.length;
    }
  }
  if (anchored) {
    // The last segment must reach exactly the end of the path.
    const last = parts[parts.length - 1]!;
    return last === '' ? idx === path.length : path.endsWith(last) && idx === path.length;
  }
  return true;
}
