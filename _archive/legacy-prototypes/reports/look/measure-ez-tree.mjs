import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  await page.goto("http://127.0.0.1:4173/reports/look/ez-tree-demo.html", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(6000);
  const out = await page.evaluate(() => {
    const { renderer, tree, scene } = window.__ez;
    let meshes = 0, tris = 0, verts = 0;
    tree.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      const idx = g.index;
      tris += idx ? idx.count / 3 : g.attributes.position.count / 3;
      verts += g.attributes.position.count;
    });
    return {
      sceneTris: renderer.info.render.triangles,
      sceneCalls: renderer.info.render.calls,
      treeMeshes: meshes,
      treeTris: Math.round(tris),
      treeVerts: verts,
      children: tree.children.map((c) => c.name || c.type),
    };
  });
  console.log(JSON.stringify({ ...out, logs: logs.slice(-3) }, null, 2));
} finally { await browser.close(); }
