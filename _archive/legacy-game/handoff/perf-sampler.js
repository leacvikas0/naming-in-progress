// Shared browser-side performance sampler for the Sunpetal Vale handoff evidence.
// Injected via Playwright evaluate; returns median/p95 frame interval plus
// renderer.info.render draw calls and triangles.
window.__samplePerf = function samplePerf(seconds = 10) {
  const g = window.__game;
  return new Promise((resolve) => {
    const t0 = performance.now();
    const frames = [];
    let last = t0;
    let renderCalls = 0;
    let triangles = 0;
    let samples = 0;
    function tick(now) {
      frames.push(now - last);
      last = now;
      const info = g.renderer && g.renderer.info ? g.renderer.info.render : null;
      if (info) {
        renderCalls += info.calls;
        triangles += info.triangles;
        samples += 1;
      }
      if (now - t0 < seconds * 1000) requestAnimationFrame(tick);
      else {
        const sorted = frames.slice(5).sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        resolve({
          phase: g.state.phase,
          wave: g.state.wave,
          enemies: g.enemies ? g.enemies.aliveCount : 0,
          samples: frames.length,
          medianMs: +med.toFixed(2),
          p95Ms: +p95.toFixed(2),
          fpsMedian: +(1000 / med).toFixed(1),
          fpsP95: +(1000 / p95).toFixed(1),
          drawCalls: samples ? Math.round(renderCalls / samples) : null,
          triangles: samples ? Math.round(triangles / samples) : null,
          dpr: devicePixelRatio,
          canvas: [g.renderer.domElement.width, g.renderer.domElement.height],
        });
      }
    }
    requestAnimationFrame(tick);
  });
};
"perf sampler installed";
