// The mage's spellbook rotation: Frost Lance -> Storm Lance -> Glacial Crown.
//
// Covers the cast contract for all three spells (shape, element, damage,
// cooldown, rotation), refusal/cancel/swap/reset behaviour, and the enemies.js
// damage fronts (line timing/clipping and circle ring expansion, one contact
// per target per cast, negative cases, clearAll cleanup).
//
// Run: node game/tests/ice-lance.test.mjs

import { strict as assert } from "node:assert";
import { createPlayer } from "../src/player.js";
import { createEnemies } from "../src/enemies.js";
import { CONFIG, CHARACTERS, MOMENTUM_GAIN } from "../src/balance.js";
import { ICE_LANCE } from "../src/ice-lance-config.js";
import { STORM_LANCE } from "../src/storm-lance-config.js";
import { GLACIAL_CROWN } from "../src/glacial-crown-config.js";
import { ACTIVE_SPELLS, SPELLS } from "../src/spellbook-config.js";
import { halfWidthAt, advanceFront, clipCastLength } from "../src/ice-lance-logic.js";

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
      return () => {
        const list = handlers.get(name);
        if (list) {
          const i = list.indexOf(fn);
          if (i >= 0) list.splice(i, 1);
        }
      };
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
  };
}

const fakeScene = { add() {} };
const fakeWorld = {
  bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
  colliders: [],
};

function heroDef(id) {
  return { ...CHARACTERS[id], glb: null };
}

function makeMage(config = CONFIG) {
  const bus = makeBus();
  const player = createPlayer({
    scene: fakeScene,
    world: fakeWorld,
    events: bus,
    config,
    hero: heroDef("mage"),
    partner: heroDef("knight"),
    loader: null,
  });
  player.stats.critChance = 0;
  return { player, bus };
}

function advance(player, seconds, input = {}) {
  const step = 0.05;
  const ticks = Math.ceil(seconds / step);
  for (let i = 0; i < ticks; i++) player.update(step, input);
}

function waitCooldown(player) {
  let guard = 0;
  while (player.spellCooldownFrac > 0 && guard++ < 200) player.update(0.05, {});
}

// Press attack, let the swing reach its impact beat, and return the emitted cast.
function castOnce(player, bus) {
  waitCooldown(player);
  const before = bus.events("player-spell-cast").length;
  player.update(0.05, { attack: true });
  advance(player, 0.5);
  const casts = bus.events("player-spell-cast");
  return casts.length > before ? casts[casts.length - 1].payload : null;
}

// ---- enemies harness (same fake loader/event bus pattern as enemies.test) ---

const deadLoader = { load() {} };

function makeEnemies(bus, world = fakeWorld) {
  return createEnemies({ scene: null, world, events: bus, rng: () => 0.5, loader: deadLoader });
}

function spellPayload(over = {}) {
  return {
    spellId: "ice-lance",
    castId: 1,
    shape: "line",
    origin: { x: 0, y: 0, z: 0 },
    dir: { x: 0, z: 1 },
    range: 12,
    damage: 10,
    crit: false,
    element: "frost",
    stun: 0.15,
    speed: 26,
    widthNear: 0.55,
    widthFar: 1.6,
    widthCurve: 0.75,
    standTime: 1.2,
    sinkTime: 0.5,
    reactionMult: 1,
    auraMult: 1,
    executeMult: 0,
    reactionHeal: 0,
    ...over,
  };
}

function spawnEnemies(bus, count = 1, world = fakeWorld) {
  const enemies = makeEnemies(bus, world);
  enemies.spawnWave({ n: 1, count, mix: [{ type: "minion", count }] }, null);
  for (let i = 0; i < 200 && enemies.list.length < count; i++) enemies.update(0.05, null);
  assert.equal(enemies.list.length, count, `expected ${count} enemies to spawn`);
  for (const e of enemies.list) {
    e.hp = 1e6;
    e.maxHp = 1e6;
  }
  return enemies;
}

function place(enemy, x, z) {
  enemy.group.position.set(x, 0, z);
}

// The existing elemental pipeline applies a hit's rolled damage and then its
// element payload, so one *contact* can emit more than one enemy-hit event.
// These tests count contacts through `aura-applied` (once per contact) and hp.
function contacts(bus) {
  return bus.events("aura-applied").length;
}

console.log("mage spellbook");

// ---------------------------------------------------------------------------
// Contract and config
// ---------------------------------------------------------------------------

test("the spell rotation is ice -> storm -> glacier", () => {
  assert.deepEqual(ACTIVE_SPELLS, ["ice-lance", "storm-lance", "glacial-crown"]);
  assert.equal(SPELLS["ice-lance"], ICE_LANCE);
  assert.equal(SPELLS["storm-lance"], STORM_LANCE);
  assert.equal(SPELLS["glacial-crown"], GLACIAL_CROWN);
  assert.equal(ICE_LANCE.shape, "line");
  assert.equal(STORM_LANCE.shape, "line");
  assert.equal(GLACIAL_CROWN.shape, "circle");
  assert.equal(ICE_LANCE.element, "frost");
  assert.equal(STORM_LANCE.element, "arcane");
  assert.equal(GLACIAL_CROWN.element, "frost");
});

test("initial tuning matches the task spec", () => {
  assert.equal(ICE_LANCE.range, 12);
  assert.equal(ICE_LANCE.minLength, 2.5);
  assert.equal(ICE_LANCE.speed, 26);
  assert.equal(ICE_LANCE.cooldown, 1.0);
  assert.equal(ICE_LANCE.widthNear, 0.55);
  assert.equal(ICE_LANCE.widthFar, 1.6);
  assert.equal(ICE_LANCE.heightNear, 0.35);
  assert.equal(ICE_LANCE.heightFar, 2.4);
  assert.ok(ICE_LANCE.crystalCount >= 72 && ICE_LANCE.crystalCount <= 96);
  assert.ok(ICE_LANCE.variants >= 2 && ICE_LANCE.variants <= 3);
  assert.equal(ICE_LANCE.slots, 3);
  assert.equal(ICE_LANCE.damageMult, 1.25);
  assert.equal(ICE_LANCE.stun, 0.15);
  assert.equal(STORM_LANCE.slots, 3);
  assert.equal(STORM_LANCE.damageMult, 1.25);
  assert.ok(STORM_LANCE.strands >= 6);
  assert.equal(GLACIAL_CROWN.slots, 3);
  assert.equal(GLACIAL_CROWN.damageMult, 1.25);
  assert.ok(GLACIAL_CROWN.zoneRadius > 0);
});

test("shared footprint math and dt-driven front", () => {
  assert.equal(halfWidthAt(0, ICE_LANCE), ICE_LANCE.widthNear);
  assert.equal(halfWidthAt(1, ICE_LANCE), ICE_LANCE.widthFar);
  assert.ok(halfWidthAt(0.5, ICE_LANCE) > ICE_LANCE.widthNear);
  assert.ok(halfWidthAt(2, ICE_LANCE) === ICE_LANCE.widthFar, "s is clamped");
  assert.equal(advanceFront(0, 0.1, ICE_LANCE, 12), 2.6);
  assert.equal(advanceFront(0, 0, ICE_LANCE, 12), 0);
  assert.equal(advanceFront(11.5, 0.1, ICE_LANCE, 12), 12);
});

test("clipCastLength stops at a world collider and the play boundary", () => {
  const world = {
    bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
    colliders: [{ x: 0, z: 8, radius: 1 }],
  };
  const clipped = clipCastLength({ x: 0, z: 0 }, { x: 0, z: 1 }, 12, world);
  assert.ok(Math.abs(clipped - (8 - 1.25)) < 1e-6, `clipped ${clipped}`);
  const wall = clipCastLength({ x: 0, z: 0 }, { x: 0, z: 1 }, 12, {
    bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 5 },
    colliders: [],
  });
  assert.ok(Math.abs(wall - 5) < 1e-6, `boundary ${wall}`);
});

// ---------------------------------------------------------------------------
// Player: the spell rotation
// ---------------------------------------------------------------------------

test("a valid mage cast replaces the old bolt and carries frost", () => {
  const { player, bus } = makeMage();
  player.update(0.05, { attack: true });
  advance(player, 0.5);

  const casts = bus.events("player-spell-cast");
  assert.equal(casts.length, 1, "one accepted cast");
  const p = casts[0].payload;
  assert.equal(p.spellId, "ice-lance");
  assert.equal(p.shape, "line");
  assert.equal(p.element, "frost");
  assert.equal(p.castId, 1);
  assert.equal(p.damage, CHARACTERS.mage.damage * 1.25);
  assert.equal(p.crit, false);
  assert.equal(p.range, 12, "clear line reaches max range");
  assert.equal(p.speed, ICE_LANCE.speed);
  assert.equal(p.reactionMult, 1);
  assert.equal(p.auraMult, 1);
  assert.equal(p.executeMult, 0);
  assert.equal(p.reactionHeal, 0);
  assert.ok(Math.abs(Math.hypot(p.dir.x, p.dir.z) - 1) < 1e-6, "dir is normalised");
  assert.equal(p.origin.y, 0);
  assert.ok(!bus.events("player-attack").some((e) => e.payload.kind === "light"), "no old light bolt");
  assert.equal(player.momentum, MOMENTUM_GAIN.light, "momentum is awarded once per cast");
  assert.ok(player.spellCooldownFrac > 0.5, "cooldown started at the accepted cast");
});

test("the payload origin is a copy, not the live player vector", () => {
  const { player, bus } = makeMage();
  player.update(0.05, { attack: true });
  advance(player, 0.5);
  const p = bus.last("player-spell-cast").payload;
  const before = { ...p.origin };
  advance(player, 0.2, { move: { x: 0, z: 1 } });
  assert.deepEqual(p.origin, before);
  assert.notEqual(p.origin, player.position);
});

test("the rotation advances ice -> storm -> glacier -> ice", () => {
  const { player, bus } = makeMage();
  const a = castOnce(player, bus);
  assert.equal(a.spellId, "ice-lance");
  const b = castOnce(player, bus);
  assert.equal(b.spellId, "storm-lance");
  assert.equal(b.element, "arcane");
  assert.equal(b.shape, "line");
  const c = castOnce(player, bus);
  assert.equal(c.spellId, "glacial-crown");
  assert.equal(c.element, "frost");
  assert.equal(c.shape, "circle");
  assert.equal(c.radius, GLACIAL_CROWN.zoneRadius);
  assert.ok(Math.abs(Math.hypot(c.center.x - c.origin.x, c.center.z - c.origin.z) - c.range) < 1e-6);
  const d = castOnce(player, bus);
  assert.equal(d.spellId, "ice-lance", "the list wraps back to A");
  assert.equal(player.spellIndex, 1, "next cast is B");
});

test("a cast whose clipped line is too short is refused cleanly", () => {
  const bus = makeBus();
  const world = {
    bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
    colliders: [{ x: 0, z: 1.5, radius: 1 }],
  };
  const player = createPlayer({
    scene: fakeScene,
    world,
    events: bus,
    config: CONFIG,
    hero: heroDef("mage"),
    partner: heroDef("knight"),
    loader: null,
  });
  player.stats.critChance = 0;
  player.update(0.05, { attack: true });
  advance(player, 0.5);
  assert.equal(bus.events("player-spell-cast").length, 0, "no spell event");
  assert.equal(bus.events("player-attack").length, 0, "no damage payload");
  assert.equal(player.momentum, 0, "no momentum for a refused cast");
  assert.equal(player.spellCooldownFrac, 0, "no cooldown for a refused cast");
  assert.equal(player.spellIndex, 0, "the next-cast index is unchanged");
  assert.ok(bus.has("sfx"), "existing audio feedback still plays");
});

test("a clipped line reports the shortened range", () => {
  const bus = makeBus();
  const world = {
    bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
    colliders: [{ x: 0, z: 8, radius: 1 }],
  };
  const player = createPlayer({
    scene: fakeScene,
    world,
    events: bus,
    config: CONFIG,
    hero: heroDef("mage"),
    partner: heroDef("knight"),
    loader: null,
  });
  player.stats.critChance = 0;
  player.update(0.05, { attack: true });
  advance(player, 0.5);
  const p = bus.last("player-spell-cast").payload;
  const expected = 8 - 1.25 - p.origin.z;
  assert.ok(Math.abs(p.range - expected) < 1e-6, `clipped range ${p.range}, expected ${expected}`);
});

test("each spell's own cooldown gates the next cast", () => {
  const { player, bus } = makeMage();
  player.update(0.05, { attack: true });
  advance(player, 0.4);
  assert.equal(bus.events("player-spell-cast").length, 1);
  advance(player, 0.5, { attack: true });
  assert.equal(bus.events("player-spell-cast").length, 1, "Frost Lance cooldown still running");
  advance(player, 0.7, { attack: true });
  assert.equal(bus.events("player-spell-cast").length, 2, "Storm Lance after the cooldown");
  // Storm Lance's own cooldown is 0.5s.
  advance(player, 0.3, { attack: true });
  assert.equal(bus.events("player-spell-cast").length, 2, "Storm Lance cooldown still running");
  advance(player, 0.5, { attack: true });
  assert.equal(bus.events("player-spell-cast").length, 3, "Glacial Crown after 0.5s");
});

test("swapping away and back does not reset the spell cooldown", () => {
  const config = { player: { ...CONFIG.player, swapCooldown: 0.1 } };
  const { player, bus } = makeMage(config);
  player.update(0.05, { attack: true });
  advance(player, 0.4);
  assert.equal(bus.events("player-spell-cast").length, 1);
  assert.equal(player.swap(), true, "swap to the knight");
  assert.ok(player.spellCooldownFrac > 0.5, "cooldown survives the swap");
  advance(player, 0.2);
  assert.equal(player.swap(), true, "swap back to the mage");
  const frac = player.spellCooldownFrac;
  assert.ok(frac > 0.2 && frac < 0.9, `cooldown kept ticking while off-field (${frac})`);
  player.update(0.05, { attack: true });
  advance(player, 0.2, { attack: true });
  assert.equal(bus.events("player-spell-cast").length, 1, "no free cast from swapping");
  advance(player, 1.2, { attack: true });
  const casts = bus.events("player-spell-cast");
  assert.ok(casts.length >= 2, "cast returns once the cooldown ends");
  assert.equal(casts[1].payload.spellId, "storm-lance", "the rotation continues with B");
});

test("cancelling the swing before impact does not advance the sequence", () => {
  const config = { player: { ...CONFIG.player, swapCooldown: 0.1 } };
  const { player, bus } = makeMage(config);
  player.update(0.05, { attack: true });
  advance(player, 0.1);
  player.swap();
  advance(player, 0.5);
  assert.equal(bus.events("player-spell-cast").length, 0, "cancelled cast emitted nothing");
  assert.equal(player.spellCooldownFrac, 0);
  assert.equal(player.momentum, 0);
  assert.equal(player.spellIndex, 0);
});

test("respawn resets the spell cooldown and next-cast index", () => {
  const { player, bus } = makeMage();
  player.update(0.05, { attack: true });
  advance(player, 0.4);
  assert.equal(bus.events("player-spell-cast").length, 1);
  player.respawn({ x: 0, z: 0 });
  assert.equal(player.spellCooldownFrac, 0);
  assert.equal(player.spellIndex, 0);
  player.update(0.05, { attack: true });
  advance(player, 0.4);
  assert.equal(bus.events("player-spell-cast").length, 2, "a fresh cast after respawn");
});

test("mage heavy and Meteor still fire their old payloads", () => {
  const { player, bus } = makeMage();
  player.update(0.05, { heavy: true });
  advance(player, 0.9);
  const heavy = bus.events("player-attack").find((e) => e.payload.kind === "heavy");
  assert.ok(heavy, "heavy attack still emits");
  assert.equal(heavy.payload.element, "arcane");
  assert.equal(heavy.payload.knockback, CHARACTERS.mage.heavy.knockback);

  for (let i = 0; i < 10; i++) bus.emit("enemy-died", { position: { x: 0, y: 0, z: 0 }, value: 1 });
  assert.equal(player.superReady, true);
  player.update(0.05, { super: true });
  advance(player, 2.6);
  assert.ok(bus.has("player-blast"), "Meteor still lands its blast");
  const meteor = bus.events("player-attack").find((e) => e.payload.kind === "super");
  assert.ok(meteor, "Meteor still emits the super hit");
  assert.equal(meteor.payload.element, "arcane");
});

// ---------------------------------------------------------------------------
// Enemies: line fronts
// ---------------------------------------------------------------------------

test("the line front hits only when it reaches the target", () => {
  const bus = makeBus();
  const enemies = spawnEnemies(bus, 1);
  const enemy = enemies.list[0];
  place(enemy, 0, 5);
  bus.emit("player-spell-cast", spellPayload());
  const before = enemy.hp;

  for (let i = 0; i < 3; i++) enemies.update(0.05, null);
  assert.equal(enemy.hp, before, "no contact before the front arrives");
  assert.equal(contacts(bus), 0);
  enemies.update(0.05, null);
  assert.ok(enemy.hp < before, "contact when the front reaches the target");
  assert.equal(contacts(bus), 1, "exactly one contact");
  assert.equal(enemy.aura.element, "frost", "the hit carries the frost element");
  assert.ok(enemy.stun >= 0.15, "the extra spell stun is applied");
  enemies.clearAll();
});

test("one contact per enemy per line cast, even across many frames", () => {
  const bus = makeBus();
  const enemies = spawnEnemies(bus, 3);
  const [a, b, c] = enemies.list;
  place(a, 0, 3);
  place(b, 0, 6);
  place(c, 0, 9);
  bus.emit("player-spell-cast", spellPayload());
  for (let i = 0; i < 40; i++) enemies.update(0.05, null);
  assert.equal(contacts(bus), 3, `one contact per target, got ${contacts(bus)}`);
  const dealt = [a, b, c].map((e) => 1e6 - e.hp);
  for (const d of dealt) assert.ok(d >= 10, `each target takes the hit, dealt ${d}`);
  assert.equal(dealt[0], dealt[2], "the same rolled hit lands on every target");
  enemies.clearAll();
});

test("an enemy outside the line band is not hit", () => {
  const bus = makeBus();
  const enemies = spawnEnemies(bus, 1);
  place(enemies.list[0], 3, 5);
  bus.emit("player-spell-cast", spellPayload());
  for (let i = 0; i < 40; i++) enemies.update(0.05, null);
  assert.equal(contacts(bus), 0, "off-line enemy is untouched");
  assert.equal(enemies.list[0].hp, 1e6);
  enemies.clearAll();
});

test("an enemy beyond the clipped endpoint is not hit", () => {
  const bus = makeBus();
  const enemies = spawnEnemies(bus, 1);
  place(enemies.list[0], 0, 8);
  bus.emit("player-spell-cast", spellPayload({ range: 6 }));
  for (let i = 0; i < 40; i++) enemies.update(0.05, null);
  assert.equal(contacts(bus), 0, "the line stops at its clipped end");
  assert.equal(enemies.list[0].hp, 1e6);
  enemies.clearAll();
});

test("an enemy entering the already-erupted line takes no contact hit", () => {
  const bus = makeBus();
  const enemies = spawnEnemies(bus, 1);
  const enemy = enemies.list[0];
  place(enemy, 10, 0);
  bus.emit("player-spell-cast", spellPayload());
  for (let i = 0; i < 20; i++) enemies.update(0.05, null);
  assert.equal(contacts(bus), 0);
  place(enemy, 0, 5);
  for (let i = 0; i < 20; i++) enemies.update(0.05, null);
  assert.equal(contacts(bus), 0, "no new contact hit after the front passed");
  enemies.clearAll();
});

test("the swept line front cannot tunnel through a target", () => {
  const bus = makeBus();
  const enemies = spawnEnemies(bus, 1);
  place(enemies.list[0], 0, 5);
  bus.emit("player-spell-cast", spellPayload());
  enemies.update(0.1, null);
  assert.equal(contacts(bus), 0);
  enemies.update(0.1, null);
  assert.equal(contacts(bus), 1, "swept interval catches the target");
  enemies.clearAll();
});

// ---------------------------------------------------------------------------
// Enemies: circle front (Glacial Crown)
// ---------------------------------------------------------------------------

function circlePayload(over = {}) {
  return spellPayload({
    spellId: "glacial-crown",
    shape: "circle",
    range: 6,
    center: { x: 0, z: 6 },
    radius: 4,
    ringSpeed: 13,
    speed: 44,
    element: "frost",
    standTime: 2,
    sinkTime: 1,
    ...over,
  });
}

test("the circle front travels out, then hits inside the ring only", () => {
  const bus = makeBus();
  const enemies = spawnEnemies(bus, 3);
  const [center, edge, outside] = enemies.list;
  place(center, 0, 6);
  place(edge, 0, 9.5);
  place(outside, 0, 12);
  bus.emit("player-spell-cast", circlePayload());
  const before = enemies.list.map((e) => e.hp);

  // Travel to the centre takes 6 / 44 = 0.136s; nothing is hit while travelling.
  enemies.update(0.05, null);
  enemies.update(0.05, null);
  assert.equal(contacts(bus), 0, "no contact while the front travels");
  for (let i = 0; i < 40; i++) enemies.update(0.05, null);
  assert.equal(contacts(bus), 2, `centre and ring edge hit, outside missed (${contacts(bus)})`);
  assert.ok(center.hp < before[0]);
  assert.ok(edge.hp < before[1]);
  assert.equal(outside.hp, before[2], "outside the ring is untouched");
  enemies.clearAll();
});

test("one contact per enemy per circle cast", () => {
  const bus = makeBus();
  const enemies = spawnEnemies(bus, 2);
  place(enemies.list[0], 0, 6);
  place(enemies.list[1], 2, 6);
  bus.emit("player-spell-cast", circlePayload());
  for (let i = 0; i < 40; i++) enemies.update(0.05, null);
  const hitCount = contacts(bus);
  const hpAfter = enemies.list.map((e) => e.hp);
  for (let i = 0; i < 30; i++) enemies.update(0.05, null);
  assert.equal(contacts(bus), hitCount, "the standing crown does not tick damage");
  assert.deepEqual(enemies.list.map((e) => e.hp), hpAfter, "hp is stable after the ring passed");
  enemies.clearAll();
});

test("clearAll removes pending line and circle fronts", () => {
  const bus = makeBus();
  const enemies = spawnEnemies(bus, 2);
  place(enemies.list[0], 0, 5);
  place(enemies.list[1], 0, 6);
  bus.emit("player-spell-cast", spellPayload({ castId: 1 }));
  bus.emit("player-spell-cast", circlePayload({ castId: 2 }));
  enemies.update(0.05, null);
  assert.equal(contacts(bus), 0, "damage is still pending");
  enemies.clearAll();
  enemies.spawnWave({ n: 1, count: 2, mix: [{ type: "minion", count: 2 }] }, null);
  for (let i = 0; i < 200 && enemies.list.length < 2; i++) enemies.update(0.05, null);
  for (const e of enemies.list) {
    e.hp = 1e6;
    e.maxHp = 1e6;
    place(e, 0, 5);
  }
  for (let i = 0; i < 40; i++) enemies.update(0.05, null);
  assert.equal(contacts(bus), 0, "cleared fronts deal no delayed damage");
  enemies.clearAll();
});

test("overlapping casts keep independent hit sets", () => {
  const bus = makeBus();
  const enemies = spawnEnemies(bus, 1);
  const enemy = enemies.list[0];
  place(enemy, 0, 5);
  bus.emit("player-spell-cast", spellPayload({ castId: 1 }));
  for (let i = 0; i < 40; i++) enemies.update(0.05, null);
  assert.equal(contacts(bus), 1);
  const afterFirst = enemy.hp;
  const perContact = 1e6 - afterFirst;
  bus.emit("player-spell-cast", spellPayload({ castId: 2 }));
  for (let i = 0; i < 40; i++) enemies.update(0.05, null);
  assert.equal(contacts(bus), 2, "a new cast is a new hit set");
  assert.equal(enemy.hp, 1e6 - perContact * 2, "exactly one more contact, not a tick");
  enemies.clearAll();
});

console.log(`\n${passed} passed`);
