/** Conformance runner + tiny assertion helpers (no test-framework dependency). */
import { COMPLIANCE_LEVELS, type ComplianceLevel, type ConformanceCheck, type ConformanceReport, type ConformanceResult } from './types.js';

const RANK: Record<ComplianceLevel, number> = { Core: 0, Certified: 1, Reference: 2 };

/** Assertion helpers used inside contract checks. */
export function expect(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
export function expectEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) throw new Error(`${message ?? 'values differ'}: expected ${String(expected)}, got ${String(actual)}`);
}
export async function expectRejects(fn: () => unknown, pattern: RegExp, message: string): Promise<void> {
  try { await fn(); } catch (e) { const m = e instanceof Error ? e.message : String(e); if (pattern.test(m)) return; throw new Error(`${message}: error "${m}" did not match ${pattern}`); }
  throw new Error(`${message}: expected a rejection matching ${pattern}`);
}

/** Run a set of checks for a profile at a target level; returns a report. */
export async function runConformance(
  profile: string,
  checks: readonly ConformanceCheck[],
  targetLevel: ComplianceLevel = 'Core',
  now: () => string = () => new Date().toISOString(),
): Promise<ConformanceReport> {
  const required = (c: ConformanceCheck): boolean => RANK[c.level ?? 'Core'] <= RANK[targetLevel];
  const results: ConformanceResult[] = [];
  for (const c of checks) {
    if (!required(c)) continue;
    try {
      await c.run();
      results.push({ id: c.id, description: c.description, level: c.level ?? 'Core', passed: true });
    } catch (e) {
      results.push({ id: c.id, description: c.description, level: c.level ?? 'Core', passed: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const failed = results.filter((r) => !r.passed).length;
  return { profile, targetLevel, results, passed: results.length - failed, failed, compliant: failed === 0, generatedAt: now() };
}

/** Render a report as a concise human-readable string. */
export function formatReport(r: ConformanceReport): string {
  const head = `KMOS Conformance — ${r.profile} @ ${r.targetLevel}: ${r.compliant ? 'COMPLIANT ✅' : 'NON-COMPLIANT ❌'} (${r.passed}/${r.passed + r.failed})`;
  const lines = r.results.map((x) => `  ${x.passed ? 'PASS' : 'FAIL'}  [${x.level}] ${x.id}${x.passed ? '' : ' — ' + x.error}`);
  return [head, ...lines].join('\n');
}

export { COMPLIANCE_LEVELS };
