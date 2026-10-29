# Fast, storm-only visual pass for iterating on the bolt/dome look.
# One screenshot per run so the shot lands at the right moment (each
# page.screenshot costs ~300 ms, which is most of the effect's life).
# Usage: python storm-shot.py [bolt|dome|game]
# Temporary scratch: delete before handoff.
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = pathlib.Path(__file__).resolve().parent
THREE = ROOT / "node_modules" / "three"
LOG = []
MODE = sys.argv[1] if len(sys.argv) > 1 else "bolt"


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
window.__storm = {
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
      if (clearance < 6) continue;
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
        const len = clip(gx, gz, dx, dz, 13);
        if (len < 12.2) continue;
        const ix = gx + dx * 10, iz = gz + dz * 10;
        let iclear = 99;
        for (const c of cols) iclear = Math.min(iclear, Math.hypot(ix - c.x, iz - c.z) - (c.radius || 0));
        if (iclear < 4) continue;
        const sx = -dz, sz = dx;
        const cx = ix + sx * 4.5 - dx, cz = iz + sz * 4.5 - dz;
        let cclear = 99;
        for (const c of cols) cclear = Math.min(cclear, Math.hypot(cx - c.x, cz - c.z) - (c.radius || 0));
        if (cclear < 2) continue;
        const score = len + Math.min(clearance, 10) + Math.min(iclear, 8) + Math.min(cclear, 6);
        if (!best || score > best.score) best = { x: gx, z: gz, dx, dz, len, score };
      }
    }
    if (!best) return null;
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
  hideEnemies() {
    for (const e of __game.enemies.list) { e.group.visible = false; e.stun = 999; e.attackCd = 9999; }
  },
  camera(mode) {
    const a = window.__arena;
    const sx = -a.dz, sz = a.dx;
    const ix = a.x + a.dx * 10, iz = a.z + a.dz * 10;
    if (mode == 'wide') {
      window.__cameraOverride = {
        eye: [a.x - a.dx * 5 + sx * 9, 10, a.z - a.dz * 5 + sz * 9],
        target: [a.x + a.dx * 6, 0.8, a.z + a.dz * 6], fov: 55,
      };
    } else if (mode == 'impact') {
      window.__cameraOverride = {
        eye: [ix + sx * 4.5 - a.dx, 2.6, iz + sz * 4.5 - a.dz],
        target: [ix, 1.3, iz], fov: 50,
      };
    }
  },
  cast() { __game.input.attack = true; setTimeout(() => { __game.input.attack = false; }, 140); },
  stormVfx() {
    const g = __game.scene.getObjectByName('storm-lance-vfx');
    let meshes = 0, visible = 0, domes = 0;
    if (g) g.traverse((o) => {
      if (o.isInstancedMesh) meshes++;
      if (o.isMesh && !o.isInstancedMesh && o.geometry.type === 'SphereGeometry') domes++;
      if (o.visible && (o.isMesh || o.isInstancedMesh)) visible++;
    });
    return { meshes, domes, visible };
  },
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
        arena = page.evaluate("__storm.setupArena()")
        print("arena", json.dumps(arena))
        page.evaluate("__game.player.heal(9999)")
        page.evaluate("__storm.hideEnemies()")
        page.wait_for_timeout(700)

        # First cast is Frost Lance; let it fully withdraw so it cannot pollute
        # the storm shot.
        page.evaluate("__storm.cast()")
        page.wait_for_function(
            "() => { const g=__game.scene.getObjectByName('ice-lance-vfx'); let c=0;"
            " if (g) g.traverse(o=>{ if(o.isInstancedMesh && o.geometry.getAttribute('aSeed')) c+=o.count; }); return c>0; }",
            timeout=4000,
        )
        page.wait_for_function(
            "() => { const g=__game.scene.getObjectByName('ice-lance-vfx'); let c=0;"
            " if (g) g.traverse(o=>{ if(o.isInstancedMesh && o.geometry.getAttribute('aSeed')) c+=o.count; }); return c===0; }",
            timeout=8000,
        )
        page.wait_for_timeout(300)

        # Second cast is Storm Lance. Set the camera BEFORE the cast so the
        # single screenshot lands while the dome/bolt is still alive.
        if MODE in ("bolt", "dome"):
            cam = "wide" if MODE == "bolt" else "impact"
            page.evaluate(f"__storm.camera('{cam}')")
            page.wait_for_timeout(150)
        page.evaluate("__storm.pin()")
        page.evaluate("__storm.cast()")
        page.wait_for_function(
            "() => { const g=__game.scene.getObjectByName('storm-lance-vfx');"
            " return g && g.children.some(o => o.visible && o.isInstancedMesh); }",
            timeout=4000,
        )
        page.wait_for_timeout(90 if MODE == "bolt" else 140)
        page.screenshot(path=str(OUT / ("shot-storm-%s.png" % MODE)))
        print("state", page.evaluate("__storm.stormVfx()"))
        print("errors", json.dumps([x for x in LOG if x.startswith(("console.error", "pageerror"))]))
        browser.close()


if __name__ == "__main__":
    main()
