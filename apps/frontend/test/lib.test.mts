import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAmount, parseAmount, percent, relativeTime, shortAddress, formatUtc } from "../src/lib/format";
import { roleOf } from "../src/lib/role";
import { translateError } from "../src/lib/errors";

describe("formatAmount / parseAmount", () => {
  it("formats base units without floating point", () => {
    assert.equal(formatAmount("50000000"), "50.00");
    assert.equal(formatAmount("33333333"), "33.333333");
    assert.equal(formatAmount(0n), "0.00");
    assert.equal(formatAmount("1234567890000"), "1,234,567.89");
    assert.equal(formatAmount("1"), "0.000001");
    assert.equal(formatAmount("9007199254740993000000"), "9,007,199,254,740,993.00"); // beyond Number precision
  });

  it("parses user input into base units and rejects imprecise or malformed values", () => {
    assert.equal(parseAmount("50"), 50_000_000n);
    assert.equal(parseAmount("12.5"), 12_500_000n);
    assert.equal(parseAmount("0.000001"), 1n);
    assert.equal(parseAmount("0.0000001"), null); // more than 6 decimals
    assert.equal(parseAmount("-1"), null);
    assert.equal(parseAmount("1e3"), null);
    assert.equal(parseAmount(""), null);
    assert.equal(parseAmount("1,000"), null);
    assert.equal(parseAmount("80", 2), 8000n); // percent -> basis points
    assert.equal(parseAmount("33.33", 2), 3333n);
    assert.equal(parseAmount("33.333", 2), null);
  });

  it("round-trips", () => {
    for (const s of ["1", "0.5", "123.789012"]) assert.equal(formatAmount(parseAmount(s)!, 6, 0), s);
  });
});

describe("percent / dates / addresses", () => {
  it("computes progress with integers", () => {
    assert.equal(percent("0", "0"), 0);
    assert.equal(percent("50000000", "100000000"), 50);
    assert.equal(percent("1", "3"), 33.3);
  });
  it("formats relative time", () => {
    const now = Date.UTC(2026, 8, 19, 12, 0, 0);
    assert.equal(relativeTime(new Date(now + 3 * 3600_000 + 12 * 60_000).toISOString(), now), "in 3 h 12 min");
    assert.equal(relativeTime(new Date(now - 5 * 86_400_000).toISOString(), now), "5 d ago");
    assert.equal(relativeTime(new Date(now + 10_000).toISOString(), now), "in moments");
  });
  it("shows UTC and short addresses", () => {
    assert.equal(formatUtc("2026-09-19T14:22:59.000Z"), "2026-09-19 14:22 UTC");
    assert.equal(formatUtc(null), "—");
    assert.equal(shortAddress("0x1234567890abcdef1234567890abcdef12345678"), "0x1234…5678");
  });
});

describe("roleOf", () => {
  const p = { funder: "0xAaAaAaaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa", communitySigner: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", verifierSigner: "0xcccccccccccccccccccccccccccccccccccccccc" };
  it("matches case-insensitively and only per agreement", () => {
    assert.equal(roleOf(p, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "FUNDER");
    assert.equal(roleOf(p, "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"), "COMMUNITY");
    assert.equal(roleOf(p, p.verifierSigner), "REVIEWER");
    assert.equal(roleOf(p, "0xdddddddddddddddddddddddddddddddddddddddd"), "OBSERVER");
    assert.equal(roleOf(p, undefined), "OBSERVER");
  });
});

describe("translateError", () => {
  it("maps contract reverts found deep in viem's cause chain", () => {
    const err = { shortMessage: "The contract function reverted", cause: { cause: { reason: "Invalid verifier signature" } } };
    const f = translateError(err);
    assert.equal(f.code, "REVIEWER_SIGNATURE");
    assert.match(f.message, /reviewer/i);
  });
  it("recognises wallet rejection by code and by text", () => {
    assert.equal(translateError({ code: 4001, message: "x" }).code, "USER_REJECTED");
    assert.equal(translateError(new Error("User rejected the request.")).code, "USER_REJECTED");
  });
  it("passes API errors through with their stable code", () => {
    const e = Object.assign(new Error("Only the community representative can upload evidence."), { name: "ApiError", code: "NOT_COMMUNITY_REPRESENTATIVE" });
    assert.deepEqual(translateError(e), { code: "NOT_COMMUNITY_REPRESENTATIVE", message: "Only the community representative can upload evidence." });
  });
  it("explains missing gas and hides unknown internals", () => {
    assert.equal(translateError(new Error("insufficient funds for gas * price + value")).code, "NO_GAS");
    const u = translateError(new Error("0xdeadbeef selector blah"));
    assert.equal(u.code, "UNKNOWN");
    assert.doesNotMatch(u.message, /0xdeadbeef/);
    assert.match(u.technical ?? "", /0xdeadbeef/);
  });
});
