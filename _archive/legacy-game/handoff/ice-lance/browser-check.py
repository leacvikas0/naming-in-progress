# Frost Lance browser evidence — one small Playwright script, no framework.
# Serves the repo root on 127.0.0.1:4180 (started separately) and maps the
# jsdelivr three.js import to the repo's installed 0.170 build so the check does
# not depend on network access.
#
# Covers: boot/console, wave combat with a controlled line of targets, one hit
# per target, off-line and clipped-end negatives, hero switching, heavy/Meteor,
# retry cleanup, 30-cast resource return, and one 10s repeated-cast perf sample.
import json
import pathlib
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = pathlib.Path(__file__).resolve().parent
THREE = ROOT / "node_modules" / "three"

LOG = []
RESULTS = {}


def note(*parts):
    line = " ".join(str(p) for p in parts)
    LOG.append(line)
    print(line, flush=True)


def route_cdn(route):
    url = route.request.url
    if "three@0.170.0/build/three.module.js" in url:
        route.fulfill(path=str(THREE / "build" / "three.module.js"), content_type="application/javascript")
    elif "three@0.170.0/examples/jsm/" in url:
        rel = url.split("three@0.170.0/examples/jsm/")[1]
        route.fulfill(path=str(THREE / "examples" / "jsm" / rel), content_type="application/javascript")
    else:
        route.abort()


HELPERS = r"""
window.__ice = {
  vfx() {
    const g = __game.scene.getObjectByName('ice-lance-vfx');
    let crystals = 0, frost = 0, glints = false, meshes = 0;
    if (g) g.traverse((o) => {
      if (o.isInstancedMesh) {
        meshes++;
        if (o.geometry.getAttribute('aSeed')) crystals += o.count; else frost += o.count;
      }
      if (o.isPoints) glints = o.visible;
    });
    return { crystals, frost, glints, meshes, slotSpan: Math.round(crystals / 96) };
  },
  enemies() {
    return (__game.enemies ? __game.enemies.list : []).map((e) => ({
      id: e.id, x: e.group.position.x, z: e.group.position.z, hp: e.hp,
    }));
  },
  freeze() {
    for (const e of __game.enemies.list) { e.stun = 999; e.attackCd = 9999; e.speed = 0; }
  },
  place(list) {
    // list: [{index, x, z, hp}] against the current enemy list order.
    const es = __game.enemies.list;
    for (const it of list) {
      const e = es[it.index];
      if (!e) continue;
      e.group.position.set(it.x, 0, it.z);
      e.stun = 999; e.attackCd = 9999; e.speed = 0;
      if (it.hp) { e.hp = it.hp; e.maxHp = it.hp; }
    }
    return this.enemies();
  },
  // Move the player to an open spot and aim down the clearest direction.
  setupArena() {
    const b = __game.world.bounds;
    const cols = __game.world.colliders || [];
    const clip = (ox, oz, dx, dz, max) => {
      let len = max;
      if (dx > 1e-6) len = Math.min(len, (b.maxX - ox) / dx); else if (dx < -1e-6) len = Math.min(len, (b.minX - ox) / dx);
      if (dz > 1e-6) len = Math.min(len, (b.maxZ - oz) / dz); else if (dz < -1e-6) len = Math.min(len, (b.minZ - oz) / dz);
      for (const c of cols) {
        const r = (c.radius || 0) + 0.25; const cx = ox - c.x, cz = oz - c.z;
        const bq = cx * dx + cz * dz; const cq = cx * cx + cz * cz - r * r;
        if (cq <= 0) continue;
        const disc = bq * bq - cq; if (disc < 0) continue;
        const t = -bq - Math.sqrt(disc); if (t > 0 && t < len) len = t;
      }
      return len;
    };
    const free = (x, z) => {
      for (const c of cols) { const d = Math.hypot(x - c.x, z - c.z); if (d < (c.radius || 0) + 0.8) return false; }
      return true;
    };
    let best = null;
    for (let gx = -36; gx <= 36; gx += 4) {
      for (let gz = -36; gz <= 36; gz += 4) {
        if (!free(gx, gz)) continue;
        let clearance = 99;
        for (const c of cols) clearance = Math.min(clearance, Math.hypot(gx - c.x, gz - c.z) - (c.radius || 0));
        if (clearance < 5) continue;
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          const dx = Math.sin(a), dz = Math.cos(a);
          const len = clip(gx, gz, dx, dz, 12);
          if (len < 11.5) continue;
          // Prefer an open line and room around the caster for the evidence camera.
          const score = len + Math.min(clearance, 10);
          if (!best || score > best.score) best = { x: gx, z: gz, dx, dz, len, angle: a, clearance, score };
        }
      }
    }
    if (!best) return null;
    // Pick the side of the line with the clearest ground for the evidence camera.
    let side = 1;
    let sideClear = -99;
    for (const s of [1, -1]) {
      const ex = best.x - best.dx * 2 + -best.dz * s * 6;
      const ez = best.z - best.dz * 2 + best.dx * s * 6;
      let cl = 99;
      for (const c of cols) cl = Math.min(cl, Math.hypot(ex - c.x, ez - c.z) - (c.radius || 0));
      if (cl > sideClear) { sideClear = cl; side = s; }
    }
    best.side = side;
    best.sideClearance = sideClear;
    const p = __game.player;
    p.group.position.set(best.x, 0, best.z);
    __game.input.aim.set(best.x + best.dx * 10, 0, best.z + best.dz * 10);
    window.__arena = best;
    return { x: best.x, z: best.z, dx: best.dx, dz: best.dz, len: best.len, side: best.side, clearance: best.clearance };
  },
  cameraForShots(mode) {
    const a = window.__arena;
    if (!a) return null;
    const sx = -a.dz * a.side, sz = a.dx * a.side;
    if (mode === 'early') {
      // Behind and slightly to the side: the near-caster crystals and the
      // racing front read ahead of the mage instead of under the hat.
      window.__cameraOverride = {
        eye: [a.x - a.dx * 4 + sx * 3.5, 4.6, a.z - a.dz * 4 + sz * 3.5],
        target: [a.x + a.dx * 3.5, 0.6, a.z + a.dz * 3.5],
        fov: 60,
      };
    } else {
      window.__cameraOverride = {
        eye: [a.x - a.dx * 2 + sx * 6, 9.5, a.z - a.dz * 2 + sz * 6],
        target: [a.x + a.dx * 5, 0.6, a.z + a.dz * 5],
        fov: 54,
      };
    }
    return window.__cameraOverride;
  },
  clearCamera() {
    window.__cameraOverride = null;
  },
  cast() {
    __game.input.attack = true;
    setTimeout(() => { __game.input.attack = false; }, 140);
  },
  heavy() {
    __game.input.heavy = true;
    setTimeout(() => { __game.input.heavy = false; }, 120);
  },
  async killForMomentum(need) {
    const t0 = performance.now();
    const freezeAll = () => {
      __game.player.party.forEach((p) => { p.hp = p.maxHp; });
      for (const e of __game.enemies.list) { e.stun = 999; e.attackCd = 9999; e.speed = 0; }
    };
    const liveNow = () => __game.enemies.list.filter((e) => !e.dead && !e.dying && e.solid);
    while (__game.player.momentum < need && performance.now() - t0 < 45000) {
      freezeAll();
      let live = liveNow();
      if (live.length <= 1) {
        __game.enemies.spawnWave({ n: 99, count: 8, mix: [{ type: 'minion', count: 8 }] }, __game.player);
        const tw = performance.now();
        while (performance.now() - tw < 5000) {
          freezeAll();
          if (liveNow().length >= 2) break;
          await new Promise((r) => setTimeout(r, 80));
        }
        continue;
      }
      // Keep one alive so the wave never ends into the upgrade screen.
      for (let i = 0; i < live.length - 1; i++) __game.enemies.damageEnemy(live[i], 1e9, {});
      await new Promise((r) => setTimeout(r, 90));
    }
    return { momentum: __game.player.momentum, live: liveNow().length, playerAlive: __game.player.alive };
  },
  async spawnAt(x, z, hp) {
    __game.enemies.spawnWave({ n: 99, count: 2, mix: [{ type: 'minion', count: 2 }] }, __game.player);
    const t0 = performance.now();
    while (performance.now() - t0 < 8000) {
      // Keep the party alive and every spawn frozen while the telegraphs resolve.
      __game.player.party.forEach((p) => { p.hp = p.maxHp; });
      for (const e of __game.enemies.list) { e.stun = 999; e.attackCd = 9999; e.speed = 0; }
      const es = __game.enemies.list.filter((e) => !e.dead && !e.dying && e.solid);
      const idle = es.filter((e) => Math.abs(e.group.position.x - x) > 0.4 || Math.abs(e.group.position.z - z) > 0.4);
      if (idle.length >= 2) break;
      await new Promise((r) => setTimeout(r, 80));
    }
    const es = __game.enemies.list.filter((e) => !e.dead && !e.dying && e.solid).slice(0, 2);
    es.forEach((e, i) => {
      e.group.position.set(x + (i === 1 ? 1.2 : 0), 0, z);
      e.stun = 999; e.attackCd = 9999; e.speed = 0;
      e.hp = hp; e.maxHp = hp;
    });
    return this.enemies();
  },
  perf(seconds, castEveryMs) {
    return new Promise((resolve) => {
      const g = __game;
      const frames = [];
      let calls = 0, tris = 0, n = 0;
      const span = { 1: { n: 0, calls: 0 }, 2: { n: 0, calls: 0 }, 3: { n: 0, calls: 0 } };
      // Hold the scene still so baseline and casting measure the same content:
      // full-hp frozen targets, party topped up. Otherwise repeated casts kill
      // the wave and the draw-call comparison would flatter the spell.
      const hold = setInterval(() => {
        for (const e of __game.enemies.list) { e.hp = 1e6; e.maxHp = 1e6; e.stun = 999; e.attackCd = 9999; e.speed = 0; }
        __game.player.party.forEach((p) => { p.hp = p.maxHp; });
      }, 300);
      let timer = null;
      if (castEveryMs) {
        timer = setInterval(() => { __game.input.attack = true; setTimeout(() => { __game.input.attack = false; }, 140); }, castEveryMs);
      }
      const t0 = performance.now();
      let last = t0;
      const a = window.__arena;
      function tick(now) {
        // Pin the caster: every cast lunges, and a drifting camera would change
        // what the baseline and the casting sample are measuring.
        if (a) __game.player.group.position.set(a.x, 0, a.z);
        frames.push(now - last); last = now;
        const info = g.renderer.info.render;
        calls += info.calls; tris += info.triangles; n++;
        const v = __ice.vfx().slotSpan;
        const bucket = span[v] || (v >= 3 ? span[3] : span[1]);
        bucket.n++; bucket.calls += info.calls;
        if (now - t0 < seconds * 1000) requestAnimationFrame(tick);
        else {
          if (timer) clearInterval(timer);
          clearInterval(hold);
          __game.input.attack = false;
          const sorted = frames.slice(5).sort((a, b) => a - b);
          const bySpan = {};
          for (const k of [1, 2, 3]) bySpan[k] = span[k].n ? +(span[k].calls / span[k].n).toFixed(1) : null;
          resolve({
            seconds,
            samples: frames.length,
            medianMs: +sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
            p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
            avgCalls: +(calls / n).toFixed(1),
            avgTriangles: Math.round(tris / n),
            callsBySlotSpan: bySpan,
            framesBySlotSpan: { 1: span[1].n, 2: span[2].n, 3: span[3].n },
            dpr: devicePixelRatio,
            canvas: [g.renderer.domElement.width, g.renderer.domElement.height],
          });
        }
      }
      requestAnimationFrame(tick);
    });
  },
  resources() {
    const m = __game.renderer.info.memory;
    return { geometries: m.geometries, textures: m.textures, programs: __game.renderer.info.programs.length };
  },
};
'ready';
"""


def wait_vfx(page, active=True, timeout=4000):
    expr = (
        "() => { const g=__game.scene.getObjectByName('ice-lance-vfx'); let c=0;"
        " if (g) g.traverse(o=>{ if(o.isInstancedMesh && o.geometry.getAttribute('aSeed')) c+=o.count; });"
        f" return c {'>' if active else '==='} 0; }}"
    )
    page.wait_for_function(expr, timeout=timeout)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            channel="chrome",
            args=["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"],
        )
        page = browser.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
        page.on("console", lambda m: LOG.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: LOG.append(f"pageerror: {e}"))
        page.route("https://cdn.jsdelivr.net/**", route_cdn)
        page.goto("http://127.0.0.1:4180/game/index.html", wait_until="domcontentloaded")
        page.wait_for_function("() => window.__game && window.__game.state.phase === 'title'", timeout=90000)
        page.evaluate(HELPERS)

        gl = page.evaluate(
            "() => { const g=__game.renderer.getContext(); const d=g.getExtension('WEBGL_debug_renderer_info');"
            " return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; }"
        )
        RESULTS["device"] = {
            "gl": gl,
            "headless": True,
            "browser": "Chrome via Playwright",
            "viewport": [1600, 900],
            "dpr": page.evaluate("devicePixelRatio"),
            "canvas": page.evaluate("[__game.renderer.domElement.width, __game.renderer.domElement.height]"),
        }
        note("device", json.dumps(RESULTS["device"]))

        # ---- run + controlled combat line ----------------------------------
        page.evaluate("__game.startRun(['mage','knight'])")
        page.wait_for_function(
            "() => __game.state.phase === 'playing' && __game.enemies && __game.enemies.aliveCount >= 2",
            timeout=30000,
        )
        arena = page.evaluate("__ice.setupArena()")
        assert arena and arena["len"] >= 11.9, f"no open 12m line: {arena}"
        RESULTS["arena"] = arena
        note("arena", json.dumps(arena))
        page.evaluate("__game.player.heal(9999)")
        page.wait_for_timeout(900)  # let the follow camera settle after the teleport

        # Freeze the wave and lay out three targets on the line + one off it.
        es = page.evaluate("__game.enemies.list.length")
        while es < 4:
            page.evaluate("__game.enemies.spawnWave({n:99,count:2,mix:[{type:'minion',count:2}]}, __game.player)")
            page.wait_for_function("() => __game.enemies.aliveCount >= 4", timeout=15000)
            es = page.evaluate("__game.enemies.list.length")
        line = [
            {"index": 0, "x": arena["x"] + arena["dx"] * 2.5, "z": arena["z"] + arena["dz"] * 2.5, "hp": 1e6},
            {"index": 1, "x": arena["x"] + arena["dx"] * 5.0, "z": arena["z"] + arena["dz"] * 5.0, "hp": 1e6},
            {"index": 2, "x": arena["x"] + arena["dx"] * 7.5, "z": arena["z"] + arena["dz"] * 7.5, "hp": 1e6},
            {
                "index": 3,
                "x": arena["x"] + arena["dx"] * 5.0 + arena["dz"] * arena["side"] * 4,
                "z": arena["z"] + arena["dz"] * 5.0 - arena["dx"] * arena["side"] * 4,
                "hp": 1e6,
            },
        ]
        placed = page.evaluate("(l) => __ice.place(l)", line)
        note("targets", json.dumps(placed))
        line_geom = []
        for e in placed:
            ax = e["x"] - arena["x"]
            az = e["z"] - arena["z"]
            along = ax * arena["dx"] + az * arena["dz"]
            lateral = abs(ax * arena["dz"] - az * arena["dx"])
            line_geom.append({"id": e["id"], "along": round(along, 2), "lateral": round(lateral, 2)})
        RESULTS["target_geometry"] = line_geom
        note("target geometry", json.dumps(line_geom))
        assert all(g["lateral"] < 0.6 for g in line_geom[:3]), "on-line targets must stay on the line"
        assert line_geom[3]["lateral"] > 3.0, "the negative target must stay outside the band"

        before = {e["id"]: e["hp"] for e in placed}
        # Evidence camera: fixed 3/4 views down the line (main.js exposes
        # __cameraOverride for handoff evidence only; gameplay is unchanged).
        page.evaluate("__ice.cameraForShots('early')")
        page.wait_for_timeout(250)
        page.evaluate("__ice.cast()")
        wait_vfx(page, True, 4000)
        page.wait_for_timeout(120)
        page.screenshot(path=str(OUT / "shot-early-front.png"))
        early = page.evaluate("__ice.vfx()")
        note("early vfx", json.dumps(early))

        page.evaluate("__ice.cameraForShots('field')")
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "shot-peak-field.png"))
        peak = page.evaluate("__ice.vfx()")
        note("peak vfx", json.dumps(peak))

        page.wait_for_timeout(1200)
        after = {e["id"]: e["hp"] for e in page.evaluate("__ice.enemies()")}
        along = [line[0], line[1], line[2]]
        along_ids = [e["id"] for e in placed[:3]]
        off_id = placed[3]["id"]
        damage = {str(k): round(before[k] - after.get(k, before[k]), 2) for k in before}
        RESULTS["cast_damage"] = damage
        note("damage", json.dumps(damage))
        assert all(after.get(i, 0) < before[i] for i in along_ids), "the three on-line targets must be hit"
        assert after.get(off_id, before[off_id]) == before[off_id], "the off-line target must be missed"

        wait_vfx(page, False, 6000)
        page.screenshot(path=str(OUT / "shot-aftermath.png"))
        note("aftermath vfx", json.dumps(page.evaluate("__ice.vfx()")))
        page.evaluate("__ice.clearCamera()")
        page.wait_for_timeout(400)

        # ---- hero switching: knight melee, back to mage ---------------------
        page.evaluate("__game.input.swapQueued = true")
        page.wait_for_function("() => __game.player.activeHero.id === 'knight'", timeout=3000)
        page.wait_for_timeout(300)
        # Put one target directly in the knight's reach using the locked aim dir.
        page.evaluate(
            """() => {
                const p = __game.player;
                const d = __game.input.aim.clone().sub(p.position); d.y = 0; d.normalize();
                const e = __game.enemies.list.find((x) => !x.dead && !x.dying);
                e.group.position.set(p.position.x + d.x * 1.7, 0, p.position.z + d.z * 1.7);
                e.stun = 999; e.attackCd = 9999; e.speed = 0; e.hp = 1e6; e.maxHp = 1e6;
            }"""
        )
        knight_hp_before = page.evaluate("__game.enemies.list.find(e=>!e.dead&&!e.dying).hp")
        page.evaluate("__ice.cast()")
        page.wait_for_timeout(900)
        knight_hp_after = page.evaluate("__game.enemies.list.find(e=>!e.dead&&!e.dying).hp")
        knight_vfx = page.evaluate("__ice.vfx()")
        RESULTS["knight_light"] = {"hp_before": knight_hp_before, "hp_after": knight_hp_after, "vfx": knight_vfx}
        note("knight light", json.dumps(RESULTS["knight_light"]))
        assert knight_hp_after < knight_hp_before, "knight light attack should still hit"
        assert knight_vfx["crystals"] == 0, "knight light must not spawn Frost Lance"

        page.wait_for_function("() => __game.player.swapCooldownFrac === 0", timeout=4000)
        page.evaluate("__game.input.swapQueued = true")
        page.wait_for_function("() => __game.player.activeHero.id === 'mage'", timeout=3000)
        page.wait_for_timeout(300)
        page.evaluate("__ice.cast()")
        wait_vfx(page, True, 4000)
        mage_vfx = page.evaluate("__ice.vfx()")
        RESULTS["mage_after_swap"] = mage_vfx
        note("mage after swap", json.dumps(mage_vfx))
        assert mage_vfx["crystals"] > 0, "mage casts again after swapping back"
        wait_vfx(page, False, 6000)

        # ---- retry cleanup ---------------------------------------------------
        page.evaluate("__game.startRun(['mage','knight'])")
        page.wait_for_timeout(200)
        retry_vfx = page.evaluate("__ice.vfx()")
        player_groups = page.evaluate("__game.scene.children.filter(o => o.name === 'player').length")
        RESULTS["retry"] = {"vfx_immediately_after": retry_vfx, "player_groups": player_groups}
        note("retry", json.dumps(RESULTS["retry"]))
        assert retry_vfx["crystals"] == 0 and retry_vfx["frost"] == 0 and not retry_vfx["glints"], "retry clears ice"
        assert player_groups == 1, f"one player group after retry, got {player_groups}"
        page.wait_for_function(
            "() => __game.state.phase === 'playing' && __game.enemies && __game.enemies.aliveCount >= 2",
            timeout=30000,
        )
        page.evaluate("__game.player.heal(9999); __ice.freeze()")
        page.wait_for_timeout(1500)
        retry_hp = page.evaluate("__ice.enemies()")
        page.wait_for_timeout(1200)
        retry_hp2 = page.evaluate("__ice.enemies()")
        same = [e for e in retry_hp if any(x["id"] == e["id"] and x["hp"] == e["hp"] for x in retry_hp2)]
        RESULTS["retry"]["no_delayed_hits"] = len(same) == len(retry_hp)
        note("retry no delayed hits", RESULTS["retry"]["no_delayed_hits"])
        assert RESULTS["retry"]["no_delayed_hits"], "no stale ice damage after retry"

        # ---- heavy -----------------------------------------------------------
        page.evaluate("__ice.setupArena()")
        page.evaluate("__game.player.heal(9999); __ice.freeze()")
        page.evaluate(
            """() => {
                const p = __game.player;
                const d = __game.input.aim.clone().sub(p.position); d.y = 0; d.normalize();
                const e = __game.enemies.list.find((x) => !x.dead && !x.dying);
                e.group.position.set(p.position.x + d.x * 2.0, 0, p.position.z + d.z * 2.0);
                e.stun = 999; e.attackCd = 9999; e.speed = 0; e.hp = 1e6; e.maxHp = 1e6;
            }"""
        )
        heavy_before = page.evaluate("__game.enemies.list.find(e=>!e.dead&&!e.dying).hp")
        page.evaluate("__ice.heavy()")
        page.wait_for_timeout(1200)
        heavy_after = page.evaluate("__game.enemies.list.find(e=>!e.dead&&!e.dying).hp")
        RESULTS["heavy"] = {"hp_before": heavy_before, "hp_after": heavy_after}
        note("heavy", json.dumps(RESULTS["heavy"]))
        assert heavy_after < heavy_before, "mage heavy still lands"

        # ---- Meteor ----------------------------------------------------------
        momentum = page.evaluate("__ice.killForMomentum(100)")
        note("momentum", json.dumps(momentum))
        page.evaluate("__ice.setupArena()")
        page.evaluate("__game.player.heal(9999); __ice.freeze()")
        targets = page.evaluate(
            """async () => {
                const p = __game.player;
                const d = __game.input.aim.clone().sub(p.position); d.y = 0; d.normalize();
                await __ice.spawnAt(p.position.x + d.x * 6, p.position.z + d.z * 6, 1e6);
                __game.input.aim.set(p.position.x + d.x * 6, 0, p.position.z + d.z * 6);
                __ice.freeze();
                return __ice.enemies();
            }"""
        )
        meteor_ids = [e["id"] for e in targets if e["hp"] >= 1e6]
        before = {e["id"]: e["hp"] for e in targets}
        page.evaluate("__game.player.party.forEach((p) => { p.hp = p.maxHp; }); __ice.freeze()")
        ready = page.evaluate(
            "() => ({ momentum: __game.player.momentum, ready: __game.player.superReady, alive: __game.player.alive, phase: __game.state.phase, hero: __game.player.activeHero.id })"
        )
        note("meteor ready", json.dumps(ready))
        page.evaluate("__game.input.superQueued = true")
        page.wait_for_timeout(350)
        fired = page.evaluate("() => ({ momentum: __game.player.momentum, phase: __game.state.phase, alive: __game.player.alive })")
        note("meteor fired?", json.dumps(fired))
        # The super entry + Meteor delay is 2.0s of GAMEPLAY time; the existing
        # super hitstop/slowmo stretches that to roughly 3.5s of wall time.
        page.wait_for_function(
            "(ids) => { const map = {}; for (const e of __game.enemies.list) map[e.id] = e.hp;"
            " return ids.some((id) => map[id] < 1000000); }",
            arg=meteor_ids,
            timeout=12000,
        )
        after = {e["id"]: e["hp"] for e in page.evaluate("__ice.enemies()")}
        damaged = [i for i in meteor_ids if after.get(i, before.get(i)) < before[i]]
        RESULTS["meteor"] = {
            "ready": ready,
            "after_start": fired,
            "targets": meteor_ids,
            "before": before,
            "after": after,
            "damaged": damaged,
        }
        note("meteor", json.dumps(RESULTS["meteor"]))
        assert damaged, "Meteor still damages the aim point"

        # ---- performance + 30-cast resource return --------------------------
        page.evaluate("__game.startRun(['mage','knight'])")
        page.wait_for_function(
            "() => __game.state.phase === 'playing' && __game.enemies && __game.enemies.aliveCount >= 2",
            timeout=30000,
        )
        page.evaluate("__ice.setupArena(); __game.player.heal(9999); __ice.freeze()")
        page.wait_for_timeout(1500)
        page.evaluate("__game.input.attack = false")
        resources_warm = page.evaluate("__ice.resources()")
        baseline = page.evaluate("__ice.perf(10, 0)")
        casting = page.evaluate("__ice.perf(10, 1080)")
        resources_after_sample = page.evaluate("__ice.resources()")
        # A 1.0s cast interval makes three visual casts overlap for a few frames,
        # which is the only way to sample the three-slot draw-call case.
        casting_three = page.evaluate("__ice.perf(8, 1000)")
        RESULTS["perf"] = {
            "baseline": baseline,
            "casting": casting,
            "casting_1s_interval": casting_three,
            "resources_warm": resources_warm,
            "resources_after_sample": resources_after_sample,
        }
        note("perf baseline", json.dumps(baseline))
        note("perf casting", json.dumps(casting))
        note("perf three-slot", json.dumps(casting_three))

        # Continue to 30 accepted casts (the first ~9 are already in the sample).
        page.evaluate(
            """async () => {
                const t0 = performance.now();
                while (performance.now() - t0 < 23000) {
                    __game.player.heal(9999); __ice.freeze();
                    __game.input.attack = true;
                    await new Promise((r) => setTimeout(r, 120));
                    __game.input.attack = false;
                    await new Promise((r) => setTimeout(r, 980));
                }
            }"""
        )
        page.wait_for_timeout(2500)
        page.evaluate("__game.startRun(['mage','knight'])")
        page.wait_for_timeout(500)
        resources_after = page.evaluate("__ice.resources()")
        after_retry_vfx = page.evaluate("__ice.vfx()")
        RESULTS["resources"] = {"warm": resources_warm, "after_30_casts_and_retry": resources_after, "vfx": after_retry_vfx}
        note("resources", json.dumps(RESULTS["resources"]))
        assert after_retry_vfx["crystals"] == 0 and after_retry_vfx["frost"] == 0, "resources return to the pool baseline"

        # ---- report ----------------------------------------------------------
        errors = [x for x in LOG if x.startswith(("console.error", "pageerror"))]
        RESULTS["console_errors"] = errors
        RESULTS["console_warnings"] = [x for x in LOG if x.startswith("console.warning")]
        note("console errors", json.dumps(errors))
        (OUT / "evidence.json").write_text(json.dumps(RESULTS, indent=2), encoding="utf-8")
        (OUT / "browser-log.txt").write_text("\n".join(LOG), encoding="utf-8")
        browser.close()


if __name__ == "__main__":
    main()
