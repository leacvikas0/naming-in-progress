import { strict as assert } from "node:assert";
import {
  MOMENTUM_GAIN,
  momentumAfter,
  CONFIG,
  UPGRADES,
  computeWave,
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

console.log("momentum.js");

test("MOMENTUM_GAIN has the five spec sources", () => {
  assert.deepEqual(MOMENTUM_GAIN, {
    light: 6,
    heavy: 12,
    kill: 10,
    perfect: 25,
    reaction: 20,
  });
});

test("momentumAfter adds gain and clamps to [0, max]", () => {
  assert.equal(momentumAfter(0, 6, 100), 6);
  assert.equal(momentumAfter(50, 25, 100), 75);
  assert.equal(momentumAfter(95, 12, 100), 100);
  assert.equal(momentumAfter(0, -10, 100), 0);
  assert.equal(momentumAfter(100, 0, 100), 100);
});

test("momentumAfter clamps at the boundary exactly", () => {
  assert.equal(momentumAfter(99, 1, 100), 100);
  assert.equal(momentumAfter(99, 2, 100), 100);
  assert.equal(momentumAfter(1, -1, 100), 0);
  assert.equal(momentumAfter(0.5, -5, 100), 0);
});

test("momentumAfter works with a custom max", () => {
  assert.equal(momentumAfter(8, 6, 10), 10);
  assert.equal(momentumAfter(0, 12, 10), 10);
});

test("CONFIG.player gains the combat 2.0 momentum fields", () => {
  assert.equal(CONFIG.player.momentumMax, 100);
  assert.equal(CONFIG.player.perfectWindow, 3);
  assert.equal(CONFIG.player.perfectDamageMult, 1.25);
  assert.equal(CONFIG.player.swapCooldown, 1.5);
  assert.equal(CONFIG.player.swapIFrames, 0.25);
});

test("CONFIG.combat gains the combat 2.0 fields", () => {
  assert.equal(CONFIG.combat.maxAttackers, 3);
  assert.equal(CONFIG.combat.standoff, 3.6);
  assert.equal(CONFIG.combat.spikeDamage, 12);
  assert.equal(CONFIG.combat.spikeTick, 0.9);
  assert.equal(CONFIG.combat.auraTime, 5);
});

test("the six new upgrades exist with spec tiers", () => {
  const want = {
    focus: "rare",
    aura: "common",
    reactionary: "rare",
    core: "rare",
    swiftswap: "common",
    executioner: "epic",
  };
  for (const [id, tier] of Object.entries(want)) {
    const u = UPGRADES.find((x) => x.id === id);
    assert.ok(u, `missing upgrade ${id}`);
    assert.equal(u.tier, tier, id);
    assert.ok(u.name && u.desc, id);
  }
});

test("new upgrades apply to a full stat bag", () => {
  const fake = {
    stats: {
      damageMult: 1,
      moveSpeedMult: 1,
      critChance: 0.05,
      range: 0,
      arc: 0,
      coinMult: 1,
      attackSpeedMult: 1,
      lifesteal: 0,
      dodgeCooldownMult: 1,
      thorns: 0,
      reactionMult: 1,
      auraMult: 1,
      momentumMult: 1,
      swapCooldownMult: 1,
      executeMult: 0,
      reactionHeal: 0,
      swapSpeedMult: 1,
      swapSpeedTime: 0,
    },
    addMaxHp() {},
    heal() {},
  };
  for (const id of ["focus", "aura", "reactionary", "core", "swiftswap", "executioner"]) {
    const u = UPGRADES.find((x) => x.id === id);
    u.apply(fake);
  }
  assert.ok(Math.abs(fake.stats.reactionMult - 1.4) < 1e-9, "focus");
  assert.ok(Math.abs(fake.stats.auraMult - 1.5) < 1e-9, "aura");
  assert.equal(fake.stats.reactionHeal, 6, "reactionary");
  assert.ok(Math.abs(fake.stats.momentumMult - 1.25) < 1e-9, "core");
  assert.ok(Math.abs(fake.stats.swapCooldownMult - 0.6) < 1e-9, "swiftswap cooldown");
  assert.ok(Math.abs(fake.stats.swapSpeedMult - 1.15) < 1e-9, "swiftswap speed");
  assert.equal(fake.stats.swapSpeedTime, 2, "swiftswap window");
  assert.ok(Math.abs(fake.stats.executeMult - 0.3) < 1e-9, "executioner");
});

test("computeWave modifier is deterministic and follows the n % 5 schedule", () => {
  for (let n = 1; n <= 40; n++) {
    const m = computeWave(n).modifier;
    if (n % 4 === 0) {
      assert.equal(m && m.id, "elites", `wave ${n}`);
    } else if (n % 5 === 2) {
      assert.equal(m && m.id, "swarm", `wave ${n}`);
    } else if (n % 5 === 3) {
      assert.equal(m && m.id, "arcane", `wave ${n}`);
    } else if (n % 5 === 4) {
      assert.equal(m && m.id, "horde", `wave ${n}`);
    } else {
      assert.equal(m, null, `wave ${n}`);
    }
  }
});

test("computeWave modifiers carry id/name/desc", () => {
  for (const n of [4, 7, 8, 13, 14]) {
    const m = computeWave(n).modifier;
    assert.ok(m, `wave ${n}`);
    assert.ok(typeof m.id === "string" && m.id.length > 0, `wave ${n} id`);
    assert.ok(typeof m.name === "string" && m.name.length > 0, `wave ${n} name`);
    assert.ok(typeof m.desc === "string" && m.desc.length > 0, `wave ${n} desc`);
  }
});

test("elite waves keep their eliteCount behavior under the elites modifier", () => {
  assert.equal(computeWave(4).eliteCount, 1);
  assert.equal(computeWave(8).eliteCount, 2);
  assert.equal(computeWave(12).eliteCount, 2);
});

test("swarm waves keep mix counts === count - eliteCount", () => {
  const w = computeWave(7);
  assert.equal(w.modifier.id, "swarm");
  const sum = w.mix.reduce((a, m) => a + m.count, 0);
  assert.equal(sum, w.count - w.eliteCount);
});

console.log(`\n${passed} passed`);
