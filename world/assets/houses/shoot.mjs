import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

function startStaticServer(rootDir) {
  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, 'http://127.0.0.1');
      if (reqUrl.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      const relPath = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, '');
      const fullPath = path.resolve(rootDir, relPath);
      if (!fullPath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const data = await fs.readFile(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function main() {
  const passName = process.argv[2] || 'pass1';
  const outDir = path.join(__dirname, 'shots', passName);
  await fs.mkdir(outDir, { recursive: true });

  const { server, port } = await startStaticServer(REPO_ROOT);
  const url = `http://127.0.0.1:${port}/world/assets/houses/preview.html`;

  const consoleErrors = [];
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1,
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message || String(err));
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });

    const shotList = [
      'inn-3q',
      'inn-front',
      'inn-right-90',
      'inn-rear-180',
      'inn-left-270',
      'inn-overhead',
      'window-closeup-front',
      'window-closeup-side',
      'herbalist-3q',
      'smithy-3q',
      'gardener-3q',
      'watermill-3q',
      'all-lineup',
      'all-rear-lineup',
    ];

    const shotsReport = {};

    for (const shotName of shotList) {
      const stats = await page.evaluate((name) => {
        return window.__housesPreview.setShot(name, { hideUI: true });
      }, shotName);

      await page.waitForTimeout(80);
      const pngPath = path.join(outDir, `${shotName}.png`);
      await page.screenshot({ path: pngPath });
      shotsReport[shotName] = {
        ...stats,
        path: pngPath,
      };
    }

    const lineupStats = shotsReport['all-lineup'];
    const report = {
      pass: passName,
      timestamp: new Date().toISOString(),
      budget: {
        maxDrawCalls: 15,
        maxTriangles: 48000,
        actualLineupDrawCalls: lineupStats.drawCalls,
        actualLineupTriangles: lineupStats.triangles,
        drawCallsPass: lineupStats.drawCalls <= 15,
        trianglesPass: lineupStats.triangles <= 48000,
        zeroConsoleErrors: consoleErrors.length === 0,
      },
      consoleErrors,
      shots: shotsReport,
    };

    const reportPath = path.join(outDir, 'report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));

    if (consoleErrors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
