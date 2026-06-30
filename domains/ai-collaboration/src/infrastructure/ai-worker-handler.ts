/**
 * Composition adapter binding an AI worker's business logic to the Capability
 * Runtime's CapabilityHandler port. This lives in the domain (composition /
 * infrastructure layer), NOT in the runtime — the engine stays decoupled from
 * any specific AI model or worker.
 *
 * KMOS-0008: the implementation behind a capability may be any technology or AI
 * model and may be replaced, while the stable business contract is preserved.
 * The worker returns its output and a confidence; this adapter exposes it as a
 * runtime CapabilityHandler that is always operationally Ready.
 */
import type { InvocationContext, CapabilityHandler } from '@kmos/capability-runtime';
import type { HealthState } from '@kmos/capability-runtime';

/** The shape an AI worker output: a recommendation plus a confidence in [0,1]. */
export interface AiWorkerOutput {
  /** The AI worker's recommended output. Never authoritative on its own. */
  readonly output: unknown;
  /** AI-reported confidence in [0,1]; confidence never replaces verification. */
  readonly confidence: number;
}

/** The business logic of an AI worker: pure-ish function from input to output. */
export type AiWorkerFn = (
  input: Record<string, unknown>,
  context: InvocationContext,
) => Promise<AiWorkerOutput> | AiWorkerOutput;

/**
 * Adapt an AI worker function into a runtime CapabilityHandler. Health is always
 * Ready for an in-process worker; replace this adapter to back the worker with a
 * remote model whose health is probed.
 */
export class AiWorkerHandler implements CapabilityHandler<Record<string, unknown>, AiWorkerOutput> {
  private readonly fn: AiWorkerFn;
  constructor(fn: AiWorkerFn) {
    this.fn = fn;
  }
  async invoke(
    input: Record<string, unknown>,
    context: InvocationContext,
  ): Promise<AiWorkerOutput> {
    return this.fn(input, context);
  }
  health(): HealthState {
    return 'Ready';
  }
}
