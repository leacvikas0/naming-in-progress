// Zero-dependency static server. Serves the kit and mounts the repo's own
// copy of three.js at /vendor/three, so the demo runs offline with nothing
// installed beyond what this repo already has.
//
//   node tools/serve.mjs            -> http://localhost:4180
//   node tools/serve.mjs 5000       -> custom port

import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, "..");
const repoRoot = path.resolve(kitRoot, "..");
const threeRoot = path.join(repoRoot, "node_modules", "three");

const port = Number(process.argv[2] || process.env.PORT || 4180);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function serveFile(res, filePath) {
  let st;
  try {
    st = statSync(filePath);
  } catch {
    return send(res, 404, "not found");
  }
  if (!st.isFile()) return send(res, 404, "not found");
  const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);

  if (url.startsWith("/vendor/three/")) {
    return serveFile(res, path.join(threeRoot, url.slice("/vendor/three/".length)));
  }

  const rel = url === "/" ? "/index.html" : url;
  const target = path.normalize(path.join(kitRoot, rel));
  if (!target.startsWith(kitRoot)) return send(res, 403, "forbidden");
  serveFile(res, target);
});

server.listen(port, () => {
  console.log(`meadow-kit  ->  http://localhost:${port}/`);
  console.log(`preview     ->  http://localhost:${port}/scratch/preview.html?species=daisy`);
  console.log(`three       ->  ${threeRoot}`);
});
