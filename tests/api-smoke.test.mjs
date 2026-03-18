import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("auth api applies security headers", () => {
  const source = fs.readFileSync("api/auth/[action].ts", "utf8");
  assert.ok(source.includes("applySecurityHeaders(res)"));
});

test("invoice api has idempotency for critical writes", () => {
  const source = fs.readFileSync("api/invoices/index.ts", "utf8");
  assert.ok(source.includes("invoices.send"));
  assert.ok(source.includes("invoices.create"));
});

test("entries api supports manager approval route", () => {
  const source = fs.readFileSync("api/entries/index.ts", "utf8");
  assert.ok(source.includes('id === "approve"'));
  assert.ok(source.includes("approvalStatus"));
});
