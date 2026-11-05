# Haru-machi — Xiaomi Pad 7 Fullscreen Landscape TWA Wrapper

This directory contains the Trusted Web Activity (TWA) configuration for installing **Haru-machi** as a zero-chrome, fullscreen landscape Android application on Ishika's **Xiaomi Pad 7** (`Snapdragon 7+ Gen 3` / `Adreno 732`).

## Target Device Profile
- **Device:** Xiaomi Pad 7 (`3200 × 2136` native `3:2` display, `144Hz`)
- **Orientation:** Locked `"landscape"` (`display: "fullscreen"`)
- **Web Manifest:** `/world/manifest.webmanifest`
- **Service Worker:** `/world/sw.js` (caches static shell & 3D assets while bypassing `/api/room/*` WebSockets and `/api/commune` prayers)

## Option A: Instant Fullscreen Install via Chrome on Xiaomi Pad 7 (Zero APK Build Needed)
1. Open the deployed Cloudflare Worker URL (`https://<your-worker>.workers.dev/world/index.html`) in Chrome on the Xiaomi Pad 7.
2. Tap the Chrome menu (`⋮`) -> **Add to Home screen** / **Install app**.
3. Launching **Haru-machi** from the Pad 7 home screen opens directly in fullscreen landscape mode via `/world/manifest.webmanifest` and `/world/sw.js`.

## Option B: Building a Signed Android APK via `@bubblewrap/cli`
```bash
npx @bubblewrap/cli init --manifest=https://haru-machi-coop.workers.dev/world/manifest.webmanifest
npx @bubblewrap/cli build
```
Then copy the SHA-256 certificate fingerprint into `assetlinks.json` and serve it at `/.well-known/assetlinks.json`.
