/**
 * Capability Runtime application layer (KMOS-0210; normative contract KMOS-0160).
 *
 * The Registry catalogs business abilities; the Runtime runs them. This
 * coordinator resolves the ACTIVE implementation for a (capabilityId, version?),
 * executes it behind its stable business contract, and surrounds execution with
 * the platform responsibilities the handler must not own itself:
 *
 *   - Isolation (KMOS-0160 §21): every invocation is wrapped in try/catch so one
 *     failing capability is contained and never throws across unrelated
 *     invocations. Failures are classified with the kernel KmosError taxonomy.
 *   - Observability (KMOS-0160 §15): CapabilityExecutionStarted is published
 *     before execution, then CapabilityExecutionCompleted on success or
 *     CapabilityExecutionFailed (with the classified error) on failure.
 *   - External configuration (KMOS-0160 §9): resolved through a ConfigurationPort
 *     and passed into the invocation context; no business config is baked in.
 *
 * The coordinator computes; it never coordinates (KMOS-0210 §6). It depends only
 * on ports; concrete adapters live in `infrastructure/`.
 */

import {
  EventBus,
  KmosError,
  createEvent,
  isKmosError,
  newCanonicalId,
  type CanonicalId,
} from '@kmos/canonical-kernel';
import type { HealthState } from '../domain/health.js';
import { isInvocable } from '../domain/health.js';
import { createRuntimeCatalog } from '../domain/runtime-catalog.js';
import type {
  CapabilityHandler,
  CapabilityResolver,
  ConfigurationPort,
  InvocationContext,
} from '../domain/ports.js';
import { InMemoryCapabilityResolver } from '../infrastructure/in-memory-resolver.js';
import { StaticConfigurationPort } from '../infrastructure/static-configuration.js';

const PRODUCER = 'CapabilityRuntime';

export interface CapabilityRuntimeOptions {
  /** Injected bus. Defaults to one bound to the local runtime event catalog. */
  readonly bus?: EventBus;
  /** Injected resolver. Defaults to an in-memory resolver. */
  readonly resolver?: CapabilityResolver;
  /** Injected configuration port. Defaults to an empty static port. */
  readonly configuration?: ConfigurationPort;
  /** Deterministic clock for emitted events (tests/replay). */
  readonly now?: () => string;
}

/** Context supplied by a caller (Workflow Service) for an invocation. */
export interface InvokeOptions {
  readonly correlationId?: string;
  readonly actorId?: CanonicalId;
  readonly organizationId?: CanonicalId;
  readonly executionId?: CanonicalId;
}

/** Outcome of an isolated invocation: never throws across the boundary. */
export interface InvocationResult<O = unknown> {
  readonly executionId: CanonicalId;
  readonly capabilityId: CanonicalId;
  readonly version: string;
  readonly success: boolean;
  readonly output?: O;
  readonly error?: KmosError;
}

export class CapabilityRuntimeService {
  private readonly bus: EventBus;
  private readonly resolver: CapabilityResolver;
  private readonly configuration: ConfigurationPort;
  private readonly now: () => string;

  constructor(options: CapabilityRuntimeOptions = {}) {
    // Default bus is bound to the LOCAL catalog so runtime execution events
    // validate while unregistered types are still rejected (KMOS-0210 §4).
    this.bus =
      options.bus ?? new EventBus({ catalog: createRuntimeCatalog() });
    this.resolver = options.resolver ?? new InMemoryCapabilityResolver();
    this.configuration = options.configuration ?? new StaticConfigurationPort();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Register and activate an implementation for a capability id + version.
   * Repeatable and idempotent in effect (latest-wins activation, KMOS-0160 §12).
   * Publishes CapabilityRuntimeRegistered.
   */
  async registerImplementation(
    capabilityId: CanonicalId,
    version: string,
    handler: CapabilityHandler,
  ): Promise<void> {
    this.resolver.register(capabilityId, version, handler);
    await this.publish('CapabilityRuntimeRegistered', capabilityId, {
      capabilityId,
      version,
      health: handler.health(),
    });
  }

  /**
   * Resolve the active implementation and execute it WITH ISOLATION. A failing
   * capability is contained: this method never throws across the boundary for a
   * handler fault; it returns an InvocationResult and publishes
   * CapabilityExecutionFailed with a classified KmosError. A subsequent
   * unrelated invocation is unaffected.
   */
  async invoke<I = unknown, O = unknown>(
    capabilityId: CanonicalId,
    input: I,
    options: InvokeOptions = {},
  ): Promise<InvocationResult<O>> {
    const executionId = newCanonicalId('CapabilityExecution');

    const resolved = this.resolver.resolve(capabilityId);
    if (resolved === undefined) {
      const error = new KmosError(`No active implementation for capability: ${capabilityId}`, {
        category: 'NotFound',
        code: 'capability.implementation.notfound',
        subject: capabilityId,
      });
      await this.publishFailure(executionId, capabilityId, undefined, error, options);
      return { executionId, capabilityId, version: '', success: false, error };
    }

    const { version, handler } = resolved;
    const context: InvocationContext = {
      capabilityId,
      version,
      ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
      ...(options.actorId !== undefined ? { actorId: options.actorId } : {}),
      ...(options.organizationId !== undefined ? { organizationId: options.organizationId } : {}),
      ...(options.executionId !== undefined ? { executionId: options.executionId } : {}),
      ...(this.resolveConfiguration(capabilityId, version) !== undefined
        ? { configuration: this.resolveConfiguration(capabilityId, version) }
        : {}),
    };

    // Refuse to invoke a handler that is not operationally available; this is an
    // operational (not business) failure and is retryable.
    const state = this.safeHealth(handler);
    if (!isInvocable(state)) {
      const error = new KmosError(`Capability not invocable in health state: ${state}`, {
        category: 'Transient',
        code: 'capability.health.unavailable',
        subject: capabilityId,
        detail: { health: state },
      });
      await this.publishFailure(executionId, capabilityId, version, error, options);
      return { executionId, capabilityId, version, success: false, error };
    }

    await this.publish(
      'CapabilityExecutionStarted',
      capabilityId,
      { executionId, capabilityId, version },
      options,
    );

    try {
      const output = (await handler.invoke(input, context)) as O;
      await this.publish(
        'CapabilityExecutionCompleted',
        capabilityId,
        { executionId, capabilityId, version },
        options,
      );
      return { executionId, capabilityId, version, success: true, output };
    } catch (caught) {
      // ISOLATION: the fault is contained here and classified; it does not
      // propagate to unrelated invocations.
      const error = this.classify(caught, capabilityId);
      await this.publishFailure(executionId, capabilityId, version, error, options);
      return { executionId, capabilityId, version, success: false, error };
    }
  }

  /** Surface the active (or specified) implementation's health (KMOS-0160 §14). */
  health(capabilityId: CanonicalId, version?: string): HealthState {
    const resolved = this.resolver.resolve(capabilityId, version);
    if (resolved === undefined) return 'Unknown';
    return this.safeHealth(resolved.handler);
  }

  /** The active version for a capability id, if any implementation is registered. */
  activeVersion(capabilityId: CanonicalId): string | undefined {
    return this.resolver.activeVersion(capabilityId);
  }

  // ---- internals ----

  private resolveConfiguration(
    capabilityId: CanonicalId,
    version: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.configuration.resolve(capabilityId, version);
  }

  /** A handler's health() must never break the runtime; treat faults as Unavailable. */
  private safeHealth(handler: CapabilityHandler): HealthState {
    try {
      return handler.health();
    } catch {
      return 'Unavailable';
    }
  }

  /** Classify an arbitrary thrown value into the canonical KmosError taxonomy. */
  private classify(caught: unknown, capabilityId: CanonicalId): KmosError {
    if (isKmosError(caught)) return caught;
    const message = caught instanceof Error ? caught.message : String(caught);
    return new KmosError(`Capability execution failed: ${message}`, {
      // An uncategorized throw from a handler is an opaque infrastructure fault.
      category: 'Infrastructure',
      code: 'capability.execution.unhandled',
      subject: capabilityId,
      cause: caught,
    });
  }

  private async publishFailure(
    executionId: CanonicalId,
    capabilityId: CanonicalId,
    version: string | undefined,
    error: KmosError,
    options: InvokeOptions = {},
  ): Promise<void> {
    await this.publish(
      'CapabilityExecutionFailed',
      capabilityId,
      {
        executionId,
        capabilityId,
        ...(version !== undefined ? { version } : {}),
        error: {
          category: error.category,
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      },
      options,
    );
  }

  private async publish(
    type: string,
    subjectId: CanonicalId,
    payload: Record<string, unknown>,
    options: InvokeOptions = {},
  ): Promise<void> {
    const event = createEvent({
      type,
      schemaVersion: '1.0',
      producer: PRODUCER,
      subjectId,
      payload,
      time: this.now(),
      ...(options.actorId !== undefined ? { actorId: options.actorId } : {}),
      ...(options.organizationId !== undefined ? { organizationId: options.organizationId } : {}),
      ...(options.executionId !== undefined || options.correlationId !== undefined
        ? {
            governance: {
              ...(options.executionId !== undefined ? { executionId: options.executionId } : {}),
            },
          }
        : {}),
    });
    await this.bus.publish(event, { streamId: subjectId });
  }
}
