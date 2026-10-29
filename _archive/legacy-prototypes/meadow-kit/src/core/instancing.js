// Batching. One InstancedMesh per species (optionally split into spatial
// cells), plus a thinned "far" copy so a distant meadow costs less than a
// near one.

import * as THREE from "three";

function createInstancedMesh(geometry, material, list, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, "YXZ");
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i < list.length; i++) {
    const inst = list[i];
    p.set(inst.x, inst.y, inst.z);
    e.set(0, inst.rot, 0);
    q.setFromEuler(e);
    s.set(inst.sx, inst.sy, inst.sz);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    c.setRGB(inst.r, inst.g, inst.b);
    mesh.setColorAt(i, c);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = name;
  mesh.frustumCulled = true;
  mesh.computeBoundingSphere();
  mesh.userData.instanceCount = list.length;
  return mesh;
}

function splitCells(instances, cellSize) {
  if (!cellSize || cellSize <= 0) return new Map([["all", instances]]);
  const cells = new Map();
  for (const inst of instances) {
    const key = `${Math.floor(inst.x / cellSize)}:${Math.floor(inst.z / cellSize)}`;
    let list = cells.get(key);
    if (!list) {
      list = [];
      cells.set(key, list);
    }
    list.push(inst);
  }
  return cells;
}

/**
 * @returns {{group: THREE.Group, update: Function, triangles: number, count: number}}
 */
export function buildInstancedSpecies({
  id,
  geometry,
  material,
  instances,
  cellSize = 0,
  lodDistance = Infinity,
  lodStride = 3,
}) {
  const group = new THREE.Group();
  group.name = `meadow:${id}`;

  const near = [];
  const far = [];
  const cells = splitCells(instances, cellSize);

  for (const [key, list] of cells) {
    const full = createInstancedMesh(geometry, material, list, `${id}:${key}`);
    group.add(full);
    near.push(full);

    if (lodStride > 1 && list.length > lodStride * 2) {
      const thinned = [];
      for (let i = 0; i < list.length; i += lodStride) thinned.push(list[i]);
      const sparse = createInstancedMesh(geometry, material, thinned, `${id}:${key}:lod`);
      sparse.visible = false;
      group.add(sparse);
      far.push(sparse);
    }
  }

  const trisPerInstance = Math.floor(
    (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3
  );

  let isFar = false;

  return {
    group,
    count: instances.length,
    triangles: trisPerInstance * instances.length,
    update(distance) {
      const shouldBeFar = distance > lodDistance;
      if (shouldBeFar === isFar) return;
      isFar = shouldBeFar;
      for (const m of near) m.visible = !isFar;
      for (const m of far) m.visible = isFar;
    },
    dispose() {
      for (const m of [...near, ...far]) {
        m.dispose();
        group.remove(m);
      }
    },
  };
}
