// Regression test for the "jitter back to the bind pose" bug.
//
// A one-shot clip (a hero flourish, a dodge) is followed by a looping idle.
// With clampWhenFinished = false three.js disables the finished action the
// instant it ends — its weight drops to 0 — and only then fires "finished",
// which starts fading the idle in from 0. For those frames the sum of all
// action weights is below 1, so the remainder blends toward the bind pose and
// the character's arms snap to its sides.
//
// The invariant: the total weight driving the skeleton must never drop below 1
// during a one-shot -> loop handoff. Run: node game/tests/animation.test.mjs

import { strict as assert } from "node:assert";
import * as THREE from "three";

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

function clip(name, duration = 1) {
  const track = new THREE.VectorKeyframeTrack(".position", [0, duration], [0, 0, 0, 1, 1, 1]);
  return new THREE.AnimationClip(name, duration, [track]);
}

// Runs a one-shot followed by an idle handoff and reports the lowest total
// weight the skeleton saw while the handoff was in progress.
function handoffFloor({ clamp, fade = 0.15, step = 0.05, ticks = 40 }) {
  const mixer = new THREE.AnimationMixer(new THREE.Object3D());

  const oneShot = mixer.clipAction(clip("OneShot"));
  oneShot.setLoop(THREE.LoopOnce, 1);
  oneShot.clampWhenFinished = clamp;
  oneShot.setEffectiveWeight(1);
  oneShot.play();

  const idle = mixer.clipAction(clip("Idle"));
  idle.setLoop(THREE.LoopRepeat, Infinity);
  idle.setEffectiveWeight(0);
  idle.play();

  mixer.addEventListener("finished", () => {
    idle.reset();
    idle.fadeIn(fade);
    idle.play();
  });

  let floor = Infinity;
  for (let i = 0; i < ticks; i++) {
    mixer.update(step);
    floor = Math.min(floor, oneShot.getEffectiveWeight() + idle.getEffectiveWeight());
  }
  return floor;
}

console.log("animation handoff");

test("clamping a one-shot keeps the skeleton fully driven through the handoff", () => {
  const floor = handoffFloor({ clamp: true });
  assert.ok(
    floor >= 0.999,
    `total weight dipped to ${floor.toFixed(3)} — the bind pose bleeds through`
  );
});

test("the bug this guards against is real: unclamped one-shots drop to zero", () => {
  // If three.js ever changes so that unclamped actions keep their weight, this
  // test starts failing and the clamp requirement can be revisited.
  const floor = handoffFloor({ clamp: false });
  assert.ok(floor < 0.5, `expected an unclamped handoff to collapse, got ${floor.toFixed(3)}`);
});

test("the clamp holds at every fade length, including instant", () => {
  for (const fade of [0.05, 0.1, 0.15, 0.3]) {
    const floor = handoffFloor({ clamp: true, fade });
    assert.ok(floor >= 0.999, `fade ${fade}s dipped to ${floor.toFixed(3)}`);
  }
});

test("the clamp holds under coarse frame steps", () => {
  for (const step of [0.016, 0.05, 0.1]) {
    const floor = handoffFloor({ clamp: true, step, ticks: 60 });
    assert.ok(floor >= 0.999, `step ${step}s dipped to ${floor.toFixed(3)}`);
  }
});

console.log(`\n${passed} passed`);
