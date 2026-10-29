import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Bokeh motes - additive glow points drifting through the volume.
// ---------------------------------------------------------------------------
export class BokehField {
  constructor({
    count = 600,
    size = 0.30,
    opacity = 0.70,
    color = 0xfff0b0,
    texture = null,
    rand = Math.random,
    spread = 14.0,
    depthNear = 3.0,
    depthFar = 58.0
  } = {}) {
    this.count = count;
    this.rand = rand;

    this.positions = new Float32Array(count * 3);
    this.baseY = new Float32Array(count);
    this.phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const u = rand();
      this.positions[i * 3] = (rand() * 2 - 1) * spread;
      this.positions[i * 3 + 1] = 0.25 + rand() * 12.75;
      this.positions[i * 3 + 2] = 14.0 - u * depthFar;
      this.baseY[i] = this.positions[i * 3 + 1];
      this.phases[i] = rand() * Math.PI * 2;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    this.material = new THREE.PointsMaterial({
      map: texture,
      size: size,
      sizeAttenuation: true,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: new THREE.Color(color)
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'PetalBokeh';
    this.points.frustumCulled = false;
  }

  update(time) {
    const pos = this.geometry.getAttribute('position');
    for (let i = 0; i < this.count; i++) {
      pos.setY(i, this.baseY[i] + Math.sin(time * 0.55 + this.phases[i]) * 0.45);
    }
    pos.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// Halo - a soft additive glow sitting on each hero petal, the anime backlight.
// The system writes positions every frame; the field just owns the buffers.
// ---------------------------------------------------------------------------
export class HaloField {
  constructor({
    count = 44,
    size = 0.95,
    opacity = 0.18,
    color = 0xffd27a,
    texture = null
  } = {}) {
    this.count = count;
    this.positions = new Float32Array(count * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    this.material = new THREE.PointsMaterial({
      map: texture,
      size: size,
      sizeAttenuation: true,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: new THREE.Color(color)
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'PetalHalo';
    this.points.frustumCulled = false;
  }

  set(i, x, y, z) {
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
  }

  commit() {
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
