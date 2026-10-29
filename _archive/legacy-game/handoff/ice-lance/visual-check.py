# Fast visual-only pass for iterating on Frost Lance's look.
import json
import pathlib

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = pathlib.Path(__file__).resolve().parent
THREE = ROOT / "node_modules" / "three"
LOG = []


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
    let crystals = 0, frost = 0, points = 0, meshes = 0;
    if (g) g.traverse((o) => {
      if (o.isInstancedMesh) {
        meshes++;
        if (o.geometry.getAttribute('aSeed')) crystals += o.count; else frost += o.count;
      }
      if (o.isPoints && o.visible) points++;
    });
    return { crystals, frost, points, meshes };
  },
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
    for (let gx = -36; gx <= 36; gx += 4) for (let gz = -36; gz <= 36; gz += 4) {
      if (!free(gx, gz)) continue;
      let clearance = 99;
      for (const c of cols) clearance = Math.min(clearance, Math.hypot(gx - c.x, gz - c.z) - (c.radius || 0));
      if (clearance < 5) continue;
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
        const len = clip(gx, gz, dx, dz, 12);
        if (len < 11.5) continue;
        const score = len + Math.min(clearance, 10);
        if (!best || score > best.score) best = { x: gx, z: gz, dx, dz, len, side: 1, score };
      }
    }
    if (!best) return null;
    for (const s of [1, -1]) {
      const ex = best.x - best.dx * 2 + -best.dz * s * 6;
      const ez = best.z - best.dz * 2 + best.dx * s * 6;
      let cl = 99;
      for (const c of cols) cl = Math.min(cl, Math.hypot(ex - c.x, ez - c.z) - (c.radius || 0));
      if (!best.sideClear || cl > best.sideClear) { best.sideClear = cl; best.side = s; }
    }
    const p = __game.player;
    p.group.position.set(best.x, 0, best.z);
    __game.input.aim.set(best.x + best.dx * 10, 0, best.z + best.dz * 10);
    __game.input.hasPointer = false;
    __game.input.locked = false;
    window.__arena = best;
    return best;
  },
  pin() {
    const a = window.__arena;
    __game.player.group.position.set(a.x, 0, a.z);
    __game.input.hasPointer = false;
    __game.input.locked = false;
    __game.input.aim.set(a.x + a.dx * 10, 0, a.z + a.dz * 10);
  },
  spellVfx(name) {
    const g = __game.scene.getObjectByName(name);
    let crystals = 0, points = 0, visible = false;
    if (g) {
      visible = g.children.some((o) => o.visible && (o.isMesh || o.isPoints || o.isInstancedMesh));
      g.traverse((o) => {
        if (o.isInstancedMesh) crystals += o.count;
        if (o.isPoints && o.visible) points++;
      });
    }
    return { crystals, points, visible };
  },
  place(list) {
    const es = __game.enemies.list;
    for (const it of list) {
      const e = es[it.index];
      if (!e) continue;
      e.group.position.set(it.x, 0, it.z);
      e.stun = 999; e.attackCd = 9999; e.speed = 0;
      e.hp = 1e6; e.maxHp = 1e6;
    }
  },
  cameraForShots(mode) {
    const a = window.__arena;
    const sx = -a.dz * a.side, sz = a.dx * a.side;
    if (mode === 'early') {
      window.__cameraOverride = {
        eye: [a.x - a.dx * 4 + sx * 3.5, 4.6, a.z - a.dz * 4 + sz * 3.5],
        target: [a.x + a.dx * 3.5, 0.6, a.z + a.dz * 3.5], fov: 60,
      };
    } else if (mode === 'close') {
      window.__cameraOverride = {
        eye: [a.x - a.dx * 2 + sx * 4.5, 3.2, a.z - a.dz * 2 + sz * 4.5],
        target: [a.x + a.dx * 6, 1.0, a.z + a.dz * 6], fov: 55,
      };
    } else if (mode === 'wide') {
      window.__cameraOverride = {
        eye: [a.x - a.dx * 2 + sx * 8, 11.5, a.z - a.dz * 2 + sz * 8],
        target: [a.x + a.dx * 8, 0.6, a.z + a.dz * 8], fov: 56,
      };
    } else {
      window.__cameraOverride = {
        eye: [a.x - a.dx * 2 + sx * 6, 9.5, a.z - a.dz * 2 + sz * 6],
        target: [a.x + a.dx * 5, 0.6, a.z + a.dz * 5], fov: 54,
      };
    }
  },
  cast() { __game.input.attack = true; setTimeout(() => { __game.input.attack = false; }, 140); },
};
'ready';
"""


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome", args=["--ignore-gpu-blocklist"])
        page = browser.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
        page.on("console", lambda m: LOG.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: LOG.append(f"pageerror: {e}"))
        page.route("https://cdn.jsdelivr.net/**", route_cdn)
        page.goto("http://127.0.0.1:4180/game/index.html", wait_until="domcontentloaded")
        page.wait_for_function("() => window.__game && window.__game.state.phase === 'title'", timeout=90000)
        page.evaluate(HELPERS)
        page.evaluate("__game.startRun(['mage','knight'])")
        page.wait_for_function("() => __game.state.phase === 'playing' && __game.enemies && __game.enemies.aliveCount >= 4", timeout=30000)
        arena = page.evaluate("__ice.setupArena()")
        print("arena", json.dumps(arena))
        page.evaluate("__game.player.heal(9999)")
        page.wait_for_timeout(900)
        line = []
        for i, d in enumerate([2.5, 5.0, 7.5]):
            line.append({"index": i, "x": arena["x"] + arena["dx"] * d, "z": arena["z"] + arena["dz"] * d})
        line.append({
            "index": 3,
            "x": arena["x"] + arena["dx"] * 5 + arena["dz"] * arena["side"] * 4,
            "z": arena["z"] + arena["dz"] * 5 - arena["dx"] * arena["side"] * 4,
        })
        page.evaluate("(l) => __ice.place(l)", line)
        page.evaluate("__ice.cameraForShots('early')")
        page.wait_for_timeout(250)
        page.evaluate("__ice.cast()")
        page.wait_for_function(
            "() => { const g=__game.scene.getObjectByName('ice-lance-vfx'); let c=0;"
            " if (g) g.traverse(o=>{ if(o.isInstancedMesh && o.geometry.getAttribute('aSeed')) c+=o.count; }); return c>0; }",
            timeout=4000,
        )
        page.wait_for_timeout(120)
        page.screenshot(path=str(OUT / "shot-early-front.png"))
        print("early", page.evaluate("__ice.vfx()"))
        page.evaluate("__ice.cameraForShots('field')")
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "shot-peak-field.png"))
        print("peak", page.evaluate("__ice.vfx()"))
        page.evaluate("__ice.cameraForShots('close')")
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "shot-close-field.png"))
        page.wait_for_function(
            "() => { const g=__game.scene.getObjectByName('ice-lance-vfx'); let c=0;"
            " if (g) g.traverse(o=>{ if(o.isInstancedMesh && o.geometry.getAttribute('aSeed')) c+=o.count; }); return c===0; }",
            timeout=6000,
        )
        page.evaluate("__ice.cameraForShots('field')")
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "shot-aftermath.png"))
        print("aftermath", page.evaluate("__ice.vfx()"))

        # ---- Storm Lance (second in the rotation) --------------------------
        page.evaluate("__ice.pin()")
        page.evaluate("__ice.cameraForShots('wide')")
        page.wait_for_timeout(200)
        page.evaluate("__ice.cast()")
        page.wait_for_timeout(320)
        page.screenshot(path=str(OUT / "shot-storm-lance.png"))
        print("storm", page.evaluate("__ice.spellVfx('storm-lance-vfx')"))
        page.wait_for_timeout(1200)

        # ---- Glacial Crown (third in the rotation) -------------------------
        page.evaluate("__ice.pin()")
        page.evaluate("__ice.cameraForShots('wide')")
        page.wait_for_timeout(200)
        page.evaluate("__ice.cast()")
        page.wait_for_function(
            "() => { const g=__game.scene.getObjectByName('glacial-crown-vfx'); let c=0;"
            " if (g) g.traverse(o=>{ if(o.isInstancedMesh && o.geometry.getAttribute('aSeed')) c+=o.count; }); return c>0; }",
            timeout=5000,
        )
        page.wait_for_timeout(850)
        page.screenshot(path=str(OUT / "shot-glacial-crown.png"))
        print("glacier", page.evaluate("__ice.spellVfx('glacial-crown-vfx')"))
        page.wait_for_timeout(2500)
        page.screenshot(path=str(OUT / "shot-glacial-aftermath.png"))
        print("glacier aftermath", page.evaluate("__ice.spellVfx('glacial-crown-vfx')"))

        print("errors", json.dumps([x for x in LOG if x.startswith(("console.error", "pageerror"))]))
        browser.close()


if __name__ == "__main__":
    main()
