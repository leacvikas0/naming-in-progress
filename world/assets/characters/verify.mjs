import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PASS_DIR = path.join(__dirname, 'shots', 'pass2');
const REPORT_PATH = path.join(PASS_DIR, 'report.json');

const REQUIRED_SHOTS = [
  'hero-duo-knight-mage',
  'adventurer-lineup',
  'skeleton-enemies',
  'action-poses-sheet',
  'back-and-silhouette',
];

const REQUIRED_PACKS = [
  'Rig_Medium_General.glb',
  'Rig_Medium_MovementBasic.glb',
  'Rig_Medium_CombatMelee.glb',
  'Rig_Medium_CombatRanged.glb',
  'Rig_Medium_Special.glb',
];

async function main() {
  const raw = await fs.readFile(REPORT_PATH, 'utf8');
  const report = JSON.parse(raw);

  assert.equal(report.pass, 'pass2', 'Expected report.pass === "pass2"');
  assert.equal(report.zeroConsoleErrors, true, `Expected zero console errors, got: ${JSON.stringify(report.consoleErrors)}`);
  assert.equal(report.consoleErrors.length, 0, 'Expected consoleErrors to be empty');

  // 1. Verify all 5 rendered PNGs exist and are > 30KB
  for (const shotName of REQUIRED_SHOTS) {
    const shotInfo = report.shots?.[shotName];
    assert.ok(shotInfo, `Missing shot telemetry for ${shotName}`);
    const pngPath = path.join(PASS_DIR, `${shotName}.png`);
    const stat = await fs.stat(pngPath);
    assert.ok(stat.size > 30_000, `Expected ${shotName}.png > 30KB, got ${stat.size} bytes`);
  }

  // 2. Verify hardware draw-call & triangle budgets
  const duo = report.shots['hero-duo-knight-mage'];
  assert.ok(duo.drawCalls <= 6, `Expected hero-duo-knight-mage drawCalls <= 6, got ${duo.drawCalls}`);
  assert.ok(duo.triangles <= 26_000, `Expected hero-duo-knight-mage triangles <= 26000, got ${duo.triangles}`);

  const lineup = report.shots['adventurer-lineup'];
  assert.ok(lineup.drawCalls <= 15, `Expected adventurer-lineup drawCalls <= 15, got ${lineup.drawCalls}`);

  const skels = report.shots['skeleton-enemies'];
  assert.ok(skels.drawCalls <= 12, `Expected skeleton-enemies drawCalls <= 12, got ${skels.drawCalls}`);

  const poses = report.shots['action-poses-sheet'];
  assert.ok(poses.drawCalls <= 12, `Expected action-poses-sheet drawCalls <= 12, got ${poses.drawCalls}`);

  const back = report.shots['back-and-silhouette'];
  assert.ok(back.drawCalls <= 6, `Expected back-and-silhouette drawCalls <= 6, got ${back.drawCalls}`);

  // 3. Verify all 5 Rig_Medium_* animation packs and >= 24 semantic animation keys
  const audit = report.animationAudit;
  assert.ok(audit, 'Missing animationAudit in report.json');
  for (const packName of REQUIRED_PACKS) {
    assert.ok(audit.packNames.includes(packName), `Missing animation pack ${packName}`);
  }
  assert.ok(audit.totalNativeClips >= 90, `Expected >= 90 native Rig_Medium clips, got ${audit.totalNativeClips}`);
  assert.ok(audit.semanticKeys.length >= 24, `Expected >= 24 semantic animation keys, got ${audit.semanticKeys.length}`);
  assert.equal(audit.adventurerIds.length, 5, 'Expected all 5 KayKit Adventurer heroes');
  assert.equal(audit.skeletonIds.length, 4, 'Expected all 4 KayKit Skeleton enemies');

  console.log('[verify:characters] PASS — All Stage 3 Pass 2 visual & hardware assertions succeeded:', {
    heroDuoDraws: duo.drawCalls,
    heroDuoTris: duo.triangles,
    adventurerLineupDraws: lineup.drawCalls,
    skeletonEnemiesDraws: skels.drawCalls,
    actionPosesDraws: poses.drawCalls,
    backSilhouetteDraws: back.drawCalls,
    totalNativeClips: audit.totalNativeClips,
    semanticKeys: audit.semanticKeys.length,
  });
}

main().catch((err) => {
  console.error('[verify:characters] FAILED:', err);
  process.exit(1);
});
