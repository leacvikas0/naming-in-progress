import { strict as assert } from "node:assert";
import { moveBasis } from "../src/balance.js";

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

const EPS = 1e-9;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < EPS, `${msg}: ${a} vs ${b}`);

function moveFor(yaw, keys) {
  const { forward, right } = moveBasis(yaw);
  let mx = 0;
  let mz = 0;
  if (keys.includes("w")) mz += 1;
  if (keys.includes("s")) mz -= 1;
  if (keys.includes("d")) mx += 1;
  if (keys.includes("a")) mx -= 1;
  return { x: forward.x * mz + right.x * mx, z: forward.z * mz + right.z * mx };
}

function assertVec(v, x, z, msg) {
  close(v.x, x, `${msg} x`);
  close(v.z, z, `${msg} z`);
}

console.log("controls.js");

test("yaw=0 basis: forward +Z, right -X", () => {
  const { forward, right } = moveBasis(0);
  assertVec(forward, 0, 1, "forward");
  assertVec(right, -1, 0, "right");
});

test("yaw=0 key mapping: W/S/D/A", () => {
  assertVec(moveFor(0, ["w"]), 0, 1, "W");
  assertVec(moveFor(0, ["s"]), 0, -1, "S");
  assertVec(moveFor(0, ["d"]), -1, 0, "D");
  assertVec(moveFor(0, ["a"]), 1, 0, "A");
});

test("yaw=pi/2 basis: forward +X, right +Z", () => {
  const { forward, right } = moveBasis(Math.PI / 2);
  assertVec(forward, 1, 0, "forward");
  assertVec(right, 0, 1, "right");
});

test("basis stays unit length, perpendicular, and right-handed for 0..2pi", () => {
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const yaw = (i / steps) * Math.PI * 2;
    const { forward, right } = moveBasis(yaw);
    const fLen = Math.hypot(forward.x, forward.z);
    const rLen = Math.hypot(right.x, right.z);
    close(fLen, 1, `|forward| at yaw ${yaw}`);
    close(rLen, 1, `|right| at yaw ${yaw}`);
    close(forward.x * right.x + forward.z * right.z, 0, `forward·right at yaw ${yaw}`);

    const cross = { x: -forward.z, z: forward.x };
    assertVec(cross, right.x, right.z, `cross(forward,up) at yaw ${yaw}`);
  }
});

test("W always moves away from the camera", () => {
  const flat = 7;
  const px = 3;
  const pz = -2;
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const yaw = (i / steps) * Math.PI * 2;
    const { forward } = moveBasis(yaw);
    const camX = px - Math.sin(yaw) * flat;
    const camZ = pz - Math.cos(yaw) * flat;
    const dot = forward.x * (px - camX) + forward.z * (pz - camZ);
    assert.ok(dot > 0, `W should move away from camera at yaw ${yaw} (dot ${dot})`);
  }
});

console.log(`\n${passed} passed`);
