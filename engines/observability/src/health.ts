/**
 * Health registry (KMOS-0200 §13, KMOS-9999 §18).
 *
 * Every service exposes a health endpoint that aggregates named checks (storage
 * reachable, broker connected, dependencies healthy, ...). Checks are pure
 * functions of current state; `overall()` aggregates them into one verdict.
 *
 * Aggregation rule: the service is Ready only when no check is Degraded or
 * Unavailable. Any Unavailable makes the whole service Unavailable; otherwise
 * any Degraded makes it Degraded; otherwise Ready.
 */

/** Health states, ordered best to worst. */
export const HEALTH_STATES = ['Ready', 'Degraded', 'Unavailable'] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

/** The result of a single named health check. */
export interface HealthCheckResult {
  readonly state: HealthState;
  /** Optional human-readable explanation (e.g. "primary db unreachable"). */
  readonly detail?: string;
}

/** A health check: a synchronous function returning the current result. */
export type HealthCheck = () => HealthCheckResult;

/** Per-check result keyed by name, plus the aggregate state. */
export interface HealthReport {
  readonly state: HealthState;
  readonly checks: Readonly<Record<string, HealthCheckResult>>;
}

const SEVERITY: Readonly<Record<HealthState, number>> = {
  Ready: 0,
  Degraded: 1,
  Unavailable: 2,
};

/** A registry of named health checks. */
export class HealthRegistry {
  private readonly checks = new Map<string, HealthCheck>();

  /** Register (or replace) a named check. Returns `this` for chaining. */
  register(name: string, check: HealthCheck): this {
    this.checks.set(name, check);
    return this;
  }

  unregister(name: string): boolean {
    return this.checks.delete(name);
  }

  /** Run all checks and produce a per-check + aggregate report. */
  report(): HealthReport {
    const checks: Record<string, HealthCheckResult> = {};
    let worst: HealthState = 'Ready';
    for (const [name, check] of this.checks) {
      const result = check();
      checks[name] = result;
      if (SEVERITY[result.state] > SEVERITY[worst]) worst = result.state;
    }
    return { state: worst, checks };
  }

  /** The aggregate state only (Ready unless any check is Degraded/Unavailable). */
  overall(): HealthState {
    return this.report().state;
  }
}
