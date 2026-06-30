/**
 * Composition adapter binding the Workflow Service's CapabilityInvoker port to
 * the Capability Runtime. This lives in the domain (composition layer), NOT in
 * the Workflow Service — the engine stays decoupled from the runtime.
 */
import type { CanonicalId } from '@kmos/canonical-kernel';
import type { CapabilityInvoker, InvocationContext } from '@kmos/workflow';
import type { CapabilityRuntimeService } from '@kmos/capability-runtime';

export class RuntimeCapabilityInvoker implements CapabilityInvoker {
  private readonly runtime: CapabilityRuntimeService;
  constructor(runtime: CapabilityRuntimeService) {
    this.runtime = runtime;
  }
  async invoke(ref: CanonicalId | string, input: Record<string, unknown>, ctx: InvocationContext): Promise<unknown> {
    const opts: { correlationId?: string; organizationId?: string } = {};
    if (ctx.correlationId !== undefined) opts.correlationId = ctx.correlationId;
    if (ctx.organizationId !== undefined) opts.organizationId = ctx.organizationId;
    const res = await this.runtime.invoke(ref as CanonicalId, input, opts);
    if (!res.success) throw res.error;
    return res.output;
  }
}
