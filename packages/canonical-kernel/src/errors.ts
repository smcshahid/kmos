/**
 * Error taxonomy (KMOS-0120 §18, KMOS-0180 §17).
 *
 * Capabilities and services SHALL classify failures so that business failures
 * remain distinguishable from infrastructure failures, and so that the Workflow
 * Service / Event Service can decide whether to retry, dead-letter, escalate, or
 * compensate. The categories below are the canonical failure classes.
 */

export const ERROR_CATEGORIES = [
  'Validation', // input/schema/business-rule violation — not retryable as-is
  'Policy', // refused by a governance/policy decision
  'Authorization', // authenticated but not permitted
  'Authentication', // identity not established
  'BusinessRule', // a domain invariant was violated
  'NotFound', // referenced canonical object does not exist
  'Conflict', // optimistic-concurrency / version conflict — caller may retry
  'Transient', // temporary infrastructure failure — retry with backoff
  'Permanent', // permanent infrastructure failure — do not retry
  'Infrastructure', // generic infrastructure failure
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** Categories for which a retry (with backoff) is meaningful. */
const RETRYABLE: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  'Conflict',
  'Transient',
  'Infrastructure',
]);

export interface KmosErrorOptions {
  readonly category: ErrorCategory;
  /** Stable machine-readable code, e.g. "asset.checksum.mismatch". */
  readonly code: string;
  /** Optional canonical id of the subject this error concerns. */
  readonly subject?: string;
  /** Arbitrary structured detail (no secrets). */
  readonly detail?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** Canonical error type carrying a classification usable by orchestration. */
export class KmosError extends Error {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly subject?: string;
  readonly detail?: Record<string, unknown>;

  constructor(message: string, options: KmosErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'KmosError';
    this.category = options.category;
    this.code = options.code;
    if (options.subject !== undefined) this.subject = options.subject;
    if (options.detail !== undefined) this.detail = options.detail;
  }

  /** Whether a consumer/orchestrator may retry the failed operation. */
  get retryable(): boolean {
    return RETRYABLE.has(this.category);
  }
}

export function isKmosError(value: unknown): value is KmosError {
  return value instanceof KmosError;
}

export function isRetryable(value: unknown): boolean {
  return isKmosError(value) && value.retryable;
}
