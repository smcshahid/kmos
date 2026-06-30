/**
 * Minimal, deterministic JSON-Schema-style validator (zero runtime dependencies).
 *
 * The kernel deliberately avoids a heavy schema library to keep validation fully
 * deterministic and dependency-free for replay/governance. It supports the
 * subset needed for canonical objects and event payloads. A specialized
 * validator (e.g. Ajv) MAY be introduced later behind this same interface
 * without changing callers (KMOS-0100 §15, KMOS-0110 §13).
 */

import { isCanonicalId } from '../identifiers.js';

export type JsonType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

export interface Schema {
  readonly type?: JsonType;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly items?: Schema;
  readonly enum?: readonly unknown[];
  /** Supported formats: "date-time", "canonical-id". */
  readonly format?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly pattern?: string;
  readonly additionalProperties?: boolean;
  /** Documentation only. */
  readonly description?: string;
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

const ISO_DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function typeOf(value: unknown): JsonType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'string') return 'string';
  return 'object';
}

function typeMatches(expected: JsonType, value: unknown): boolean {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

function validateInto(schema: Schema, value: unknown, path: string, issues: ValidationIssue[]): void {
  if (schema.type !== undefined && !typeMatches(schema.type, value)) {
    issues.push({ path, message: `expected type ${schema.type}, got ${typeOf(value)}` });
    return; // further checks are unreliable on a type mismatch
  }

  if (schema.enum !== undefined && !schema.enum.includes(value as never)) {
    issues.push({ path, message: `value not in enum [${schema.enum.join(', ')}]` });
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path, message: `string shorter than minLength ${schema.minLength}` });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: `string does not match pattern ${schema.pattern}` });
    }
    if (schema.format === 'date-time' && !ISO_DATE_TIME_RE.test(value)) {
      issues.push({ path, message: `string is not an ISO-8601 date-time` });
    }
    if (schema.format === 'canonical-id' && !isCanonicalId(value)) {
      issues.push({ path, message: `string is not a canonical identifier` });
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({ path, message: `number below minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({ path, message: `number above maximum ${schema.maximum}` });
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, i) => validateInto(schema.items as Schema, item, `${path}[${i}]`, issues));
  }

  if (schema.type === 'object' && typeOf(value) === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) issues.push({ path: `${path}.${key}`, message: 'required property missing' });
    }
    const props = schema.properties ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) validateInto(sub, obj[key], `${path}.${key}`, issues);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) issues.push({ path: `${path}.${key}`, message: 'additional property not allowed' });
      }
    }
  }
}

/** Validate a value against a schema. */
export function validate(schema: Schema, value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateInto(schema, value, '$', issues);
  return { valid: issues.length === 0, issues };
}
