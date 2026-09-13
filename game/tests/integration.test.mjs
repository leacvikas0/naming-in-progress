import { strict as assert } from "node:assert";

const base = new URL("../src/", import.meta.url);
const THREE = await import("three").catch(() => null);

if (!THREE) {
  console.log("three not installed locally — skipping player/enemies integration test");
  process.exit(0);
}

console.log("integration smoke (needs three)");
console.log("  ok  placeholder");
