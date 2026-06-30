/**
 * Manual timer scheduler adapter (KMOS-0204 §5; determinism, Constitution §6).
 *
 * Arms timers without any real clock: registers callbacks keyed by timer id and
 * fires them only when `fire(id)` is invoked. Tests (and a real scheduler
 * adapter) drive expiry explicitly, so the engine core stays deterministic.
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type { TimerHandle, TimerScheduler } from '../application/ports.js';

export class ManualTimerScheduler implements TimerScheduler {
  private readonly callbacks = new Map<CanonicalId, () => void | Promise<void>>();

  arm(id: CanonicalId, onExpire: () => void | Promise<void>): TimerHandle {
    this.callbacks.set(id, onExpire);
    return {
      id,
      cancel: () => {
        this.callbacks.delete(id);
      },
    };
  }

  /** Whether a timer with this id is currently armed. */
  isArmed(id: CanonicalId): boolean {
    return this.callbacks.has(id);
  }

  /** Fire an armed timer, invoking its callback once and disarming it. */
  async fire(id: CanonicalId): Promise<void> {
    const cb = this.callbacks.get(id);
    if (!cb) throw new Error(`No armed timer: ${id}`);
    this.callbacks.delete(id);
    await cb();
  }
}
