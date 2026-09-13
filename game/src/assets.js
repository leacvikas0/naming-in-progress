// Resolve pixel-chrome asset URLs, with the content hash from the build.
//
// The dev server sends an ETag but no Cache-Control, so browsers heuristically
// cache PNGs and can keep serving art from a previous build. build-ui.mjs
// writes `ui/gen/asset-urls.css` with a `--px-<name>` custom property per
// asset, each carrying a content hash. We read those back here so JS-created
// <img> elements get the same cache-busting the CSS uses.
//
// Usage:
//   import { pxUrl, applyPxIcons } from "./assets.js";
//   img.src = pxUrl("sigil-knight");
//   applyPxIcons(document);   // fills every <img data-px-icon="...">

let urlMap = null;

function loadMap() {
  if (urlMap) return urlMap;
  urlMap = new Map();
  if (typeof document === "undefined" || !document.documentElement) return urlMap;
  for (const sheet of Array.from(document.styleSheets || [])) {
    let rules = null;
    try {
      rules = sheet.cssRules;
    } catch (err) {
      continue; // cross-origin sheet
    }
    if (!rules) continue;
    // Custom-property url() values resolve against the stylesheet that defines
    // them, but an <img>.src resolves against the document. Resolve here so the
    // two agree.
    const base = sheet.href || (typeof location !== "undefined" ? location.href : "");
    for (const rule of Array.from(rules)) {
      if (!rule.style) continue;
      for (const prop of Array.from(rule.style)) {
        if (!prop.startsWith("--px-")) continue;
        const raw = rule.style.getPropertyValue(prop).trim();
        const match = raw.match(/url\(["']?([^"')]+)["']?\)/);
        if (!match) continue;
        let href = match[1];
        try {
          href = new URL(href, base).href;
        } catch (err) {
          /* keep the raw value */
        }
        urlMap.set(prop.slice(5), href);
      }
    }
  }
  return urlMap;
}

/** Hashed URL for an asset name, e.g. pxUrl("icon-hp") or pxUrl("sigil-mage"). */
export function pxUrl(name) {
  const map = loadMap();
  const hit = map.get(name);
  if (hit) return hit;
  // Fall back to the unhashed path so a missing manifest entry still renders.
  return `/game/ui/gen/${name}.png`;
}

/**
 * Resolve a short name to an asset.
 *
 * Accepts either a full asset name ("icon-hp", "sigil-mage", "divider-boss")
 * or a bare glyph ("hp", "coin"), which is looked up as an icon first and then
 * as-is. That keeps `data-px-icon="coin"` and `pxUrl("sigil-knight")` both
 * working without the caller having to know the naming convention.
 */
export function pxAsset(name) {
  const map = loadMap();
  if (map.has(name)) return map.get(name);
  const asIcon = `icon-${name}`;
  if (map.has(asIcon)) return map.get(asIcon);
  return `/game/ui/gen/${map.has(asIcon) ? asIcon : name}.png`;
}

/** Fill in src for every <img data-px-icon="name"> under `root`. */
export function applyPxIcons(root) {
  const host = root || (typeof document !== "undefined" ? document : null);
  if (!host || typeof host.querySelectorAll !== "function") return;
  for (const img of Array.from(host.querySelectorAll("img[data-px-icon]"))) {
    const name = img.getAttribute("data-px-icon");
    if (name) img.src = pxAsset(name);
  }
}
