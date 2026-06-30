/**
 * Structured logging (KMOS-0200 §13, KMOS-9999 §18).
 *
 * Emits structured records — never free-form strings — so logs are queryable
 * and correlatable. Records are sent to an injectable sink; the default sink
 * collects in memory, which keeps logging deterministic and side-effect-free in
 * tests (constitution §6). Production wires a sink that writes JSON lines.
 */

/** Severity levels, ordered least to most severe. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Structured fields attached to a record. Values must be JSON-serializable. */
export type LogFields = Readonly<Record<string, unknown>>;

/** A single structured log record. */
export interface LogRecord {
  readonly level: LogLevel;
  readonly message: string;
  readonly fields: LogFields;
  /** ISO-8601 timestamp from the injected clock. */
  readonly time: string;
}

/** A sink consumes emitted records. */
export interface LogSink {
  emit(record: LogRecord): void;
}

/** Injectable clock returning an ISO-8601 timestamp. */
export type NowIso = () => string;

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** A sink that collects records in memory; ideal for tests and buffering. */
export class InMemoryLogSink implements LogSink {
  private readonly buffer: LogRecord[] = [];
  emit(record: LogRecord): void {
    this.buffer.push(record);
  }
  /** All records emitted so far, in order. */
  records(): readonly LogRecord[] {
    return [...this.buffer];
  }
  clear(): void {
    this.buffer.length = 0;
  }
}

export interface StructuredLoggerOptions {
  readonly sink?: LogSink;
  readonly now?: NowIso;
  /** Drop records below this level. Defaults to 'debug' (emit everything). */
  readonly minLevel?: LogLevel;
  /** Fields merged into every record (e.g. { service: 'events' }). */
  readonly baseFields?: LogFields;
}

/**
 * Structured logger. Each method builds a {@link LogRecord} and hands it to the
 * sink. `child(fields)` returns a logger that merges additional base fields,
 * useful for per-request or per-correlation context.
 */
export class StructuredLogger {
  private readonly sink: LogSink;
  private readonly now: NowIso;
  private readonly minRank: number;
  private readonly baseFields: LogFields;

  constructor(options: StructuredLoggerOptions = {}) {
    this.sink = options.sink ?? new InMemoryLogSink();
    this.now = options.now ?? (() => new Date().toISOString());
    this.minRank = LEVEL_RANK[options.minLevel ?? 'debug'];
    this.baseFields = options.baseFields ?? {};
  }

  /** The sink in use (exposed so tests can read collected records). */
  get target(): LogSink {
    return this.sink;
  }

  log(level: LogLevel, message: string, fields: LogFields = {}): void {
    if (LEVEL_RANK[level] < this.minRank) return;
    const record: LogRecord = {
      level,
      message,
      fields: { ...this.baseFields, ...fields },
      time: this.now(),
    };
    this.sink.emit(record);
  }

  debug(message: string, fields?: LogFields): void {
    this.log('debug', message, fields);
  }
  info(message: string, fields?: LogFields): void {
    this.log('info', message, fields);
  }
  warn(message: string, fields?: LogFields): void {
    this.log('warn', message, fields);
  }
  error(message: string, fields?: LogFields): void {
    this.log('error', message, fields);
  }

  /** Derive a logger sharing the same sink/clock with extra base fields. */
  child(fields: LogFields): StructuredLogger {
    return new StructuredLogger({
      sink: this.sink,
      now: this.now,
      minLevel: invertRank(this.minRank),
      baseFields: { ...this.baseFields, ...fields },
    });
  }
}

function invertRank(rank: number): LogLevel {
  for (const level of LOG_LEVELS) {
    if (LEVEL_RANK[level] === rank) return level;
  }
  return 'debug';
}
