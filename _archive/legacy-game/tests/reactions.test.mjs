import { strict as assert } from "node:assert";
import {
  ELEMENTS,
  REACTIONS,
  reactionFor,
  auraOutcome,
  CHARACTERS,
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

console.log("reactions.js");

const ELEMENT_IDS = ["frost", "ember", "shadow", "arcane"];

test("ELEMENTS carries the four elements with spec colors", () => {
  assert.deepEqual(Object.keys(ELEMENTS), ELEMENT_IDS);
  const names = { frost: "Frost", ember: "Ember", shadow: "Shadow", arcane: "Arcane" };
  const colors = { frost: 0x7fd7ff, ember: 0xff7a2a, shadow: 0x9b6fe8, arcane: 0x7fe8c8 };
  for (const id of ELEMENT_IDS) {
    assert.equal(ELEMENTS[id].id, id);
    assert.equal(ELEMENTS[id].name, names[id]);
    assert.equal(ELEMENTS[id].color, colors[id], `${id} color`);
  }
});

test("REACTIONS carries the six reactions with the spec table", () => {
  assert.deepEqual(
    Object.keys(REACTIONS).sort(),
    ["detonate", "frozen", "melt", "overload", "shatter", "void"]
  );
  const table = {
    melt: {
      name: "Melt",
      elements: ["frost", "ember"],
      damageMult: 2.2,
      radius: 2.2,
      armorBreak: { mult: 1.3, time: 4 },
    },
    overload: {
      name: "Overload",
      elements: ["ember", "shadow"],
      damageMult: 1.5,
      radius: 3.5,
      knockback: 14,
    },
    shatter: {
      name: "Shatter",
      elements: ["frost", "shadow"],
      damageMult: 1.2,
      radius: 2.0,
      freeze: 1.5,
      shatterMult: 2.5,
    },
    detonate: {
      name: "Detonate",
      elements: ["ember", "arcane"],
      damageMult: 1.4,
      radius: 3.0,
      burn: { dps: 6, time: 4, spread: 3.5 },
    },
    frozen: {
      name: "Frozen",
      elements: ["frost", "arcane"],
      damageMult: 1.0,
      radius: 2.5,
      freeze: 2.0,
    },
    void: {
      name: "Void",
      elements: ["shadow", "arcane"],
      damageMult: 1.1,
      radius: 3.0,
      pull: 9,
      mark: { time: 6, crit: 0.25 },
    },
  };
  const scalar = ["name", "elements", "damageMult", "radius"];
  for (const [id, want] of Object.entries(table)) {
    const r = REACTIONS[id];
    assert.equal(r.id, id);
    assert.equal(r.name, want.name);
    assert.deepEqual(r.elements, want.elements, `${id} elements`);
    assert.equal(r.damageMult, want.damageMult, `${id} damageMult`);
    assert.equal(r.radius, want.radius, `${id} radius`);
    assert.equal(typeof r.color, "number", `${id} color`);
    for (const key of Object.keys(want)) {
      if (scalar.includes(key)) continue;
      assert.deepEqual(r[key], want[key], `${id}.${key}`);
    }
  }
});

test("all six unordered element pairs map to a distinct reaction", () => {
  const seen = new Set();
  for (let i = 0; i < ELEMENT_IDS.length; i++) {
    for (let j = i + 1; j < ELEMENT_IDS.length; j++) {
      const r = reactionFor(ELEMENT_IDS[i], ELEMENT_IDS[j]);
      assert.ok(r, `${ELEMENT_IDS[i]}+${ELEMENT_IDS[j]} has no reaction`);
      seen.add(r.id);
    }
  }
  assert.equal(seen.size, 6);
});

test("reactionFor is order-independent", () => {
  const expected = {
    "frost:ember": "melt",
    "ember:shadow": "overload",
    "frost:shadow": "shatter",
    "ember:arcane": "detonate",
    "frost:arcane": "frozen",
    "shadow:arcane": "void",
  };
  for (const [pair, id] of Object.entries(expected)) {
    const [a, b] = pair.split(":");
    assert.equal(reactionFor(a, b).id, id, pair);
    assert.equal(reactionFor(b, a).id, id, `${pair} reversed`);
  }
});

test("reactionFor is null for same or unknown elements", () => {
  for (const id of ELEMENT_IDS) assert.equal(reactionFor(id, id), null, id);
  assert.equal(reactionFor("frost", "bogus"), null);
  assert.equal(reactionFor("bogus", "ember"), null);
  assert.equal(reactionFor(null, null), null);
  assert.equal(reactionFor(undefined, "arcane"), null);
});

test("auraOutcome refreshes when the aura element repeats", () => {
  assert.deepEqual(auraOutcome({ element: "frost", t: 2 }, "frost"), {
    apply: "frost",
    reaction: null,
  });
  assert.deepEqual(auraOutcome({ element: "arcane", t: 0.1 }, "arcane"), {
    apply: "arcane",
    reaction: null,
  });
});

test("auraOutcome reacts when a different element lands", () => {
  assert.deepEqual(auraOutcome({ element: "frost", t: 2 }, "ember"), {
    apply: "ember",
    reaction: "melt",
  });
  assert.deepEqual(auraOutcome({ element: "ember", t: 1 }, "frost"), {
    apply: "frost",
    reaction: "melt",
  });
  assert.deepEqual(auraOutcome({ element: "shadow", t: 3 }, "arcane"), {
    apply: "arcane",
    reaction: "void",
  });
});

test("auraOutcome applies without reaction when no aura is present", () => {
  for (const id of ELEMENT_IDS) {
    assert.deepEqual(auraOutcome(null, id), { apply: id, reaction: null }, id);
  }
});

test("auraOutcome ignores unknown elements", () => {
  assert.deepEqual(auraOutcome(null, "bogus"), { apply: null, reaction: null });
  assert.deepEqual(auraOutcome({ element: "frost", t: 1 }, "bogus"), {
    apply: null,
    reaction: null,
  });
  assert.deepEqual(auraOutcome({ element: "bogus", t: 1 }, "ember"), {
    apply: "ember",
    reaction: null,
  });
});

test("every hero has an element, a heavy and a super", () => {
  for (const [id, c] of Object.entries(CHARACTERS)) {
    assert.ok(ELEMENT_IDS.includes(c.element), `${id} element`);
    const h = c.heavy;
    assert.ok(h && typeof h.clip === "string" && h.clip.length > 0, `${id} heavy clip`);
    assert.ok(h.damageMult > 0, `${id} heavy damageMult`);
    assert.ok(h.knockback >= 0, `${id} heavy knockback`);
    assert.ok(h.stun >= 0, `${id} heavy stun`);
    assert.ok(h.lunge >= 0, `${id} heavy lunge`);
    assert.ok(h.radius > 0 && h.arc > 0, `${id} heavy shape`);
    const s = c.super;
    assert.ok(s && typeof s.id === "string" && typeof s.name === "string", `${id} super id/name`);
    assert.ok(typeof s.desc === "string" && s.desc.length > 0, `${id} super desc`);
    assert.ok(typeof s.clip === "string" && s.clip.length > 0, `${id} super clip`);
    assert.ok(s.duration > 0, `${id} super duration`);
    assert.ok(s.damageMult > 0 && s.radius > 0, `${id} super power`);
    assert.ok(s.knockback >= 0 && s.stun >= 0, `${id} super control`);
  }
});

test("hero element mapping matches the spec", () => {
  assert.equal(CHARACTERS.knight.element, "frost");
  assert.equal(CHARACTERS.barbarian.element, "ember");
  assert.equal(CHARACTERS.rogue.element, "shadow");
  assert.equal(CHARACTERS.mage.element, "arcane");
});

test("super shapes are the four distinct spec ids", () => {
  assert.equal(CHARACTERS.knight.super.id, "nova");
  assert.equal(CHARACTERS.barbarian.super.id, "whirlwind");
  assert.equal(CHARACTERS.rogue.super.id, "flurry");
  assert.equal(CHARACTERS.mage.super.id, "meteor");
});

console.log(`\n${passed} passed`);
