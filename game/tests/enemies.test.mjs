// Enemy-side combat 2.0: auras, the six reactions, attack tokens, spikes, rage.
//
// The reaction table itself is tested in reactions.test.mjs against balance.js.
// This file tests the resolution path in enemies.js: that a second element
// converts an aura into the right reaction, that the reaction consumes the
// aura and applies the incoming element, and that the fight is throttled by
// attack tokens instead of piling on.
//
// Run: node game/tests/enemies.test.mjs

import { strict as assert } from "node:assert";
import { createEnemies } from "../src/enemies.js";
import { CONFIG, ENEMY_TYPES, REACTIONS, CHARACTERS } from "../src/balance.js";

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

function makeBus() {
  const log = [];
  const handlers = new Map();
  return {
    emit(name, payload) {
      log.push({ name, payload });
      const list = handlers.get(name);
      if (list) for (const fn of [...list]) fn(payload);
    },
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    events(name) {
      return log.filter((e) => e.name === name);
    },
    last(name) {
      const all = log.filter((e) => e.name === name);
      return all.length ? all[all.length - 1] : null;
    },
    has(name) {
      return log.some((e) => e.name === name);
    },
    reset() {
      log.length = 0;
    },
  };
}

const fakeWorld = {
  bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
  colliders: [],
  hazards: [],
  spawnPoint: () => ({ x: 0, z: 5 }),
};

// A loader that never resolves: models are irrelevant to the state machine
// under test, and this keeps node from trying to fetch GLBs over the network.
const deadLoader = { load() {} };

function makeEnemies(bus, world = fakeWorld) {
  return createEnemies({ scene: null, world, events: bus, rng: () => 0.5, loader: deadLoader });
}

function attackPayload(over = {}) {
  return {
    origin: { x: 0, y: 0, z: 0 },
    dir: { x: 0, y: 0, z: 1 },
    range: 100,
    arc: Math.PI * 2,
    damage: 10,
    heavy: false,
    crit: false,
    element: "frost",
    kind: "light",
    stun: 0,
    knockback: 0,
    reactionMult: 1,
    auraMult: 1,
    executeMult: 0,
    reactionHeal: 0,
    ...over,
  };
}

// Spawns one enemy directly through the public surface by driving a wave and
// then reading the list once the telegraph resolves. `hp` can be raised so a
// test can land several hits on a living target without killing it.
function spawnOne(bus, world = fakeWorld, hp = 100000) {
  const enemies = makeEnemies(bus, world);
  enemies.spawnWave({ n: 1, count: 1, mix: [{ type: "minion", count: 1 }] }, null);
  enemies.update(0.05, null);
  // Telegraph duration is combat.spawnTelegraph; step past it.
  for (let i = 0; i < 40 && enemies.list.length === 0; i++) enemies.update(0.05, null);
  assert.equal(enemies.list.length, 1, "expected exactly one enemy to spawn");
  const enemy = enemies.list[0];
  enemy.hp = hp;
  enemy.maxHp = hp;
  return { enemies, enemy };
}

console.log("enemy combat 2.0");

test("a hit applies its element as an aura", () => {
  const bus = makeBus();
  const { enemies, enemy } = spawnOne(bus);
  bus.emit("player-attack", attackPayload({ element: "frost" }));
  assert.equal(enemy.aura.element, "frost");
  assert.ok(enemy.aura.t > 0);
  assert.ok(bus.has("aura-applied"));
  assert.equal(bus.last("aura-applied").payload.element, "frost");
  enemies.clearAll();
});

test("the same element refreshes the aura instead of reacting", () => {
  const bus = makeBus();
  const { enemies, enemy } = spawnOne(bus);
  bus.emit("player-attack", attackPayload({ element: "frost" }));
  const first = enemy.aura.t;
  enemies.update(0.5, null);
  bus.emit("player-attack", attackPayload({ element: "frost" }));
  assert.ok(enemy.aura.t >= first, "refresh should not shorten the aura");
  assert.equal(bus.has("reaction"), false, "same element must not react");
  enemies.clearAll();
});

test("a different element converts the aura into its reaction", () => {
  const bus = makeBus();
  const { enemies, enemy } = spawnOne(bus);
  bus.emit("player-attack", attackPayload({ element: "frost" }));
  bus.emit("player-attack", attackPayload({ element: "ember" }));
  assert.ok(bus.has("reaction"), "expected a reaction");
  const r = bus.last("reaction").payload;
  assert.equal(r.type, "melt", "frost then ember is melt");
  assert.equal(r.name, REACTIONS.melt.name);
  assert.equal(enemy.aura.element, "ember", "the triggering element becomes the new aura");
  enemies.clearAll();
});

test("every unordered element pair reaches its own reaction", () => {
  const pairs = [
    ["frost", "ember", "melt"],
    ["ember", "shadow", "overload"],
    ["frost", "shadow", "shatter"],
    ["ember", "arcane", "detonate"],
    ["frost", "arcane", "frozen"],
    ["shadow", "arcane", "void"],
  ];
  for (const [a, b, expected] of pairs) {
    const bus = makeBus();
    const { enemies } = spawnOne(bus);
    bus.emit("player-attack", attackPayload({ element: a }));
    bus.emit("player-attack", attackPayload({ element: b }));
    const r = bus.last("reaction");
    assert.ok(r, `${a}+${b} produced no reaction`);
    assert.equal(r.payload.type, expected, `${a}+${b} should be ${expected}`);
    assert.equal(r.payload.color != null, true, `${expected} needs a color for fx`);
    enemies.clearAll();
  }
});

test("reactions are order-independent", () => {
  const forward = makeBus();
  const a = spawnOne(forward);
  forward.emit("player-attack", attackPayload({ element: "frost" }));
  forward.emit("player-attack", attackPayload({ element: "shadow" }));
  const first = forward.last("reaction").payload.type;
  a.enemies.clearAll();

  const backward = makeBus();
  const b = spawnOne(backward);
  backward.emit("player-attack", attackPayload({ element: "shadow" }));
  backward.emit("player-attack", attackPayload({ element: "frost" }));
  const second = backward.last("reaction").payload.type;
  b.enemies.clearAll();

  assert.equal(first, second);
  assert.equal(first, "shatter");
});

test("a reaction consumes the aura and re-arms it with the new element", () => {
  const bus = makeBus();
  const { enemies, enemy } = spawnOne(bus);
  bus.emit("player-attack", attackPayload({ element: "ember" }));
  bus.emit("player-attack", attackPayload({ element: "arcane" }));
  assert.equal(bus.last("reaction").payload.type, "detonate");
  assert.equal(enemy.aura.element, "arcane");
  assert.equal(enemy.aura.t > 0, true);
  enemies.clearAll();
});

test("an aura with no element on the hit is left alone", () => {
  const bus = makeBus();
  const { enemies, enemy } = spawnOne(bus);
  bus.emit("player-attack", attackPayload({ element: "frost" }));
  bus.emit("player-attack", attackPayload({ element: undefined }));
  assert.equal(enemy.aura.element, "frost", "an element-less hit must not consume the aura");
  assert.equal(bus.has("reaction"), false);
  enemies.clearAll();
});

test("reactionCount tracks reactions and resets per wave", () => {
  const bus = makeBus();
  const { enemies } = spawnOne(bus);
  bus.emit("player-attack", attackPayload({ element: "frost" }));
  bus.emit("player-attack", attackPayload({ element: "ember" }));
  assert.equal(enemies.reactionCount, 1);
  enemies.spawnWave({ n: 2, count: 1, mix: [{ type: "minion", count: 1 }] }, null);
  assert.equal(enemies.reactionCount, 0);
  enemies.clearAll();
});

test("melt softens the target: armor break raises incoming damage", () => {
  const bus = makeBus();
  const { enemies, enemy } = spawnOne(bus);
  bus.emit("player-attack", attackPayload({ element: "frost" }));
  bus.emit("player-attack", attackPayload({ element: "ember" }));
  assert.ok(enemy.armorBreakT > 0, "melt must apply armor break");
  const before = enemy.hp;
  bus.emit("player-attack", attackPayload({ element: "frost", damage: 10 }));
  const dealt = before - enemy.hp;
  assert.ok(dealt > 10, `armor break should amplify damage, dealt ${dealt}`);
  enemies.clearAll();
});

test("shatter freezes, and the next hit cashes the shatter bonus", () => {
  const bus = makeBus();
  const { enemies, enemy } = spawnOne(bus);
  bus.emit("player-attack", attackPayload({ element: "frost" }));
  bus.emit("player-attack", attackPayload({ element: "shadow" }));
  assert.ok(enemy.frozenT > 0, "shatter must freeze");
  assert.equal(enemy.shatterReady, true, "the freeze must be primed to shatter");

  const before = enemy.hp;
  bus.emit("player-attack", attackPayload({ element: "frost", damage: 10 }));
  const dealt = before - enemy.hp;
  assert.ok(dealt > 10, `the frozen target should take amplified damage, dealt ${dealt}`);

  // The hit that cashes the bonus also carries the next element, so it
  // re-triggers shatter and re-arms the freeze. Alternating the two elements
  // is therefore a sustained chain — that is the duo's identity, not a leak.
  assert.equal(enemy.shatterReady, true, "the same hit re-arms the shatter chain");
  assert.ok(enemy.frozenT > 0, "the chain keeps the target frozen");
  assert.equal(enemy.aura.element, "frost", "the aura tracks the latest element");
  enemies.clearAll();
});

test("frozen enemies do not act", () => {
  const bus = makeBus();
  const { enemies, enemy } = spawnOne(bus);
  const player = { position: { x: 0, y: 0, z: 0 }, radius: 0.55, isDodging: false };
  enemy.group.position.set(0, 0, 1);
  enemy.frozenT = 2;
  const before = enemy.group.position.z;
  enemies.update(0.5, player);
  assert.equal(enemy.group.position.z, before, "a frozen enemy must not move");
  assert.equal(enemy.state, "chase", "a frozen enemy must not hold a windup");
  enemies.clearAll();
});

test("burn ticks damage over time", () => {
  const bus = makeBus();
  const { enemies, enemy } = spawnOne(bus);
  enemy.burnT = 2;
  enemy.burnDps = 10;
  const before = enemy.hp;
  enemies.update(0.5, null);
  assert.ok(enemy.hp < before, "burn should tick damage");
  assert.ok(enemy.burnT > 0);
  enemies.clearAll();
});

test("at most maxAttackers enemies hold a windup at once", () => {
  const bus = makeBus();
  const enemies = makeEnemies(bus);
  enemies.spawnWave({ n: 1, count: 6, mix: [{ type: "minion", count: 6 }] }, null);
  const player = { position: { x: 0, y: 0, z: 0 }, radius: 0.55, isDodging: false };
  for (let i = 0; i < 200; i++) enemies.update(0.05, player);
  const winding = enemies.list.filter((e) => e.state === "windup").length;
  assert.ok(
    winding <= CONFIG.combat.maxAttackers,
    `expected at most ${CONFIG.combat.maxAttackers} attackers, saw ${winding}`
  );
  enemies.clearAll();
});

test("spikes damage enemies standing on them", () => {
  const bus = makeBus();
  const world = {
    ...fakeWorld,
    hazards: [{ x: 0, z: 5, radius: 1.5, damage: 9, tick: 1.1 }],
  };
  const { enemies, enemy } = spawnOne(bus, world);
  enemy.group.position.set(0, 0, 5);
  // The enemy spawned on the spike, so its cooldown is already running; clear
  // it to observe the tick this frame.
  enemy.hazardCd = 0;
  const before = enemy.hp;
  enemies.update(0.05, null);
  assert.ok(bus.has("hazard-hit"), "standing in spikes should emit hazard-hit");
  assert.equal(bus.last("hazard-hit").payload.target, "enemy");
  assert.ok(enemy.hp < before, "spikes should hurt");
  enemies.clearAll();
});

test("spikes respect their per-enemy tick cooldown", () => {
  const bus = makeBus();
  const world = {
    ...fakeWorld,
    hazards: [{ x: 0, z: 5, radius: 1.5, damage: 9, tick: 1.1 }],
  };
  const { enemies, enemy } = spawnOne(bus, world);
  enemy.group.position.set(0, 0, 5);
  enemy.hazardCd = 0;
  enemies.update(0.05, null);
  const hits = bus.events("hazard-hit").length;
  const afterFirst = enemy.hp;
  enemies.update(0.05, null);
  assert.equal(bus.events("hazard-hit").length, hits, "must not re-tick within the cooldown");
  assert.equal(enemy.hp, afterFirst, "no damage while the cooldown runs");
  enemies.clearAll();
});

test("elite rage raises speed once below half hp", () => {
  const bus = makeBus();
  const enemies = makeEnemies(bus);
  enemies.spawnWave({ n: 4, count: 1, eliteCount: 1, mix: [{ type: "minion", count: 1 }] }, null);
  for (let i = 0; i < 40 && enemies.list.length === 0; i++) enemies.update(0.05, null);
  const elite = enemies.list.find((e) => e.elite);
  assert.ok(elite, "expected an elite to spawn");
  const base = elite.speed;
  elite.hp = elite.maxHp * 0.4;
  enemies.update(0.05, null);
  assert.ok(elite.enraged, "the elite should enrage below half hp");
  assert.ok(elite.speed > base, "rage should raise speed");
  enemies.clearAll();
});

test("execute amplification applies only under the threshold", () => {
  const bus = makeBus();
  const { enemies, enemy } = spawnOne(bus);
  enemy.hp = enemy.maxHp * 0.8;
  let before = enemy.hp;
  bus.emit("player-attack", attackPayload({ element: undefined, damage: 10, executeMult: 1 }));
  const healthy = before - enemy.hp;
  enemy.hp = enemy.maxHp * 0.1;
  before = enemy.hp;
  bus.emit("player-attack", attackPayload({ element: undefined, damage: 10, executeMult: 1 }));
  const wounded = before - enemy.hp;
  assert.ok(wounded > healthy, `execute should amplify low-hp damage (${healthy} -> ${wounded})`);
  enemies.clearAll();
});

test("reaction heal is reported for the player to collect", () => {
  const bus = makeBus();
  const { enemies } = spawnOne(bus);
  bus.emit("player-attack", attackPayload({ element: "frost" }));
  bus.emit("player-attack", attackPayload({ element: "ember", reactionHeal: 6 }));
  assert.ok(bus.has("reaction-heal"), "expected a reaction-heal event");
  assert.equal(bus.last("reaction-heal").payload.amount, 6);
  enemies.clearAll();
});

test("hero elements match the spec so duos are meaningful", () => {
  assert.equal(CHARACTERS.knight.element, "frost");
  assert.equal(CHARACTERS.barbarian.element, "ember");
  assert.equal(CHARACTERS.rogue.element, "shadow");
  assert.equal(CHARACTERS.mage.element, "arcane");
  assert.equal(ENEMY_TYPES.minion != null, true);
});

console.log(`\n${passed} passed`);
