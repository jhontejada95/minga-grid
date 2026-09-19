import { keccak256, toBytes, type Hex } from "viem";

/**
 * Deterministic JSON serialization shared by the backend and the frontend.
 *
 * Rules (a strict subset of RFC 8785 sufficient for manifests and metadata):
 *  - object keys sorted by UTF-16 code unit order, no insignificant whitespace;
 *  - only null, booleans, finite numbers, strings, arrays and plain objects are allowed;
 *  - `undefined`, functions, symbols, bigint, NaN and Infinity are rejected instead of dropped.
 *
 * The exact string returned here is what gets hashed. Always store and expose this string,
 * never a re-serialization of a parsed copy.
 */
export function canonicalJsonStringify(value: unknown): string {
  return serialize(value, "$");
}

function serialize(value: unknown, at: string): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${at}`);
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item, i) => serialize(item, `${at}[${i}]`)).join(",")}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new Error(`Non-plain object at ${at}`);
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(record[k], `${at}.${k}`)}`).join(",")}}`;
    }
    default:
      throw new Error(`Unsupported value (${typeof value}) at ${at}`);
  }
}

/** keccak256 of the exact UTF-8 bytes of a canonical JSON string. */
export function hashCanonicalText(text: string): Hex {
  return keccak256(toBytes(text));
}

/** Canonicalize `value` and hash it: returns both, so callers store the exact bytes that were hashed. */
export function canonicalize(value: unknown): { text: string; hash: Hex } {
  const text = canonicalJsonStringify(value);
  return { text, hash: hashCanonicalText(text) };
}
