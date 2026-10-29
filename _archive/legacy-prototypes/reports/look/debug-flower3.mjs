
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=default','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const logs = [];
page.on('console', m => logs.push(m.type()+': '+m.text().slice(0,300)));
page.on('pageerror', e => logs.push('pageerror: '+e.message));
await page.goto('http://127.0.0.1:4173/game/handoff/map-bg/preview-flower-tree.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(4000);
const out = await page.evaluate(() => {
  const g = window.__meadow;
  const errs = [];
  g.renderer.debug.onShaderError = (gl, program, vs, fs) => {
    errs.push({
      vs: gl.getShaderInfoLog(vs),
      fs: gl.getShaderInfoLog(fs),
      prog: gl.getProgramInfoLog(program),
    });
  };
  // force a re-render to compile the shaders
  g.renderer.render(g.scene, g.camera);
  const leaves = g.scene.getObjectByName('flowerTreeLeaves');
  const props = g.renderer.properties.get(leaves.material);
  return {
    errs,
    programs: g.renderer.info.programs.length,
    matType: leaves.material.type,
    hasProg: !!props.currentProgram,
    uniforms: Object.keys(leaves.material.uniforms || {}),
  };
});
console.log(JSON.stringify({ out, logs: logs.filter(l => !l.includes('404')).slice(0,8) }, null, 2));
await browser.close();
