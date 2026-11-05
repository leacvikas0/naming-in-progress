import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const toolsDir = import.meta.dirname;
const worldDir = path.resolve(toolsDir, '..');
const repoRoot = path.resolve(worldDir, '..');
const outVideo = path.join(worldDir, 'shots', 'videos', '08-mill-lake-and-volumetric-grass.webm');
fs.mkdirSync(path.dirname(outVideo), { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  let filePath = path.join(repoRoot, urlPath === '/' ? 'world/index.html' : urlPath);
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

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/world/index.html`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
    null,
    { timeout: 30000 }
  );

  const b64 = await page.evaluate(async () => {
    window.__WORLD__.toggleHud(false);
    window.__WORLD__.setShot('day-mill-pier');
    const canvas = document.getElementById('world-canvas');
    const stream = canvas.captureStream(30);
    const chunks = [];
    const rec = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: 6000000,
    });
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise((resolve) => {
      rec.onstop = resolve;
    });
    rec.start();
    await new Promise((r) => setTimeout(r, 2600));
    window.__WORLD__.setShot('day-flower-lobby');
    await new Promise((r) => setTimeout(r, 2400));
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(bin);
  });

  fs.writeFileSync(outVideo, Buffer.from(b64, 'base64'));
  console.log('Saved wind & mist video ->', outVideo);
} finally {
  await browser.close();
  server.close();
}
