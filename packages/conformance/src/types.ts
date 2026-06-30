/**
 * KMOS Conformance Kit — core types.
 *
 * The kit defines what it means to be KMOS-compliant and is the long-term
 * mechanism that protects architectural integrity as KMOS evolves across
 * products, implementations, and teams (consultancy recommendation; KMOS-9999).
 *
 * It is FRAMEWORK-AGNOSTIC: a contract is a list of named checks; the runner
 * executes them and returns a structured, serializable report. This lets CI,
 * the SDK, and third-party adapter authors self-certify with only the kernel as
 * a dependency.
 */

/** Compliance levels a target may claim (ascending rigor). */
export const COMPLIANCE_LEVELS = ['Core', 'Certified', 'Reference'] as const;
export type ComplianceLevel = (typeof COMPLIANCE_LEVELS)[number];

/** A single conformance check. `run` throws (or rejects) on failure. */
export interface ConformanceCheck {
  /** Stable id, e.g. "eventlog.append.optimistic-concurrency". */
  readonly id: string;
  readonly description: string;
  /** Minimum level at which this check is mandatory (default 'Core'). */
  readonly level?: ComplianceLevel;
  run(): Promise<void> | void;
}

export interface ConformanceResult {
  readonly id: string;
  readonly description: string;
  readonly level: ComplianceLevel;
  readonly passed: boolean;
  readonly error?: string;
}

export interface ConformanceReport {
  readonly profile: string;
  readonly targetLevel: ComplianceLevel;
  readonly results: readonly ConformanceResult[];
  readonly passed: number;
  readonly failed: number;
  /** True when every check required at `targetLevel` (and below) passed. */
  readonly compliant: boolean;
  readonly generatedAt: string;
}
