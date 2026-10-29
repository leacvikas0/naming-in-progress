import json
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = pathlib.Path(__file__).resolve().parent
THREE = ROOT / "node_modules" / "three"


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
window.__dbg = {
  freeze() {
    __game.player.party.forEach((p) => { p.hp = p.maxHp; });
    for (const e of __game.enemies.list) { e.stun = 999; e.attackCd = 9999; e.speed = 0; }
  },
  live() { return __game.enemies.list.filter((e) => !e.dead && !e.dying && e.solid); },
  async killForMomentum(need) {
    const t0 = performance.now();
    while (__game.player.momentum < need && performance.now() - t0 < 45000) {
      this.freeze();
      let live = this.live();
      if (live.length <= 1) {
        __game.enemies.spawnWave({ n: 99, count: 8, mix: [{ type: 'minion', count: 8 }] }, __game.player);
        const tw = performance.now();
        while (performance.now() - tw < 5000) {
          this.freeze();
          if (this.live().length >= 2) break;
          await new Promise((r) => setTimeout(r, 80));
        }
        continue;
      }
      for (let i = 0; i < live.length - 1; i++) __game.enemies.damageEnemy(live[i], 1e9, {});
      await new Promise((r) => setTimeout(r, 90));
    }
    return { momentum: __game.player.momentum, live: this.live().length };
  },
  snapshot() {
    const p = __game.player;
    return {
      phase: __game.state.phase,
      momentum: p.momentum,
      ready: p.superReady,
      alive: p.alive,
      hero: p.activeHero.id,
      pos: [p.position.x, p.position.z],
      aim: [__game.input.aim.x, __game.input.aim.z],
      enemies: this.live().map((e) => ({ id: e.id, hp: e.hp, x: e.group.position.x, z: e.group.position.z })),
    };
  },
};
'ready';
"""


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome", args=["--ignore-gpu-blocklist"])
        page = browser.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
        page.on("pageerror", lambda e: print("pageerror", e))
        page.route("https://cdn.jsdelivr.net/**", route_cdn)
        page.goto("http://127.0.0.1:4180/game/index.html", wait_until="domcontentloaded")
        page.wait_for_function("() => window.__game && window.__game.state.phase === 'title'", timeout=90000)
        page.evaluate(HELPERS)
        page.evaluate("__game.startRun(['mage','knight'])")
        page.wait_for_function("() => __game.state.phase === 'playing' && __game.enemies && __game.enemies.aliveCount >= 2", timeout=30000)
        print("kill", page.evaluate("__dbg.killForMomentum(100)"))
        # Put the player at origin and aim at a fixed point; spawn two frozen targets there.
        page.evaluate(
            """() => {
                __game.player.group.position.set(0, 0, 0);
                __game.input.aim.set(0, 0, 6);
                __dbg.freeze();
            }"""
        )
        page.evaluate(
            """async () => {
                __game.enemies.spawnWave({n: 99, count: 2, mix: [{type:'minion', count:2}]}, __game.player);
                const t0 = performance.now();
                while (performance.now() - t0 < 8000 && __dbg.live().length < 2) {
                    __dbg.freeze();
                    await new Promise((r) => setTimeout(r, 80));
                }
                const es = __dbg.live().slice(0, 2);
                es.forEach((e, i) => {
                    e.group.position.set(i * 1.2, 0, 6);
                    e.stun = 999; e.attackCd = 9999; e.speed = 0; e.hp = 1e6; e.maxHp = 1e6;
                });
                __game.input.aim.set(0, 0, 6);
                __dbg.freeze();
            }"""
        )
        page.wait_for_timeout(400)
        print("before", json.dumps(page.evaluate("__dbg.snapshot()")))
        page.evaluate("__game.input.superQueued = true")
        for i in range(20):
            page.wait_for_timeout(500)
            s = page.evaluate("__dbg.snapshot()")
            print(i, json.dumps(s))
            if any(e["hp"] < 1e6 for e in s["enemies"]):
                print("DAMAGED")
                break
        browser.close()


if __name__ == "__main__":
    main()
