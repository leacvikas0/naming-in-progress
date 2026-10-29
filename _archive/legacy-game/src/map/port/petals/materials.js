import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Palettes
// Every petal type is built from five colours: stem, base, mid, tip, vein.
// Vertex colours are baked from these, so changing a palette costs one rebuild
// and no shader work.
// ---------------------------------------------------------------------------
export const PALETTES = {
  ginkgoGold: {
    stem: '#d9952c', base: '#f0bd48', mid: '#ffdd80', tip: '#fff3c8', vein: '#e8b03c',
    emissive: 0xffcf70, emissiveIntensity: 0.22
  },
  ginkgoAmber: {
    stem: '#b05f05', base: '#e09402', mid: '#f5c014', tip: '#ffe24a', vein: '#cc7f00',
    emissive: 0xc97f00, emissiveIntensity: 0.18
  },
  sakuraPink: {
    stem: '#d98ba6', base: '#ff9fc6', mid: '#ffd0e2', tip: '#fff4f8', vein: '#f7b8d0',
    emissive: 0xffb0cc, emissiveIntensity: 0.14
  },
  sakuraWhite: {
    stem: '#c9a0ad', base: '#f9c8d8', mid: '#ffe3ec', tip: '#fffdfd', vein: '#f0c0d0',
    emissive: 0xffc8dc, emissiveIntensity: 0.12
  },
  mapleRed: {
    stem: '#5e1a0c', base: '#8f2212', mid: '#c33a18', tip: '#ef7a2e', vein: '#7a1c0e',
    emissive: 0x8f2212, emissiveIntensity: 0.10
  },
  mapleOrange: {
    stem: '#6b2a0c', base: '#a63c10', mid: '#d95a1c', tip: '#f29a44', vein: '#8f2e0c',
    emissive: 0xa63c10, emissiveIntensity: 0.10
  },
  roseDusty: {
    stem: '#8a4552', base: '#c96a80', mid: '#e293a5', tip: '#f7ccd6', vein: '#b05a6e',
    emissive: 0xd47f92, emissiveIntensity: 0.12
  }
};

// MeshLambertMaterial keeps the look of the original scene and is cheap enough
// for thousands of instances. Swap for MeshStandardMaterial if your game already
// runs PBR lighting.
export function createPetalMaterial(palette, options = {}) {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(palette.emissive),
    emissiveIntensity: palette.emissiveIntensity,
    transparent: options.transparent === true,
    opacity: options.opacity != null ? options.opacity : 1.0,
    depthWrite: options.depthWrite !== false
  });
}

// Radial glow sprite used by the bokeh motes and the hero backlight halo.
export function createGlowTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255, 252, 232, 1)');
  g.addColorStop(0.22, 'rgba(255, 232, 150, 0.85)');
  g.addColorStop(0.55, 'rgba(255, 200, 80, 0.22)');
  g.addColorStop(1.0, 'rgba(255, 180, 50, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
