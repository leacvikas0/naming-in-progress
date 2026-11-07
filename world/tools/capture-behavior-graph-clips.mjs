// ============================================================================
// world/tools/capture-behavior-graph-clips.mjs
//
// Deterministic Frame-Stepped 1080p Behavioral Video Clip & Poster Recorder for
// Amarante's ComfyUI-Style Visual Behavior Graph (`world/behavior-graph/clips/`).
//
// Records all 12 real `.webm` video clips (1920x1080 Full HD, locked 24fps, 3.6-5.7s)
// and matching `.png` poster frames (`01-flow-title.png` .. `12-mage-combat-kit.png`),
// plus `world/behavior-graph/clips/manifest.json`.
//
// HARD GUARANTEES:
// - Uses an ephemeral/dedicated random port (`4280 + Math.floor(Math.random()*500)`)
//   with automatic fallback so parallel subagents never collide.
// - ZERO SPOILERS: Intercepts `/api/altar*` at the HTTP server layer AND
//   overrides the 3D stone calligraphy decal lines in clip 07 with spoiler-masked
//   placeholder verse lines. Never reads or logs secret poems or true names.
// - Reuses a single loaded page and steps `window.__FIXED_DT__` frame-by-frame
//   into `ffmpeg -f image2pipe` so every clip has 0 loading frames and 100%
//   locked 24fps motion in SwiftShader at full 1920x1080.
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORLD_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WORLD_DIR, '..');
const OUT_DIR = path.join(WORLD_DIR, 'behavior-graph', 'clips');

const VIEWPORT = { width: 1920, height: 1080 };
const FPS = 24;
const STEP_DT = 1 / FPS;

const SPOILER_MASKED_POEM_LINES = Object.freeze([
  '[Secret Stone Poem #1 — True Name Riddle]',
  '"Speak the hidden name beneath the crimson bloom..."',
  '[Spoiler-Masked for Playthrough]',
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
};

function startIsolatedServer() {
  const server = http.createServer((req, res) => {
    const rawUrl = req.url || '/';
    const urlPath = decodeURIComponent(rawUrl.split('?')[0]);

    if (urlPath === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Zero-Spoiler Interceptor: never serve real Sacred Stone poems during capture
    if (urlPath.startsWith('/api/altar')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          stage: 1,
          stoneId: 'stone_plaza',
          title: 'Weathered Stele of the Town Plaza',
          lines: SPOILER_MASKED_POEM_LINES,
        })
      );
      return;
    }

    if (urlPath.startsWith('/api/commune')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          verdict: 'blessing',
          shouldSpeakAloud: false,
          divine_quote: 'Briar Sanctuary Encloses You Both.',
        })
      );
      return;
    }

    const relTarget = urlPath === '/' ? 'world/index.html' : urlPath.replace(/^\/+/, '');
    let filePath = path.join(REPO_ROOT, relTarget);
    if (!fs.existsSync(filePath)) {
      const mainRepoRoot = path.resolve(REPO_ROOT, '../../..');
      const altPath = path.join(mainRepoRoot, relTarget);
      if (fs.existsSync(altPath)) {
        filePath = altPath;
      }
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  const preferredPort = 4280 + Math.floor(Math.random() * 500);
  return new Promise((resolve) => {
    server.once('error', () => {
      server.listen(0, '127.0.0.1', () => {
        resolve({ server, port: server.address().port });
      });
    });
    server.listen(preferredPort, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

async function probeVideoDuration(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      filePath,
    ]);
    const parsed = JSON.parse(stdout);
    const dur = Number(parsed?.format?.duration);
    if (Number.isFinite(dur) && dur > 0) return dur;
  } catch {
    // ignore
  }
  return null;
}

function createFfmpegWebmEncoder(outputPath, fps = FPS) {
  const proc = spawn(
    'ffmpeg',
    [
      '-y',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      '-framerate',
      String(fps),
      '-i',
      '-',
      '-c:v',
      'libvpx',
      '-b:v',
      '4.8M',
      '-crf',
      '14',
      '-pix_fmt',
      'yuv420p',
      '-an',
      outputPath,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] }
  );

  let stderrLog = '';
  proc.stderr.on('data', (chunk) => {
    stderrLog += chunk.toString();
  });

  const donePromise = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderrLog.slice(-400)}`));
    });
  });

  return {
    writeFrame(jpegBuffer) {
      if (!proc.stdin.writable) return Promise.resolve();
      const ok = proc.stdin.write(jpegBuffer);
      if (ok) return Promise.resolve();
      return new Promise((r) => proc.stdin.once('drain', r));
    },
    async finish() {
      proc.stdin.end();
      await donePromise;
    },
  };
}

async function stepSimulationFrame(page, dt = STEP_DT) {
  await page.evaluate((stepDt) => {
    return new Promise((resolve) => {
      window.__FIXED_DT__ = stepDt;
      requestAnimationFrame(() => {
        window.__FIXED_DT__ = 0.00001;
        resolve();
      });
    });
  }, dt);
}

async function recordDeterministicClip(page, spec, consoleErrors) {
  const { id, description, totalFrames, posterFrame, setupFn, onFrame } = spec;
  const startErrCount = consoleErrors.length;

  const videoPath = path.join(OUT_DIR, `${id}.webm`);
  const posterPath = path.join(OUT_DIR, `${id}.png`);

  // Freeze simulation clock & clean transient banners before clip setup
  await page.evaluate(() => {
    window.__FIXED_DT__ = 0.00001;
    const w = window.__WORLD__;
    if (w?.meadow?.grassMesh) {
      w.meadow.grassMesh.count = Math.min(w.meadow.grassMesh.count, 16000);
    }
    w?.damageNumbers?.clear?.();
    w?.sculptedHud?.closePauseModal?.();
    document.getElementById('combat-banner')?.classList.remove('visible');
    document.getElementById('debug-dev-pill')?.classList.remove('visible');
  });

  if (typeof setupFn === 'function') {
    await setupFn(page);
  }

  // Advance 2 settle frames so camera and matrices are 100% synced before Frame 0
  await stepSimulationFrame(page, 0.016);
  await stepSimulationFrame(page, 0.016);

  const encoder = createFfmpegWebmEncoder(videoPath, FPS);
  let posterSaved = false;

  for (let f = 0; f < totalFrames; f++) {
    const tSec = f * STEP_DT;
    if (typeof onFrame === 'function') {
      await onFrame(page, f, tSec);
    }
    await stepSimulationFrame(page, STEP_DT);

    const jpegBuf = await page.screenshot({ type: 'jpeg', quality: 92 });
    await encoder.writeFrame(jpegBuf);

    if (f === posterFrame && !posterSaved) {
      posterSaved = true;
      await page.screenshot({ path: posterPath, type: 'png' });
    }
  }

  if (!posterSaved) {
    await page.screenshot({ path: posterPath, type: 'png' });
  }

  await encoder.finish();

  const stat = await fsp.stat(videoPath);
  const posterStat = await fsp.stat(posterPath);
  const probedDur = (await probeVideoDuration(videoPath)) || Number((totalFrames / FPS).toFixed(2));
  const clipErrors = consoleErrors.length - startErrCount;

  console.log(
    `[CLIP RECORDED] ${id}.webm (${(stat.size / 1024).toFixed(1)} KB, ${probedDur.toFixed(2)}s, ${totalFrames} frames @ ${FPS}fps, ${VIEWPORT.width}x${VIEWPORT.height}, poster=${(posterStat.size / 1024).toFixed(1)} KB, errors=${clipErrors})`
  );

  return {
    id,
    filename: `${id}.webm`,
    poster: `${id}.png`,
    duration: Number(probedDur.toFixed(2)),
    resolution: `${VIEWPORT.width}x${VIEWPORT.height}`,
    fps: FPS,
    frames: totalFrames,
    sizeBytes: stat.size,
    posterSizeBytes: posterStat.size,
    description,
    consoleErrors: clipErrors,
  };
}

const CLIP_SPECS = [
  // =========================================================================
  // 1. 01-flow-title.webm (90 frames = 3.75s)
  // =========================================================================
  {
    id: '01-flow-title',
    mode: 'flow',
    totalFrames: 90,
    posterFrame: 36,
    description:
      'Amarante Title Screen: 36px -> 1px mosaic canvas resolve over the Southern Flower Field vista, open-air linework title & credits, clicking Step into the Domain.',
    setupFn: async (page) => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.setProfile('desktop');
        w.setTimeOfDay('day');
        w.appFlow.setStep('title');
        const btn = document.getElementById('app-flow-enter-btn');
        if (btn) {
          btn.style.transform = '';
          btn.style.borderColor = '';
        }
      });
    },
    onFrame: async (page, f, t) => {
      await page.evaluate(
        ({ f, t }) => {
          const w = window.__WORLD__;
          const veil = document.getElementById('af-pixel-veil');
          const pCanvas = document.getElementById('af-pixel-veil-canvas');
          const wCanvas = document.getElementById('world-canvas');

          // Deterministic 36px -> 1px mosaic resolve across frames 0..20
          if (f <= 20 && veil && pCanvas && wCanvas) {
            veil.classList.remove('is-resolved');
            const prog = f / 20;
            const eased = 1 - Math.pow(1 - prog, 3);
            const blockSize = Math.max(1, Math.round(36 - 35 * eased));
            const lowW = Math.max(16, Math.floor(window.innerWidth / blockSize));
            const lowH = Math.max(9, Math.floor(window.innerHeight / blockSize));
            pCanvas.width = lowW;
            pCanvas.height = lowH;
            const ctx = pCanvas.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = false;
              try {
                ctx.drawImage(wCanvas, 0, 0, lowW, lowH);
              } catch {}
            }
          } else if (f === 21 && veil) {
            veil.classList.add('is-resolved');
          }

          if (f < 60) {
            w.camState.vistaPos.x = Math.sin(t * 1.1) * 0.42;
          }
          if (f === 52) {
            const btn = document.getElementById('app-flow-enter-btn');
            if (btn) {
              btn.style.transform = 'scale(0.96)';
              btn.style.borderColor = '#fbd36b';
            }
          }
          if (f === 62) {
            const btn = document.getElementById('app-flow-enter-btn');
            if (btn) {
              btn.style.transform = '';
              btn.style.borderColor = '';
              btn.click();
            }
          }
        },
        { f, t }
      );
    },
  },

  // =========================================================================
  // 2. 02-flow-loading.webm (96 frames = 4.00s)
  //    Used by Node 8 (`n_arenas`: "8 · Valley Waves & Genshin DMG")
  // =========================================================================
  {
    id: '02-flow-loading',
    mode: 'game',
    totalFrames: 96,
    posterFrame: 52,
    description:
      'Valley Wave Arena combat with Two-Handed Xiaomi Pad 7 Concentric Fan Arc and all 4 Genshin floating damage number palettes (Physical, Ice, Fire, Lightning Crit ✦).',
    setupFn: async (page) => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.skipToGame();
        w.setProfile('tablet');
        w.setTimeOfDay('day');
        w.coopSystem.cancelCommuneChannel();
        w.communeClient.cancelCommune();
        w.campaignLoop.verdictSequence.active = false;
        w.campaignLoop.combatHeroes.Knight.downed = false;
        w.campaignLoop.combatHeroes.Mage.downed = false;
        w.campaignLoop.combatHeroes.Knight.hp = 220;
        w.campaignLoop.combatHeroes.Mage.hp = 90;
        w.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
        w.campaignLoop.combatHeroes.Knight.ultCd = 0;

        if (w.coopSystem.player.activeHeroId !== 'Knight') {
          w.coopSystem.swapActiveHero();
        }
        w.sculptedHud.setVisible(true);
        w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
        w.sculptedHud.setProgressionState({
          communeDiscovered: true,
          iceUnlocked: true,
          fireUnlocked: true,
          ultimateUnlocked: true,
          unlockedStage: 3,
          stonesSolved: 3,
          activeRole: 'Knight',
          activeElement: 'fire',
        });
        document.getElementById('combat-banner')?.classList.remove('visible');

        w.coopSystem.teleportLeaderAndPartner(71.8, -3.8, Math.PI * 0.5);
        w.enemyManager.clearAllEnemies();
        w.enemyManager.setFrozenForShot(null);
        w.enemyManager.spawnImmediateFromSpec({
          slotIndex: 0,
          archetype: 'warrior',
          x: 73.9,
          z: -3.8,
          rotY: -1.5,
          hp: 2600,
          maxHp: 2600,
        });
        w.enemyManager.spawnImmediateFromSpec({
          slotIndex: 1,
          archetype: 'warrior',
          x: 74.6,
          z: -2.4,
          rotY: -1.7,
          hp: 2600,
          maxHp: 2600,
        });
        w.enemyManager.spawnImmediateFromSpec({
          slotIndex: 2,
          archetype: 'minion',
          x: 74.4,
          z: -5.1,
          rotY: -1.3,
          hp: 2200,
          maxHp: 2200,
        });
        w.setCameraOrbit(Math.PI * 0.28, 0.17, 6.4);
      });
    },
    onFrame: async (page, f) => {
      await page.evaluate((f) => {
        const w = window.__WORLD__;
        const joyPuck = document.getElementById('sh-joy-puck');
        const joyRing = document.getElementById('sh-joy-ring');
        if (joyPuck && joyRing) {
          const jx = Math.cos(f * 0.12) * 26;
          const jy = -Math.abs(Math.sin(f * 0.12)) * 28;
          joyPuck.style.transform = `translate3d(${jx.toFixed(1)}px, ${jy.toFixed(1)}px, 0px)`;
          joyRing.classList.toggle('is-sprinting', f >= 16 && f <= 74);
        }

        if (f === 4 || f === 16 || f === 28) {
          w.coopSystem.triggerAction('attack');
        }
        if (f === 36) {
          w.coopSystem.triggerAction('skill');
        }
        if (f === 44) {
          w.coopSystem.triggerAction('ultimate');
        }
        // Spawn all 4 Genshin floating damage palettes across the wave enemies so posterFrame=52 is rich
        if (f === 42) {
          w.damageNumbers.spawnDamageNumber({
            amount: 46,
            element: 'physical',
            isCrit: false,
            worldPos: { x: 73.7, y: 1.5, z: -4.6, heightOffset: 1.45 },
          });
        }
        if (f === 45) {
          w.damageNumbers.spawnDamageNumber({
            amount: 78,
            element: 'ice',
            isCrit: false,
            worldPos: { x: 74.4, y: 1.5, z: -2.4, heightOffset: 1.65 },
          });
        }
        if (f === 48) {
          w.damageNumbers.spawnDamageNumber({
            amount: 94,
            element: 'fire',
            isCrit: false,
            worldPos: { x: 74.1, y: 1.5, z: -3.8, heightOffset: 1.75 },
          });
        }
        if (f === 50) {
          w.damageNumbers.spawnDamageNumber({
            amount: 168,
            element: 'lightning',
            isCrit: true,
            label: 'CRIT',
            worldPos: { x: 73.8, y: 1.5, z: -3.3, heightOffset: 2.05 },
          });
        }
        if (f === 68) {
          w.coopSystem.triggerAction('attack');
        }
      }, f);
    },
  },

  // =========================================================================
  // 3. 03-flow-create-join.webm (96 frames = 4.00s)
  // =========================================================================
  {
    id: '03-flow-create-join',
    mode: 'flow',
    totalFrames: 96,
    posterFrame: 52,
    description:
      'Open or Join a Domain: two open-air 1.5px hairline frames, poetic phrase chips, typing "Love is curiosity", and clicking Enter.',
    setupFn: async (page) => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.setProfile('desktop');
        w.setTimeOfDay('day');
        w.appFlow.setStep('create_join');
        const inp = document.getElementById('app-flow-phrase-input');
        if (inp) inp.value = '';
        const btn = document.getElementById('app-flow-create-btn');
        if (btn) {
          btn.style.transform = '';
          btn.style.borderColor = '';
        }
      });
    },
    onFrame: async (page, f) => {
      await page.evaluate((f) => {
        const phrase = 'Love is curiosity';
        const inp = document.getElementById('app-flow-phrase-input');
        if (f === 12) {
          const chip = document.querySelector('[data-phrase-chip="Two lanterns under wisteria"]');
          chip?.click();
        }
        if (f >= 16 && f <= 46 && inp) {
          const charCount = Math.min(
            phrase.length,
            Math.ceil(((f - 15) / 30) * phrase.length)
          );
          inp.value = phrase.slice(0, charCount);
          const activePhrase = document.getElementById('app-flow-active-phrase');
          if (activePhrase && charCount === phrase.length) {
            activePhrase.textContent = phrase;
          }
        }
        if (f === 60) {
          const btn = document.getElementById('app-flow-create-btn');
          if (btn) {
            btn.style.transform = 'scale(0.96)';
            btn.style.borderColor = '#fbd36b';
          }
        }
        if (f === 68) {
          const btn = document.getElementById('app-flow-create-btn');
          if (btn) {
            btn.style.transform = '';
            btn.style.borderColor = '';
            btn.click();
          }
          window.__WORLD__.appFlow.setLobbyState({
            roomPhrase: 'Love is curiosity',
            isHost: true,
            playerName: 'Vikas',
            partnerName: 'Ishika',
            partnerClaimed: true,
            playerCount: 2,
            peerConnected: true,
            guestReady: true,
          });
        }
      }, f);
    },
  },

  // =========================================================================
  // 4. 04-flow-flower-lobby.webm (108 frames = 4.50s)
  // =========================================================================
  {
    id: '04-flow-flower-lobby',
    mode: 'flow',
    totalFrames: 108,
    posterFrame: 24,
    description:
      'Southern Flower Field 3D Hero Claim at (0, 128): tapping Knight & Mage directly in the wildflowers, shoulder hairline name input sliding between heroes, copy invite morph, and entering the valley.',
    setupFn: async (page) => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.setProfile('desktop');
        w.setTimeOfDay('day');
        w.appFlow.setStep('flower_lobby');
        w.appFlow.setLobbyState({
          roomPhrase: 'Rain on warm limestone',
          isHost: true,
          hostRole: 'Knight',
          localRole: 'Knight',
          playerName: 'Vikas',
          partnerName: 'Ishika',
          partnerClaimed: true,
          playerCount: 2,
          peerConnected: true,
          guestReady: true,
        });
        const nameInp = document.getElementById('app-flow-name-input');
        if (nameInp) nameInp.value = 'Vikas';
      });
    },
    onFrame: async (page, f) => {
      await page.evaluate((f) => {
        if (f === 36) {
          document.getElementById('app-flow-claim-mage')?.click();
        }
        if (f === 60) {
          document.getElementById('app-flow-claim-knight')?.click();
        }
        if (f === 72) {
          document.getElementById('app-flow-copy-btn')?.click();
        }
        if (f === 84) {
          const btn = document.getElementById('app-flow-start-btn');
          if (btn) {
            btn.style.transform = 'scale(0.94)';
            btn.style.borderColor = '#fbd36b';
          }
        }
        if (f === 90) {
          const btn = document.getElementById('app-flow-start-btn');
          if (btn) {
            btn.style.transform = '';
            btn.style.borderColor = '';
            btn.click();
          }
          document.getElementById('combat-banner')?.classList.remove('visible');
        }
      }, f);
    },
  },

  // =========================================================================
  // 5. 05-hud-bare-start.webm (96 frames = 4.00s)
  // =========================================================================
  {
    id: '05-hud-bare-start',
    mode: 'game',
    totalFrames: 96,
    posterFrame: 36,
    description:
      'Dropping into (0, 124) behind the hero with the bare Amarante See-Through Ring HUD (Stage 0: borderless party strip, bottom-center 220/220 vitality bar, Pause ring, and Attack/Dash/Jump rings) and walking down the country road.',
    setupFn: async (page) => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.setProfile('desktop');
        w.appFlow.skipToGame();
        w.campaignLoop?.resetCampaign?.();
        w.enemyManager.clearAllEnemies();
        w.setTimeOfDay('day');
        if (w.coopSystem.player.activeHeroId !== 'Knight') {
          w.coopSystem.swapActiveHero();
        }
        w.campaignLoop.combatHeroes.Knight.hp = 220;
        w.campaignLoop.combatHeroes.Mage.hp = 90;
        w.sculptedHud.setVisible(true);
        w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
        w.sculptedHud.updatePartyStatus({
          knight: { hp: 220, maxHp: 220, shield: 0 },
          mage: { hp: 90, maxHp: 90, shield: 0 },
        });
        w.sculptedHud.setProgressionState({
          communeDiscovered: false,
          iceUnlocked: false,
          fireUnlocked: false,
          ultimateUnlocked: false,
          unlockedStage: 0,
          stonesSolved: 0,
          activeRole: 'Knight',
        });
        w.sculptedHud.closePauseModal();
        document.getElementById('combat-banner')?.classList.remove('visible');

        w.coopSystem.teleportLeaderAndPartner(0.0, 124.0, Math.PI);
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI;
        w.camState.pitch = 0.14;
        w.camState.dist = 8.4;
      });
    },
    onFrame: async (page, f) => {
      await page.evaluate((f) => {
        const w = window.__WORLD__;
        if (f === 0 || f === 1) {
          w.setTimeOfDay('day');
        }
        if (f === 8) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
        }
        if (f === 90) {
          window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
        }
        document.getElementById('combat-banner')?.classList.remove('visible');
      }, f);
    },
  },

  // =========================================================================
  // 6. 06-hud-role-info-and-pause-tabs.webm (120 frames = 5.00s)
  //    Used by Node 7A (`n_riddles`: "7A · Non-Linear Stone Unlocks")
  // =========================================================================
  {
    id: '06-hud-role-info-and-pause-tabs',
    mode: 'game',
    totalFrames: 120,
    posterFrame: 72,
    description:
      'Non-linear stone unlock progression (Lakeside -> Ice [E], Wisteria -> Fire [E] + [Tab] "Tab to switch", Town Plaza -> [Q] Ultimate), then opening Sanctuary Pause to cycle Sky Atmosphere (Morning -> Golden Hour -> Twilight -> Starlit Night) and Hardware Profile.',
    setupFn: async (page) => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.skipToGame();
        w.setProfile('desktop');
        w.setView('plaza');
        w.setTimeOfDay('day');
        w.sculptedHud.setVisible(true);
        w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
        w.sculptedHud.setProgressionState({
          communeDiscovered: true,
          iceUnlocked: false,
          fireUnlocked: false,
          ultimateUnlocked: false,
          unlockedStage: 0,
          stonesSolved: 0,
          activeRole: 'Knight',
        });
        w.sculptedHud.closePauseModal();
        document.getElementById('combat-banner')?.classList.remove('visible');
      });
    },
    onFrame: async (page, f) => {
      await page.evaluate((f) => {
        const w = window.__WORLD__;
        // 1. Lakeside Stone solved -> Ice [E] ring unlocks
        if (f === 10) {
          w.sculptedHud.setProgressionState({
            communeDiscovered: true,
            iceUnlocked: true,
            fireUnlocked: false,
            ultimateUnlocked: false,
            unlockedStage: 1,
            stonesSolved: 1,
            activeElement: 'ice',
          });
        }
        // 2. Wisteria Stone solved -> Fire [E] + [Tab] ("Tab to switch") unlocks
        if (f === 24) {
          w.sculptedHud.setProgressionState({
            communeDiscovered: true,
            iceUnlocked: true,
            fireUnlocked: true,
            ultimateUnlocked: false,
            unlockedStage: 2,
            stonesSolved: 2,
            activeElement: 'fire',
          });
        }
        // 3. Town Plaza Stone solved -> [Q] Storm Vortex Ultimate unlocks
        if (f === 38) {
          w.sculptedHud.setProgressionState({
            communeDiscovered: true,
            iceUnlocked: true,
            fireUnlocked: true,
            ultimateUnlocked: true,
            unlockedStage: 3,
            stonesSolved: 3,
            activeElement: 'ice',
          });
        }
        // 4. Open Sanctuary Pause & cycle Sky Atmosphere (Morning -> Golden Hour -> Twilight -> Starlit Night)
        if (f === 52) {
          document.getElementById('sculpted-pause-btn')?.click();
        }
        if (f === 64) {
          document.querySelector('[data-tod-choice="evening"]')?.click();
        }
        if (f === 82) {
          document.querySelector('[data-tod-choice="twilight"]')?.click();
        }
        if (f === 96) {
          document.querySelector('[data-tod-choice="night"]')?.click();
        }
        if (f === 112) {
          document.getElementById('sculpted-pause-resume-btn')?.click();
        }
      }, f);
    },
  },

  // =========================================================================
  // 7. 07-stone-read-unlock-commune.webm (112 frames = 4.67s, ZERO SPOILERS)
  // =========================================================================
  {
    id: '07-stone-read-unlock-commune',
    mode: 'game',
    totalFrames: 112,
    posterFrame: 78,
    description:
      'Approaching Sacred Stone 1 at (0, -14) ringed by Crimson Roses: over-the-shoulder 3D Stone Gaze framing, chiseled calligraphy engraving on the stone face, and 3-second circular lotus gaze ring filling 0% -> 100% to awaken Commune [R] (zero 2D modal popups, zero spoilers).',
    setupFn: async (page) => {
      await page.evaluate((maskedLines) => {
        const w = window.__WORLD__;
        w.appFlow.skipToGame();
        w.setProfile('desktop');
        w.setTimeOfDay('day');
        w.enemyManager.clearAllEnemies();
        if (w.coopSystem.player.activeHeroId !== 'Knight') {
          w.coopSystem.swapActiveHero();
        }
        w.sculptedHud.setVisible(true);
        w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
        w.sculptedHud.closePauseModal();
        w.sculptedHud.setProgressionState({
          communeDiscovered: false,
          iceUnlocked: false,
          fireUnlocked: false,
          ultimateUnlocked: false,
          unlockedStage: 0,
          stonesSolved: 0,
        });
        document.getElementById('combat-banner')?.classList.remove('visible');

        // Reset 3D Stone Gaze state & enforce spoiler-masked poem lines on the 3D decal
        if (w.stoneGazeState) {
          w.stoneGazeState.activeStoneId = 'stone_plaza';
          w.stoneGazeState.shoulderBlend = 0.25;
          w.stoneGazeState.stones.stone_plaza = {
            id: 'stone_plaza',
            gazeElapsed: 0,
            unlocked: false,
          };
        }
        const decal = w.stoneDecals?.entries?.stone_plaza;
        if (decal) {
          decal.title = 'Weathered Stele of the Town Plaza';
          decal.lines = [...maskedLines];
          decal.lastProgress = -1;
          decal.redraw(0, false);
        }

        // Stand 2.65m south of Sacred Stone 1 (0, -14) facing North so 3D Stone Gaze engages immediately
        w.coopSystem.teleportLeaderAndPartner(-0.48, -11.35, Math.PI);
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI;
        w.camState.pitch = 0.08;
        w.camState.dist = 4.6;
      }, SPOILER_MASKED_POEM_LINES);
    },
    onFrame: async (page, f) => {
      await page.evaluate(
        ({ f, maskedLines }) => {
          const w = window.__WORLD__;
          const decal = w.stoneDecals?.entries?.stone_plaza;
          if (decal) {
            decal.lines = [...maskedLines];
          }
          // Ensure over-the-shoulder gaze progresses smoothly across the 3.0s (72 frames) window
          if (f === 74) {
            w.sculptedHud.setProgressionState({
              communeDiscovered: true,
              unlockedStage: 0,
              stonesSolved: 0,
            });
            if (w.stoneGazeState?.stones?.stone_plaza) {
              w.stoneGazeState.stones.stone_plaza.gazeElapsed = 3.0;
              w.stoneGazeState.stones.stone_plaza.unlocked = true;
            }
            decal?.redraw(1.0, true);
          }
        },
        { f, maskedLines: SPOILER_MASKED_POEM_LINES }
      );
    },
  },

  // =========================================================================
  // 8. 08-commune-tap-vs-hold.webm (108 frames = 4.50s)
  // =========================================================================
  {
    id: '08-commune-tap-vs-hold',
    mode: 'game',
    totalFrames: 108,
    posterFrame: 56,
    description:
      'Pressing Commune [R]: Eclipse sky compression (data-env-polarity="eclipse"), 6.5m airborne enemy knockback in 0.15x slow-mo, 30s Crimson Rose ring blooming at the speaker feet, and inline crimson wave bars + 00:24 countdown inside the [R] lotus ring.',
    setupFn: async (page) => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.skipToGame();
        w.setProfile('desktop');
        w.setTimeOfDay('day');
        w.coopSystem.cancelCommuneChannel();
        w.communeClient.cancelCommune();
        w.sculptedHud.setVisible(true);
        w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
        w.sculptedHud.setProgressionState({
          communeDiscovered: true,
          iceUnlocked: true,
          fireUnlocked: false,
          ultimateUnlocked: false,
          unlockedStage: 1,
          stonesSolved: 1,
        });
        document.getElementById('combat-banner')?.classList.remove('visible');

        w.coopSystem.teleportLeaderAndPartner(2.0, 12.0, Math.PI * 0.5);
        w.campaignLoop.combatHeroes.Knight.hp = 60;
        w.campaignLoop.combatHeroes.Mage.hp = 38;

        w.enemyManager.clearAllEnemies();
        w.enemyManager.setFrozenForShot(null);
        w.enemyManager.spawnImmediateFromSpec({
          slotIndex: 0,
          archetype: 'warrior',
          x: 4.1,
          z: 11.4,
          rotY: -1.4,
          hp: 500,
          maxHp: 500,
        });
        w.enemyManager.spawnImmediateFromSpec({
          slotIndex: 1,
          archetype: 'warrior',
          x: 4.4,
          z: 13.0,
          rotY: -1.7,
          hp: 500,
          maxHp: 500,
        });
        w.enemyManager.spawnImmediateFromSpec({
          slotIndex: 2,
          archetype: 'minion',
          x: 3.5,
          z: 10.3,
          rotY: -1.1,
          hp: 500,
          maxHp: 500,
        });

        w.setCameraOrbit(Math.PI * 0.26, 0.14, 6.8);
      });
    },
    onFrame: async (page, f) => {
      await page.evaluate((f) => {
        const w = window.__WORLD__;
        if (f === 12) {
          w.startCommuneHold();
        }
        if (f >= 12) {
          const elapsed = Math.min(29, ((f - 12) / 24) * 4.2);
          w.sculptedHud.setCommuneState({
            listening: true,
            elapsedSeconds: elapsed,
            maxSeconds: 30,
          });
          const bars = document.querySelectorAll('#sculpted-commune-listening-bar .sh-wave-bar');
          bars.forEach((b, idx) => {
            const h = 5 + Math.round(Math.abs(Math.sin(f * 0.45 + idx * 0.95)) * 9);
            b.style.height = `${h}px`;
          });
        }
      }, f);
    },
  },

  // =========================================================================
  // 9. 09-verdict-briar-blessing.webm (132 frames = 5.50s)
  // =========================================================================
  {
    id: '09-verdict-briar-blessing',
    mode: 'game',
    totalFrames: 132,
    posterFrame: 52,
    description:
      'Briar Option 9 4-beat sequence: slow root creep -> fast chestnut-mahogany briar whip -> -3.05m downward plunge -> 1.6s underground flower slump & smooth green HP + golden shield fill -> side-by-side pop-up & 30s <= 5.0m Soul Tether buff.',
    setupFn: async (page) => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.skipToGame();
        w.setProfile('desktop');
        w.setTimeOfDay('day');
        w.coopSystem.cancelCommuneChannel();
        w.communeClient.cancelCommune();
        w.enemyManager.clearAllEnemies();
        w.sculptedHud.setVisible(true);
        w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
        w.sculptedHud.setProgressionState({
          communeDiscovered: true,
          iceUnlocked: true,
          fireUnlocked: true,
          ultimateUnlocked: false,
          unlockedStage: 2,
          stonesSolved: 2,
        });
        document.getElementById('combat-banner')?.classList.remove('visible');

        w.coopSystem.teleportLeaderAndPartner(2.0, 12.0, Math.PI * 0.5);
        w.campaignLoop.combatHeroes.Knight.hp = 44;
        w.campaignLoop.combatHeroes.Mage.hp = 20;
        w.sculptedHud.updatePartyStatus({
          knight: { hp: 44, maxHp: 220, shield: 0 },
          mage: { hp: 20, maxHp: 90, shield: 0 },
        });
        w.setCameraOrbit(Math.PI * 0.25, 0.18, 6.2);
      });
    },
    onFrame: async (page, f) => {
      await page.evaluate((f) => {
        if (f === 4) {
          window.__WORLD__.coopSystem.applyCommuneVerdict(
            {
              verdict: 'blessing',
              divine_quote:
                'Briar Sanctuary Encloses You Both · 30s Proximity Blessing (<= 5.0m Tether)',
            },
            'Knight'
          );
        }
      }, f);
    },
  },

  // =========================================================================
  // 10. 10-verdict-smite-wind-petals.webm (96 frames = 4.00s)
  // =========================================================================
  {
    id: '10-verdict-smite-wind-petals',
    mode: 'game',
    totalFrames: 96,
    posterFrame: 34,
    description:
      'Left-to-Right Wind Petal Smite: Frame 41 0.0x dead-wind B&W snap -> left-to-right wind erosion into 1.68x crimson petals that accelerate and vanish mid-flight.',
    setupFn: async (page) => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.skipToGame();
        w.setProfile('desktop');
        w.setTimeOfDay('day');
        w.coopSystem.cancelCommuneChannel();
        w.communeClient.cancelCommune();
        w.enemyManager.clearAllEnemies();
        w.campaignLoop.combatHeroes.Knight.downed = false;
        w.campaignLoop.combatHeroes.Mage.downed = false;
        w.campaignLoop.combatHeroes.Knight.hp = 220;
        w.campaignLoop.combatHeroes.Mage.hp = 90;
        w.sculptedHud.setVisible(true);
        w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
        w.sculptedHud.setProgressionState({
          communeDiscovered: true,
          iceUnlocked: true,
          fireUnlocked: false,
          ultimateUnlocked: false,
          unlockedStage: 1,
          stonesSolved: 1,
        });
        document.getElementById('combat-banner')?.classList.remove('visible');

        w.coopSystem.teleportLeaderAndPartner(2.0, 12.0, Math.PI * 0.5);
        w.setCameraOrbit(Math.PI * 0.24, 0.14, 5.6);
      });
    },
    onFrame: async (page, f) => {
      await page.evaluate((f) => {
        if (f === 8) {
          window.__WORLD__.coopSystem.applyCommuneVerdict(
            {
              verdict: 'smite',
              divine_quote: 'Your love is insincere — Dissolve into the crimson wind.',
            },
            'Knight'
          );
        }
      }, f);
    },
  },

  // =========================================================================
  // 11. 11-knight-combat-kit.webm (132 frames = 5.50s)
  // =========================================================================
  {
    id: '11-knight-combat-kit',
    mode: 'game',
    totalFrames: 132,
    posterFrame: 96,
    description:
      'Knight 4-hit sword combo (1.0x -> 1.30x mash speed ramp), Hold Attack frontal Shield Block (80% DR), [Tab] toggle Ice <-> Fire, [E] Power Sword (13s active / 18s CD), and [Q] Sky-Lightning Awakening (10s 2.0x DMG) with floating 3D Genshin damage numbers.',
    setupFn: async (page) => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.skipToGame();
        w.setProfile('desktop');
        w.setTimeOfDay('day');
        w.coopSystem.cancelCommuneChannel();
        w.communeClient.cancelCommune();
        w.campaignLoop.verdictSequence.active = false;
        w.campaignLoop.combatHeroes.Knight.downed = false;
        w.campaignLoop.combatHeroes.Mage.downed = false;
        w.campaignLoop.combatHeroes.Knight.hp = 220;
        w.campaignLoop.combatHeroes.Mage.hp = 90;
        w.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
        w.campaignLoop.combatHeroes.Knight.ultCd = 0;
        w.campaignLoop.combatHeroes.Knight.selectedElement = 'ice';

        if (w.coopSystem.player.activeHeroId !== 'Knight') {
          w.coopSystem.swapActiveHero();
        }
        w.sculptedHud.setVisible(true);
        w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
        w.sculptedHud.setProgressionState({
          communeDiscovered: true,
          iceUnlocked: true,
          fireUnlocked: true,
          ultimateUnlocked: true,
          unlockedStage: 3,
          stonesSolved: 3,
          activeRole: 'Knight',
          activeElement: 'ice',
        });
        document.getElementById('combat-banner')?.classList.remove('visible');

        w.coopSystem.teleportLeaderAndPartner(72.5, -3.8, Math.PI * 0.5);
        w.enemyManager.clearAllEnemies();
        w.enemyManager.setFrozenForShot(null);
        w.enemyManager.spawnImmediateFromSpec({
          slotIndex: 0,
          archetype: 'warrior',
          x: 74.6,
          z: -3.8,
          rotY: -1.4,
          hp: 2500,
          maxHp: 2500,
        });
        w.enemyManager.spawnImmediateFromSpec({
          slotIndex: 1,
          archetype: 'warrior',
          x: 75.3,
          z: -2.5,
          rotY: -1.6,
          hp: 2500,
          maxHp: 2500,
        });
        w.setCameraOrbit(Math.PI * 0.28, 0.16, 6.2);
      });
    },
    onFrame: async (page, f) => {
      await page.evaluate((f) => {
        const w = window.__WORLD__;
        // 1. 4-hit sword combo with mash speed ramp (1.0x -> 1.30x)
        if (f === 2 || f === 13 || f === 24 || f === 35) {
          w.coopSystem.triggerAction('attack');
          w.coopSystem.triggerAction('attack');
        }
        // 2. Hold Attack -> Frontal Shield Block (80% DR)
        if (f === 48) {
          w.coopSystem.triggerAction('heavy');
        }
        if (f === 65) {
          w.coopSystem.triggerAction('release_heavy');
        }
        // 3. [Tab] toggle Ice -> Fire + [E] Power Sword (13s active / 18s CD)
        if (f === 68) {
          const res = w.coopSystem.toggleElement('Knight');
          if (res?.element) w.sculptedHud.setElement(res.element);
          w.coopSystem.triggerAction('skill');
        }
        // 4. [Q] Sky-Lightning Awakening (10s 2.0x DMG) + floating Genshin damage numbers
        if (f === 86) {
          w.enemyManager.spawnImmediateFromSpec({
            slotIndex: 0,
            archetype: 'warrior',
            x: 74.2,
            z: -3.8,
            rotY: -1.5,
            hp: 2500,
            maxHp: 2500,
          });
          w.enemyManager.spawnImmediateFromSpec({
            slotIndex: 1,
            archetype: 'warrior',
            x: 74.9,
            z: -2.4,
            rotY: -1.7,
            hp: 2500,
            maxHp: 2500,
          });
        }
        if (f === 88) {
          w.coopSystem.triggerAction('ultimate');
        }
        if (f === 91) {
          w.damageNumbers.spawnDamageNumber({
            amount: 88,
            element: 'fire',
            isCrit: false,
            worldPos: { x: 74.2, y: 1.5, z: -3.8, heightOffset: 1.65 },
          });
        }
        if (f === 93) {
          w.damageNumbers.spawnDamageNumber({
            amount: 184,
            element: 'lightning',
            isCrit: true,
            label: 'CRIT',
            worldPos: { x: 74.9, y: 1.5, z: -2.4, heightOffset: 2.05 },
          });
        }
        if (f === 104) {
          w.coopSystem.triggerAction('attack');
        }
      }, f);
    },
  },

  // =========================================================================
  // 12. 12-mage-combat-kit.webm (136 frames = 5.67s)
  // =========================================================================
  {
    id: '12-mage-combat-kit',
    mode: 'game',
    totalFrames: 136,
    posterFrame: 86,
    description:
      'Mage combat with Two-Handed Xiaomi Pad 7 Concentric Fan Arc: 3-bolt soft-lock combo, Hold Attack Shatterlance, Hold [E] terrain-conforming Spellbook Aim Arrow (Frost Lance cyan 14.5m & [Tab] Cinder Fall molten 3..16m) + Release [E] cast, [Q] 6.0s Storm Cataclysm, and floating Genshin damage numbers.',
    setupFn: async (page) => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.skipToGame();
        w.setProfile('tablet');
        w.setTimeOfDay('day');
        w.coopSystem.cancelCommuneChannel();
        w.communeClient.cancelCommune();
        w.campaignLoop.verdictSequence.active = false;
        w.campaignLoop.combatHeroes.Knight.downed = false;
        w.campaignLoop.combatHeroes.Mage.downed = false;
        w.campaignLoop.combatHeroes.Knight.hp = 220;
        w.campaignLoop.combatHeroes.Mage.hp = 90;
        w.campaignLoop.combatHeroes.Mage.skillCd = 0;
        w.campaignLoop.combatHeroes.Mage.ultCd = 0;
        w.campaignLoop.combatHeroes.Mage.stormCataclysmActive = false;
        w.campaignLoop.combatHeroes.Mage.selectedElement = 'ice';
        w.campaignLoop.combatHeroes.Mage.selectedSpell = 'frost_lance';
        w.coopSystem.heroStates.Mage.selectedElement = 'ice';
        w.coopSystem.heroStates.Mage.selectedSpell = 'frost_lance';

        if (w.coopSystem.player.activeHeroId !== 'Mage') {
          w.coopSystem.swapActiveHero();
        }
        w.sculptedHud.setVisible(true);
        w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
        w.sculptedHud.setProgressionState({
          communeDiscovered: true,
          iceUnlocked: true,
          fireUnlocked: true,
          ultimateUnlocked: true,
          unlockedStage: 3,
          stonesSolved: 3,
          activeRole: 'Mage',
          activeElement: 'ice',
        });
        document.getElementById('combat-banner')?.classList.remove('visible');

        w.coopSystem.teleportLeaderAndPartner(60.0, -4.0, Math.PI * 0.5);
        w.enemyManager.clearAllEnemies();
        w.enemyManager.setFrozenForShot(null);
        w.enemyManager.spawnImmediateFromSpec({
          slotIndex: 0,
          archetype: 'warrior',
          x: 69.5,
          z: -4.0,
          rotY: -1.5,
          hp: 2500,
          maxHp: 2500,
        });
        w.enemyManager.spawnImmediateFromSpec({
          slotIndex: 4,
          archetype: 'mage',
          x: 71.2,
          z: -5.4,
          rotY: -1.4,
          hp: 2500,
          maxHp: 2500,
        });
        w.setCameraOrbit(Math.PI * 0.34, 0.19, 6.8);
      });
    },
    onFrame: async (page, f) => {
      await page.evaluate((f) => {
        const w = window.__WORLD__;
        // 1. Mage 3-bolt soft-lock combo
        if (f === 2 || f === 12 || f === 22) {
          w.coopSystem.triggerAction('attack');
        }
        // 2. Hold Attack -> Stationary Shatterlance
        if (f === 34) {
          w.coopSystem.triggerAction('heavy');
        }
        // 3. Hold [E] -> Terrain-conforming Spellbook Aim Arrow (Frost Lance cyan 14.5m)
        if (f === 54) {
          w.coopSystem.startSkillAim({
            spellId: 'frost_lance',
            yaw: Math.PI * 0.5,
            distance: 14.5,
          });
        }
        // Toggle [Tab] -> Cinder Fall molten 3..16m variable Aim Arrow
        if (f === 70) {
          const res = w.coopSystem.toggleElement('Mage');
          if (res?.element) w.sculptedHud.setElement(res.element);
          w.coopSystem.startSkillAim({
            spellId: 'cinder_fall',
            yaw: Math.PI * 0.5,
            distance: 8.5,
          });
        }
        if (f > 70 && f <= 88) {
          const dist = 8.5 + ((f - 70) / 18) * 5.0;
          w.coopSystem.updateSkillAim({
            yaw: Math.PI * 0.5,
            distance: dist,
          });
        }
        if (f === 81) {
          w.damageNumbers.spawnDamageNumber({
            amount: 112,
            element: 'ice',
            isCrit: true,
            label: 'SHATTER',
            worldPos: { x: 69.5, y: 1.5, z: -4.0, heightOffset: 1.75 },
          });
        }
        if (f === 83) {
          w.damageNumbers.spawnDamageNumber({
            amount: 136,
            element: 'fire',
            isCrit: true,
            worldPos: { x: 71.2, y: 1.5, z: -5.4, heightOffset: 1.95 },
          });
        }
        // Release [E] -> Cast Cinder Fall
        if (f === 90) {
          w.coopSystem.releaseSkillAim();
        }
        // 4. [Q] -> 6.0s Vulnerable Stationary Storm Cataclysm
        if (f === 106) {
          w.coopSystem.triggerAction('ultimate');
        }
      }, f);
    },
  },
];

async function openWorldPage(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message || String(err)));

  await page.goto(`${baseUrl}/world/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
    null,
    { timeout: 30000 }
  );

  return { context, page, consoleErrors };
}

async function main() {
  await fsp.mkdir(OUT_DIR, { recursive: true });

  const { server, port } = await startIsolatedServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[behavior-clips] Isolated server listening on ${baseUrl}`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const clipsMeta = [];

  try {
    const session = await openWorldPage(browser, baseUrl);
    for (const spec of CLIP_SPECS) {
      const entry = await recordDeterministicClip(
        session.page,
        spec,
        session.consoleErrors
      );
      clipsMeta.push(entry);
    }
    await session.context.close();

    const manifest = {
      generatedAt: new Date().toISOString(),
      resolution: `${VIEWPORT.width}x${VIEWPORT.height}`,
      fps: FPS,
      clipCount: clipsMeta.length,
      spoilerMasked: true,
      clips: clipsMeta,
    };

    const manifestPath = path.join(OUT_DIR, 'manifest.json');
    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`[behavior-clips] Wrote manifest -> ${manifestPath}`);

    const invalid = clipsMeta.filter((c) => !c.sizeBytes || c.sizeBytes <= 20000);
    if (invalid.length > 0) {
      throw new Error(
        `Some clips failed size verification (> 20000 bytes): ${JSON.stringify(invalid)}`
      );
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('[behavior-clips] Fatal error:', err);
  process.exit(1);
});
