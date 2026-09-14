// Party, swap, momentum, heavy, super, perfect dodge.
//
// player.js is created with loader: null and heroes with glb stripped, so no
// GLTF ever loads and every assertion here is about the state machine, not the
// mesh. Events are recorded by a fake bus that also dispatches, so the test can
// drive the player by emitting `enemy-died` / `reaction` the way enemies.js will.

import { strict as assert } from "node:assert";
import { createPlayer } from "../src/player.js";
import { CHARACTERS, CONFIG, ELEMENTS, MOMENTUM_GAIN } from "../src/balance.js";

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
  const handlers = new Map();
  const log = [];
  const bus = {
    log,
    emit(name, payload) {
      log.push({ name, payload });
      const set = handlers.get(name);
      if (set) for (const fn of [...set]) fn(payload);
    },
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => bus.off(name, fn);
    },
    off(name, fn) {
      handlers.get(name)?.delete(fn);
    },
    events(name) {
      return log.filter((e) => e.name === name);
    },
    last(name) {
      const all = bus.events(name);
      return all.length ? all[all.length - 1] : null;
    },
    has(name) {
      return log.some((e) => e.name === name);
    },
  };
  return bus;
}

const fakeScene = { add() {} };
const fakeWorld = {
  bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
  colliders: [],
};

// Real CHARACTERS data (heavy/super/element), minus the GLB so nothing loads.
function heroDef(id) {
  return { ...CHARACTERS[id], glb: null };
}

function makePlayer(ids = ["knight", "rogue"]) {
  const bus = makeBus();
  const player = createPlayer({
    scene: fakeScene,
    world: fakeWorld,
    events: bus,
    config: CONFIG,
    hero: heroDef(ids[0]),
    partner: heroDef(ids[1]),
    loader: null,
  });
  return { player, bus };
}

function advance(player, seconds, input = {}) {
  const step = 0.05;
  const ticks = Math.ceil(seconds / step);
  for (let i = 0; i < ticks; i++) player.update(step, input);
}

function kill(bus, n) {
  for (let i = 0; i < n; i++) bus.emit("enemy-died", { position: { x: 0, y: 0, z: 0 }, value: 1 });
}

console.log("player party");

test("party has two heroes with independent hp", () => {
  const { player } = makePlayer();
  const party = player.party;
  assert.equal(party.length, 2);
  assert.equal(party[0].def.id, "knight");
  assert.equal(party[1].def.id, "rogue");
  assert.equal(party[0].hp, party[0].maxHp);
  assert.equal(party[1].hp, party[1].maxHp);
  assert.notEqual(party[0].maxHp, party[1].maxHp);
  assert.equal(player.activeHero.id, "knight");
  assert.equal(player.hp, party[0].hp);
  assert.equal(player.maxHp, party[0].maxHp);
  assert.equal(player.partyAlive, 2);
});

test("damage only reduces the active hero's hp", () => {
  const { player } = makePlayer();
  const partnerHp = player.party[1].hp;
  assert.equal(player.damage(20), true);
  assert.equal(player.party[0].hp, player.party[0].maxHp - 20);
  assert.equal(player.party[1].hp, partnerHp);
  assert.equal(player.hp, player.party[0].hp);
});

test("swap toggles the active hero and respects its cooldown", () => {
  const { player, bus } = makePlayer();
  assert.equal(player.swap(), true);
  assert.equal(player.activeHero.id, "rogue");
  assert.equal(player.hp, player.party[1].hp);
  assert.equal(player.swap(), false, "swap during cooldown must fail");
  assert.ok(player.swapCooldownFrac > 0.9, `frac ${player.swapCooldownFrac}`);
  const ev = bus.last("swap").payload;
  assert.equal(ev.from, "knight");
  assert.equal(ev.to, "rogue");
  assert.equal(ev.element, "shadow");
  assert.equal(ev.color, ELEMENTS.shadow.color);
  assert.equal(bus.last("sfx").payload.name, "swap");
  advance(player, CONFIG.player.swapCooldown + 0.2);
  assert.equal(player.swapCooldownFrac, 0);
  assert.equal(player.swap(), true);
  assert.equal(player.activeHero.id, "knight");
});

test("swap i-frames negate a hit without counting as a perfect dodge", () => {
  const { player, bus } = makePlayer();
  player.swap();
  const hp = player.hp;
  assert.equal(player.damage(50), false, "swap i-frames must negate the hit");
  assert.equal(player.hp, hp);
  assert.equal(bus.has("perfect-dodge"), false);
  assert.equal(bus.has("player-hurt"), false);
});

test("active hero at 0 hp auto-swaps instead of dying", () => {
  const { player, bus } = makePlayer();
  assert.equal(player.damage(9999), true);
  assert.equal(player.party[0].hp, 0);
  assert.equal(player.activeHero.id, "rogue");
  assert.equal(player.alive, true);
  assert.equal(player.partyAlive, 1);
  assert.equal(bus.has("player-died"), false);
  assert.equal(bus.last("swap").payload.to, "rogue");
  assert.equal(player.hp, player.party[1].hp);
  assert.equal(player.swap(), false, "a downed hero cannot be swapped back in");
});

test("both heroes down emits player-died", () => {
  const { player, bus } = makePlayer();
  player.damage(9999);
  advance(player, 1.5);
  assert.equal(player.damage(9999), true);
  assert.equal(player.partyAlive, 0);
  assert.equal(player.alive, false);
  assert.equal(bus.events("player-died").length, 1);
  assert.equal(player.damage(10), false, "a dead party takes no damage");
});

test("momentum accumulates from kills, clamps at max, and arms the super", () => {
  const { player, bus } = makePlayer();
  assert.equal(player.momentum, 0);
  assert.equal(player.superReady, false);
  kill(bus, 11);
  assert.equal(player.momentum, CONFIG.player.momentumMax);
  assert.equal(player.superReady, true);
  const last = bus.last("momentum").payload;
  assert.deepEqual(last, {
    value: CONFIG.player.momentumMax,
    max: CONFIG.player.momentumMax,
    ready: true,
  });
  assert.ok(bus.events("momentum").length >= 2, "momentum emits on gain");
});

test("reactions award momentum", () => {
  const { player, bus } = makePlayer();
  bus.emit("reaction", { type: "melt", position: { x: 0, y: 0, z: 0 } });
  assert.equal(player.momentum, MOMENTUM_GAIN.reaction);
});

test("kills no longer award momentum after the party dies", () => {
  const { player, bus } = makePlayer();
  player.damage(9999);
  advance(player, 1.5);
  player.damage(9999);
  assert.equal(player.alive, false);
  const before = player.momentum;
  kill(bus, 3);
  assert.equal(player.momentum, before);
});

test("light attacks emit the full frozen attack payload", () => {
  const { player, bus } = makePlayer();
  player.stats.critChance = 0;
  player.update(0.05, { attack: true });
  advance(player, 0.5);
  const p = bus.last("player-attack").payload;
  assert.equal(p.kind, "light");
  assert.equal(p.element, "frost");
  assert.equal(p.heavy, false);
  assert.equal(p.stun, 0);
  assert.equal(p.knockback, 0);
  assert.equal(p.damage, CHARACTERS.knight.damage);
  assert.equal(p.reactionMult, 1);
  assert.equal(p.auraMult, 1);
  assert.equal(p.executeMult, 0);
  assert.equal(p.reactionHeal, 0);
  assert.ok(p.origin && Number.isFinite(p.origin.x));
  assert.ok(Math.abs(Math.hypot(p.dir.x, p.dir.z) - 1) < 1e-6);
});

test("light hits build momentum", () => {
  const { player, bus } = makePlayer();
  player.update(0.05, { attack: true });
  advance(player, 0.5);
  assert.equal(player.momentum, MOMENTUM_GAIN.light);
  assert.equal(bus.last("player-attack").payload.kind, "light");
});

test("heavy attacks emit kind heavy with the hero's stun and knockback", () => {
  const { player, bus } = makePlayer();
  player.update(0.05, { heavy: true });
  advance(player, 1.0);
  const p = bus.last("player-attack").payload;
  assert.equal(p.kind, "heavy");
  assert.equal(p.heavy, true);
  assert.equal(p.element, "frost");
  assert.equal(p.stun, CHARACTERS.knight.heavy.stun);
  assert.equal(p.knockback, CHARACTERS.knight.heavy.knockback);
  assert.equal(player.momentum, MOMENTUM_GAIN.heavy);
});

test("heavy commits through its windup and is dodge-cancellable after impact", () => {
  const { player } = makePlayer();
  player.update(0.05, { heavy: true });
  player.update(0.05, { dodge: true });
  assert.equal(player.isDodging, false, "dodge must not cancel the heavy windup");
  advance(player, 0.4);
  player.update(0.05, { dodge: true });
  assert.equal(player.isDodging, true, "dodge cancels after impact");
});

test("super needs full momentum, drains it, and emits the nova payload", () => {
  const { player, bus } = makePlayer();
  player.update(0.05, { super: true });
  assert.equal(bus.has("super-used"), false, "super must not fire without momentum");
  kill(bus, 10);
  assert.equal(player.superReady, true);
  player.update(0.05, { super: true });
  assert.equal(player.momentum, 0);
  const used = bus.last("super-used").payload;
  assert.equal(used.hero, "knight");
  assert.equal(used.color, ELEMENTS.frost.color);
  assert.ok(Number.isFinite(used.position.x));
  advance(player, 1.4);
  const p = bus.last("player-attack").payload;
  assert.equal(p.kind, "super");
  assert.equal(p.arc, Math.PI * 2);
  assert.equal(p.range, CHARACTERS.knight.super.radius);
  assert.equal(p.stun, CHARACTERS.knight.super.stun);
  assert.equal(p.knockback, CHARACTERS.knight.super.knockback);
  assert.equal(p.element, "frost");
});

test("whirlwind ticks repeated 360 hits for its duration", () => {
  const { player, bus } = makePlayer(["barbarian", "knight"]);
  kill(bus, 10);
  player.update(0.05, { super: true });
  advance(player, 2.0);
  const hits = bus.events("player-attack").filter((e) => e.payload.kind === "super");
  assert.ok(hits.length >= 2, `expected repeated ticks, got ${hits.length}`);
  for (const h of hits) assert.equal(h.payload.arc, Math.PI * 2);
  advance(player, 2.0);
  const later = bus.events("player-attack").filter((e) => e.payload.kind === "super");
  assert.ok(later.length >= 8, `whirlwind should keep ticking, got ${later.length}`);
  advance(player, 1.5);
  const end = bus.events("player-attack").filter((e) => e.payload.kind === "super").length;
  advance(player, 1.5);
  assert.equal(
    bus.events("player-attack").filter((e) => e.payload.kind === "super").length,
    end,
    "whirlwind must end"
  );
});

test("flurry blinks the player forward and lands repeated hits", () => {
  const { player, bus } = makePlayer(["rogue", "knight"]);
  kill(bus, 10);
  const startZ = player.position.z;
  player.update(0.05, { super: true });
  advance(player, 1.6);
  const hits = bus.events("player-attack").filter((e) => e.payload.kind === "super");
  assert.ok(hits.length >= 4, `expected flurry hits, got ${hits.length}`);
  assert.ok(player.position.z > startZ, "flurry should blink the player forward");
  assert.equal(hits[0].payload.element, "shadow");
});

test("meteor waits, then blasts the aim point", () => {
  const { player, bus } = makePlayer(["mage", "knight"]);
  kill(bus, 10);
  player.update(0.05, { super: true });
  assert.equal(bus.has("player-blast"), false, "meteor must not land during the entry");
  advance(player, 1.0);
  assert.equal(bus.has("player-blast"), false, "meteor has an 0.8s delay after the entry");
  advance(player, 0.4);
  assert.equal(bus.has("player-blast"), false, "the 0.8s delay starts after the 1.2s entry");
  advance(player, 0.8);
  const blast = bus.last("player-blast").payload;
  assert.equal(blast.radius, CHARACTERS.mage.super.radius);
  const p = bus.last("player-attack").payload;
  assert.equal(p.kind, "super");
  assert.equal(p.range, CHARACTERS.mage.super.radius);
  assert.equal(p.arc, Math.PI * 2);
  assert.equal(p.element, "arcane");
});

test("dodge i-frames turn a hit into a perfect dodge", () => {
  const { player, bus } = makePlayer();
  player.update(0.05, { dodge: true });
  assert.equal(player.isDodging, true);
  assert.equal(player.damage(10), false);
  assert.equal(bus.events("perfect-dodge").length, 1);
  assert.equal(player.momentum, MOMENTUM_GAIN.perfect);
  const sfx = bus.last("sfx").payload;
  assert.equal(sfx.name, "dodge");
  assert.equal(sfx.pitch, 1.3);
  assert.ok(player.stats.perfectT > 0);
  player.damage(10);
  player.damage(10);
  assert.equal(bus.events("perfect-dodge").length, 1, "0.25s double-call guard");
});

test("perfect dodge empowers the next hit", () => {
  const { player, bus } = makePlayer();
  player.stats.critChance = 0;
  player.update(0.05, { dodge: true });
  player.damage(10);
  advance(player, 0.6);
  assert.ok(player.stats.perfectT > 0);
  player.update(0.05, { attack: true });
  advance(player, 0.5);
  const p = bus.last("player-attack").payload;
  const expected = CHARACTERS.knight.damage * CONFIG.player.perfectDamageMult;
  assert.ok(Math.abs(p.damage - expected) < 1e-6, `damage ${p.damage} != ${expected}`);
});

test("the empowered window expires", () => {
  const { player, bus } = makePlayer();
  player.stats.critChance = 0;
  player.update(0.05, { dodge: true });
  player.damage(10);
  advance(player, CONFIG.player.perfectWindow + 0.5);
  assert.equal(player.stats.perfectT, 0);
  player.update(0.05, { attack: true });
  advance(player, 0.5);
  assert.equal(bus.last("player-attack").payload.damage, CHARACTERS.knight.damage);
});

test("respawn restores both heroes and clears momentum", () => {
  const { player, bus } = makePlayer();
  kill(bus, 5);
  player.damage(9999);
  advance(player, 1.5);
  player.damage(9999);
  assert.equal(player.alive, false);
  player.respawn({ x: 2, z: -3 });
  assert.equal(player.alive, true);
  assert.equal(player.partyAlive, 2);
  assert.equal(player.party[0].hp, player.party[0].maxHp);
  assert.equal(player.party[1].hp, player.party[1].maxHp);
  assert.equal(player.momentum, 0);
  assert.equal(player.position.x, 2);
  assert.equal(player.position.z, -3);
});

console.log(`\n${passed} passed`);
