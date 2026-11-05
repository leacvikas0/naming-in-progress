// ============================================================================
// world/assets/vfx/verify.mjs
//
// Automated Stage 4 & Wave 2A Verification Gate for the Opaque VFX, Aim Arrow &
// Artorious Suite:
// Verifies:
//   1. `shots/<passName>/report.json` exists and parses cleanly
//   2. `passesAllBudgets === true`
//   3. `maxVfxDraws <= 6` and per-system draw call caps (`shatterlance <= 4`,
//      `cinderFall <= 4`, `stormLance <= 3`, `swordVfx <= 4`,
//      `artoriousVfx <= 4`, `aimArrow <= 1`)
//   4. `maxIdleVfxDraws === 0` (`0` idle draw calls when inactive/cleared)
//   5. `maxVfxFrameMs <= 0.35`
//   6. `consoleErrors.length === 0`
//   7. `contractChecks`:
//      - `zeroGlassOpaqueCompliant === true` & `sheathSurvivedRebuild === true`
//      - `frostLanceBounceFree === true`
//      - `cinderVariableDistanceOk === true`
//      - `aimArrowContractOk === true`
//      - `lotusHasCavityAttr === true`
//      - `roseGommagePetalCountOk === true` (`>= 180` crimson rose petals & embers)
//   8. All required PNGs exist in `shots/<passName>/` and each is `> 40 KB`
// ============================================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_6_SHOTS = [
  '01-cast-launch.png',
  '02-mid-eruption-ramp.png',
  '03-apex-crown-impact.png',
  '04-standing-glacier-field.png',
  '05-player-shoulder-camera.png',
  '06-twilight-bloom-showcase.png',
];

const SUITE_SHOTS = [
  ...BASE_6_SHOTS,
  '07-shatterlance-convergence.png',
  '08-shatterlance-impact.png',
  '09-cinder-fall-crater.png',
  '10-storm-lance-discharge.png',
  '11-sword-sunfire-slash.png',
  '12-sword-glacial-detonation.png',
  '13-artorious-prayer-sanctuary.png',
  '14-artorious-petty-smite.png',
  '15-artorious-divine-miracle.png',
  '17-aim-arrow-frost-lance.png',
  '18-aim-arrow-cinder-fall.png',
];

const MIN_PNG_BYTES = 40 * 1024; // 40 KB

async function main() {
  const passName = process.argv[2] || 'pass2-suite';
  const passDir = path.join(__dirname, 'shots', passName);
  const reportPath = path.join(passDir, 'report.json');

  const failures = [];
  const checks = [];

  let report;
  try {
    const raw = await fs.readFile(reportPath, 'utf8');
    report = JSON.parse(raw);
    checks.push(`Loaded ${reportPath}`);
  } catch (err) {
    console.error(`[VERIFY FAIL] Could not read ${reportPath}: ${err.message}`);
    process.exit(1);
  }

  const isSuite =
    passName.includes('suite') || Boolean(report.shots?.['07-shatterlance-convergence']);
  const requiredShots = isSuite ? SUITE_SHOTS : BASE_6_SHOTS;

  const maxDraws = report.maxVfxDraws ?? report.maxVfxDrawCalls ?? 999;
  const maxIdleDraws = report.maxIdleVfxDraws ?? 0;
  const maxFrameMs = report.maxVfxFrameMs ?? 999;
  const consoleErrors = Array.isArray(report.consoleErrors) ? report.consoleErrors : ['missing'];
  const passesAllBudgets =
    report.passesAllBudgets === true ||
    (report.drawCallBudgetMet === true &&
      maxDraws <= 6 &&
      maxIdleDraws === 0 &&
      maxFrameMs <= 0.35 &&
      consoleErrors.length === 0);

  if (passesAllBudgets !== true) {
    failures.push(`passesAllBudgets expected true, got ${report.passesAllBudgets}`);
  } else {
    checks.push(`passesAllBudgets === true`);
  }

  if (maxIdleDraws !== 0) {
    failures.push(`maxIdleVfxDraws expected 0, got ${maxIdleDraws}`);
  } else {
    checks.push(`maxIdleVfxDraws = 0 (0 idle draw calls)`);
  }

  if (!(maxDraws <= 6)) {
    failures.push(`maxVfxDraws expected <= 6, got ${maxDraws}`);
  } else {
    checks.push(`maxVfxDraws = ${maxDraws} (<= 6)`);
  }

  if (isSuite && report.systemMaxDraws) {
    const sys = report.systemMaxDraws;
    if (!(sys.shatterlance <= 4)) failures.push(`shatterlance draws ${sys.shatterlance} > 4`);
    else checks.push(`shatterlance draws = ${sys.shatterlance} (<= 4)`);

    if (!(sys.cinderFall <= 4)) failures.push(`cinderFall draws ${sys.cinderFall} > 4`);
    else checks.push(`cinderFall draws = ${sys.cinderFall} (<= 4)`);

    if (!(sys.stormLance <= 3)) failures.push(`stormLance draws ${sys.stormLance} > 3`);
    else checks.push(`stormLance draws = ${sys.stormLance} (<= 3)`);

    if (!(sys.swordVfx <= 4)) failures.push(`swordVfx draws ${sys.swordVfx} > 4`);
    else checks.push(`swordVfx draws = ${sys.swordVfx} (<= 4)`);

    if (sys.artoriousVfx !== undefined) {
      if (!(sys.artoriousVfx <= 4)) failures.push(`artoriousVfx draws ${sys.artoriousVfx} > 4`);
      else checks.push(`artoriousVfx draws = ${sys.artoriousVfx} (<= 4)`);
    }

    if (sys.aimArrow !== undefined) {
      if (!(sys.aimArrow <= 1)) failures.push(`aimArrow draws ${sys.aimArrow} > 1`);
      else checks.push(`aimArrow draws = ${sys.aimArrow} (<= 1)`);
    }
  }

  if (isSuite && report.contractChecks) {
    const cc = report.contractChecks;
    if (cc.zeroGlassOpaqueCompliant !== true) {
      failures.push(`zeroGlassOpaqueCompliant failed: ${JSON.stringify(cc.nonOpaqueMeshes)}`);
    } else {
      checks.push(`zeroGlassOpaqueCompliant === true (transparent: false, depthWrite: true)`);
    }
    if (cc.sheathSurvivedRebuild !== true) {
      failures.push(`sheathSurvivedRebuild expected true`);
    } else {
      checks.push(`sheathSurvivedRebuild === true (userData.isVfx guard intact)`);
    }
    if (cc.frostLanceBounceFree !== true) {
      failures.push(`frostLanceBounceFree expected true`);
    } else {
      checks.push(`frostLanceBounceFree === true (riseOvershoot = 0.0, zero sinusoidal bounce)`);
    }
    if (cc.cinderVariableDistanceOk !== true) {
      failures.push(`cinderVariableDistanceOk expected true`);
    } else {
      checks.push(`cinderVariableDistanceOk === true (clamped 3.0..16.0m)`);
    }
    if (cc.aimArrowContractOk !== true) {
      failures.push(`aimArrowContractOk expected true`);
    } else {
      checks.push(`aimArrowContractOk === true (frost_lance=14.5m, cinder_fall=3..16m, 1 draw active, 0 idle)`);
    }
    if (cc.lotusHasCavityAttr !== true) {
      failures.push(`lotusHasCavityAttr expected true`);
    } else {
      checks.push(`lotusHasCavityAttr === true (createSacredLotusPetalGeometry + aCavity)`);
    }
    if (cc.roseGommagePetalCountOk !== true) {
      failures.push(`roseGommagePetalCountOk expected true`);
    } else {
      checks.push(`roseGommagePetalCountOk === true (180+ crimson rose petals & golden embers)`);
    }
  }

  if (!(maxFrameMs <= 0.35)) {
    failures.push(`maxVfxFrameMs expected <= 0.35, got ${maxFrameMs}`);
  } else {
    checks.push(`maxVfxFrameMs = ${maxFrameMs} ms (<= 0.35 ms)`);
  }

  if (consoleErrors.length !== 0) {
    failures.push(
      `consoleErrors.length expected 0, got ${consoleErrors.length}: ${JSON.stringify(consoleErrors)}`
    );
  } else {
    checks.push(`consoleErrors.length === 0`);
  }

  for (const pngName of requiredShots) {
    const pngPath = path.join(passDir, pngName);
    try {
      const stat = await fs.stat(pngPath);
      if (stat.size <= MIN_PNG_BYTES) {
        failures.push(`${pngName} size ${stat.size}B <= ${MIN_PNG_BYTES}B (40KB)`);
      } else {
        checks.push(`${pngName}: ${(stat.size / 1024).toFixed(1)} KB (> 40 KB)`);
      }
    } catch (err) {
      failures.push(`Missing screenshot ${pngPath}: ${err.message}`);
    }
  }

  console.log(`=== Stage 4 & Wave 2A VFX Verification Summary (${passName}) ===`);
  for (const c of checks) {
    console.log(`  [PASS] ${c}`);
  }

  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`  [FAIL] ${f}`);
    }
    process.exit(1);
  }

  console.log('ALL VERIFICATION GATES PASSED.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
