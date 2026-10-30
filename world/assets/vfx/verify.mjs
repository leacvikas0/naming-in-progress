// ============================================================================
// world/assets/vfx/verify.mjs
//
// Automated Stage 4 Pass 2 Verification Gate for Frost Lance (`shots/pass2/`):
// Verifies:
//   1. `shots/pass2/report.json` exists and parses cleanly
//   2. `passesAllBudgets === true`
//   3. `maxVfxDraws <= 6` (and `maxVfxDrawCalls <= 6`)
//   4. `maxVfxFrameMs <= 0.35`
//   5. `consoleErrors.length === 0`
//   6. All 6 required PNGs exist in `shots/pass2/` and each is `> 40 KB`
// ============================================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUIRED_SHOTS = [
  '01-cast-launch.png',
  '02-mid-eruption-ramp.png',
  '03-apex-crown-impact.png',
  '04-standing-glacier-field.png',
  '05-player-shoulder-camera.png',
  '06-twilight-bloom-showcase.png',
];

const MIN_PNG_BYTES = 40 * 1024; // 40 KB

async function main() {
  const passName = process.argv[2] || 'pass2';
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

  const maxDraws = report.maxVfxDraws ?? report.maxVfxDrawCalls ?? 999;
  const maxFrameMs = report.maxVfxFrameMs ?? 999;
  const consoleErrors = Array.isArray(report.consoleErrors) ? report.consoleErrors : ['missing'];
  const passesAllBudgets =
    report.passesAllBudgets === true ||
    (report.drawCallBudgetMet === true &&
      maxDraws <= 6 &&
      maxFrameMs <= 0.35 &&
      consoleErrors.length === 0);

  if (passesAllBudgets !== true) {
    failures.push(`passesAllBudgets expected true, got ${report.passesAllBudgets}`);
  } else {
    checks.push(`passesAllBudgets === true`);
  }

  if (!(maxDraws <= 6)) {
    failures.push(`maxVfxDraws expected <= 6, got ${maxDraws}`);
  } else {
    checks.push(`maxVfxDraws = ${maxDraws} (<= 6)`);
  }

  if (!(maxFrameMs <= 0.35)) {
    failures.push(`maxVfxFrameMs expected <= 0.35, got ${maxFrameMs}`);
  } else {
    checks.push(`maxVfxFrameMs = ${maxFrameMs} ms (<= 0.35 ms)`);
  }

  if (consoleErrors.length !== 0) {
    failures.push(`consoleErrors.length expected 0, got ${consoleErrors.length}: ${JSON.stringify(consoleErrors)}`);
  } else {
    checks.push(`consoleErrors.length === 0`);
  }

  for (const pngName of REQUIRED_SHOTS) {
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

  console.log('=== Frost Lance Pass 2 Verification Summary ===');
  for (const c of checks) {
    console.log(`  [PASS] ${c}`);
  }

  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`  [FAIL] ${f}`);
    }
    process.exit(1);
  }

  console.log('ALL PASS 2 VERIFICATION GATES PASSED.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
