/**
 * Metrics registry (KMOS-0200 §13, KMOS-9999 §18).
 *
 * A tiny, zero-dependency metrics toolkit every service can expose: counters
 * (monotonic), gauges (set/inc/dec), and timers (record an elapsed duration).
 *
 * Determinism: the registry never reads a real clock itself. A `now()` function
 * returning milliseconds is injected, so timer behaviour is fully reproducible
 * in tests and replay (constitution §6 — push non-determinism to adapters).
 */

/** Injectable monotonic-ish clock returning milliseconds. */
export type NowMs = () => number;

/** A monotonic counter. */
export interface Counter {
  /** Add `delta` (default 1). `delta` must be >= 0. */
  inc(delta?: number): void;
  value(): number;
}

/** A gauge: an instantaneous value that can move up or down. */
export interface Gauge {
  set(value: number): void;
  inc(delta?: number): void;
  dec(delta?: number): void;
  value(): number;
}

/** A stop function returned by `timer(name)`; call it to record the elapsed ms. */
export type StopTimer = () => number;

/** Aggregated timer statistics (durations in milliseconds). */
export interface TimerSnapshot {
  readonly count: number;
  readonly totalMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  /** Mean duration; 0 when no samples were recorded. */
  readonly avgMs: number;
}

/** A point-in-time view of every registered metric. */
export interface MetricsSnapshot {
  readonly counters: Readonly<Record<string, number>>;
  readonly gauges: Readonly<Record<string, number>>;
  readonly timers: Readonly<Record<string, TimerSnapshot>>;
}

class CounterImpl implements Counter {
  private current = 0;
  inc(delta = 1): void {
    if (delta < 0) throw new RangeError('Counter.inc requires a non-negative delta');
    this.current += delta;
  }
  value(): number {
    return this.current;
  }
}

class GaugeImpl implements Gauge {
  private current = 0;
  set(value: number): void {
    this.current = value;
  }
  inc(delta = 1): void {
    this.current += delta;
  }
  dec(delta = 1): void {
    this.current -= delta;
  }
  value(): number {
    return this.current;
  }
}

class TimerImpl {
  private count = 0;
  private totalMs = 0;
  private minMs = Number.POSITIVE_INFINITY;
  private maxMs = Number.NEGATIVE_INFINITY;

  record(elapsedMs: number): void {
    this.count += 1;
    this.totalMs += elapsedMs;
    if (elapsedMs < this.minMs) this.minMs = elapsedMs;
    if (elapsedMs > this.maxMs) this.maxMs = elapsedMs;
  }

  snapshot(): TimerSnapshot {
    if (this.count === 0) {
      return { count: 0, totalMs: 0, minMs: 0, maxMs: 0, avgMs: 0 };
    }
    return {
      count: this.count,
      totalMs: this.totalMs,
      minMs: this.minMs,
      maxMs: this.maxMs,
      avgMs: this.totalMs / this.count,
    };
  }
}

/**
 * In-process metrics registry. Counters/gauges/timers are created lazily and
 * memoized by name, so repeated `counter('x')` calls return the same instance.
 */
export class MetricsRegistry {
  private readonly now: NowMs;
  private readonly counters = new Map<string, CounterImpl>();
  private readonly gauges = new Map<string, GaugeImpl>();
  private readonly timers = new Map<string, TimerImpl>();

  constructor(options: { readonly now?: NowMs } = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  counter(name: string): Counter {
    let c = this.counters.get(name);
    if (c === undefined) {
      c = new CounterImpl();
      this.counters.set(name, c);
    }
    return c;
  }

  gauge(name: string): Gauge {
    let g = this.gauges.get(name);
    if (g === undefined) {
      g = new GaugeImpl();
      this.gauges.set(name, g);
    }
    return g;
  }

  /**
   * Start a timer for `name`. Returns a stop function; calling it records the
   * elapsed milliseconds (using the injected clock) and returns that elapsed
   * value. The stop function is idempotent — calling it more than once records
   * only the first measurement.
   */
  timer(name: string): StopTimer {
    let t = this.timers.get(name);
    if (t === undefined) {
      t = new TimerImpl();
      this.timers.set(name, t);
    }
    const timer = t;
    const startedAt = this.now();
    let stopped = false;
    return () => {
      const elapsed = this.now() - startedAt;
      if (!stopped) {
        stopped = true;
        timer.record(elapsed);
      }
      return elapsed;
    };
  }

  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    for (const [name, c] of this.counters) counters[name] = c.value();
    const gauges: Record<string, number> = {};
    for (const [name, g] of this.gauges) gauges[name] = g.value();
    const timers: Record<string, TimerSnapshot> = {};
    for (const [name, t] of this.timers) timers[name] = t.snapshot();
    return { counters, gauges, timers };
  }
}
