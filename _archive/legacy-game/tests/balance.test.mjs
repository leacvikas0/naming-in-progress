import { strict as assert } from "node:assert";
import {
  computeWave,
  rollUpgrades,
  makeRng,
  CHARACTERS,
  ENEMY_TYPES,
  UPGRADES,
  clamp,
  angleDelta,
  damp,
} from "../src/balance.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("balance.js");

test("computeWave(1) starts small and simple", () => {
  const w = computeWave(1);
  assert.equal(w.count, 5);
  assert.equal(w.hpMult, 1);
  assert.equal(w.dmgMult, 1);
  assert.equal(w.eliteCount, 0);
  assert.ok(w.mix.length === 1);
  assert.equal(w.mix[0].type, "minion");
  assert.equal(w.mix[0].count, 5);
});

test("computeWave mix counts sum to count - elites", () => {
  for (let n = 1; n <= 40; n++) {
    const w = computeWave(n);
    const sum = w.mix.reduce((a, m) => a + m.count, 0);
    assert.equal(sum, w.count - w.eliteCount, `wave ${n}`);
  }
});

test("computeWave enemy mix is monotonically richer", () => {
  const typesAt = (n) => computeWave(n).mix.map((m) => m.type);
  assert.deepEqual(typesAt(1), ["minion"]);
  assert.ok(typesAt(2).includes("warrior"));
  assert.ok(typesAt(3).includes("rogue"));
  assert.ok(typesAt(4).includes("mage"));
});

test("computeWave elites every 4th wave", () => {
  assert.equal(computeWave(4).eliteCount, 1);
  assert.equal(computeWave(8).eliteCount, 2);
  assert.equal(computeWave(5).eliteCount, 0);
});

test("computeWave scales but stays bounded", () => {
  const w1 = computeWave(1);
  const w30 = computeWave(30);
  assert.ok(w30.hpMult > w1.hpMult);
  assert.ok(w30.dmgMult > w1.dmgMult);
  assert.ok(w30.speedMult <= 1.35);
  assert.ok(w30.count <= 22);
});

test("rollUpgrades returns distinct cards", () => {
  const rng = makeRng(42);
  for (let i = 0; i < 50; i++) {
    const cards = rollUpgrades(rng, 3);
    assert.equal(cards.length, 3);
    const ids = new Set(cards.map((c) => c.id));
    assert.equal(ids.size, 3);
    for (const c of cards) assert.ok(UPGRADES.some((u) => u.id === c.id));
  }
});

test("makeRng is deterministic for a seed", () => {
  const a = makeRng(7);
  const b = makeRng(7);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

test("every upgrade has id/name/desc/tier/apply and applies to a stat bag", () => {
  const fake = {
    stats: {
      damageMult: 1, moveSpeedMult: 1, critChance: 0.05, range: 0, arc: 0,
      coinMult: 1, attackSpeedMult: 1, lifesteal: 0, dodgeCooldownMult: 1, thorns: 0,
    },
    addMaxHp() {},
    heal() {},
  };
  for (const u of UPGRADES) {
    assert.ok(u.id && u.name && u.desc, u.id);
    assert.ok(["common", "rare", "epic"].includes(u.tier), u.id);
    u.apply(fake);
  }
});

test("all characters and enemies have required fields", () => {
  for (const [id, c] of Object.entries(CHARACTERS)) {
    assert.equal(c.id, id);
    assert.ok(c.glb.startsWith("/library/"));
    assert.ok(c.hp > 0 && c.damage > 0 && c.moveSpeed > 0);
    assert.ok(Array.isArray(c.combo) && c.combo.length >= 2);
    assert.equal(c.combo.length, c.swing.length);
    assert.ok(Array.isArray(c.keep), `${id} needs keep[]`);
  }
  for (const [id, e] of Object.entries(ENEMY_TYPES)) {
    assert.equal(e.id, id);
    assert.ok(e.glb.startsWith("/library/"));
    assert.ok(e.hp > 0 && e.speed > 0 && e.damage > 0);
    assert.ok(Array.isArray(e.keep), `${id} needs keep[]`);
  }
});

test("every hero flourishes with its own distinct clip", () => {
  // title.js picks the flourish via `pose`, falling back to `combo[0]`. A hero
  // with neither, or two heroes sharing a clip, is the identical-selection bug
  // this guards against.
  const flourish = (c) => c.pose || (Array.isArray(c.combo) ? c.combo[0] : null);
  const seen = new Map();
  for (const [id, c] of Object.entries(CHARACTERS)) {
    const clip = flourish(c);
    assert.ok(clip, `${id} resolves to no flourish clip`);
    assert.ok(
      clip !== "Cheer",
      `${id} falls back to the shared Cheer clip instead of a character move`
    );
    assert.ok(!seen.has(clip), `${id} and ${seen.get(clip)} share the flourish clip "${clip}"`);
    seen.set(clip, id);
  }
});

test("math helpers", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.ok(Math.abs(angleDelta(0.1, -0.1) - -0.2) < 1e-9);
  assert.ok(Math.abs(angleDelta(Math.PI * 0.9, -Math.PI * 0.9) - 0.2 * Math.PI) < 1e-9);
  assert.ok(damp(0, 10, 9, 1) > 9.9);

  const d1 = angleDelta(3, -3);
  assert.ok(Math.abs(d1) < Math.PI, "angleDelta returns shortest path");
  const wrapped = angleDelta(0, Math.PI * 4 + 0.5);
  assert.ok(Math.abs(wrapped - 0.5) < 1e-9, "angleDelta wraps full turns");
});

console.log(`\n${passed} passed`);
