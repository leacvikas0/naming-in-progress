import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
await p.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview-terrain.html", { waitUntil: "load" });
await p.waitForTimeout(2000);
const r = await p.evaluate(() => {
  const t = window.__meadow.terrain;
  const pts = [[-65,-3.5],[-70,-10],[-60,0],[-50,0],[-48,0],[-46,0],[-85,-3.5],[-95,-3.5]];
  const water = window.__meadow.scene.getObjectByName("meadowLake");
  const geo = water.geometry;
  geo.computeBoundingBox();
  return {
    heights: pts.map(([x,z]) => [x,z,+t.heightAt(x,z).toFixed(2), +t.pathDistance(x,z).toFixed(2)]),
    waterPos: water.position.toArray(),
    waterBox: [geo.boundingBox.min.toArray(), geo.boundingBox.max.toArray()],
    waterVisible: water.visible,
    matType: water.material.type,
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
